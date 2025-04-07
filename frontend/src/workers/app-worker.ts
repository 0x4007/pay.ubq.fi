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
    console.error("Worker: Supabase URL or Key is missing.");
    return false;
  }
  try {
    console.log("Worker: Initializing Supabase...");
    await initializeSupabase(url, key);
    isSupabaseInitialized = true;
    console.log("Worker: Supabase initialized successfully.");
    return true;
  } catch (error) {
    console.error("Worker: Failed to initialize Supabase:", error);
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
  console.log(`Worker: GitHub token ${GITHUB_TOKEN_WORKER ? 'received and set' : 'set to null'}.`);

  // Removed token change check and cache clearing logic. Caches will rely on their own TTLs.

  workerInitialized = true;
  self.postMessage({ type: 'INIT_SUCCESS' });
  console.log('Worker: Worker initialization completed successfully');
}

async function handleFetchLeaderboardData(payload: WorkerPayload | undefined) {
  if (!workerInitialized || !isSupabaseInitialized) {
    throw new Error('Worker or Supabase not initialized');
  }
  console.log("Worker: Starting leaderboard data fetch and processing...");

  // Extract selectedWeeks from payload, default to 52 (1 year) if not provided
  const selectedWeeks = payload?.selectedWeeks ?? 52;
  console.log(`Worker: Filtering leaderboard data for the last ${selectedWeeks} weeks.`);

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - selectedWeeks * 7);
  console.log(`Worker: Filtering permits created on or after: ${cutoffDate.toISOString()}`);

  // Step 1: Fetch raw data from Supabase, filtered by date
  console.log("Worker: Calling fetchAllPermitsForLeaderboard with cutoff date...");
  const filteredRawData = await fetchAllPermitsForLeaderboard(cutoffDate.toISOString()); // Pass cutoff date
  console.log(`Worker: Fetched ${filteredRawData.length} permit entries within the time range directly from DB.`);

  // Step 1.5: Removed redundant JS filtering block

  // Step 2: Process and aggregate the *already filtered* data using the imported function
  console.log("Worker: Calling imported processAndAggregateLeaderboardData...");
  // Pass the current GITHUB_TOKEN_WORKER to the aggregator
  const processedData = await processAndAggregateLeaderboardData(filteredRawData, GITHUB_TOKEN_WORKER); // Process the filtered data
  console.log(`Worker: Processed filtered data into ${processedData.length} leaderboard entries.`);

  // Step 3: Post the successful result back
  self.postMessage({
    type: "LEADERBOARD_DATA_RESULT",
    payload: processedData,
  });
  console.log("Worker: Sent LEADERBOARD_DATA_RESULT with processed data.");
}

async function handleFetchNewPermits(payload: WorkerPayload | undefined) {
  if (!workerInitialized || !isSupabaseInitialized) {
    throw new Error('Worker or Supabase not initialized');
  }

  if (!payload?.address) {
    throw new Error('Missing address in payload');
  }

  // 1. Look up the numeric wallet ID from the address
  console.log(`Worker: Looking up wallet ID for address ${payload.address}...`);
  const supabase = getSupabase();
  const { data: walletData, error: walletError } = await supabase
    .from(WALLETS_TABLE)
    .select('id')
    .eq('address', payload.address)
    .single();

  if (walletError) {
    console.error('Worker: Error fetching wallet ID:', walletError);
    throw new Error(`Failed to find wallet ID for address ${payload.address}: ${walletError.message}`);
  }

  if (!walletData) {
    console.warn(`Worker: No wallet found in DB for address ${payload.address}`);
     self.postMessage({
       type: 'NEW_PERMITS_VALIDATED',
       permits: []
     });
     return; // Exit if no wallet found
  }

  const walletId = walletData.id;
  console.log(`Worker: Found wallet ID: ${walletId}`);

  // 2. Fetch new permits from DB using the numeric ID
  console.log('Worker: Fetching new permits using wallet ID...');
  const newPermits = await fetchPermitsFromDb(
    walletId,
    payload.lastCheckTimestamp as string | null
  );

  console.log(`Worker: Processing ${newPermits.length} new permits...`);
  const mappedPermits = mapDbPermitsToPermitData(newPermits);

  console.log(`Worker: Validating ${mappedPermits.length} mapped permits...`);
  const validatedPermits = await validatePermitsBatch(mappedPermits);

  self.postMessage({
    type: 'NEW_PERMITS_VALIDATED',
    permits: validatedPermits
  });
}

// --- Main Message Listener ---
self.onmessage = async (event: MessageEvent<{ type: string; payload?: WorkerPayload }>) => {
  const { type, payload } = event.data;
  console.log(`Worker: Received message type: ${type}`);

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
          console.error('Worker: Error fetching/validating new permits:', error);
          throw new Error('Failed to fetch/validate new permits: ' +
            (error instanceof Error ? error.message : String(error)));
        }
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('Worker error:', error);
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
    repository?: string;
};

console.log("Worker: app-worker.ts loaded and message handler attached.");
