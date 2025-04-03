/// <reference lib="webworker" />
import { createRpcClient } from '@ubiquity-dao/permit2-rpc-client';
import { type Address, parseAbiItem } from "viem";
import type { Tables } from "../database.types.ts";
import type { PermitData } from "../types.ts";
import { fetchAllPermitsForLeaderboard } from "./fetch-all-permits-for-leaderboard.ts"; // Add .ts
import { fetchPermitsFromDb } from "./fetch-permits-from-db.ts"; // Add .ts
import { mapDbPermitsToPermitData } from "./map-db-permit-to-permit-data.ts"; // Import the correct plural function
import { initializeSupabase } from "./supabase-singleton.ts"; // Add .ts
import { validatePermitsBatch } from "./validate-permits-batch.ts"; // Add .ts

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

// Handle worker messages
self.onmessage = async (event: MessageEvent<{ type: string; payload?: WorkerPayload }>) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'INIT':
        if (!payload?.supabaseUrl || !payload?.supabaseAnonKey) {
          throw new Error('Missing Supabase credentials');
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

        const combinedData: CombinedLeaderboardData[] = await fetchAllPermitsForLeaderboard();

        // Map combined data to the format expected by the hook
        // Explicitly type 'permit' here
        const mappedData: RawPermitWithUser[] = combinedData.map((permit: CombinedLeaderboardData) => ({
          nonce: permit.nonce,
          networkId: permit.token?.network ?? 1, // Default to mainnet if not specified
          amount: permit.amount ?? '', // Convert null to empty string
          githubUsername: permit.github_user ? `GitHub ID: ${permit.github_user.id}` : 'Unknown', // Keep placeholder for now
          avatarUrl: '', // Will be fetched by the hook
          node_url: permit.location?.node_url ?? null,
          created_at: permit.created,
          category: permit.category, // Pass through category
          repository: permit.repository // Pass through repository
        }));

        self.postMessage({
          type: 'LEADERBOARD_DATA_RESULT',
          payload: mappedData
        });
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
          // Fetch new permits from DB
          console.log('Worker: Fetching new permits...');
          // Assuming fetchPermitsFromDb expects address as string
          const newPermits = await fetchPermitsFromDb(
            payload.address,
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

// Define the structure expected by the hook
// NOTE: This RawPermitWithUser might be redundant now if useLeaderboardData directly uses CombinedLeaderboardData
export interface RawPermitWithUser {
  // Include necessary fields from PermitData that the hook might use for aggregation
  nonce: string;
  networkId: number;
  amount?: string; // Keep original amount for reference if needed
  // Add the user info
  githubUsername: string; // Placeholder like "GitHub ID: 12345"
  avatarUrl: string;    // Empty string from worker
  node_url: string | null; // Add node_url
  // Add any other fields needed for potential future filtering/display
  created_at?: string;
  category?: string; // Add category
  repository?: string; // Add repository
}
