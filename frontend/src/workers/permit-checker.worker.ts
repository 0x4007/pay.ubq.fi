/// <reference lib="webworker" />
import { createRpcClient } from '@ubiquity-dao/permit2-rpc-client';
import { type Address, parseAbiItem } from "viem";
import type { Tables } from "../database.types.ts";
import type { PermitData } from "../types.ts";
import { fetchAllPermitsForLeaderboard } from "./fetch-all-permits-for-leaderboard";
import { fetchPermitsFromDb } from "./fetch-permits-from-db";
import { mapDbPermitsToPermitData } from "./map-db-permit-to-permit-data";
import { getSupabase, initializeSupabase } from "./supabase-singleton"; // Correct function name
import { validatePermitsBatch } from "./validate-permits-batch";
// Import the new processing function and type
import { processAndAggregateLeaderboardData, type LeaderboardEntry } from "./leaderboard-processing";

// --- Worker Setup ---
let workerInitialized = false;

// Define table names
export const PERMITS_TABLE = "permits";
export const WALLETS_TABLE = "wallets";
export const TOKENS_TABLE = "tokens";
export const PARTNERS_TABLE = "partners";
export const LOCATIONS_TABLE = "locations";
// Removed unused: const USERS_TABLE = "users";
// Removed unused GITHUB_USERS_TABLE constant

// ABIs needed for checks
export const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

// Initialize RPC client
export const rpcClient: ReturnType<typeof createRpcClient> | null = null;
export const PROXY_BASE_URL = "";

// Store GitHub Token globally in the worker scope after INIT
let GITHUB_TOKEN_WORKER: string | null = null;

// Handle worker messages
self.onmessage = async (event: MessageEvent<{ type: string; payload?: WorkerPayload }>) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'INIT':
        if (!payload?.supabaseUrl || !payload?.supabaseAnonKey) {
          throw new Error('Missing Supabase credentials');
        }
        // Store GitHub token if provided
        if (payload.githubToken) {
          GITHUB_TOKEN_WORKER = payload.githubToken;
          // Make token available to leaderboard-processing module (if needed, though it uses self access)
          (self as WorkerGlobalScope & { GITHUB_TOKEN?: string }).GITHUB_TOKEN = GITHUB_TOKEN_WORKER;
          console.log('Worker: GitHub token received.');
        } else {
          console.warn('Worker: GitHub token not provided during INIT.');
        }

        try {
          // Initialize Supabase singleton and verify connection
          console.log('Worker: Initializing Supabase client...');
          await initializeSupabase(payload.supabaseUrl, payload.supabaseAnonKey);

          workerInitialized = true;
          self.postMessage({ type: 'INIT_SUCCESS' });
          console.log('Worker: Worker initialization completed successfully');
        } catch (initError) {
          const errorMessage = 'Failed to initialize Supabase client: ' +
            (initError instanceof Error ? initError.message : String(initError));
          console.error('Worker: ' + errorMessage);
          throw new Error(errorMessage);
        }
        break;

      case 'FETCH_LEADERBOARD_DATA': {
        if (!workerInitialized) {
          throw new Error('Worker not initialized');
        }
        console.log("Worker: Received FETCH_LEADERBOARD_DATA");

        // 1. Fetch combined permit and user data from DB
        const combinedDbData: CombinedLeaderboardData[] = await fetchAllPermitsForLeaderboard();
        console.log(`Worker: Fetched ${combinedDbData.length} combined entries from DB.`);

        // 2. Process and aggregate the data (includes GitHub fetching/parsing)
        const finalLeaderboardData: LeaderboardEntry[] = await processAndAggregateLeaderboardData(combinedDbData);
        console.log(`Worker: Processed data into ${finalLeaderboardData.length} leaderboard entries.`);

        // 3. Post the final result back
        self.postMessage({
          type: 'LEADERBOARD_DATA_RESULT',
          payload: finalLeaderboardData // Send the final processed data
        });
        console.log("Worker: Sent LEADERBOARD_DATA_RESULT to main thread.");
        break;
      }

      case 'FETCH_NEW_PERMITS': {
        if (!workerInitialized) {
          throw new Error('Worker not initialized');
        }

        if (!payload?.address) {
          throw new Error('Missing address in payload');
        }

        try {
          // 1. Look up the numeric wallet ID from the address
          console.log(`Worker: Looking up wallet ID for address ${payload.address}...`);
          const supabase = getSupabase(); // Use correct function name
          // No need for null check here as getSupabase throws if not initialized
          const { data: walletData, error: walletError } = await supabase
            .from(WALLETS_TABLE)
            .select('id')
            .eq('address', payload.address)
            .single(); // Expecting only one wallet per address

          if (walletError) {
            console.error('Worker: Error fetching wallet ID:', walletError);
            throw new Error(`Failed to find wallet ID for address ${payload.address}: ${walletError.message}`);
          }

          if (!walletData) {
            console.warn(`Worker: No wallet found in DB for address ${payload.address}`);
            // If no wallet found, there are no permits to fetch for this address. Post empty array.
             self.postMessage({
               type: 'NEW_PERMITS_VALIDATED',
               permits: [] // Send empty array as no permits can be associated
             });
             break; // Exit the case
          }

          const walletId = walletData.id;
          console.log(`Worker: Found wallet ID: ${walletId}`);

          // 2. Fetch new permits from DB using the numeric ID
          console.log('Worker: Fetching new permits using wallet ID...');
          const newPermits = await fetchPermitsFromDb(
            walletId, // Pass the numeric ID
            payload.lastCheckTimestamp as string | null
          );

          console.log(`Worker: Processing ${newPermits.length} new permits...`);
          // Use the plural function name which accepts an array
          const mappedPermits = mapDbPermitsToPermitData(newPermits);

          console.log(`Worker: Validating ${mappedPermits.length} mapped permits...`);
          const validatedPermits = await validatePermitsBatch(mappedPermits);

          self.postMessage({
            type: 'NEW_PERMITS_VALIDATED',
            permits: validatedPermits
          });
        } catch (error) {
          console.error('Worker: Error fetching/validating new permits:', error);
          throw new Error('Failed to fetch/validate new permits: ' +
            (error instanceof Error ? error.message : String(error)));
        }
        break;
      }

      default:
        console.warn(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('Worker error:', error);
    const errorType = (() => {
      switch (type) {
        case 'INIT': return 'INIT_ERROR';
        case 'FETCH_NEW_PERMITS': return 'PERMITS_ERROR';
        default: return 'LEADERBOARD_DATA_RESULT';
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

// Define expected message structure more specifically if possible
export interface WorkerPayload {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    githubToken?: string; // Add githubToken to payload for INIT
    address?: Address;
    lastCheckTimestamp?: string | null;
    permits?: PermitData[]; // For VALIDATE_PERMITS
    proxyBaseUrl?: string; // Pass proxy URL during init
    [key: string]: unknown;
}

// --- Database Fetching and Mapping ---

// Type alias for permits row using generated types
export type PermitRow = Tables<'permits'> & {
    token: Tables<'tokens'> | null;
    partner: (Tables<'partners'> & { wallet: Tables<'wallets'> | null }) | null;
    location: Tables<'locations'> | null;
    // Manually define expected shape for joined github_user data if needed by existing queries
    github_user?: { login?: string | null; avatar_url?: string | null } | null;
};

// --- Leaderboard Specific Types & Functions ---

// Define types for the two-step query approach
// Use more specific types based on the actual select query
type FetchedPermitInfo = {
    nonce: Tables<'permits'>['nonce'];
    amount: Tables<'permits'>['amount'] | null; // Allow null for amount
    created: Tables<'permits'>['created'];
    beneficiary_id: Tables<'permits'>['beneficiary_id'];
    token: { network: Tables<'tokens'>['network'] } | null;
    location: { node_url: Tables<'locations'>['node_url'] } | null;
};

// Manually define GitHubUserInfo based on schema image (users table)
export interface GitHubUserInfo {
    id: number; // This IS the GitHub ID
    // avatar_url needs to be fetched from GitHub API, not in DB
}
// Note: We assume permits.beneficiary_id is also number to match users.id for the join/lookup

// Combined type after manual join in worker
export type CombinedLeaderboardData = FetchedPermitInfo & {
    github_user: GitHubUserInfo | null; // User info will be attached
    // Add parsed metadata fields
    category?: string;
    repository?: string;
};

// Removed RawPermitWithUser as it's no longer needed here
