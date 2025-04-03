import { useCallback, useEffect, useState } from "react";
import { useWorker } from "../context/worker-context.tsx";

// Define the structure for aggregated leaderboard data
export interface LeaderboardEntry {
  githubUsername: string;
  avatarUrl: string;
  totalXp: number; // Using 'number' as XP comes from JSON metadata
  xpByCategory: Record<string, number>; // Added XP breakdown
}

// Structure returned by the worker (includes node_url now)
interface RawPermitInfoFromWorker {
  nonce: string;
  networkId: number;
  amount?: string; // Original on-chain amount (not used for XP)
  githubUsername: string; // Placeholder like "GitHub ID: 12345"
  avatarUrl: string; // Empty string from worker
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
    [key: string]: {
      // Key is the GitHub username (string)
      userId: number; // GitHub User ID
      total: number; // This is the XP value we need
      // ... other fields
    };
  };
  // ... other fields
}

// Type for storing aggregated data before final formatting
interface AggregatedUserData {
  githubId: number;
  totalXp: number; // Store as number directly from JSON
  xpByCategory: Record<string, number>; // Added XP breakdown
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
    console.log(`fetchGitHubIssueComments: Fetching for ${owner}/${repo}#${issueNumber}`);
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };
    if (GITHUB_TOKEN) {
      headers["Authorization"] = `token ${GITHUB_TOKEN}`;
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
      const comments = (await response.json()) as GitHubComment[];
      console.log(`fetchGitHubIssueComments: Fetched ${comments.length} comments for ${owner}/${repo}#${issueNumber}`);
      return comments;
    } catch (e) {
      console.error(`Error fetching comments for ${owner}/${repo}#${issueNumber}:`, e);
      return [];
    }
  };

  // Use the specific type for comments array
  const findAndParseMetadataComment = (comments: GitHubComment[]): PermitCommentMetadata | null => {
    console.log(`findAndParseMetadataComment: Searching ${comments.length} comments...`);
    const primaryMarker = "<!-- Ubiquity - GithubCommentModule - GithubCommentModule.getBodyContent";
    for (const comment of comments) {
      if (!comment.body) continue;

      const markerIndex = comment.body.indexOf(primaryMarker);
      if (markerIndex !== -1) {
        console.log("findAndParseMetadataComment: Found potential metadata comment block.");

        // Find the first '{' AFTER the marker
        const jsonStartIndex = comment.body.indexOf("{", markerIndex + primaryMarker.length);
        if (jsonStartIndex !== -1) {
          // Find the closing '-->' AFTER the '{'
          const commentEndIndex = comment.body.indexOf("-->", jsonStartIndex);
          if (commentEndIndex !== -1) {
            // Extract the string between the '{' and '-->'
            const potentialJsonString = comment.body.substring(jsonStartIndex, commentEndIndex).trim();
            console.trace({ potentialJsonString }); // Log the extracted string for debugging

            if (potentialJsonString) {
              try {
                const metadata = JSON.parse(potentialJsonString) as PermitCommentMetadata;
                // Basic validation
                if (metadata && typeof metadata.output === "object") {
                  console.log("findAndParseMetadataComment: Successfully parsed metadata.");
                  return metadata;
                } else {
                  console.warn("Parsed JSON does not match expected metadata structure (missing 'output').");
                }
              } catch (e) {
                console.error("Failed to parse JSON metadata from comment:", e, "\nAttempted JSON String:", potentialJsonString);
                // Continue searching other comments if parsing fails
              }
            } else {
              console.warn("Extracted potential JSON string is empty.");
            }
          } else {
            console.log("findAndParseMetadataComment: Found marker and '{' but not the subsequent '-->'.");
          }
        } else {
          console.log("findAndParseMetadataComment: Found marker but not the subsequent '{'.");
        }
      }
    }
    console.log("findAndParseMetadataComment: No valid metadata comment found after searching all comments.");
    return null;
  };

  const fetchGitHubUserDetails = async (userId: number): Promise<GitHubUserDetails | null> => {
    console.log(`fetchGitHubUserDetails: Fetching details for user ID ${userId}`);
    const url = `https://api.github.com/user/${userId}`;
    const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };
    if (GITHUB_TOKEN) {
      headers["Authorization"] = `token ${GITHUB_TOKEN}`;
    }
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.warn(`GitHub user API request failed for user ${userId}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      if (data && typeof data.login === "string" && typeof data.avatar_url === "string" && typeof data.id === "number") {
        console.log(`fetchGitHubUserDetails: Successfully fetched details for ${data.login}`);
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
    console.log("processAndAggregateData: Starting...");
    setIsProcessingData(true);
    setError(null);

    const aggregatedDataByUser: Record<number, AggregatedUserData> = {};
    const issuesToFetch = new Map<string, { owner: string; repo: string; issueNumber: number }>();
    // const issueXpAdded = new Map<string, Set<number>>(); // No longer needed for category breakdown
    const xpSourceKeys = new Set<string>(); // Initialize Set inside useCallback

    console.log("processAndAggregateData: First pass - identifying users and issues...");
    for (const permit of rawPermits) {
      const githubId = extractGitHubId(permit.githubUsername);
      if (!githubId) {
        console.warn(`processAndAggregateData: Could not extract GitHub ID from ${permit.githubUsername}`);
        continue;
      }

      if (!aggregatedDataByUser[githubId]) {
        // Initialize with xpByCategory
        aggregatedDataByUser[githubId] = { githubId, totalXp: 0, xpByCategory: {} };
      }

      if (permit.node_url && !issuesToFetch.has(permit.node_url)) {
        const parsedUrl = parseGitHubIssueUrl(permit.node_url);
        if (parsedUrl) {
          issuesToFetch.set(permit.node_url, parsedUrl);
        } else {
          console.warn(`processAndAggregateData: Could not parse issue URL: ${permit.node_url}`);
        }
      }
    }
    console.log(`processAndAggregateData: Identified ${Object.keys(aggregatedDataByUser).length} users and ${issuesToFetch.size} unique issues.`);

    console.log("processAndAggregateData: Fetching comments for all unique issues...");
    const commentPromises = Array.from(issuesToFetch.entries()).map(([url, params]) =>
      fetchGitHubIssueComments(params.owner, params.repo, params.issueNumber).then((comments) => ({ url, comments }))
    );
    const commentResults = await Promise.all(commentPromises);
    const commentsByUrl = new Map(commentResults.map((res) => [res.url, res.comments]));
    console.log("processAndAggregateData: Finished fetching comments.");

    console.log("processAndAggregateData: Second pass - extracting XP from comments...");
    const metadataCache = new Map<string, PermitCommentMetadata | null>();
    // Reset totalXp and xpByCategory before the second pass to avoid double counting if logic changes
    Object.values(aggregatedDataByUser).forEach(user => {
        user.totalXp = 0;
        user.xpByCategory = {};
    });


    for (const permit of rawPermits) {
      const githubId = extractGitHubId(permit.githubUsername);
      if (!githubId || !permit.node_url) continue;

      let metadata = metadataCache.get(permit.node_url);
      if (metadata === undefined) {
        const comments = commentsByUrl.get(permit.node_url);
        metadata = comments ? findAndParseMetadataComment(comments) : null;
        metadataCache.set(permit.node_url, metadata);
        if (!metadata) {
          console.warn(`processAndAggregateData: Metadata not found or parsed for issue ${permit.node_url}`);
        }
      }

      if (metadata?.output) {
        // Find the specific entry for the user within the metadata output
        // Assuming the key in metadata.output is the username, which might not match githubId directly.
        // We need a way to link githubId to the username key in metadata.output.
        // For now, let's assume the first entry found with the matching userId is correct.
        // This might need refinement if multiple entries have the same userId under different keys.
        const userMetadataEntry = Object.values(metadata.output).find(entry => entry.userId === githubId);

        if (userMetadataEntry) {
          // Aggregate XP by category for this specific comment/issue
          let currentCommentTotalXp = 0;
          const knownCategories = ["task", "comments", "reviewRewards"]; // Use the identified keys

          knownCategories.forEach(category => {
            let categoryXp = 0;
            const categoryData = userMetadataEntry[category as keyof typeof userMetadataEntry];

            // Safely check task reward type
            if (category === "task" && typeof categoryData === 'object' && categoryData !== null && typeof (categoryData as { reward?: unknown }).reward === 'number') {
              categoryXp = (categoryData as { reward: number }).reward;
            } else if (category === "comments" && Array.isArray(categoryData)) {
              categoryXp = categoryData.reduce((sum: number, comment: { score?: { reward?: number } }) => sum + (comment?.score?.reward || 0), 0);
            } else if (category === "reviewRewards" && Array.isArray(categoryData)) {
              categoryXp = categoryData.reduce((sum: number, reviewReward: { reviews?: { reward?: number }[] }) => {
                const reviewSum = Array.isArray(reviewReward?.reviews)
                  ? reviewReward.reviews.reduce((rSum: number, review: { reward?: number }) => rSum + (review?.reward || 0), 0)
                  : 0;
                return sum + reviewSum;
              }, 0);
            }

            if (categoryXp > 0) {
              // Add to the user's category total
              aggregatedDataByUser[githubId].xpByCategory[category] = (aggregatedDataByUser[githubId].xpByCategory[category] || 0) + categoryXp;
              currentCommentTotalXp += categoryXp;
              xpSourceKeys.add(category); // Add category to set if it contributed XP
            }
          });

          // Add the XP calculated from categories for this comment to the user's overall total
          // This avoids using the potentially pre-calculated 'total' from the metadata
          aggregatedDataByUser[githubId].totalXp += currentCommentTotalXp;
          console.log(`processAndAggregateData: Processed ${currentCommentTotalXp} XP for user ${githubId} from issue ${permit.node_url}`);

        } else {
           // Only warn if userMetadataEntry itself was not found for this user in this comment
           console.warn(`Could not find metadata entry for user ID ${githubId} in issue ${permit.node_url}`);
        }
      }
      // No warning here if metadata is null, already warned above when setting metadataCache
    }
    console.log("processAndAggregateData: Finished extracting XP.");
    console.log("Unique XP Source Keys Found:", Array.from(xpSourceKeys)); // Log the unique keys

     // Fetch GitHub user details
    const uniqueUserIds = Object.keys(aggregatedDataByUser).map((id) => parseInt(id, 10));
    console.log(`Fetching GitHub user details for ${uniqueUserIds.length} users...`);
    const userDetailPromises = uniqueUserIds.map(fetchGitHubUserDetails);
    const userDetailResults = await Promise.all(userDetailPromises);
    const userDetailsMap = new Map<number, GitHubUserDetails>();
    userDetailResults.forEach((detail) => {
      if (detail) {
        userDetailsMap.set(detail.id, detail);
      }
    });
    console.log(`Fetched details for ${userDetailsMap.size} users.`);

    // Final mapping
    const finalLeaderboard = Object.values(aggregatedDataByUser)
      .map((userData) => {
        const userDetails = userDetailsMap.get(userData.githubId);
        return {
          githubUsername: userDetails?.login ?? `GitHub ID: ${userData.githubId}`,
          avatarUrl: userDetails?.avatar_url ?? "",
          totalXp: userData.totalXp,
          xpByCategory: userData.xpByCategory // Map the category breakdown
        };
      })
      .sort((a, b) => b.totalXp - a.totalXp);

    setIsProcessingData(false); // Finish processing
    console.log("processAndAggregateData: Finished, returning final leaderboard:", finalLeaderboard);
    return finalLeaderboard;
  }, []);

  // Effect to handle worker interaction and trigger processing
  useEffect(() => {
    let mounted = true;

    console.log("useLeaderboardData useEffect: Running effect.", {
      isWorkerInitialized,
      hasWorker: !!worker,
      contextError: contextWorkerError,
    });

    const handleWorkerMessage = async (event: MessageEvent) => {
      if (!mounted) {
        console.log("useLeaderboardData: Ignoring message, component unmounted");
        return;
      }

      console.log("useLeaderboardData handleWorkerMessage:", {
        type: event.data.type,
        hasPayload: !!event.data.payload,
        hasError: !!event.data.error,
      });

      const { type, payload, error: workerError } = event.data;

      if (type === "LEADERBOARD_DATA_RESULT") {
        if (workerError) {
          console.error("Worker returned error:", workerError);
          setError(`Failed to fetch leaderboard data: ${workerError}`);
          setLeaderboardData([]);
        } else if (!payload || !Array.isArray(payload)) {
          console.error("Invalid payload from worker:", payload);
          setError("Received invalid data format from worker");
          setLeaderboardData([]);
        } else {
          console.log("Processing worker payload:", {
            payloadLength: payload.length,
            samplePermit: payload[0],
            networkId: payload[0]?.networkId,
            nodeUrl: payload[0]?.node_url,
          });
          try {
            const finalData = await processAndAggregateData(payload);
            console.log("Final leaderboard data:", {
              entries: finalData.length,
              sampleEntry: finalData.length > 0 ? { ...finalData[0], xpByCategory: JSON.stringify(finalData[0].xpByCategory) } : null, // Log category breakdown for sample
              totalXpSum: finalData.reduce((sum, entry) => sum + entry.totalXp, 0),
            });
            setLeaderboardData(finalData);
            setError(null);
          } catch (processingError) {
            console.error("Error processing leaderboard data:", processingError);
            setError(`Failed to process leaderboard data: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
            setLeaderboardData([]);
          }
        }

        // Always set loading to false after handling the result
        setIsLoading(false);
      }
    };

    if (contextWorkerError) {
      console.error("useLeaderboardData useEffect: Worker context error detected.");
      setError(`Worker initialization failed: ${contextWorkerError}`);
      setIsLoading(false);
      return;
    }

    const initializeAndFetch = () => {
      if (!worker) {
        console.error("useLeaderboardData: No worker instance available");
        setError("Worker initialization failed");
        setIsLoading(false);
        return;
      }

      if (!isWorkerInitialized) {
        console.log("useLeaderboardData: Waiting for worker initialization...");
        setIsLoading(true);
        return;
      }

      console.log("useLeaderboardData: Setting up worker message handler and requesting data...");
      worker.addEventListener("message", handleWorkerMessage);
      setIsLoading(true);
      worker.postMessage({ type: "FETCH_LEADERBOARD_DATA" });
    };

    initializeAndFetch();

    return () => {
      console.log("useLeaderboardData: Cleanup - removing message listener");
      mounted = false;
      worker?.removeEventListener("message", handleWorkerMessage);
    };
  }, [processAndAggregateData, worker, isWorkerInitialized, contextWorkerError]);

  // Combine local error state with context error state
  const displayError = error || (contextWorkerError ? `Worker initialization failed: ${contextWorkerError}` : null);
  // Combine loading states
  const combinedIsLoading = isLoading || isProcessingData; // Use isProcessingData

  return { leaderboardData, isLoading: combinedIsLoading, error: displayError };
}
