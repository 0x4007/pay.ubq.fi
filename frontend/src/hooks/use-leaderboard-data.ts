import { useCallback, useEffect, useRef, useState } from "react";
import { useWorker } from "../context/worker-context.tsx"; // Import useWorker
import { leaderboardCache } from "../utils/leaderboard-cache.ts";
import type { LeaderboardEntry } from "../workers/leaderboard-aggregator.ts";
// Removed initializer import: import { fetchLeaderboardData } from "../workers/leaderboard-worker-initializer.ts";

// Define hook props
interface UseLeaderboardDataProps {
  selectedWeeks: number;
  selectedRepository?: string | null;
}

/**
 * Hook to fetch and manage leaderboard data using the shared worker
 */
export function useLeaderboardData({ selectedWeeks, selectedRepository }: UseLeaderboardDataProps) {
  const { worker, isWorkerInitialized, workerError } = useWorker(); // Get worker from context
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]); // State for the data
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(null); // Ref to hold the current listener

  /**
   * Load data from cache or worker
   */
  // Helper to get cache key incorporating repository filter
  const getCacheKey = (weeks: number, repo: string | null | undefined) =>
    repo ? `${weeks}_weeks_repo_${repo}` : `${weeks}_weeks`;

  const loadData = useCallback(async () => {
    // Ensure worker is ready before proceeding
    if (!isWorkerInitialized) {
      console.log("useLeaderboardData: Worker not initialized yet, waiting...");
      if (workerError) {
        setError(`Worker initialization failed: ${workerError}`);
        setIsLoading(false);
      } else {
        // Still initializing, keep loading state true
        setIsLoading(true);
      }
      return;
    }
    if (!worker) {
      setError("Worker instance is not available after initialization.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null); // Clear previous errors

    try {
      // Try to load from cache first
      const cacheKey = getCacheKey(selectedWeeks, selectedRepository);
      console.log(`useLeaderboardData: Checking cache with key ${cacheKey}...`);
      const cachedData = await leaderboardCache.getProcessedData(cacheKey);

      if (cachedData && cachedData.length > 0) {
        console.log(`useLeaderboardData: Using cached data (${cachedData.length} entries)`);
        setLeaderboardData(cachedData);
        setIsLoading(false);
        return; // Exit early if cache hit
      }

      // No cache hit, fetch from the shared worker
      console.log(`useLeaderboardData: Fetching fresh data for ${selectedWeeks} weeks from shared worker...`);

      // --- Worker Communication ---

      // Remove previous listener if it exists to prevent duplicates
      if (messageListenerRef.current) {
        worker.removeEventListener('message', messageListenerRef.current);
        console.log("useLeaderboardData: Removed previous message listener.");
      }

      // Define the new listener for this specific request
      const handleMessage = (event: MessageEvent) => {
        const { type, payload, error: workerMsgError } = event.data;

        // Only handle the response for leaderboard data
        if (type === "LEADERBOARD_DATA_RESULT") {
          console.log(`useLeaderboardData: Received LEADERBOARD_DATA_RESULT`);
          // Remove this specific listener after receiving the response
          worker.removeEventListener('message', handleMessage);
          messageListenerRef.current = null; // Clear the ref

          if (workerMsgError) {
            console.error("useLeaderboardData: Worker returned error:", workerMsgError);
            setError(workerMsgError);
            setLeaderboardData([]);
          } else {
            const freshData = (payload as LeaderboardEntry[]) || [];
            console.log(`useLeaderboardData: Received ${freshData.length} entries from worker`);
            setLeaderboardData(freshData);
            setError(null); // Clear previous errors on success

            // Cache the results for future use with repository filtering
            leaderboardCache.setProcessedData(freshData, getCacheKey(selectedWeeks, selectedRepository))
              .then(() => console.log(`useLeaderboardData: Cached ${freshData.length} entries for ${selectedWeeks} weeks`))
              .catch(cacheError => console.error("useLeaderboardData: Error caching data:", cacheError));
          }
          setIsLoading(false); // Update loading state
        }
        // Potentially handle other message types if the worker sends more than just leaderboard results
      };

      // Store the listener function in the ref so cleanup can find it
      messageListenerRef.current = handleMessage;

      // Add the event listener to the worker
      worker.addEventListener('message', handleMessage);
      console.log("useLeaderboardData: Added message listener for LEADERBOARD_DATA_RESULT.");

      // Send the request to the worker
      worker.postMessage({
        type: "FETCH_LEADERBOARD_DATA",
        payload: {
          selectedWeeks,
          selectedRepository
        }
      });
      console.log(`useLeaderboardData: Sent FETCH_LEADERBOARD_DATA message for ${selectedWeeks} weeks.`);

    } catch (err) {
      // Catch errors during the setup phase (e.g., cache access)
      console.error("useLeaderboardData: Error initiating data load:", err);
      setError(err instanceof Error ? err.message : String(err));
      setLeaderboardData([]);
      setIsLoading(false);
      // Clean up listener in case of setup error before message is sent/received
      if (messageListenerRef.current && worker) {
        worker.removeEventListener('message', messageListenerRef.current);
        messageListenerRef.current = null;
      }
    }
    // Note: setIsLoading(false) is handled within the message listener or catch block for async operations
  }, [selectedWeeks, selectedRepository, worker, isWorkerInitialized, workerError]); // Dependencies for the useCallback

  // Effect to trigger loading data when selectedWeeks or worker initialization state changes
  useEffect(() => {
    console.log("useLeaderboardData useEffect: Running effect. isWorkerInitialized:", isWorkerInitialized, "workerError:", workerError); // Added log
    loadData();

    // Cleanup function: Remove the message listener when the component unmounts
    // or when dependencies of loadData change (triggering a new loadData function)
    return () => {
      if (messageListenerRef.current && worker) {
        worker.removeEventListener('message', messageListenerRef.current);
        console.log("useLeaderboardData: Cleaned up message listener on unmount/dependency change.");
        messageListenerRef.current = null; // Clear ref on cleanup
      }
    };
  }, [loadData, worker, isWorkerInitialized, workerError]); // Added isWorkerInitialized and workerError to dependencies

  return {
    leaderboardData,
    isLoading,
    error
  };
}
