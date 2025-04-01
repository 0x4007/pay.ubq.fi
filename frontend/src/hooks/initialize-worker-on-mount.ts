import React, { useEffect } from "react"; // Import React
import type { PermitData } from "../types";
import { PermitDataCache, SUPABASE_URL, SUPABASE_ANON_KEY, PERMIT_LAST_CHECK_TIMESTAMP_KEY } from "./use-permit-data";

// Rename function and add types
export function useInitializeWorkerOnMount(
  setError: React.Dispatch<React.SetStateAction<string | null>>, // Add type
  setIsWorkerInitialized: React.Dispatch<React.SetStateAction<boolean>>, // Add type
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>, // Add type
  workerRef: React.MutableRefObject<Worker | null>, // Add type
  fetchPermitsAndCheck: () => void,
  loadCache: () => PermitDataCache,
  allPermitsRef: React.MutableRefObject<Map<string, PermitData>>, // Add type
  saveCache: (cache: PermitDataCache) => void,
  applyFinalFilter: (permitsMap: Map<string, PermitData>) => void,
  fetchQuotesAndUpdatePermits: (permitsMap: Map<string, PermitData>) => Promise<Map<string, PermitData>>
) {
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      console.error("SupABASE URL or Anon Key missing");
      setIsWorkerInitialized(false);
      setIsLoading(false);
      return;
    }

    workerRef.current = new Worker(new URL('../workers/permit-checker.worker.ts', import.meta.url), { type: 'module' });
    // console.log("Permit checker worker created.");
    workerRef.current.postMessage({
      type: 'INIT',
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }
    });

    workerRef.current.onmessage = (event: MessageEvent) => {
      // Define a type for the worker message data
      type WorkerMessageData = {
        type: 'INIT_SUCCESS' | 'INIT_ERROR' | 'NEW_PERMITS_VALIDATED' | 'PERMITS_ERROR'; // Adjusted message types
        permits?: PermitData[]; // Used for NEW_PERMITS_VALIDATED
        error?: string;
      };
      const { type, permits: workerPermits, error: workerError } = event.data as WorkerMessageData; // event has implicit any, but MessageEvent type is complex to add here, accept for now
      // console.log("Message received from worker:", type);
      switch (type) {
        case 'INIT_SUCCESS':
          // console.log("Worker initialized successfully.");
          setIsWorkerInitialized(true);
          // Trigger initial fetch now that worker is ready (fetchPermitsAndCheck handles quoting based on cache)
          fetchPermitsAndCheck();
          break;
        case 'INIT_ERROR':
          console.error("Worker initialization failed:", workerError);
          setError(`Worker initialization failed: ${workerError}`);
          setIsWorkerInitialized(false);
          setIsLoading(false);
          break;
        case 'NEW_PERMITS_VALIDATED': { // Worker returns *only* newly fetched & validated permits
          const validatedNewPermits: PermitData[] = workerPermits || [];
          // console.log(`Received validation results for ${validatedNewPermits.length} new/updated permits.`);
          const currentCache = loadCache();
          let cacheUpdated = false;

          // Merge new results into the cache and the ref map, preserving cached 'isNonceUsed' status
          validatedNewPermits.forEach(validatedPermit => {
            const key = `${validatedPermit.nonce}-${validatedPermit.networkId}`;
            const existingCachedPermit = currentCache[key];
            console.log(`DEBUG: Merging worker data for key ${key}. Cached isNonceUsed: ${existingCachedPermit?.isNonceUsed}, Worker isNonceUsed: ${validatedPermit.isNonceUsed}`); // DEBUG



            // --- Refined Merge Logic ---
            let finalIsNonceUsed = validatedPermit.isNonceUsed; // Default to worker result


            // **Crucially, if cache already says used, force it to stay used.**
            if (existingCachedPermit?.isNonceUsed === true) {
              finalIsNonceUsed = true;
              console.log(`DEBUG: Forcing isNonceUsed=true for key ${key} based on cache.`); // DEBUG
            }
            console.log(`DEBUG: Final isNonceUsed for key ${key}: ${finalIsNonceUsed}`); // DEBUG



            // Construct the final merged permit object
            const mergedPermit = {
              ...existingCachedPermit, // Start with cached data (if any)
              ...validatedPermit, // Overwrite with fresh validation results
              isNonceUsed: finalIsNonceUsed, // Apply the potentially forced status
            };
            // --- End Refined Merge Logic ---
            allPermitsRef.current.set(key, mergedPermit); // Update ref map
            currentCache[key] = mergedPermit; // Update cache object
            cacheUpdated = true;
          });

          if (cacheUpdated) {
            // console.log("Attempting to save updated permit data cache...");
            saveCache(currentCache);
          }
          // Save the timestamp of this successful check cycle
          try {
            const nowISO = new Date().toISOString();
            localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, nowISO);
            // console.log(`Saved last check timestamp (${nowISO}) to localStorage after validation.`); // Log timestamp save
          } catch (e) { console.error("Failed to save timestamp", e); }

          // Apply filter first based on validation results
          applyFinalFilter(allPermitsRef.current);

          // Now fetch quotes based on the updated map and preference
          fetchQuotesAndUpdatePermits(allPermitsRef.current).then(mapWithQuotes => {
            allPermitsRef.current = mapWithQuotes; // Update ref with quote results
            applyFinalFilter(allPermitsRef.current); // Re-apply filter to update UI with quotes
            setIsLoading(false); // Stop loading after validation AND quoting
          }).catch(quoteError => {
            console.error("Error during post-validation quote fetching:", quoteError);
            setError(`Failed to fetch swap quotes: ${quoteError instanceof Error ? quoteError.message : quoteError}`);
            setIsLoading(false); // Still stop loading even if quoting fails
          });
          break;
        }
        case 'PERMITS_ERROR': // Handles errors from fetch or validate steps in worker
          console.error("Worker error processing permits:", workerError);
          setError(`Error processing permits: ${workerError}`);
          // Don't clear permits on error, keep showing cached data
          setIsLoading(false); // Stop loading on error
          break;
      }
    };

    workerRef.current.onerror = (event) => {
      console.error("Worker error:", event.message, event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false);
      setIsWorkerInitialized(false);
    };

    return () => {
      // console.log("Terminating permit checker worker.");
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false);
    };
    // Add missing dependencies (setError, setIsLoading, workerRef, fetchPermitsAndCheck, allPermitsRef, fetchQuotesAndUpdatePermits)
    // Note: Including functions like fetchPermitsAndCheck might cause re-runs if their definitions aren't stable (e.g., wrapped in useCallback upstream)
  }, [
      applyFinalFilter,
      loadCache,
      saveCache,
      setError,
      setIsWorkerInitialized,
      setIsLoading,
      workerRef,
      fetchPermitsAndCheck,
      allPermitsRef,
      fetchQuotesAndUpdatePermits
    ]);
}
