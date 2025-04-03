/// <reference lib="webworker" />
import { createRpcClient } from '@ubiquity-dao/permit2-rpc-client';
import { type Address, parseAbiItem } from "viem";
import type { Tables } from "../database.types.ts";
import type { PermitData } from "../types.ts";
import { fetchAllPermitsForLeaderboard } from "./fetch-all-permits-for-leaderboard";
import { initializeSupabase } from "./supabase-singleton";

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

        const combinedData = await fetchAllPermitsForLeaderboard();

        // Map combined data to the format expected by the hook
        const mappedData = combinedData.map(permit => ({
          nonce: permit.nonce,
          networkId: permit.token?.network ?? 1, // Default to mainnet if not specified
          amount: permit.amount,
          githubUsername: permit.github_user ? `GitHub ID: ${permit.github_user.id}` : 'Unknown',
          avatarUrl: '', // Will be fetched by the hook
          node_url: permit.location?.node_url ?? null,
          created_at: permit.created
        }));

        self.postMessage({
          type: 'LEADERBOARD_DATA_RESULT',
          payload: mappedData
        });
        break;
      }

      default:
        console.warn(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({
      type: type === 'INIT' ? 'INIT_ERROR' : 'LEADERBOARD_DATA_RESULT',
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
    amount: Tables<'permits'>['amount'];
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
};


// Define the structure expected by the hook
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
}
