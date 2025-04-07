/// <reference lib="webworker" />
import { createRpcClient } from '@ubiquity-dao/permit2-rpc-client';
import { parseAbiItem, type Address } from "viem";
import type { Tables } from "../database.types.ts";
import type { PermitData } from "../types.ts";
import { fetchAllPermitsForLeaderboard } from "./fetch-all-permits-for-leaderboard.ts";
import { fetchPermitsFromDb } from "./fetch-permits-from-db.ts";
import { mapDbPermitsToPermitData } from "./map-db-permit-to-permit-data.ts";
import { getSupabase, initializeSupabase } from "./supabase-singleton.ts";
import { validatePermitsBatch } from "./validate-permits-batch.ts";
// Import the leaderboard aggregator and its types
import { processAndAggregateLeaderboardData } from "./leaderboard-aggregator.ts";

// --- Worker Setup ---
let workerInitialized = false;
let isSupabaseInitialized = false; // Track Supabase init specifically

// Define table names
export const PERMITS_TABLE = "permits";
export const WALLETS_TABLE = "wallets";
export const TOKENS_TABLE = "tokens";
export const PARTNERS_TABLE = "partners";
export const LOCATIONS_TABLE = "locations";

// ABIs needed for checks
export const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

// Initialize RPC client (remains null for now, as per original file)
export const rpcClient: ReturnType<typeof createRpcClient> | null = null;
export const PROXY_BASE_URL = "";

// Store GitHub Token globally in the worker scope after INIT
let GITHUB_TOKEN_WORKER: string | null = null;

// --- Supabase Initialization Helper ---
async function ensureSupabaseInitialized(url?: string, key?: string): Promise<boolean> {
  if (isSupabaseInitialized) {
    return true;
  }
  if (!url || !key) {

    return false;
  }
  try {

    await initializeSupabase(url, key);
    isSupabaseInitialized = true;

    return true;
  } catch (error) {

    isSupabaseInitialized = false;
    return false;
  }
}

// --- Message Handlers ---

async function handleInitMessage(payload: WorkerPayload | undefined) {
  if (!payload?.supabaseUrl || !payload?.supabaseAnonKey) {
    throw new Error('Missing Supabase credentials');
  }

  const supabaseReady = await ensureSupabaseInitialized(payload.supabaseUrl, payload.supabaseAnonKey);
  if (!supabaseReady) {
    throw new Error("Supabase client could not be initialized.");
  }

  const newGitHubToken = payload.githubToken || null;
  GITHUB_TOKEN_WORKER = newGitHubToken;


  // Removed token change check and cache clearing logic. Caches will rely on their own TTLs.

  workerInitialized = true;
  self.postMessage({ type: 'INIT_SUCCESS' });

}

let cachedAllTimeRawData: CombinedLeaderboardData[] | null = null;
let cachedAllTimeTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day TTL for raw data cache

async function handleFetchLeaderboardData(payload: WorkerPayload | undefined) {
  if (!workerInitialized || !isSupabaseInitialized) {
    throw new Error('Worker or Supabase not initialized');
  }


  const now = Date.now();
  const selectedWeeks = payload?.selectedWeeks ?? 52;
  const selectedRepository = payload?.selectedRepository as string | undefined;

  const isAllTime = selectedWeeks === 0;

  let fullRawData: CombinedLeaderboardData[] = [];

  const cacheValid = cachedAllTimeRawData && (now - cachedAllTimeTimestamp < CACHE_TTL_MS);

  if (isAllTime) {
    if (cacheValid) {

      fullRawData = cachedAllTimeRawData!;
    } else {

      fullRawData = await fetchAllPermitsForLeaderboard(""); // no cutoff date
      cachedAllTimeRawData = fullRawData;
      cachedAllTimeTimestamp = now;

    }
  } else {
    if (cacheValid) {

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - selectedWeeks * 7);
      fullRawData = cachedAllTimeRawData!.filter(p => {
        if (!p.created) return false;
        return new Date(p.created) >= cutoffDate;
      });
    } else {

      fullRawData = await fetchAllPermitsForLeaderboard(""); // fetch all
      cachedAllTimeRawData = fullRawData;
      cachedAllTimeTimestamp = now;

      // Now filter
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - selectedWeeks * 7);
      fullRawData = fullRawData.filter(p => {
        if (!p.created) return false;
        return new Date(p.created) >= cutoffDate;
      });
    }
  }



  // Repository filter
  const repositoryFilteredData = selectedRepository
    ? fullRawData.filter(permit => permit.repository === selectedRepository)
    : fullRawData;



  const processedData = await processAndAggregateLeaderboardData(repositoryFilteredData, GITHUB_TOKEN_WORKER);


  self.postMessage({
    type: "LEADERBOARD_DATA_RESULT",
    payload: {
      processedData,
      rawData: repositoryFilteredData
    },
  });

}

async function handleFetchNewPermits(payload: WorkerPayload | undefined) {
  if (!workerInitialized || !isSupabaseInitialized) {
    throw new Error('Worker or Supabase not initialized');
  }

  if (!payload?.address) {
    throw new Error('Missing address in payload');
  }

  // 1. Look up the numeric wallet ID from the address

  const supabase = getSupabase();
  const { data: walletData, error: walletError } = await supabase
    .from(WALLETS_TABLE)
    .select('id')
    .eq('address', payload.address)
    .single();

  if (walletError) {

    throw new Error(`Failed to find wallet ID for address ${payload.address}: ${walletError.message}`);
  }

  if (!walletData) {

     self.postMessage({
       type: 'NEW_PERMITS_VALIDATED',
       permits: []
     });
     return; // Exit if no wallet found
  }

  const walletId = walletData.id;


  // 2. Fetch new permits from DB using the numeric ID

  const newPermits = await fetchPermitsFromDb(
    walletId,
    payload.lastCheckTimestamp as string | null
  );


  const mappedPermits = mapDbPermitsToPermitData(newPermits);


  const validatedPermits = await validatePermitsBatch(mappedPermits);

  self.postMessage({
    type: 'NEW_PERMITS_VALIDATED',
    permits: validatedPermits
  });
}

// --- Main Message Listener ---
self.onmessage = async (event: MessageEvent<{ type: string; payload?: WorkerPayload }>) => {
  const { type, payload } = event.data;


  try {
    switch (type) {
      case 'INIT':
        await handleInitMessage(payload);
        break;
      case 'FETCH_LEADERBOARD_DATA':
        await handleFetchLeaderboardData(payload);
        break;
      case 'FETCH_NEW_PERMITS':
        // Wrap in try-catch as the original did, to isolate errors from this handler
        try {
          await handleFetchNewPermits(payload);
        } catch (error) {

          throw new Error('Failed to fetch/validate new permits: ' +
            (error instanceof Error ? error.message : String(error)));
        }
        break;
      default:

    }
  } catch (error) {

    // Determine error type based on the original message type that initiated the call
    const errorType = (() => {
      switch (type) {
        case 'INIT': return 'INIT_ERROR';
        case 'FETCH_NEW_PERMITS': return 'PERMITS_ERROR';
        case 'FETCH_LEADERBOARD_DATA': return 'LEADERBOARD_DATA_ERROR'; // Specific error type
        default: return 'UNKNOWN_ERROR'; // Fallback for unhandled types
      }
    })();
    self.postMessage({
      type: errorType,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Define type for JSON-RPC Request object
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
    id: number | string;
}

// Define expected message structure more specifically
export interface WorkerPayload {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    githubToken?: string;
    address?: Address;
    lastCheckTimestamp?: string | null;
    permits?: PermitData[]; // For VALIDATE_PERMITS (if used, currently batch validation is internal)
    proxyBaseUrl?: string;
    selectedWeeks?: number; // Added for leaderboard
    selectedRepository?: string; // Added for repository filtering
    [key: string]: unknown;
}

// --- Database Fetching and Mapping Types (from permit-checker) ---

export type PermitRow = Tables<'permits'> & {
    token: Tables<'tokens'> | null;
    partner: (Tables<'partners'> & { wallet: Tables<'wallets'> | null }) | null;
    location: Tables<'locations'> | null;
    github_user?: { login?: string | null; avatar_url?: string | null } | null;
};

// --- Leaderboard Specific Types (from permit-checker, might need adjustment based on aggregator) ---

type FetchedPermitInfo = {
    nonce: Tables<'permits'>['nonce'];
    amount: Tables<'permits'>['amount'] | null;
    created: Tables<'permits'>['created'];
    beneficiary_id: Tables<'permits'>['beneficiary_id'];
    token: { network: Tables<'tokens'>['network'] } | null;
    location: { node_url: Tables<'locations'>['node_url'] } | null;
};

export interface GitHubUserInfo {
    id: number;
}

export type CombinedLeaderboardData = FetchedPermitInfo & {
    github_user: GitHubUserInfo | null;
    category?: string;
    repository?: string; // Repository in owner/repo format
};
