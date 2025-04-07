import { githubCommentCache } from "../utils/github-comment-cache.ts";
// Removed resetDatabase import as we won't reset the whole DB anymore
import { leaderboardCache } from "../utils/leaderboard-cache.ts";
import type { CombinedLeaderboardData } from "./permit-checker.worker.ts"; // Assuming this type is still correct for the fetched data structure
import { initializeSupabase, getSupabase } from "./supabase-singleton.ts";
import { fetchAllPermitsForLeaderboard } from "./fetch-all-permits-for-leaderboard.ts";

// Global variable to store the GitHub token
let GITHUB_TOKEN: string | null = null;
let isSupabaseInitialized = false;

// Read Supabase credentials from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- Types (Moved from useLeaderboardData) ---

// Define the structure for aggregated leaderboard data (Final Output)
export interface LeaderboardEntry {
  githubUsername: string;
  avatarUrl: string;
  totalXp: number;
  xpByCategory: Record<string, number>;
  permitCount: number;
}

// Structure for fetched GitHub user details (login and avatar)
interface GitHubUserDetails {
  login: string;
  avatar_url: string;
  id: number; // GitHub User ID
}

// Structure for the parsed metadata from the bot comment
interface PermitCommentMetadata {
  output: {
    [key: string]: {
      userId: number;
      total: number; // Original total, might differ from calculated sum
      // Specific category fields (adjust based on actual metadata structure)
      task?: { reward?: number };
      comments?: { score?: { reward?: number } }[];
      reviewRewards?: { reviews?: { reward?: number }[] }[];
      // Add other potential category fields if they exist
    };
  };
  // ... other fields
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

// Define the complete type for GitHub API comment structure
interface GitHubComment {
  id: number;
  body?: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
}

// Get GitHub PAT from env (Worker context uses self.location, not import.meta)
// We'll need to pass this in during worker init or fetch it differently.
// For now, assume it's available globally or passed in.
// TODO: Securely handle GITHUB_TOKEN in worker
// Removed placeholder access

// --- Helper Functions (Moved from useLeaderboardData) ---

export const extractGitHubId = (placeholder: string): number | null => {
  const match = placeholder.match(/GitHub ID: (\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

export const parseGitHubIssueUrl = (url: string): { owner: string; repo: string; issueNumber: number } | null => {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/);
  if (match) {
    return { owner: match[1], repo: match[2], issueNumber: parseInt(match[3], 10) };
  }
  return null;
};

// Fetches comments, parses metadata, and caches the metadata
export const fetchAndCacheIssueMetadata = async (owner: string, repo: string, issueNumber: number): Promise<PermitCommentMetadata | null> => {
  const issueUrl = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

  try {
    // Try to get metadata from cache first
    const cachedMetadata = await leaderboardCache.getMetadata(issueUrl);
    if (cachedMetadata) {
      console.log(`Worker: Using cached metadata for ${issueUrl}`);
      return cachedMetadata;
    }

    // Try to get comments from cache
    const cachedComments = await githubCommentCache.getComments(issueUrl);
    let comments: GitHubComment[];

    if (cachedComments) {
      console.log(`Worker: Using cached comments for ${owner}/${repo}#${issueNumber}`);
      comments = cachedComments.comments;
    } else {
      console.log(`Worker: Fetching comments for ${owner}/${repo}#${issueNumber}`);
      const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };
      if (GITHUB_TOKEN) {
        // console.log(`Worker: Using GitHub token for ${apiUrl}`); // Too noisy
        headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`; // Use Bearer for PATs
      } else {
        console.warn(`Worker: No GitHub token available. Making unauthenticated request to ${apiUrl}.`);
      }

      const response = await fetch(apiUrl, { headers });
      if (!response.ok) {
        console.error(`Worker: Failed to fetch comments for ${owner}/${repo}#${issueNumber}: ${response.status}`);
        // Don't cache failed fetches
        return null;
      }

      const responseData = await response.json();
      comments = responseData as GitHubComment[];

      // Cache the fetched comments
      await githubCommentCache.setComments(issueUrl, comments);
      console.log(`Worker: Cached comments for ${issueUrl}`);
    }

    // Parse metadata from comments (cached or freshly fetched)
    const metadata = findAndParseMetadataComment(comments);

    if (metadata) {
      await leaderboardCache.setMetadata(issueUrl, metadata);
      console.log(`Worker: Cached metadata for ${issueUrl}`);
    } else {
      console.warn(`Worker: No metadata found in comments for ${issueUrl}`);
      // Cache the fact that no metadata was found? Maybe cache null?
      // await leaderboardCache.setMetadata(issueUrl, null); // Optional: Cache null to avoid re-fetching comments
    }

    return metadata;
  } catch (e) {
    console.error(`Worker: Error in fetchAndCacheIssueMetadata for ${owner}/${repo}#${issueNumber}:`, e);
    return null;
  }
};

// Use the specific type for comments array
export const findAndParseMetadataComment = (comments: GitHubComment[]): PermitCommentMetadata | null => {
  console.log(`Worker: findAndParseMetadataComment: Searching ${comments.length} comments...`);
  const primaryMarker = "<!-- Ubiquity - GithubCommentModule - GithubCommentModule.getBodyContent";
  for (const comment of comments) {
    if (!comment.body) continue;

    const markerIndex = comment.body.indexOf(primaryMarker);
    if (markerIndex !== -1) {
      const jsonStartIndex = comment.body.indexOf("{", markerIndex + primaryMarker.length);
      if (jsonStartIndex !== -1) {
        const commentEndIndex = comment.body.indexOf("-->", jsonStartIndex);
        if (commentEndIndex !== -1) {
          const potentialJsonString = comment.body.substring(jsonStartIndex, commentEndIndex).trim();
          if (potentialJsonString) {
            try {
              const metadata = JSON.parse(potentialJsonString) as PermitCommentMetadata;
              if (metadata && typeof metadata.output === "object") {
                console.log("Worker: findAndParseMetadataComment: Successfully parsed metadata.");
                return metadata;
              } else {
                 console.warn("Worker: Parsed JSON does not match expected metadata structure (missing 'output').");
              }
            } catch (e) {
              console.error("Worker: Failed to parse JSON metadata from comment:", e, "\nAttempted JSON String:", potentialJsonString);
            }
          }
        }
      }
    }
  }
  console.log("Worker: findAndParseMetadataComment: No valid metadata comment found.");
  return null;
};

export const fetchGitHubUserDetails = async (userId: number): Promise<GitHubUserDetails | null> => {
  // Skip cache if no token is available to ensure fresh data when token is restored
  if (!GITHUB_TOKEN) {
    console.warn(`Worker: No GitHub token available. Skipping user details fetch for ${userId}`);
    return null;
  }

  const cachedDetails = await leaderboardCache.getUserDetails(userId);
  if (cachedDetails && cachedDetails.login && !cachedDetails.login.startsWith('GitHub ID:')) {
    console.log(`Worker: Using cached user details for ID ${userId}`);
    return cachedDetails;
  }

  console.log(`Worker: Fetching GitHub details for user ID ${userId}`);
  const url = `https://api.github.com/user/${userId}`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${GITHUB_TOKEN}`
  };

  try {
    const response = await fetch(url, { headers });

    // Handle rate limiting
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      console.warn(`Worker: Rate limited when fetching user ${userId}. Remaining: ${rateLimitRemaining}, Reset: ${rateLimitReset}`);
      return null;
    }

    if (!response.ok) {
      console.warn(`Worker: GitHub user API request failed for user ${userId}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Strict validation of GitHub profile data
    if (!data || typeof data !== 'object') {
      console.warn(`Worker: Invalid response data for user ${userId}`);
      return null;
    }

    const { id, login, avatar_url } = data;

    // Validate all required fields
    if (typeof id !== 'number' || id !== userId) {
      console.warn(`Worker: Mismatched or invalid user ID in response for ${userId}`);
      return null;
    }

    if (typeof login !== 'string' || login.startsWith('GitHub ID:') || !login.trim()) {
      console.warn(`Worker: Invalid login in response for user ${userId}`);
      return null;
    }

    if (typeof avatar_url !== 'string' || !avatar_url.startsWith('http')) {
      console.warn(`Worker: Invalid avatar URL in response for user ${userId}`);
      return null;
    }

    const userDetails: GitHubUserDetails = { id, login, avatar_url };
    console.log(`Worker: Successfully fetched details for ${userDetails.login}`);

    // Only cache valid GitHub profile data
    await leaderboardCache.setUserDetails(userId, userDetails);
    return userDetails;
  } catch (e) {
    console.error(`Worker: Error fetching GitHub details for user ${userId}:`, e);
    return null;
  }
};

// --- Main Processing Function ---

export const processAndAggregateLeaderboardData = async (
  combinedDataFromDb: CombinedLeaderboardData[]
): Promise<LeaderboardEntry[]> => {
  console.log("Worker: processAndAggregateLeaderboardData: Starting...");

  const aggregatedDataByUser: Record<number, AggregatedUserData> = {};
  const issuesToFetch = new Map<string, { owner: string; repo: string; issueNumber: number }>();

  console.log("Worker: First pass - identifying users and issues...");
  for (const permit of combinedDataFromDb) {
    // Use the github_user.id directly if available
    const githubId = permit.github_user?.id;
    if (!githubId) {
      console.warn(`Worker: Missing github_user ID for permit nonce ${permit.nonce}`);
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
        console.warn(`Worker: Could not parse issue URL: ${permit.location.node_url}`);
      }
    }
  }
  console.log(`Worker: Identified ${Object.keys(aggregatedDataByUser).length} users and ${issuesToFetch.size} unique issues.`);

  console.log("Worker: Fetching/caching metadata for all unique issues...");
  const metadataPromises = Array.from(issuesToFetch.entries()).map(([url, params]) =>
    fetchAndCacheIssueMetadata(params.owner, params.repo, params.issueNumber).then((metadata) => ({ url, metadata }))
  );
  const metadataResults = await Promise.all(metadataPromises);
  const metadataByUrl = new Map(metadataResults.map((res) => [res.url, res.metadata]));
  console.log("Worker: Finished fetching/caching metadata.");

  console.log("Worker: Second pass - extracting XP using cached metadata...");
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
             console.error(`Worker: Error parsing XP for category ${category} in issue ${issueUrl}, user ${githubId}:`, parseError, categoryData);
          }


          if (categoryXp > 0) {
            aggregatedDataByUser[githubId].xpByCategory[category] = (aggregatedDataByUser[githubId].xpByCategory[category] || 0) + categoryXp;
            currentPermitTotalXp += categoryXp;
          }
        });

        aggregatedDataByUser[githubId].totalXp += currentPermitTotalXp;
        // console.log(`Worker: Processed ${currentPermitTotalXp} XP for user ${githubId} from issue ${issueUrl}`);
      } else {
         console.warn(`Worker: Could not find metadata entry for user ID ${githubId} in issue ${issueUrl}`);
      }
    }
  }
  console.log("Worker: Finished extracting XP.");

  // Fetch GitHub user details
  const uniqueUserIds = Object.keys(aggregatedDataByUser).map((id) => parseInt(id, 10));
  console.log(`Worker: Fetching GitHub user details for ${uniqueUserIds.length} users...`);
  const userDetailPromises = uniqueUserIds.map(fetchGitHubUserDetails);
  const userDetailResults = await Promise.all(userDetailPromises);
  const userDetailsMap = new Map<number, GitHubUserDetails>();
  userDetailResults.forEach((detail) => {
    if (detail) {
      userDetailsMap.set(detail.id, detail);
    }
  });
  console.log(`Worker: Fetched details for ${userDetailsMap.size} users.`);

  // Final mapping to LeaderboardEntry
  const finalLeaderboard = Object.values(aggregatedDataByUser)
    .map((userData): LeaderboardEntry => {
      const userDetails = userDetailsMap.get(userData.githubId);
      return {
        githubUsername: userDetails?.login ?? `GitHub ID: ${userData.githubId}`,
        avatarUrl: userDetails?.avatar_url ?? "",
        totalXp: userData.totalXp,
        xpByCategory: userData.xpByCategory,
        permitCount: userData.permitCount,
      };
    })
    .sort((a, b) => b.totalXp - a.totalXp); // Sort descending by total XP

  console.log("Worker: processAndAggregateLeaderboardData: Finished, returning final leaderboard.");
  return finalLeaderboard;
};


// --- Supabase Initialization Helper ---
async function ensureSupabaseInitialized(): Promise<boolean> {
  if (isSupabaseInitialized) {
    return true;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Worker: Supabase URL or Key is missing in environment variables.");
    return false;
  }
  try {
    console.log("Worker: Initializing Supabase...");
    await initializeSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
    isSupabaseInitialized = true;
    console.log("Worker: Supabase initialized successfully.");
    return true;
  } catch (error) {
    console.error("Worker: Failed to initialize Supabase:", error);
    isSupabaseInitialized = false;
    return false;
  }
}


// --- Message Handler ---

// Define the structure of messages received by the worker
interface WorkerIncomingMessage {
  type: "SET_GITHUB_TOKEN" | "FETCH_LEADERBOARD_DATA"; // Add other types as needed
  payload?: unknown; // Use specific types for payload based on 'type'
}

// Define the structure for messages sent back to the main thread
interface WorkerOutgoingMessage {
  type: string; // e.g., "LEADERBOARD_DATA_RESULT"
  payload?: LeaderboardEntry[];
  error?: string;
}

// Main message handler
self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const { type, payload } = event.data;

  console.log(`Worker: Received message type: ${type}`);

  if (type === "SET_GITHUB_TOKEN") {
    const newGitHubToken = (typeof payload === 'string' && payload) ? payload : null;
    const tokenChanged = GITHUB_TOKEN !== newGitHubToken;
    GITHUB_TOKEN = newGitHubToken;
    console.log(`Worker: GitHub token ${GITHUB_TOKEN ? 'received and set' : 'set to null'}.`);

    if (tokenChanged) {
      console.log("Worker: Token changed, clearing caches...");
      try {
        await Promise.all([
          leaderboardCache.clearAll(),
          githubCommentCache.clearCache()
        ]);
        console.log("Worker: Cleared all caches on token change.");
      } catch (error) {
        console.error("Worker: Error clearing caches:", error);
        // Proceed even if cache clearing fails
      }
    }

    // Ensure Supabase is initialized (or re-initialized if needed, though singleton handles that)
    // We do this here to ensure Supabase is ready *before* the first fetch request comes.
    await ensureSupabaseInitialized();

  } else if (type === "FETCH_LEADERBOARD_DATA") {
    console.log("Worker: Starting leaderboard data fetch and processing...");
    try {
      // Ensure Supabase is initialized before fetching
      const supabaseReady = await ensureSupabaseInitialized();
      if (!supabaseReady) {
        throw new Error("Supabase client could not be initialized.");
      }

      // Step 1: Fetch raw data from Supabase
      console.log("Worker: Calling fetchAllPermitsForLeaderboard...");
      const rawData = await fetchAllPermitsForLeaderboard();
      console.log(`Worker: Fetched ${rawData.length} raw permit entries.`);

      // Step 2: Process and aggregate the data
      console.log("Worker: Calling processAndAggregateLeaderboardData...");
      const processedData = await processAndAggregateLeaderboardData(rawData);
      console.log(`Worker: Processed data into ${processedData.length} leaderboard entries.`);

      // Step 3: Post the successful result back
      self.postMessage({
        type: "LEADERBOARD_DATA_RESULT",
        payload: processedData,
      } as WorkerOutgoingMessage);
      console.log("Worker: Sent LEADERBOARD_DATA_RESULT with processed data.");

    } catch (error) {
      console.error("Worker: Error during FETCH_LEADERBOARD_DATA:", error);
      // Post an error message back
      self.postMessage({
        type: "LEADERBOARD_DATA_RESULT",
        error: error instanceof Error ? error.message : String(error),
      } as WorkerOutgoingMessage);
      console.log("Worker: Sent LEADERBOARD_DATA_RESULT with error.");
    }
  } else {
    console.warn(`Worker: Unhandled message type: ${type}`);
  }
};

console.log("Worker: leaderboard-processing.ts loaded and message handler attached.");
