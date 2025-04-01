import React, { useEffect } from "react"; // Import React
import type { Address } from "viem"; // Import Address type
import type { PermitData } from "../types";

// Rename function and add types
export function useRefetchQuotesOnPreferenceChange(
  isConnected: boolean,
  address: Address | undefined, // Use Address type
  chainId: number | undefined,
  isWorkerInitialized: boolean,
  isLoading: boolean,
  fetchQuotesAndUpdatePermits: (permitsMap: Map<string, PermitData>) => Promise<Map<string, PermitData>>,
  allPermitsRef: React.MutableRefObject<Map<string, PermitData>>, // Add type
  applyFinalFilter: (permitsMap: Map<string, PermitData>) => void,
  setError: React.Dispatch<React.SetStateAction<string | null>>, // Add type
  preferredRewardTokenAddress: Address | null // Use Address type
) {
  useEffect(() => {
    if (isConnected && address && chainId && isWorkerInitialized && !isLoading) { // Only quote if not already loading permits
      // console.log("Preference changed, re-fetching quotes...");
      // Use the current state of permits from the ref
      fetchQuotesAndUpdatePermits(new Map(allPermitsRef.current)).then(mapWithQuotes => {
        allPermitsRef.current = mapWithQuotes;
        applyFinalFilter(allPermitsRef.current); // Update display with new quotes
      }).catch(quoteError => {
        console.error("Error re-fetching quotes after preference change:", quoteError);
        setError(`Failed to update swap quotes: ${quoteError instanceof Error ? quoteError.message : quoteError}`);
        // Clear quotes on error?
        allPermitsRef.current.forEach(permit => { // No implicit any error here as forEach infers type
          delete permit.estimatedAmountOut;
          permit.quoteError = `Failed to update quote: ${quoteError instanceof Error ? quoteError.message : quoteError}`;
        });
        applyFinalFilter(allPermitsRef.current);
      });
    }
    // Add missing dependencies
  }, [
      preferredRewardTokenAddress,
      isConnected,
      address,
      chainId,
      isWorkerInitialized,
      isLoading,
      fetchQuotesAndUpdatePermits,
      allPermitsRef,
      applyFinalFilter,
      setError
    ]);
}
