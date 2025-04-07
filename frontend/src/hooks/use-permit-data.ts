import { useCallback, useEffect, useRef, useState } from "react"; // Re-added useRef
import { type Address } from "viem";
import { useWorker } from "../context/worker-context.tsx"; // Import worker context hook
import type { PermitData } from "../types.ts"; // Added .ts extension
import { getCowSwapQuote } from "../utils/cowswap-utils.ts"; // Added .ts extension

// Constants
const PERMIT_LAST_CHECK_TIMESTAMP_KEY = "permitLastCheckTimestamp";
const PERMIT_DATA_CACHE_KEY = "permitDataCache"; // Changed cache key

// Type for cached status - Now caching full PermitData
// type CachedPermitStatus = Pick<PermitData, 'isNonceUsed' | 'checkError' | 'ownerBalanceSufficient' | 'permit2AllowanceSufficient'>;
type PermitDataCache = Record<string, PermitData>; // Cache now stores full PermitData objects

// Removed unused Supabase constants

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
  preferredRewardTokenAddress: Address | null; // Add prop for preference
  chainId: number | undefined; // Add prop for current chain
}

export function usePermitData({ address, isConnected, preferredRewardTokenAddress, chainId }: UsePermitDataProps) {
  // Main state holding potentially filtered permits for UI display
  const [displayPermits, setDisplayPermits] = useState<PermitData[]>([]);
  // Ref to hold the *complete* map of permits from cache + new results (including quote estimates)
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());
  const [isLoading, setIsLoading] = useState(true); // Covers both permit loading and quoting
  const [isQuoting, setIsQuoting] = useState(false); // Specific state for quoting process
  // Removed unused state: const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Get worker instance and status from context
  const { worker, isWorkerInitialized, workerError: contextWorkerError } = useWorker();

  // Function to load PermitData cache from localStorage
  const loadCache = useCallback((): PermitDataCache => {
    try {
      const cachedString = localStorage.getItem(PERMIT_DATA_CACHE_KEY);
      //
      const cachedData = cachedString ? JSON.parse(cachedString) : {};

      // Log any cached permits marked as used
      Object.entries(cachedData).forEach(([, permit]) => { // Removed unused 'key'
        // Type assertion needed here as JSON.parse returns any
        if ((permit as PermitData).isNonceUsed === true) {
          // //
        }
      });

      return cachedData;
    } catch (e) {

      return {};
    }
  }, []);

  // Function to save PermitData cache to localStorage
  const saveCache = useCallback((cache: PermitDataCache) => {
    try {
      const cacheString = JSON.stringify(cache);
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, cacheString);
      //  // Log cache save
    } catch (e) {

    }
  }, []);

   // Function to apply final filtering for UI display
   const applyFinalFilter = useCallback((permitsMap: Map<string, PermitData>) => {
    const filteredList: PermitData[] = [];
    permitsMap.forEach(permit => {
        // Filter if nonce is used OR if the nonce check specifically failed
        const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
        const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed;

        // Add detailed logging for the filtering decision
        // const permitKey = `${permit.nonce}-${permit.networkId}`;
        // //

        if (!shouldFilter) {
            filteredList.push(permit);
        } else {
            //  //
        }
    });
    //
    // Log the permits *being set* to the state, focusing on nonce and used status
    //
    setDisplayPermits(filteredList);
  }, []);

  // Function to fetch quotes and update permits in the map
  const fetchQuotesAndUpdatePermits = useCallback(async (permitsMap: Map<string, PermitData>): Promise<Map<string, PermitData>> => {
    if (!preferredRewardTokenAddress || !address || !chainId) {
      // Clear existing quote data if preference is removed or user/chain disconnected
      permitsMap.forEach(permit => {
        delete permit.estimatedAmountOut;
        delete permit.quoteError;
      });
      return permitsMap; // No preference set or missing info, return map as is
    }

    //
    setIsQuoting(true);
    const updatedPermitsMap = new Map(permitsMap); // Create a mutable copy

    // Group permits by their original token address
    const permitsByToken = new Map<Address, PermitData[]>();
    updatedPermitsMap.forEach(permit => {
      // Only consider claimable ERC20 permits for quoting
      if (permit.tokenAddress && permit.type === 'erc20-permit' && permit.status !== 'Claimed' && permit.claimStatus !== 'Success' && permit.claimStatus !== 'Pending') {
        const group = permitsByToken.get(permit.tokenAddress as Address) || [];
        group.push(permit);
        permitsByToken.set(permit.tokenAddress as Address, group);
      }
    });

    // Fetch quote for each group that needs swapping
    for (const [tokenInAddress, groupPermits] of permitsByToken.entries()) {
      // Skip if the group's token is already the preferred token
      if (tokenInAddress.toLowerCase() === preferredRewardTokenAddress.toLowerCase()) {
         // Clear any previous quote errors for this group
         groupPermits.forEach(p => {
            delete p.estimatedAmountOut;
            delete p.quoteError;
            updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p);
         });
        continue;
      }

      // Sum total amount for the group
      let totalAmountInWei = 0n;
      groupPermits.forEach(p => {
        if (p.amount) {
          try {
            totalAmountInWei += BigInt(p.amount);
          } catch (e) {
             // Log the error object
          }
        }
      });

      if (totalAmountInWei === 0n) {
        // Clear quote fields if total amount is zero
         groupPermits.forEach(p => {
            delete p.estimatedAmountOut;
            delete p.quoteError;
            updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p);
         });
        continue; // Skip fetching quote if nothing to swap
      }

      try {
        //
        const quoteResult = await getCowSwapQuote({
          tokenIn: tokenInAddress,
          tokenOut: preferredRewardTokenAddress,
          amountIn: totalAmountInWei,
          userAddress: address,
          chainId: chainId, // Pass chainId
        });

        // Placeholder quote returns the total output amount in the output token's smallest unit
        const groupEstimatedTotalOut_InOutputUnits = quoteResult.estimatedAmountOut;

        groupPermits.forEach(p => {
          if (p.amount && totalAmountInWei > 0n) { // Ensure permit amount and group total exist and are non-zero
            try {
              const permitAmount_InInputUnits = BigInt(p.amount);

              // Calculate the permit's proportional share of the *total estimated output*
              // individual_output = (permit_input / group_total_input) * group_total_output
              // Use BigInt math throughout to maintain precision
              const individualEstimatedOut_InOutputUnits = (permitAmount_InInputUnits * groupEstimatedTotalOut_InOutputUnits) / totalAmountInWei;

              // **** Add Detailed Logging ****
              //
              // **** End Logging ****

              // **** Add Logging Before toString() ****
              //
              // **** End Logging ****

              p.estimatedAmountOut = individualEstimatedOut_InOutputUnits.toString(); // Store individual estimate (already in output units)
              p.quoteError = null; // Clear previous errors
            } catch (calcError) {

               p.estimatedAmountOut = undefined; // Clear estimate on error
               p.quoteError = "Calculation error";
            }
          } else {
             p.estimatedAmountOut = undefined; // Clear if permit amount is missing or group total is zero
             p.quoteError = p.amount ? "Group total is zero" : "Missing amount";
          }
          updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p); // Update the map
        });
        // Correct variable name in log message
        //

      } catch (quoteError) {

        const errorMessage = quoteError instanceof Error ? quoteError.message : "Quote fetching failed";
        // Apply error to all permits in the group
        groupPermits.forEach(p => {
          delete p.estimatedAmountOut; // Clear previous estimate
          p.quoteError = errorMessage;
          updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p); // Update the map
        });
      }
    }

    setIsQuoting(false);
    //
    return updatedPermitsMap; // Return the map with updated quote info
  }, [preferredRewardTokenAddress, address, chainId]);

  // Effect to handle worker messages and trigger initial fetch
  useEffect(() => {
    // Define the message handler
    const handleWorkerMessage = (event: MessageEvent) => {
      // Define a type for the worker message data
      type WorkerMessageData = {
          type: 'NEW_PERMITS_VALIDATED' | 'PERMITS_ERROR'; // Only handle these types here
          permits?: PermitData[]; // Used for NEW_PERMITS_VALIDATED
          error?: string;
      };
      const { type, permits: workerPermits, error: workerError } = event.data as WorkerMessageData;
      //

      switch (type) {
        case 'NEW_PERMITS_VALIDATED': { // Worker returns *only* newly fetched & validated permits
          const validatedNewPermits: PermitData[] = workerPermits || [];
          //
          const currentCache = loadCache();
          let cacheUpdated = false;

          // Merge new results into the cache and the ref map, preserving cached 'isNonceUsed' status
          validatedNewPermits.forEach(validatedPermit => {
            const key = `${validatedPermit.nonce}-${validatedPermit.networkId}`;
            const existingCachedPermit = currentCache[key];

            // Determine the correct isNonceUsed status, prioritizing cache=true
            const finalIsNonceUsed = existingCachedPermit?.isNonceUsed === true || validatedPermit.isNonceUsed === true;
            if (existingCachedPermit?.isNonceUsed === true && !finalIsNonceUsed) {

            } else if (existingCachedPermit?.isNonceUsed === true) {
                 //
            }

            // Construct the final merged permit object
            const mergedPermit = {
              ...existingCachedPermit, // Start with cached data (if any)
              ...validatedPermit,     // Overwrite with fresh validation results
              isNonceUsed: finalIsNonceUsed, // Apply the determined status
            };

            allPermitsRef.current.set(key, mergedPermit); // Update ref map
            currentCache[key] = mergedPermit; // Update cache object
            cacheUpdated = true;
          });

          if (cacheUpdated) {
            //
            saveCache(currentCache);
          }
          // Save the timestamp of this successful check cycle
          try {
            const nowISO = new Date().toISOString();
            localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, nowISO);
            //  // Log timestamp save
          } catch (e) {  }

          // Apply filter first based on validation results
          applyFinalFilter(allPermitsRef.current);

          // Now fetch quotes based on the updated map and preference
          fetchQuotesAndUpdatePermits(allPermitsRef.current).then(mapWithQuotes => {
              allPermitsRef.current = mapWithQuotes; // Update ref with quote results
              applyFinalFilter(allPermitsRef.current); // Re-apply filter to update UI with quotes
              setIsLoading(false); // Stop loading after validation AND quoting
          }).catch(quoteError => {

              setError(`Failed to fetch swap quotes: ${quoteError instanceof Error ? quoteError.message : quoteError}`);
              setIsLoading(false); // Still stop loading even if quoting fails
          });
          break;
        }
        case 'PERMITS_ERROR': // Handles errors from fetch or validate steps in worker

          setError(`Error processing permits: ${workerError}`);
          // Don't clear permits on error, keep showing cached data
          setIsLoading(false); // Stop loading on error
          break;
      }
    };

    // Check for context error first
    if (contextWorkerError) {
      setError(`Worker initialization failed: ${contextWorkerError}`);
      setIsLoading(false);
      return;
    }

    // Only proceed if worker is initialized and user is connected
    if (isWorkerInitialized && worker && isConnected && address) {
      // Add listener for permit data results
      worker.addEventListener('message', handleWorkerMessage);

      // Trigger initial fetch/check
      setIsLoading(true);
      setError(null);

      // Load cached data for immediate display
      const cachedData = loadCache();
      const initialMap = new Map<string, PermitData>();
      Object.entries(cachedData).forEach(([key, permit]) => {
          initialMap.set(key, permit);
      });
      allPermitsRef.current = initialMap;
      applyFinalFilter(allPermitsRef.current); // Show cached data immediately

      // Fetch quotes for cached data immediately if preference is set
      if (preferredRewardTokenAddress && address && chainId) {
          fetchQuotesAndUpdatePermits(initialMap).then(mapWithQuotes => {
              allPermitsRef.current = mapWithQuotes;
              applyFinalFilter(allPermitsRef.current);
          }).catch(quoteError => {

          });
      }

      // Get last check timestamp
      let lastCheckTimestamp: string | null = null;
      try {
        lastCheckTimestamp = localStorage.getItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY);
      } catch (e) {

      }

      // Ask worker to fetch new permits
      //
      worker.postMessage({ type: 'FETCH_NEW_PERMITS', payload: { address, lastCheckTimestamp } });

      // Cleanup function for this effect instance
      return () => {
        worker.removeEventListener('message', handleWorkerMessage);
        //
      };
    } else if (!isConnected) {
      // Clear state if disconnected
      allPermitsRef.current.clear();
      setDisplayPermits([]);
      setIsLoading(false); // Ensure loading stops if disconnected
      setError(null); // Clear errors on disconnect
    } else if (!isWorkerInitialized && !contextWorkerError) {
      // Worker not ready yet, but no error. Set loading.
      setIsLoading(true);
    }

  }, [
    worker, isWorkerInitialized, contextWorkerError, isConnected, address, // Core dependencies
    loadCache, saveCache, applyFinalFilter, fetchQuotesAndUpdatePermits, // Callbacks
    preferredRewardTokenAddress, chainId // For quote fetching trigger
  ]);


  // Effect to re-fetch quotes when preference changes
  useEffect(() => {
    // Only run if worker is ready, user connected, not already loading, and address/chain available
    if (isConnected && address && chainId && isWorkerInitialized && worker && !isLoading) {
        //
        // Use the current state of permits from the ref map
        fetchQuotesAndUpdatePermits(new Map(allPermitsRef.current)).then(mapWithQuotes => {
            allPermitsRef.current = mapWithQuotes;
            applyFinalFilter(allPermitsRef.current); // Update display with new quotes
        }).catch(quoteError => {

            setError(`Failed to update swap quotes: ${quoteError instanceof Error ? quoteError.message : quoteError}`);
            // Clear quotes on error?
             allPermitsRef.current.forEach(permit => {
                 delete permit.estimatedAmountOut;
                 permit.quoteError = `Failed to update quote: ${quoteError instanceof Error ? quoteError.message : quoteError}`;
             });
             applyFinalFilter(allPermitsRef.current);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredRewardTokenAddress, isConnected, address, chainId, isWorkerInitialized, isLoading]); // Re-run when preference changes


  // Function to manually update the status cache (e.g., after a successful claim)
  const updatePermitStatusCache = useCallback((permitKey: string, statusUpdate: Partial<PermitData>) => {
      //  // Log cache update attempt
      const currentCache = loadCache();
      const existingCachedPermit = currentCache[permitKey];
      if (existingCachedPermit) {
          // Update the specific fields in the cached permit data
          currentCache[permitKey] = { ...existingCachedPermit, ...statusUpdate };
          saveCache(currentCache); // Save updated cache

          // Update the ref map as well
          const existingPermitInRef = allPermitsRef.current.get(permitKey);
          if (existingPermitInRef) {
              allPermitsRef.current.set(permitKey, { ...existingPermitInRef, ...statusUpdate });
              applyFinalFilter(allPermitsRef.current); // Re-filter display list
          }
      } else {

      }
  }, [loadCache, saveCache, applyFinalFilter]);


  return {
    permits: displayPermits, // Expose the filtered list for display
    setPermits: setDisplayPermits, // Allow external updates (though cache update is preferred)
    isLoading,
    // Removed: initialLoadComplete,
     error,
     setError,
     // Removed fetchPermitsAndCheck as it's now internal to the main useEffect
     isWorkerInitialized, // Expose context status
     updatePermitStatusCache, // Expose cache update function
     isQuoting // Expose quoting status
   };
 }
