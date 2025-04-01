import React, { useCallback } from "react"; // Import React
import type { Address } from "viem"; // Import Address
import type { PermitData } from "../types";
import { PermitDataCache, PERMIT_LAST_CHECK_TIMESTAMP_KEY } from "./use-permit-data";

// Rename function and add types
export function useFetchPermits(
  workerRef: React.MutableRefObject<Worker | null>, // Add type
  isWorkerInitialized: boolean,
  isConnected: boolean,
  address: Address | undefined, // Use Address type
  allPermitsRef: React.MutableRefObject<Map<string, PermitData>>, // Add type
  setDisplayPermits: React.Dispatch<React.SetStateAction<PermitData[]>>, // Add type
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>, // Add type
  setError: React.Dispatch<React.SetStateAction<string | null>>, // Add type
  loadCache: () => PermitDataCache,
  applyFinalFilter: (permitsMap: Map<string, PermitData>) => void,
  preferredRewardTokenAddress: Address | null, // Use Address type
  chainId: number | undefined,
  fetchQuotesAndUpdatePermits: (permitsMap: Map<string, PermitData>) => Promise<Map<string, PermitData>>
) {
  return useCallback(() => {
    if (!workerRef.current || !isWorkerInitialized) {
      console.warn("useFetchPermits called before worker is ready.");
      return;
    }
    if (!isConnected || !address) {
      allPermitsRef.current.clear();
      setDisplayPermits([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Load cached data for immediate display
    // console.log("fetchPermitsAndCheck: Attempting to load cache for initial display...");
    const cachedData = loadCache();
    const initialMap = new Map<string, PermitData>();
    Object.entries(cachedData).forEach(([key, permit]) => {
      initialMap.set(key, permit);
    });
    allPermitsRef.current = initialMap;
    applyFinalFilter(allPermitsRef.current); // Show cached data immediately (without quotes initially)





    // console.log(`fetchPermitsAndCheck: Displayed ${initialMap.size} permits from cache.`);
    // Fetch quotes for cached data immediately if preference is set
    if (preferredRewardTokenAddress && address && chainId) {
      // console.log("fetchPermitsAndCheck: Fetching quotes for cached data...");
      fetchQuotesAndUpdatePermits(initialMap).then(mapWithQuotes => {
        allPermitsRef.current = mapWithQuotes; // Update ref with quote results
        applyFinalFilter(allPermitsRef.current); // Re-apply filter to update UI with quotes


        // console.log("fetchPermitsAndCheck: Updated display with quotes for cached data.");
      }).catch(quoteError => {
        console.error("Error fetching quotes for cached data:", quoteError);
        // Optionally set an error state here, but don't block permit validation
      });
    }


    // Get last check timestamp from localStorage
    let lastCheckTimestamp: string | null = null;
    try {
      // console.log("fetchPermitsAndCheck: Attempting to read last check timestamp...");
      lastCheckTimestamp = localStorage.getItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY);
      // console.log(`fetchPermitsAndCheck: Read timestamp: ${lastCheckTimestamp}`);
    } catch (e) {
      console.error("Failed to read last check timestamp from localStorage", e);
    }
    // console.log(`Posting FETCH_NEW_PERMITS message to worker... Last check: ${lastCheckTimestamp || 'Never'}`);
    // Ask worker to fetch only new permits since last check
    workerRef.current.postMessage({ type: 'FETCH_NEW_PERMITS', payload: { address, lastCheckTimestamp } }); // Correct message type

    // Add missing dependencies
  }, [
      address,
      isConnected,
      isWorkerInitialized,
      loadCache,
      applyFinalFilter,
      preferredRewardTokenAddress,
      chainId,
      fetchQuotesAndUpdatePermits,
      workerRef, // Added
      allPermitsRef, // Added
      setDisplayPermits, // Added
      setIsLoading, // Added
      setError // Added
    ]);
}
