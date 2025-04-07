import { useCallback, useEffect, useState, useRef } from "react";
// Removed useWorker import
import { leaderboardCache } from "../utils/leaderboard-cache"; // Keep for caching final results
import type { LeaderboardEntry } from "../workers/leaderboard-processing"; // Import final type

// Removed unused types: RawPermitInfoFromWorker, GitHubUserDetails, PermitCommentMetadata, AggregatedUserData, GitHubComment

// Read GitHub Token from environment variables
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;

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
  // Use useRef to hold the worker instance - prevents re-creation on re-renders
  const workerRef = useRef<Worker | null>(null);
  // State to track if the worker has been successfully initialized (token sent)
  const [isWorkerReady, setIsWorkerReady] = useState<boolean>(false);

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
      if (!workerRef.current) {
         console.log("useLeaderboardData: Ignoring message, worker instance lost (likely unmounted or not created)");
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
    [setLeaderboardData, setError, setIsLoading] // Dependencies updated - workerRef is stable
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

  // Effect for worker creation, initialization, and data fetching
  useEffect(() => {
    let mounted = true; // Simple mount check

    const initializeWorker = () => {
      console.log("useLeaderboardData: Initializing leaderboard worker...");
      setIsLoading(true); // Start loading
      setError(null); // Clear previous errors

      try {
        // Create the worker instance
        const newWorker = new Worker(new URL('../workers/leaderboard-processing.ts', import.meta.url), { type: 'module' });
        workerRef.current = newWorker;
        console.log("useLeaderboardData: Leaderboard worker instance created.");

        // --- Error Handling ---
        const handleError = (event: ErrorEvent) => {
          console.error("useLeaderboardData: Worker error:", event.message, event);
          if (mounted) {
            setError(`Worker error: ${event.message}`);
            setIsLoading(false);
            setIsWorkerReady(false); // Mark as not ready on error
            // Clean up worker instance on critical error
            workerRef.current?.terminate();
            workerRef.current = null;
          }
        };
        newWorker.addEventListener('error', handleError);

        // --- Message Handling ---
        newWorker.addEventListener('message', handleWorkerMessage);
        console.log("useLeaderboardData: Added message and error listeners.");

        // --- Send Token ---
        if (!GITHUB_TOKEN) {
          console.warn("useLeaderboardData: VITE_GITHUB_TOKEN is missing in environment variables. Proceeding without authentication.");
          // Optionally set an error state or allow proceeding unauthenticated
          // setError("GitHub token is missing. Leaderboard data might be incomplete or rate-limited.");
        }
        console.log("useLeaderboardData: Sending SET_GITHUB_TOKEN to worker.");
        newWorker.postMessage({ type: 'SET_GITHUB_TOKEN', payload: GITHUB_TOKEN || null }); // Send null if undefined

        // Mark worker as ready (token sent, listeners attached)
        if (mounted) {
          setIsWorkerReady(true);
          console.log("useLeaderboardData: Worker marked as ready.");
        }

      } catch (e) {
        console.error("useLeaderboardData: Failed to create worker instance:", e);
        if (mounted) {
          setError(`Failed to create worker: ${e instanceof Error ? e.message : String(e)}`);
          setIsLoading(false);
        }
      }
    };

    // Initialize worker only if it doesn't exist yet
    if (!workerRef.current) {
      initializeWorker();
    }

    // --- Fetch Data (only if worker is ready) ---
    const fetchData = async () => {
      if (isWorkerReady && workerRef.current) {
        console.log("useLeaderboardData: Worker is ready, checking cache...");
        const hadCacheHit = await loadInitialData();
        if (!hadCacheHit && mounted) {
          console.log("useLeaderboardData: Cache miss, requesting fresh data (FETCH_LEADERBOARD_DATA)");
          workerRef.current.postMessage({ type: "FETCH_LEADERBOARD_DATA" });
          // isLoading should already be true or set by loadInitialData
        } else if (hadCacheHit) {
          console.log("useLeaderboardData: Cache hit, data loaded.");
          // isLoading should have been set to false by loadInitialData
        }
      } else if (!workerRef.current && mounted) {
         console.log("useLeaderboardData: Waiting for worker to be ready before fetching data...");
         setIsLoading(true); // Ensure loading state is true while waiting
      }
    };

    fetchData();

    // --- Cleanup ---
    return () => {
      console.log("useLeaderboardData: Cleanup running.");
      mounted = false;
      if (workerRef.current) {
        console.log("useLeaderboardData: Terminating worker and removing listeners.");
        // Remove listeners before terminating
        workerRef.current.removeEventListener('message', handleWorkerMessage);
        // Error listener is implicitly removed on terminate, but good practice:
        // workerRef.current.removeEventListener('error', handleError); // Need to store handleError ref if doing this
        workerRef.current.terminate();
        workerRef.current = null;
        setIsWorkerReady(false); // Reset ready state on unmount
      }
    };
    // Dependencies: Only run on mount and unmount essentially, plus when worker becomes ready
  }, [isWorkerReady, handleWorkerMessage]); // Added isWorkerReady dependency

  // Removed the second useEffect for client-side filtering/re-processing

  // Return simplified state
  return {
    leaderboardData,
    isLoading, // Only one loading state now
    error, // Use local error state directly
    // Removed filter-related returns
  };
}
