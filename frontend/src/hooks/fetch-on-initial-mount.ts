import React, { useEffect } from "react"; // Import React
import type { PermitData } from "../types";

// Rename function and add types
export function useFetchOnInitialMount(
  isConnected: boolean,
  isWorkerInitialized: boolean,
  allPermitsRef: React.MutableRefObject<Map<string, PermitData>>, // Add type
  setDisplayPermits: React.Dispatch<React.SetStateAction<PermitData[]>>, // Add type
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>> // Add type
) {
  useEffect(() => {
    if (isConnected && isWorkerInitialized) {
      // console.log("Initial mount: Worker ready, applying initial filter from ref.");
      // Apply initial filter based on whatever is in the ref (loaded from cache by worker init)
      setDisplayPermits(Array.from(allPermitsRef.current.values()));
      setIsLoading(false); // Stop loading after initial filter application
    }
    // Add missing dependencies
  }, [isConnected, isWorkerInitialized, allPermitsRef, setDisplayPermits, setIsLoading]);
}
