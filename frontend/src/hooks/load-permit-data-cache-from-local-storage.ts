import { useCallback } from "react";
import type { PermitData } from "../types";
import { PermitDataCache, PERMIT_DATA_CACHE_KEY } from "./use-permit-data";

// Rename function
export function useLoadPermitDataCacheFromLocalStorage() {
  return useCallback((): PermitDataCache => {
    try {
      const cachedString = localStorage.getItem(PERMIT_DATA_CACHE_KEY);
      // console.log(`Loaded cache string for ${PERMIT_DATA_CACHE_KEY}: ${cachedString ? cachedString.substring(0, 100) + '...' : 'null'}`);
      const cachedData = cachedString ? JSON.parse(cachedString) : {};
      console.log("DEBUG: Loaded cache from localStorage:", cachedData); // DEBUG



      // Log any cached permits marked as used
      Object.entries(cachedData).forEach(([key, permit]) => {
        // Type assertion needed here as JSON.parse returns any
        if ((permit as PermitData).isNonceUsed === true) {
          console.log(`DEBUG: loadCache: Found cached permit ${key} with isNonceUsed=true.`); // DEBUG
        }
      });

      return cachedData;
    } catch (e) {
      console.error("Failed to load permit data cache", e);
      return {};
    }
  }, []);
}
