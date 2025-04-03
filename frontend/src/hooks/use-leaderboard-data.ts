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
    // More specific marker targeting the main payload
    const primaryMarker = "<!-- Ubiquity - GithubCommentModule - GithubCommentModule.getBodyContent";
    for (const comment of comments) {
      if (!comment.body) continue;

      const markerIndex = comment.body.indexOf(primaryMarker);
      if (markerIndex !== -1) {
        console.log("findAndParseMetadataComment: Found potential metadata comment block.");

        const commentEndIndex = comment.body.indexOf("-->", markerIndex);
        if (commentEndIndex !== -1) {
          const jsonStartIndex = comment.body.indexOf("{", commentEndIndex);
          if (jsonStartIndex !== -1) {
            // Extract the substring starting from the first '{' after '-->'
            const potentialJsonString = comment.body.substring(jsonStartIndex);

            // Attempt to find the matching closing brace, assuming it's the main JSON object
            // This is a basic approach; a more robust parser might be needed for complex cases
            let braceDepth = 0;
            let jsonEndIndex = -1;
            for (let i = 0; i < potentialJsonString.length; i++) {
              if (potentialJsonString[i] === "{") {
                braceDepth++;
              } else if (potentialJsonString[i] === "}") {
                braceDepth--;
                if (braceDepth === 0) {
                  jsonEndIndex = i;
                  break;
                }
              }
            }

            console.trace({ potentialJsonString });

            if (jsonEndIndex !== -1) {
              const jsonString = potentialJsonString.substring(0, jsonEndIndex + 1);
              try {
                const metadata = JSON.parse(jsonString) as PermitCommentMetadata;

                // Basic validation to check if it looks like the expected structure
                if (metadata && typeof metadata.output === "object") {
                  console.log("findAndParseMetadataComment: Successfully parsed metadata.");
                  return metadata;
                } else {
                  console.warn("Parsed JSON does not match expected metadata structure (missing 'output').");
                }
              } catch (e) {
                console.error("Failed to parse JSON metadata from comment:", e, "\nAttempted JSON String:", jsonString);
                // Continue searching other comments if parsing fails
              }
            } else {
              console.warn("Could not find matching closing brace for JSON object.");
            }
          } else {
            console.log("findAndParseMetadataComment: Found marker and '-->' but not the subsequent '{'.");
          }
        } else {
          console.log("findAndParseMetadataComment: Found marker but not the closing '-->'.");
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
    const issueXpAdded = new Map<string, Set<number>>();

    console.log("processAndAggregateData: First pass - identifying users and issues...");
    for (const permit of rawPermits) {
      const githubId = extractGitHubId(permit.githubUsername);
      if (!githubId) {
        console.warn(`processAndAggregateData: Could not extract GitHub ID from ${permit.githubUsername}`);
        continue;
      }

      if (!aggregatedDataByUser[githubId]) {
        aggregatedDataByUser[githubId] = { githubId, totalXp: 0 };
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
        const userMetadataEntry = Object.values(metadata.output).find((entry) => entry.userId === githubId);

        if (userMetadataEntry && typeof userMetadataEntry.total === "number") {
          const usersAddedForIssue = issueXpAdded.get(permit.node_url) ?? new Set<number>();
          if (!usersAddedForIssue.has(githubId)) {
            console.log(`processAndAggregateData: Adding ${userMetadataEntry.total} XP for user ${githubId} from issue ${permit.node_url}`);
            aggregatedDataByUser[githubId].totalXp += userMetadataEntry.total;
            usersAddedForIssue.add(githubId);
            issueXpAdded.set(permit.node_url, usersAddedForIssue);
          } else {
            // console.log(`processAndAggregateData: XP for user ${githubId} from issue ${permit.node_url} already added.`);
          }
        } else {
          console.warn(`Could not find user ID ${githubId} or valid 'total' XP in metadata for ${permit.node_url}`);
        }
      }
      // No warning here if metadata is null, already warned above
    }
    console.log("processAndAggregateData: Finished extracting XP.");

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
          totalXp: userData.totalXp, // Use the aggregated XP from metadata
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
              sampleEntry: finalData[0],
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
