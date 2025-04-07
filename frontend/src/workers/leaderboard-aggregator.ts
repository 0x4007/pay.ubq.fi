

import type { CombinedLeaderboardData } from "./app-worker.ts";
import { fetchAndCacheIssueMetadata, fetchGitHubUserDetails, type GitHubUserDetails } from "./github-data-fetcher.ts";
import { parseGitHubIssueUrl } from "./leaderboard-helpers.ts";

/**
 * Build a whitelist of repositories based on JSON filenames in fixtures/database.
 * Only repositories with explicit JSON files will be included in the UI.
 */
export async function getWhitelistedRepositories(): Promise<Set<string>> {
  const whitelist = new Set<string>();

  const modules = import.meta.glob("../../src/fixtures/database/*.json");

  for (const path in modules) {
    // Extract filename
    const filename = path.split("/").pop();
    if (!filename) continue;

    // Remove trailing _issueNumber.json
    const repoPart = filename.replace(/_\d+\.json$/, "");

    // Reverse sanitization: replace first _ with /
    const firstUnderscore = repoPart.indexOf("_");
    if (firstUnderscore === -1) continue;

    const owner = repoPart.slice(0, firstUnderscore);
    const repo = repoPart.slice(firstUnderscore + 1);

    const canonicalRepo = `${owner}/${repo}`;
    whitelist.add(canonicalRepo);
  }


  return whitelist;
}

// --- Types ---

export interface LeaderboardEntry {
  githubUsername: string;
  avatarUrl: string;
  totalXp: number;
  xpByCategory: Record<string, number>;
  xpByRepository: Record<string, number>;
  permitCount: number;
  repositories: string[];
}

interface AggregatedUserData {
  githubId: number;
  totalXp: number;
  xpByCategory: Record<string, number>;
  permitCount: number;
  login?: string;
  avatarUrl?: string;
}

/**
 * Processes raw permit data, fetches metadata and user details, aggregates XP,
 * and returns the final sorted leaderboard entries.
 * Only repositories with explicit JSON files are included.
 */
export const processAndAggregateLeaderboardData = async (
  combinedDataFromDb: CombinedLeaderboardData[],
  githubToken: string | null
): Promise<LeaderboardEntry[]> => {


  const repoWhitelist = await getWhitelistedRepositories();


  const uniquePermitRepos = new Set<string>();
  combinedDataFromDb.forEach(permit => {
    if (permit.repository) uniquePermitRepos.add(permit.repository);
  });


  // Do NOT filter permits here; include all permits with a repository
  const filteredPermits = combinedDataFromDb.filter(permit =>
    permit.repository
  );

  const aggregatedDataByUser: Record<number, AggregatedUserData> = {};
  const issuesToFetch = new Map<string, { owner: string; repo: string; issueNumber: number }>();


  for (const permit of filteredPermits) {
    const githubId = permit.github_user?.id;
    if (!githubId) {

      continue;
    }

    if (!aggregatedDataByUser[githubId]) {
      aggregatedDataByUser[githubId] = { githubId, totalXp: 0, xpByCategory: {}, permitCount: 0 };
    }
    aggregatedDataByUser[githubId].permitCount += 1;

    if (permit.location?.node_url && !issuesToFetch.has(permit.location.node_url)) {
      const parsedUrl = parseGitHubIssueUrl(permit.location.node_url);
      if (parsedUrl) {
        issuesToFetch.set(permit.location.node_url, parsedUrl);
      } else {

      }
    }
  }



  const metadataPromises = Array.from(issuesToFetch.entries()).map(([url, params]) =>
    fetchAndCacheIssueMetadata(params.owner, params.repo, params.issueNumber, githubToken)
      .then((metadata) => ({ url, metadata }))
  );
  const metadataResults = await Promise.all(metadataPromises);
  const metadataByUrl = new Map(metadataResults.map((res) => [res.url, res.metadata]));



  Object.values(aggregatedDataByUser).forEach((user) => {
    user.totalXp = 0;
    user.xpByCategory = {};
  });

  for (const permit of filteredPermits) {
    const githubId = permit.github_user?.id;
    const issueUrl = permit.location?.node_url;

    if (!githubId || !issueUrl) continue;

    const metadata = metadataByUrl.get(issueUrl);

    if (metadata?.output) {
      const userMetadataEntry = Object.values(metadata.output).find((entry) => entry.userId === githubId);

      if (userMetadataEntry) {
        let currentPermitTotalXp = 0;
        const knownCategories = ["task", "comments", "reviewRewards"];

        knownCategories.forEach((category) => {
          let categoryXp = 0;
          const categoryData = userMetadataEntry[category as keyof typeof userMetadataEntry];

          try {
            if (category === "task" && typeof categoryData === 'object' && categoryData !== null && typeof (categoryData as { reward?: unknown }).reward === 'number') {
              categoryXp = (categoryData as { reward: number }).reward;
            } else if (category === "comments" && Array.isArray(categoryData)) {
              const commentsArray = categoryData as { score?: { reward?: number } }[];
              categoryXp = commentsArray.reduce((sum, comment) => sum + (comment?.score?.reward || 0), 0);
            } else if (category === "reviewRewards" && Array.isArray(categoryData)) {
              const reviewRewardsArray = categoryData as { reviews?: { reward?: number }[] }[];
              categoryXp = reviewRewardsArray.reduce((sum, reviewReward) => {
                const reviewSum = Array.isArray(reviewReward?.reviews)
                  ? reviewReward.reviews.reduce((rSum, review) => rSum + (review?.reward || 0), 0)
                  : 0;
                return sum + reviewSum;
              }, 0);
            }
          } catch (parseError) {

          }

          if (categoryXp > 0) {
            aggregatedDataByUser[githubId].xpByCategory[category] = (aggregatedDataByUser[githubId].xpByCategory[category] || 0) + categoryXp;
            currentPermitTotalXp += categoryXp;
          }
        });

        aggregatedDataByUser[githubId].totalXp += currentPermitTotalXp;
      } else {

      }
    }
  }


  const uniqueUserIds = Object.keys(aggregatedDataByUser).map((id) => parseInt(id, 10));

  const userDetailPromises = uniqueUserIds.map(userId => fetchGitHubUserDetails(userId, githubToken));
  const userDetailResults = await Promise.all(userDetailPromises);
  const userDetailsMap = new Map<number, GitHubUserDetails>();
  userDetailResults.forEach((detail) => {
    if (detail) {
      userDetailsMap.set(detail.id, detail);
    }
  });


  const finalLeaderboard = Object.values(aggregatedDataByUser)
    .map((userData): LeaderboardEntry => {
      const userDetails = userDetailsMap.get(userData.githubId);
      const repositoriesSet = new Set<string>();
      const xpByRepository: Record<string, number> = {};

      filteredPermits.forEach(permit => {
        if (
          permit.github_user?.id === userData.githubId &&
          permit.repository
        ) {
          repositoriesSet.add(permit.repository);

          const issueUrl = permit.location?.node_url;
          const metadata = issueUrl ? metadataByUrl.get(issueUrl) : undefined;
          if (metadata?.output) {
            const userMetadataEntry = Object.values(metadata.output).find((entry) => entry.userId === userData.githubId);
            if (userMetadataEntry) {
              let permitXp = 0;
              const knownCategories = ["task", "comments", "reviewRewards"];
              knownCategories.forEach((category) => {
                let categoryXp = 0;
                const categoryData = userMetadataEntry[category as keyof typeof userMetadataEntry];

                try {
                  if (category === "task" && typeof categoryData === 'object' && categoryData !== null && typeof (categoryData as { reward?: unknown }).reward === 'number') {
                    categoryXp = (categoryData as { reward: number }).reward;
                  } else if (category === "comments" && Array.isArray(categoryData)) {
                    const commentsArray = categoryData as { score?: { reward?: number } }[];
                    categoryXp = commentsArray.reduce((sum, comment) => sum + (comment?.score?.reward || 0), 0);
                  } else if (category === "reviewRewards" && Array.isArray(categoryData)) {
                    const reviewRewardsArray = categoryData as { reviews?: { reward?: number }[] }[];
                    categoryXp = reviewRewardsArray.reduce((sum, reviewReward) => {
                      const reviewSum = Array.isArray(reviewReward?.reviews)
                        ? reviewReward.reviews.reduce((rSum, review) => rSum + (review?.reward || 0), 0)
                        : 0;
                      return sum + reviewSum;
                    }, 0);
                  }
                } catch {
                  // ignore parse errors here
                }

                permitXp += categoryXp;
              });
              const sanitizedRepo = permit.repository.replace(/[/.]/g, "_");
              xpByRepository[sanitizedRepo] = (xpByRepository[sanitizedRepo] || 0) + permitXp;
            }
          }
        }
      });

      return {
        githubUsername: userDetails?.login ?? `GitHub ID: ${userData.githubId}`,
        avatarUrl: userDetails?.avatar_url ?? "",
        totalXp: userData.totalXp,
        xpByCategory: userData.xpByCategory,
        xpByRepository,
        permitCount: userData.permitCount,
        repositories: Array.from(repositoriesSet).map(r => r.replace(/[/.]/g, "_")),
      };
    })
    .sort((a, b) => b.totalXp - a.totalXp);


  return finalLeaderboard;
};
