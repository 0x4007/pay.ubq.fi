import { useCallback, useEffect, useState } from "react";
import { useWorker } from "../context/worker-context.tsx";

// Define the structure for aggregated leaderboard data
export interface LeaderboardEntry {
  githubUsername: string;
  avatarUrl: string;
  totalXp: number; // Using 'number' as XP comes from JSON metadata
}

// Structure returned by the worker (includes node_url now)
interface RawPermitInfoFromWorker {
  nonce: string;
  networkId: number;
  amount?: string; // Original on-chain amount (not used for XP)
  githubUsername: string; // Placeholder like "GitHub ID: 12345"
  avatarUrl: string;    // Empty string from worker
  node_url: string | null; // GitHub issue URL
  created_at?: string;
  // Implicitly contains beneficiary_id via githubUsername placeholder
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
    [key: string]: { // Key is the GitHub username (string)
      userId: number; // GitHub User ID
      total: number; // This is the XP value we need
      // ... other fields
    }
  }
  // ... other fields
}

// Type for storing aggregated data before final formatting
interface AggregatedUserData {
  githubId: number;
  totalXp: number; // Store as number directly from JSON
  login?: string; // Fetched from GitHub API
  avatarUrl?: string; // Fetched from GitHub API
}

// Define a basic type for the expected comment structure from GitHub API
interface GitHubComment {
    body?: string;
    // Add other relevant fields if needed later, e.g., user.login if needed for matching
}

// Get GitHub PAT from env
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;

export function useLeaderboardData() {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Tracks worker fetching
  const [isProcessingData, setIsProcessingData] = useState<boolean>(false); // Tracks GitHub/aggregation processing
  const [error, setError] = useState<string | null>(null);
  const { worker, isWorkerInitialized, workerError: contextWorkerError } = useWorker();

  // --- GitHub API and Parsing Helpers ---

  const extractGitHubId = (placeholder: string): number | null => {
    const match = placeholder.match(/GitHub ID: (\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  const parseGitHubIssueUrl = (url: string): { owner: string; repo: string; issueNumber: number } | null => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/);
    if (match) {
      return { owner: match[1], repo: match[2], issueNumber: parseInt(match[3], 10) };
    }
    return null;
  };

  // Use the specific type for comments array
  const fetchGitHubIssueComments = async (owner: string, repo: string, issueNumber: number): Promise<GitHubComment[]> => {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    } else {
      console.warn("VITE_GITHUB_TOKEN not found. Making unauthenticated request to GitHub API (rate limits may apply).");
    }

    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.error(`Failed to fetch comments for ${owner}/${repo}#${issueNumber}: ${response.status}`);
        return [];
      }
      // Assert the response type after parsing
      return await response.json() as GitHubComment[];
    } catch (e) {
      console.error(`Error fetching comments for ${owner}/${repo}#${issueNumber}:`, e);
      return [];
    }
  };

  // Use the specific type for comments array
  const findAndParseMetadataComment = (comments: GitHubComment[]): PermitCommentMetadata | null => {
    const marker = "<!-- Ubiquity - GithubCommentModule -";
    for (const comment of comments) {
      if (comment.body?.includes(marker)) {
        // Extract JSON - assumes JSON starts after the marker comment closing tag -->
        const jsonStart = comment.body.indexOf("-->\n{"); // Look for newline after marker close
        if (jsonStart !== -1) {
          const jsonString = comment.body.substring(jsonStart + 4); // Start after -->\n
          try {
            // Attempt to clean potential trailing markdown/HTML if necessary
            const cleanedJsonString = jsonString.split("\n```")[0].trim();
            return JSON.parse(cleanedJsonString) as PermitCommentMetadata;
          } catch (e) {
            console.error("Failed to parse JSON metadata from comment:", e, "\nJSON String:", jsonString);
            return null;
          }
        }
      }
    }
    return null;
  };

  const fetchGitHubUserDetails = async (userId: number): Promise<GitHubUserDetails | null> => {
     const url = `https://api.github.com/user/${userId}`;
     const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };
     if (GITHUB_TOKEN) {
       headers['Authorization'] = `token ${GITHUB_TOKEN}`;
     }
     try {
       const response = await fetch(url, { headers });
       if (!response.ok) {
         console.warn(`GitHub user API request failed for user ${userId}: ${response.status}`);
         return null;
       }
       const data = await response.json();
       if (data && typeof data.login === 'string' && typeof data.avatar_url === 'string' && typeof data.id === 'number') {
         return { id: data.id, login: data.login, avatar_url: data.avatar_url };
       } else {
         console.warn(`GitHub user API response for ${userId} missing expected fields.`);
         return null;
       }
     } catch (e) {
       console.error(`Error fetching GitHub details for user ${userId}:`, e);
       return null;
     }
   };

  // --- Aggregation Logic ---

  const processAndAggregateData = useCallback(async (rawPermits: RawPermitInfoFromWorker[]): Promise<LeaderboardEntry[]> => {
    setIsProcessingData(true); // Start processing
    setError(null);

    const aggregatedDataByUser: Record<number, AggregatedUserData> = {};
    const issuesToFetch = new Map<string, { owner: string; repo: string; issueNumber: number }>();
    const issueXpAdded = new Map<string, Set<number>>(); // Track which user's XP has been added for which issue URL

    // First pass: Group by user and identify unique issues
    for (const permit of rawPermits) {
      const githubId = extractGitHubId(permit.githubUsername);
      if (!githubId) continue;

      if (!aggregatedDataByUser[githubId]) {
        aggregatedDataByUser[githubId] = { githubId, totalXp: 0 };
      }

      if (permit.node_url && !issuesToFetch.has(permit.node_url)) {
        const parsedUrl = parseGitHubIssueUrl(permit.node_url);
        if (parsedUrl) {
          issuesToFetch.set(permit.node_url, parsedUrl);
        }
      }
    }

    // Fetch comments for unique issues
    const commentPromises = Array.from(issuesToFetch.entries()).map(([url, params]) =>
      fetchGitHubIssueComments(params.owner, params.repo, params.issueNumber).then(comments => ({ url, comments }))
    );
    const commentResults = await Promise.all(commentPromises);
    const commentsByUrl = new Map(commentResults.map(res => [res.url, res.comments]));

    // Second pass: Extract XP and aggregate, ensuring XP is added only once per user per issue metadata comment
    const metadataCache = new Map<string, PermitCommentMetadata | null>();

    for (const permit of rawPermits) {
      const githubId = extractGitHubId(permit.githubUsername);
      if (!githubId || !permit.node_url) continue;

      let metadata = metadataCache.get(permit.node_url);
      if (metadata === undefined) {
        const comments = commentsByUrl.get(permit.node_url);
        metadata = comments ? findAndParseMetadataComment(comments) : null;
        metadataCache.set(permit.node_url, metadata);
      }

      if (metadata?.output) {
        const userMetadataEntry = Object.values(metadata.output).find(entry => entry.userId === githubId);

        if (userMetadataEntry && typeof userMetadataEntry.total === 'number') {
          // Check if XP for this user from this issue URL has already been added
          const usersAddedForIssue = issueXpAdded.get(permit.node_url) ?? new Set<number>();
          if (!usersAddedForIssue.has(githubId)) {
            aggregatedDataByUser[githubId].totalXp += userMetadataEntry.total;
            usersAddedForIssue.add(githubId); // Mark as added for this issue
            issueXpAdded.set(permit.node_url, usersAddedForIssue);
          }
        } else {
           console.warn(`Could not find user ID ${githubId} or valid 'total' XP in metadata for ${permit.node_url}`);
        }
      } else {
         console.warn(`Could not find or parse metadata comment in ${permit.node_url}`);
      }
    }

     // Fetch GitHub user details
     const uniqueUserIds = Object.keys(aggregatedDataByUser).map(id => parseInt(id, 10));
     console.log(`Fetching GitHub user details for ${uniqueUserIds.length} users...`);
     const userDetailPromises = uniqueUserIds.map(fetchGitHubUserDetails);
     const userDetailResults = await Promise.all(userDetailPromises);
     const userDetailsMap = new Map<number, GitHubUserDetails>();
     userDetailResults.forEach(detail => {
       if (detail) {
         userDetailsMap.set(detail.id, detail);
       }
     });
     console.log(`Fetched details for ${userDetailsMap.size} users.`);

    // Final mapping
    const finalLeaderboard = Object.values(aggregatedDataByUser)
      .map(userData => {
        const userDetails = userDetailsMap.get(userData.githubId);
        return {
          githubUsername: userDetails?.login ?? `GitHub ID: ${userData.githubId}`,
          avatarUrl: userDetails?.avatar_url ?? '',
          totalXp: userData.totalXp, // Use the aggregated XP from metadata
        };
      })
      .sort((a, b) => b.totalXp - a.totalXp);

    setIsProcessingData(false); // Finish processing
    return finalLeaderboard;
  }, []);


  // Effect to handle worker interaction and trigger processing
  useEffect(() => {
    const handleWorkerMessage = async (event: MessageEvent) => {
      const { type, payload, error: workerError } = event.data;

      if (type === "LEADERBOARD_DATA_RESULT") {
        setIsLoading(false); // Worker fetch is complete
        if (workerError) {
          console.error("Error fetching leaderboard data from worker:", workerError);
          setError(`Failed to fetch leaderboard data: ${workerError}`);
          setLeaderboardData([]);
          return;
        }

        const rawPermits = payload as RawPermitInfoFromWorker[];
        console.log("Received raw permit info from worker:", rawPermits);

        if (rawPermits.length === 0) {
          setLeaderboardData([]);
          return;
        }

        // Process the raw data (fetch GitHub info, parse comments, aggregate XP)
        try {
          const finalData = await processAndAggregateData(rawPermits);
          setLeaderboardData(finalData);
          setError(null);
        } catch (processingError) {
           console.error("Error processing leaderboard data:", processingError);
           setError(`Failed to process leaderboard data: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
           setLeaderboardData([]);
        }
      }
    };

    if (contextWorkerError) {
      setError(`Worker initialization failed: ${contextWorkerError}`);
      setIsLoading(false);
      return;
    }

    if (isWorkerInitialized && worker) {
      worker.addEventListener("message", handleWorkerMessage);
      console.log("Requesting leaderboard data from worker...");
      worker.postMessage({ type: "FETCH_LEADERBOARD_DATA" });
      setIsLoading(true); // Start loading (worker fetch)

      return () => {
        worker.removeEventListener("message", handleWorkerMessage);
        console.log("Leaderboard hook cleanup: Removed message listener.");
      };
    } else if (!isWorkerInitialized && !contextWorkerError) {
      setIsLoading(true); // Set loading while waiting for worker init
    }

  }, [processAndAggregateData, worker, isWorkerInitialized, contextWorkerError]);

  // Combine local error state with context error state
  const displayError = error || (contextWorkerError ? `Worker initialization failed: ${contextWorkerError}` : null);
  // Combine loading states
  const combinedIsLoading = isLoading || isProcessingData; // Use isProcessingData

  return { leaderboardData, isLoading: combinedIsLoading, error: displayError };
}
