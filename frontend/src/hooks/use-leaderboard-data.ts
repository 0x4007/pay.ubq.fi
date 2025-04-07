import { useCallback, useEffect, useState } from "react";
import { useWorker } from "../context/worker-context";
import { leaderboardCache } from "../utils/leaderboard-cache"; // Keep for caching final results
import type { LeaderboardEntry } from "../workers/leaderboard-processing"; // Import final type

// Removed unused types: RawPermitInfoFromWorker, GitHubUserDetails, PermitCommentMetadata, AggregatedUserData, GitHubComment

// Removed GITHUB_TOKEN constant

// Props no longer needed as filtering happens in component
// interface UseLeaderboardDataProps {
//   selectedWeeks: number;
// }

export function useLeaderboardData() {
  // Removed rawPermitData state
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]); // Final processed data
  const [isLoading, setIsLoading] = useState<boolean>(true); // Tracks worker fetching/processing
  // Removed isProcessingData state
  const [error, setError] = useState<string | null>(null);
  const {
    worker,
    isWorkerInitialized,
    workerError: contextWorkerError,
  }: {
    worker: Worker | null;
    isWorkerInitialized: boolean;
    workerError: string | null;
  } = useWorker();

  // Removed filter state - this should be managed by the component using the hook
  // const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // const [selectedRepository, setSelectedRepository] = useState<string | null>(null);
  // const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  // const [availableRepositories, setAvailableRepositories] = useState<string[]>([]);

  // Removed client-side processing functions:
  // extractGitHubId, parseGitHubIssueUrl, fetchAndCacheIssueMetadata,
  // findAndParseMetadataComment, fetchGitHubUserDetails, processAndAggregateData

  // Define worker message handler type (expects final LeaderboardEntry[])
  type WorkerMessage = {
    type: string;
    payload?: LeaderboardEntry[]; // Expect final data structure
    error?: string;
  };

  // Define worker message handler
  const handleWorkerMessage = useCallback(
    async (event: MessageEvent<WorkerMessage>) => {
      // Check mount status using a ref or check if worker is still valid
      if (!worker) {
         console.log("useLeaderboardData: Ignoring message, worker instance lost (likely unmounted)");
         return;
      }

      console.log("useLeaderboardData handleWorkerMessage:", {
        type: event.data.type,
        hasPayload: !!event.data.payload,
        hasError: !!event.data.error,
      });

      const { type, payload, error: workerError } = event.data;

      if (type === "LEADERBOARD_DATA_RESULT") {
        setIsLoading(false); // Stop loading once result (or error) is received
        if (workerError) {
          console.error("Worker returned error:", workerError);
          setError(`Failed to fetch leaderboard data: ${workerError}`);
          setLeaderboardData([]);
        } else if (!payload || !Array.isArray(payload)) {
          console.error("Invalid payload from worker:", payload);
          setError("Received invalid data format from worker");
          setLeaderboardData([]);
        } else {
          console.log("Received final leaderboard data from worker:", { payloadLength: payload.length });
          // Set the final processed data directly
          setLeaderboardData(payload);
          setError(null);

          // Cache the final processed results
          try {
            await leaderboardCache.setProcessedData(payload); // Assuming a method to cache only processed data
            console.log("Cached final leaderboard data to IndexedDB");
          } catch (cacheError) {
             console.error("Failed to cache leaderboard data:", cacheError);
          }
        }
      }
    },
    [worker, setLeaderboardData, setError, setIsLoading] // Dependencies updated
  );

  // Initial data loading function (simplified)
  const loadInitialData = async () => {
    console.log("useLeaderboardData: Checking cache for processed data...");
    // Try to load processed data from cache first
    const cachedData = await leaderboardCache.getProcessedData(); // Assuming method exists
    if (cachedData) {
      console.log("Using cached processed leaderboard data from IndexedDB");
      setLeaderboardData(cachedData);
      setIsLoading(false); // Stop loading if cache hit
      return true; // Cache hit
    }
    console.log("No cached processed data found.");
    setIsLoading(true); // Set loading true only if cache miss
    return false; // Cache miss
  };

  // Effect for worker initialization and data fetching
  useEffect(() => {
    let mounted = true; // Simple mount check

    const initializeAndFetch = async () => {
      if (contextWorkerError) {
        console.error("useLeaderboardData: Worker context error detected.");
        if (mounted) {
          setError(`Worker initialization failed: ${contextWorkerError}`);
          setIsLoading(false);
        }
        return;
      }

      if (!worker) {
        console.warn("useLeaderboardData: No worker instance available yet.");
        // Don't set error immediately, wait for initialization
        if (mounted) setIsLoading(true);
        return;
      }

      if (!isWorkerInitialized) {
        console.log("useLeaderboardData: Waiting for worker initialization...");
        if (mounted) setIsLoading(true);
        return;
      }

      // Try loading from cache
      const hadCacheHit = await loadInitialData();

      // Set up worker message handler if mounted
      if (mounted) {
        console.log("useLeaderboardData: Setting up worker message handler");
        worker.addEventListener("message", handleWorkerMessage);

        // Only request fresh data from worker if cache was missed
        if (!hadCacheHit) {
          console.log("useLeaderboardData: Requesting fresh data from worker (FETCH_LEADERBOARD_DATA)");
          worker.postMessage({ type: "FETCH_LEADERBOARD_DATA" });
          // Keep isLoading true until response received
        }
      }
    };

    initializeAndFetch();

    // Cleanup function
    return () => {
      console.log("useLeaderboardData: Cleanup - removing message listener");
      mounted = false;
      // Remove listener only if worker instance still exists
      worker?.removeEventListener("message", handleWorkerMessage);
    };
    // Dependencies: worker instance, initialization status, context error, and the message handler
  }, [worker, isWorkerInitialized, contextWorkerError, handleWorkerMessage]);

  // Removed the second useEffect for client-side filtering/re-processing

  // Combine local error state with context error state
  const displayError = error || (contextWorkerError ? `Worker initialization failed: ${contextWorkerError}` : null);

  // Return simplified state
  return {
    leaderboardData,
    isLoading, // Only one loading state now
    error: displayError,
    // Removed filter-related returns
  };
}
