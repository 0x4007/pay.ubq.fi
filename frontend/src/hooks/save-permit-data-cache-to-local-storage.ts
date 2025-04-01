import { useCallback } from "react";
import { PermitDataCache, PERMIT_DATA_CACHE_KEY } from "./use-permit-data";

// Rename function
export function useSavePermitDataCacheToLocalStorage() {
  return useCallback((cache: PermitDataCache) => {
    try {
      const cacheString = JSON.stringify(cache);
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, cacheString);
      // console.log(`Saved cache for ${PERMIT_DATA_CACHE_KEY}: ${cacheString.substring(0,100)}...`); // Log cache save
    } catch (e) {
      console.error("Failed to save permit data cache", e);
    }
  }, []);
}
