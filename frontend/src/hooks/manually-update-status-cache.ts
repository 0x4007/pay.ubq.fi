import React, { useCallback } from "react"; // Import React
import type { PermitData } from "../types";
import { PermitDataCache } from "./use-permit-data";

// Rename function and add types
export function useManuallyUpdateStatusCache(
  loadCache: () => PermitDataCache,
  saveCache: (cache: PermitDataCache) => void,
  allPermitsRef: React.MutableRefObject<Map<string, PermitData>>, // Add type
  applyFinalFilter: (permitsMap: Map<string, PermitData>) => void
) {
  return useCallback((permitKey: string, statusUpdate: Partial<PermitData>) => {
    console.log(`DEBUG: useManuallyUpdateStatusCache called for key: ${permitKey} with statusUpdate:`, statusUpdate); // ADDED LOG
    const currentCache = loadCache();
    const existingCachedPermit = currentCache[permitKey];
    if (existingCachedPermit) {
      console.log(`DEBUG: useManuallyUpdateStatusCache: Found existing permit for key ${permitKey}. Merging status...`); // ADDED LOG


      // Update the specific fields in the cached permit data
      const updatedPermit = { ...existingCachedPermit, ...statusUpdate }; // Store merged result
      currentCache[permitKey] = updatedPermit;
      console.log(`DEBUG: useManuallyUpdateStatusCache: Calling saveCache for key ${permitKey} with merged data:`, updatedPermit); // ADDED LOG
      saveCache(currentCache); // Save updated cache



      // Update the ref map as well
      const existingPermitInRef = allPermitsRef.current.get(permitKey);
      if (existingPermitInRef) {
        allPermitsRef.current.set(permitKey, { ...existingPermitInRef, ...statusUpdate });
        applyFinalFilter(allPermitsRef.current); // Re-filter display list
      }
    } else {
      console.warn(`Attempted to update cache for non-existent key: ${permitKey}`);
    }
    // Add missing dependency allPermitsRef
  }, [loadCache, saveCache, applyFinalFilter, allPermitsRef]);
}
