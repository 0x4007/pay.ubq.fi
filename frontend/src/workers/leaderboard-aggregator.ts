console.log("Worker: Loading leaderboard-aggregator.ts..."); // Add top-level log

import type { CombinedLeaderboardData } from "./app-worker.ts"; // Updated import path
import { fetchAndCacheIssueMetadata, fetchGitHubUserDetails, type GitHubUserDetails } from "./github-data-fetcher.ts";
import { parseGitHubIssueUrl } from "./leaderboard-helpers.ts";

// --- Types ---

// Define the structure for aggregated leaderboard data (Final Output)
export interface LeaderboardEntry {
  githubUsername: string;
  avatarUrl: string;
  totalXp: number;
  xpByCategory: Record<string, number>;
  permitCount: number;
  repositories: string[]; // Change from single repository to array of repositories
}

// Type for storing aggregated data during processing
interface AggregatedUserData {
  githubId: number;
  totalXp: number;
  xpByCategory: Record<string, number>;
  permitCount: number;
  login?: string;
  avatarUrl?: string;
}

// --- Main Processing Function ---

/**
 * Processes raw permit data, fetches metadata and user details, aggregates XP,
 * and returns the final sorted leaderboard entries.
 * Requires a GitHub token for fetching details.
 */
export const processAndAggregateLeaderboardData = async (
  combinedDataFromDb: CombinedLeaderboardData[],
  githubToken: string | null // Accept token as parameter
): Promise<LeaderboardEntry[]> => {
  console.log("Aggregator: processAndAggregateLeaderboardData: Starting...");

  const aggregatedDataByUser: Record<number, AggregatedUserData> = {};
  const issuesToFetch = new Map<string, { owner: string; repo: string; issueNumber: number }>();

  console.log("Aggregator: First pass - identifying users and issues...");
  for (const permit of combinedDataFromDb) {
    // Use the github_user.id directly if available
    const githubId = permit.github_user?.id;
    if (!githubId) {
      console.warn(`Aggregator: Missing github_user ID for permit nonce ${permit.nonce}`);
      continue;
    }

    if (!aggregatedDataByUser[githubId]) {
      aggregatedDataByUser[githubId] = { githubId, totalXp: 0, xpByCategory: {}, permitCount: 0 };
    }
    // Increment permit count here
    aggregatedDataByUser[githubId].permitCount += 1;

    if (permit.location?.node_url && !issuesToFetch.has(permit.location.node_url)) {
      const parsedUrl = parseGitHubIssueUrl(permit.location.node_url);
      if (parsedUrl) {
        issuesToFetch.set(permit.location.node_url, parsedUrl);
      } else {
        console.warn(`Aggregator: Could not parse issue URL: ${permit.location.node_url}`);
      }
    }
  }
  console.log(`Aggregator: Identified ${Object.keys(aggregatedDataByUser).length} users and ${issuesToFetch.size} unique issues.`);

  console.log("Aggregator: Fetching/caching metadata for all unique issues...");
  const metadataPromises = Array.from(issuesToFetch.entries()).map(([url, params]) =>
    // Pass token to fetcher
    fetchAndCacheIssueMetadata(params.owner, params.repo, params.issueNumber, githubToken)
      .then((metadata) => ({ url, metadata }))
  );
  const metadataResults = await Promise.all(metadataPromises);
  const metadataByUrl = new Map(metadataResults.map((res) => [res.url, res.metadata]));
  console.log("Aggregator: Finished fetching/caching metadata.");

  console.log("Aggregator: Second pass - extracting XP using cached metadata...");
  // Reset XP and category breakdown before recalculating
  Object.values(aggregatedDataByUser).forEach((user) => {
    user.totalXp = 0;
    user.xpByCategory = {};
    // Keep permitCount as it was calculated in the first pass
  });

  for (const permit of combinedDataFromDb) {
    const githubId = permit.github_user?.id;
    const issueUrl = permit.location?.node_url;

    if (!githubId || !issueUrl) continue;

    const metadata = metadataByUrl.get(issueUrl);

    if (metadata?.output) {
      const userMetadataEntry = Object.values(metadata.output).find((entry) => entry.userId === githubId);

      if (userMetadataEntry) {
        let currentPermitTotalXp = 0;
        const knownCategories = ["task", "comments", "reviewRewards"]; // Define expected keys

        knownCategories.forEach((category) => {
          let categoryXp = 0;
          const categoryData = userMetadataEntry[category as keyof typeof userMetadataEntry];

          try {
            // Type guard for task reward
            if (category === "task" && typeof categoryData === 'object' && categoryData !== null && typeof (categoryData as { reward?: unknown }).reward === 'number') {
              categoryXp = (categoryData as { reward: number }).reward;
            }
            // Type guard and reduce for comments
            else if (category === "comments" && Array.isArray(categoryData)) {
              // Ensure the elements being reduced are of the expected type
              const commentsArray = categoryData as { score?: { reward?: number } }[];
              categoryXp = commentsArray.reduce((sum: number, comment) => sum + (comment?.score?.reward || 0), 0);
            }
            // Type guard and reduce for reviewRewards
            else if (category === "reviewRewards" && Array.isArray(categoryData)) {
               // Ensure the elements being reduced are of the expected type
              const reviewRewardsArray = categoryData as { reviews?: { reward?: number }[] }[];
              categoryXp = reviewRewardsArray.reduce((sum: number, reviewReward) => {
                const reviewSum = Array.isArray(reviewReward?.reviews)
                  ? reviewReward.reviews.reduce((rSum: number, review: { reward?: number }) => rSum + (review?.reward || 0), 0)
                  : 0;
                return sum + reviewSum;
              }, 0);
            }
          } catch (parseError) {
             console.error(`Aggregator: Error parsing XP for category ${category} in issue ${issueUrl}, user ${githubId}:`, parseError, categoryData);
          }


          if (categoryXp > 0) {
            aggregatedDataByUser[githubId].xpByCategory[category] = (aggregatedDataByUser[githubId].xpByCategory[category] || 0) + categoryXp;
            currentPermitTotalXp += categoryXp;
          }
        });

        aggregatedDataByUser[githubId].totalXp += currentPermitTotalXp;
        // console.log(`Aggregator: Processed ${currentPermitTotalXp} XP for user ${githubId} from issue ${issueUrl}`);
      } else {
         console.warn(`Aggregator: Could not find metadata entry for user ID ${githubId} in issue ${issueUrl}`);
      }
    }
  }
  console.log("Aggregator: Finished extracting XP.");

  // Fetch GitHub user details
  const uniqueUserIds = Object.keys(aggregatedDataByUser).map((id) => parseInt(id, 10));
  console.log(`Aggregator: Fetching GitHub user details for ${uniqueUserIds.length} users...`);
  // Pass token to fetcher
  const userDetailPromises = uniqueUserIds.map(userId => fetchGitHubUserDetails(userId, githubToken));
  const userDetailResults = await Promise.all(userDetailPromises);
  const userDetailsMap = new Map<number, GitHubUserDetails>();
  userDetailResults.forEach((detail) => {
    if (detail) {
      userDetailsMap.set(detail.id, detail);
    }
  });
  console.log(`Aggregator: Fetched details for ${userDetailsMap.size} users.`);

  // Final mapping to LeaderboardEntry
  const finalLeaderboard = Object.values(aggregatedDataByUser)
    .map((userData): LeaderboardEntry => {
      const userDetails = userDetailsMap.get(userData.githubId);
      // Track repositories for this user
      const repositoriesSet = new Set<string>();
      combinedDataFromDb.forEach(permit => {
        if (permit.github_user?.id === userData.githubId && permit.repository) {
          repositoriesSet.add(permit.repository);
        }
      });

      return {
        githubUsername: userDetails?.login ?? `GitHub ID: ${userData.githubId}`,
        avatarUrl: userDetails?.avatar_url ?? "",
        totalXp: userData.totalXp,
        xpByCategory: userData.xpByCategory,
        permitCount: userData.permitCount,
        repositories: Array.from(repositoriesSet), // Use all repositories found for this user
      };
    })
    .sort((a, b) => b.totalXp - a.totalXp); // Sort descending by total XP

  console.log("Aggregator: processAndAggregateLeaderboardData: Finished, returning final leaderboard.");
  return finalLeaderboard;
};

console.log("Worker: Loaded leaderboard-aggregator.ts."); // Add top-level log
