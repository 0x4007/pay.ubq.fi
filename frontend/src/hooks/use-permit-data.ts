import { useState, useRef } from "react";
import { type Address } from "viem";
import type { PermitData } from "../types";
import { useManuallyUpdateStatusCache } from "./manually-update-status-cache"; // Renamed import
import { useRefetchQuotesOnPreferenceChange } from "./refetch-quotes-on-preference-change"; // Renamed import
import { useFetchOnInitialMount } from "./fetch-on-initial-mount"; // Renamed import
import { useFetchPermits } from "./fetch-permits"; // Renamed import
import { useInitializeWorkerOnMount } from "./initialize-worker-on-mount"; // Renamed import
import { useFetchQuotesAndUpdatePermitsInMap } from "./fetch-quotes-and-update-permits-in-map"; // Renamed import
import { useApplyFinalFilteringForUi } from "./apply-final-filtering-for-ui";
import { useSavePermitDataCacheToLocalStorage } from "./save-permit-data-cache-to-local-storage"; // Renamed import
import { useLoadPermitDataCacheFromLocalStorage } from "./load-permit-data-cache-from-local-storage"; // Renamed import
// Removed unused import: import { getTokenInfo } from "../constants/supported-reward-tokens";

// Constants
export const PERMIT_LAST_CHECK_TIMESTAMP_KEY = "permitLastCheckTimestamp";
export const PERMIT_DATA_CACHE_KEY = "permitDataCache"; // Changed cache key

// Type for cached status - Now caching full PermitData
// type CachedPermitStatus = Pick<PermitData, 'isNonceUsed' | 'checkError' | 'ownerBalanceSufficient' | 'permit2AllowanceSufficient'>;
export type PermitDataCache = Record<string, PermitData>; // Cache now stores full PermitData objects

// Get Supabase config from Vite env vars
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);

  // Function to load PermitData cache from localStorage
  const loadCache = useLoadPermitDataCacheFromLocalStorage(); // Renamed call

  // Function to save PermitData cache to localStorage
  const saveCache = useSavePermitDataCacheToLocalStorage(); // Renamed call

  // Function to apply final filtering for UI display
  const applyFinalFilter = useApplyFinalFilteringForUi(setDisplayPermits);

  // Function to fetch quotes and update permits in the map
  const fetchQuotesAndUpdatePermits = useFetchQuotesAndUpdatePermitsInMap(preferredRewardTokenAddress, address, chainId, setIsQuoting); // Renamed call

  // Function to fetch permits (initiates the process) - Defined before use in initializeWorkerOnMount
  const fetchPermitsAndCheck = useFetchPermits( // Renamed call
    workerRef,
    isWorkerInitialized,
    isConnected,
    address,
    allPermitsRef,
    setDisplayPermits,
    setIsLoading,
    setError,
    loadCache,
    applyFinalFilter,
    preferredRewardTokenAddress,
    chainId,
    fetchQuotesAndUpdatePermits
  ); // Add dependencies

  // Initialize worker on mount
  useInitializeWorkerOnMount( // Renamed call
    setError,
    setIsWorkerInitialized,
    setIsLoading,
    workerRef,
    fetchPermitsAndCheck,
    loadCache,
    allPermitsRef,
    saveCache,
    applyFinalFilter,
    fetchQuotesAndUpdatePermits
  );

  // Trigger fetch on initial mount after worker is initialized
  // Also re-trigger quote fetching if the preference changes
  useFetchOnInitialMount(isConnected, isWorkerInitialized, allPermitsRef, setDisplayPermits, setIsLoading); // Renamed call

  // Effect to re-fetch quotes when preference changes
  useRefetchQuotesOnPreferenceChange( // Renamed call
    isConnected,
    address,
    chainId,
    isWorkerInitialized,
    isLoading,
    fetchQuotesAndUpdatePermits,
    allPermitsRef,
    applyFinalFilter,
    setError,
    preferredRewardTokenAddress
  ); // Re-run when preference changes

  // Function to manually update the status cache (e.g., after a successful claim)
  const updatePermitStatusCache = useManuallyUpdateStatusCache(loadCache, saveCache, allPermitsRef, applyFinalFilter); // Renamed call

  return {
    permits: displayPermits, // Expose the filtered list for display
    setPermits: setDisplayPermits, // Allow external updates (though cache update is preferred)
    isLoading,
    // Removed: initialLoadComplete,
    error,
    setError,
    fetchPermitsAndCheck, // Keep for potential manual refresh?
    isWorkerInitialized,
    updatePermitStatusCache, // Expose cache update function
    isQuoting, // Expose quoting status
  };
}
