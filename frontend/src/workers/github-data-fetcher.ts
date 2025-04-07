import { githubCommentCache } from "../utils/github-comment-cache.ts";
import { leaderboardCache } from "../utils/leaderboard-cache.ts";

// --- Types ---

// Structure for fetched GitHub user details (login and avatar)
export interface GitHubUserDetails {
  login: string;
  avatar_url: string;
  id: number; // GitHub User ID
}

// Structure for the parsed metadata from the bot comment
export interface PermitCommentMetadata {
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

// Define the complete type for GitHub API comment structure
export interface GitHubComment {
  id: number;
  body?: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
}


// --- GitHub Data Fetching and Parsing ---

/**
 * Fetches comments for a GitHub issue, parses metadata, and caches results.
 * Requires a GitHub token for authenticated requests.
 */
export const fetchAndCacheIssueMetadata = async (
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken: string | null // Accept token as parameter
): Promise<PermitCommentMetadata | null> => {
  const issueUrl = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

  try {
    // Try to get metadata from cache first
    const cachedMetadata = await leaderboardCache.getMetadata(issueUrl);
    if (cachedMetadata) {
      console.log(`GitHubFetcher: Using cached metadata for ${issueUrl}`);
      return cachedMetadata;
    }

    // Try to get comments from cache
    const cachedComments = await githubCommentCache.getComments(issueUrl);
    let comments: GitHubComment[];

    if (cachedComments) {
      console.log(`GitHubFetcher: Using cached comments for ${owner}/${repo}#${issueNumber}`);
      comments = cachedComments.comments;
    } else {
      console.log(`GitHubFetcher: Fetching comments for ${owner}/${repo}#${issueNumber}`);
      const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };
      if (githubToken) {
        headers["Authorization"] = `Bearer ${githubToken}`;
      } else {
        console.warn(`GitHubFetcher: No GitHub token provided. Making unauthenticated request to ${apiUrl}.`);
      }

      const response = await fetch(apiUrl, { headers });
      if (!response.ok) {
        console.error(`GitHubFetcher: Failed to fetch comments for ${owner}/${repo}#${issueNumber}: ${response.status}`);
        return null; // Don't cache failed fetches
      }

      const responseData = await response.json();
      comments = responseData as GitHubComment[];

      // Cache the fetched comments
      await githubCommentCache.setComments(issueUrl, comments);
      console.log(`GitHubFetcher: Cached comments for ${issueUrl}`);
    }

    // Parse metadata from comments (cached or freshly fetched)
    const metadata = findAndParseMetadataComment(comments);

    if (metadata) {
      await leaderboardCache.setMetadata(issueUrl, metadata);
      console.log(`GitHubFetcher: Cached metadata for ${issueUrl}`);
    } else {
      console.warn(`GitHubFetcher: No metadata found in comments for ${issueUrl}`);
      // Optional: Cache null to avoid re-fetching comments for a while
      // await leaderboardCache.setMetadata(issueUrl, null);
    }

    return metadata;
  } catch (e) {
    console.error(`GitHubFetcher: Error in fetchAndCacheIssueMetadata for ${owner}/${repo}#${issueNumber}:`, e);
    return null;
  }
};

/**
 * Finds and parses the Ubiquity metadata comment from an array of GitHub comments.
 */
export const findAndParseMetadataComment = (comments: GitHubComment[]): PermitCommentMetadata | null => {
  console.log(`GitHubFetcher: findAndParseMetadataComment: Searching ${comments.length} comments...`);
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
                console.log("GitHubFetcher: findAndParseMetadataComment: Successfully parsed metadata.");
                return metadata;
              } else {
                 console.warn("GitHubFetcher: Parsed JSON does not match expected metadata structure (missing 'output').");
              }
            } catch (e) {
              console.error("GitHubFetcher: Failed to parse JSON metadata from comment:", e, "\nAttempted JSON String:", potentialJsonString);
            }
          }
        }
      }
    }
  }
  console.log("GitHubFetcher: findAndParseMetadataComment: No valid metadata comment found.");
  return null;
};

/**
 * Fetches GitHub user details (login, avatar) by user ID.
 * Requires a GitHub token for authenticated requests. Caches results.
 */
export const fetchGitHubUserDetails = async (
  userId: number,
  githubToken: string | null // Accept token as parameter
): Promise<GitHubUserDetails | null> => {
  // Skip fetch and cache if no token is available
  if (!githubToken) {
    console.warn(`GitHubFetcher: No GitHub token available. Skipping user details fetch for ${userId}`);
    return null;
  }

  const cachedDetails = await leaderboardCache.getUserDetails(userId);
  // Ensure cached details are valid before returning
  if (cachedDetails && cachedDetails.login && !cachedDetails.login.startsWith('GitHub ID:')) {
    console.log(`GitHubFetcher: Using cached user details for ID ${userId}`);
    return cachedDetails;
  }

  console.log(`GitHubFetcher: Fetching GitHub details for user ID ${userId}`);
  const url = `https://api.github.com/user/${userId}`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${githubToken}`
  };

  try {
    const response = await fetch(url, { headers });

    // Handle rate limiting
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      console.warn(`GitHubFetcher: Rate limited when fetching user ${userId}. Remaining: ${rateLimitRemaining}, Reset: ${rateLimitReset}`);
      return null;
    }

    if (!response.ok) {
      console.warn(`GitHubFetcher: GitHub user API request failed for user ${userId}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Strict validation of GitHub profile data
    if (!data || typeof data !== 'object') {
      console.warn(`GitHubFetcher: Invalid response data for user ${userId}`);
      return null;
    }

    const { id, login, avatar_url } = data;

    // Validate all required fields
    if (typeof id !== 'number' || id !== userId) {
      console.warn(`GitHubFetcher: Mismatched or invalid user ID in response for ${userId}`);
      return null;
    }

    if (typeof login !== 'string' || login.startsWith('GitHub ID:') || !login.trim()) {
      console.warn(`GitHubFetcher: Invalid login in response for user ${userId}`);
      return null;
    }

    if (typeof avatar_url !== 'string' || !avatar_url.startsWith('http')) {
      console.warn(`GitHubFetcher: Invalid avatar URL in response for user ${userId}`);
      return null;
    }

    const userDetails: GitHubUserDetails = { id, login, avatar_url };
    console.log(`GitHubFetcher: Successfully fetched details for ${userDetails.login}`);

    // Only cache valid GitHub profile data
    await leaderboardCache.setUserDetails(userId, userDetails);
    return userDetails;
  } catch (e) {
    console.error(`GitHubFetcher: Error fetching GitHub details for user ${userId}:`, e);
    return null;
  }
};
