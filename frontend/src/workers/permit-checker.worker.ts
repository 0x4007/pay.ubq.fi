/// <reference lib="webworker" />
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient, type JsonRpcResponse } from '@ubiquity-dao/permit2-rpc-client';
import { type Abi, type Address, encodeFunctionData, parseAbiItem } from "viem";
import type { Database, Tables } from "../database.types.ts"; // Added .ts extension
import type { PermitData } from "../types.ts"; // Added .ts extension
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils.ts"; // Added .ts extension

// --- Worker Setup ---

// Define table names
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";
// Removed unused: const USERS_TABLE = "users";
// Removed unused GITHUB_USERS_TABLE constant

// ABIs needed for checks
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

// Initialize Supabase & RPC clients (will be set in INIT)
let supabase: SupabaseClient<Database> | null = null; // Use Database type
let rpcClient: ReturnType<typeof createRpcClient> | null = null;
let PROXY_BASE_URL = ""; // Will be set in INIT
let initializationPromise: Promise<void> | null = null; // Promise to track initialization

// Define type for JSON-RPC Request object
interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
    id: number | string;
}

// Define expected message structure more specifically if possible
interface WorkerPayload {
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
type PermitRow = Tables<'permits'> & {
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
interface GitHubUserInfo {
    id: number; // This IS the GitHub ID
    // avatar_url needs to be fetched from GitHub API, not in DB
}
// Note: We assume permits.beneficiary_id is also number to match users.id for the join/lookup

// Combined type after manual join in worker
type CombinedLeaderboardData = FetchedPermitInfo & {
    github_user: GitHubUserInfo | null; // User info will be attached
};


// Define the structure expected by the hook
interface RawPermitWithUser {
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

// Function to map the *combined* data for the leaderboard hook
function mapCombinedToLeaderboardData(permit: CombinedLeaderboardData): RawPermitWithUser | null {
  const networkIdNum = Number(permit.token?.network ?? 0); // Default to 0 if token or network is null

  // Safely access joined data, providing defaults
  const githubUser = permit.github_user; // Access the potentially null user info
  // Use the GitHub ID as the username identifier since no username column exists
  const githubUsername = githubUser ? `GitHub ID: ${githubUser.id}` : `UnknownUser(${permit.beneficiary_id})`; // Use beneficiary_id in fallback
  const avatarUrl = ''; // Set to empty string as it's not available from DB
  const nodeUrl = permit.location?.node_url ?? null; // Extract node_url

  // Basic validation: Ensure we have a valid user and node_url
  if (!githubUser || !nodeUrl) {
     console.warn(`Worker: Filtering out leaderboard permit nonce ${permit.nonce} due to missing github_user info or node_url.`);
    return null;
  }

  // Ensure amount is parseable (though hook does parseFloat too)
  // This check might be less relevant now if XP comes from metadata, but keep for safety
  if (permit.amount !== undefined && permit.amount !== null) {
      try {
         parseFloat(permit.amount);
         if (isNaN(parseFloat(permit.amount))) throw new Error("Amount is NaN");
      } catch(e) {
         console.warn(`Worker: Filtering out leaderboard permit nonce ${permit.nonce} due to invalid amount format: ${permit.amount}`, e);
        return null;
      }
  }


  return {
    nonce: String(permit.nonce),
    networkId: networkIdNum,
    amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined, // Keep original amount
    githubUsername: githubUsername,
    avatarUrl: avatarUrl,
    node_url: nodeUrl, // Include node_url
    created_at: permit.created // Include creation date if needed
  };
}


// Function to fetch ALL permits and associated user data using two queries
async function fetchAllPermitsForLeaderboard(): Promise<CombinedLeaderboardData[]> {
    if (!supabase) throw new Error("Supabase client not initialized.");

    console.log(`Worker: Querying ALL permits for leaderboard (Step 1)...`);

    // Step 1: Fetch all permits with necessary fields including beneficiary_id and token network
    const { data: permitsData, error: permitsError } = await supabase
        .from(PERMITS_TABLE)
        .select(`
            nonce,
            amount,
            created,
            beneficiary_id,
            token:tokens!inner(network),
            location:locations(node_url) // Select node_url from locations table
        `)
        .is("transaction", null); // Keep filtering for unclaimed permits

    if (permitsError) {
        console.error("Supabase leaderboard permits fetch error (Step 1):", permitsError);
        throw new Error(`Supabase leaderboard permits fetch failed: ${permitsError.message}`);
    }

    // Add a type check for permitsData before proceeding
    if (!permitsData || !Array.isArray(permitsData)) {
        console.log(`Worker: No valid permits data found for leaderboard (Step 1).`);
        return [];
    }
    console.log(`Worker: Found ${permitsData.length} permits (Step 1).`);

    // Step 2: Extract unique beneficiary IDs, ensuring they are numbers
    const beneficiaryIds = [
        ...new Set(
            permitsData
                .map(p => p.beneficiary_id) // Access beneficiary_id safely
                .filter((id): id is number => id !== null && !isNaN(Number(id))) // Filter nulls and non-numeric IDs, assert number type
                .map(id => Number(id)) // Convert to number
        )
    ];


    if (beneficiaryIds.length === 0) {
        console.log(`Worker: No valid beneficiary IDs found in permits.`);
        // Return permits without user info if no IDs to query
        // Explicitly map to handle potential type issues
        return permitsData.map((p: any) => ({
            nonce: p.nonce,
            amount: p.amount,
            created: p.created,
            beneficiary_id: p.beneficiary_id,
            token: p.token,
            location: p.location ? { node_url: p.location.node_url } : null,
            github_user: null
        })) as CombinedLeaderboardData[];
    }

    console.log(`Worker: Querying ${beneficiaryIds.length} unique GitHub users (Step 2)...`);

    // Step 3: Fetch corresponding GitHub users
    const { data: usersData, error: usersError } = await supabase
        .from('users') // Correct table name
        .select('id') // Select ONLY id
        .in('id', beneficiaryIds); // Filter by the correct ID column

    if (usersError) {
        console.error("Supabase GitHub users fetch error (Step 2):", usersError);
        console.warn("Worker: Failed to fetch GitHub user details. Leaderboard will show placeholders.");
        // Return permits without user info if user fetch fails
         return permitsData.map((p: any) => ({
            nonce: p.nonce,
            amount: p.amount,
            created: p.created,
            beneficiary_id: p.beneficiary_id,
            token: p.token,
            location: p.location ? { node_url: p.location.node_url } : null,
            github_user: null
        })) as CombinedLeaderboardData[];
    }

     console.log(`Worker: Found ${usersData?.length ?? 0} GitHub users (Step 2).`);

    // Step 4: Combine the data
    const usersMap = new Map<number, GitHubUserInfo>();
    usersData?.forEach(user => {
        const potentialUser = user as any;
        if (potentialUser && typeof potentialUser.id === 'number') {
            const userInfo: GitHubUserInfo = { id: potentialUser.id };
            usersMap.set(userInfo.id, userInfo);
        }
    });

    // Explicitly construct the CombinedLeaderboardData object with type checks
    const combinedData: CombinedLeaderboardData[] = permitsData
        .map((permit: any): CombinedLeaderboardData | null => {
            // Check if permit is a valid object and has the core properties
            if (!permit || typeof permit !== 'object' ||
                !('nonce' in permit) ||
                !('beneficiary_id' in permit) || // Check existence before use
                permit.beneficiary_id === null || permit.beneficiary_id === undefined) {
                console.warn("Worker: Invalid permit data structure received:", permit);
                return null;
            }

            const beneficiaryIdNum = Number(permit.beneficiary_id);
            if (isNaN(beneficiaryIdNum)) {
                 console.warn("Worker: Invalid beneficiary_id:", permit.beneficiary_id);
                 return null;
            }
            const github_user = usersMap.get(beneficiaryIdNum) ?? null;

            // Safely access nested location data
            const locationData = (permit.location && typeof permit.location === 'object' && 'node_url' in permit.location)
                ? { node_url: permit.location.node_url as string | null }
                : null;

            // Safely access nested token data
            const tokenData = (permit.token && typeof permit.token === 'object' && 'network' in permit.token)
                ? { network: permit.token.network as number }
                : null;

            // Construct the object explicitly, ensuring all fields match CombinedLeaderboardData
            return {
                nonce: permit.nonce,
                amount: permit.amount,
                created: permit.created,
                beneficiary_id: permit.beneficiary_id,
                token: tokenData,
                location: locationData,
                github_user: github_user
            };
        })
        .filter((item): item is CombinedLeaderboardData => item !== null); // Filter out any nulls from invalid data

    return combinedData;
}


// --- Original Permit Fetching and Mapping ---

// Function to map DB result to PermitData (ERC20 only focus)
function mapDbPermitToPermitData(permit: PermitRow, index: number, lowerCaseWalletAddress: string): PermitData | null {
    const tokenData = permit.token;
    const ownerWalletData = permit.partner?.wallet;
    const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
    const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
    const networkIdNum = Number(tokenData?.network ?? 0);
    const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

    // Assume ERC20 if amount is positive, otherwise filter out.
    let type: 'erc20-permit' | null = null;
    let amountBigInt: bigint | null = null;
    if (permit.amount !== undefined && permit.amount !== null) {
        try {
            amountBigInt = BigInt(permit.amount);
        } catch {
            console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has invalid amount format: ${permit.amount}`);
            amountBigInt = null;
        }
    }

    if (amountBigInt !== null && amountBigInt > 0n) {
        type = "erc20-permit";
    } else {
        type = "erc20-permit"; // Still classify as ERC20 if amount is 0 or null
    }

    if (index < 10) {
        // console.log(`Worker: Permit [${index}] mapped. Raw: {amount: ${permit.amount}}. Determined type: ${type}`);
    }

    const permitData: PermitData = {
        nonce: String(permit.nonce),
        networkId: networkIdNum,
        beneficiary: lowerCaseWalletAddress,
        deadline: String(permit.deadline),
        signature: String(permit.signature),
        type: type,
        owner: ownerAddressStr,
        tokenAddress: tokenAddressStr,
        token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined,
        amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
        token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
        githubCommentUrl: githubUrlStr,
        partner: ownerAddressStr ? { wallet: { address: ownerAddressStr } } : undefined,
        claimStatus: "Idle",
        ...(permit.created && { created_at: permit.created })
    };

    if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || !permitData.token?.address) {
        if (index < 10) { console.warn(`Worker: Permit [${index}] missing essential data. Filtering out. Data:`, JSON.stringify(permitData)); }
        return null;
    }
     if (typeof permitData.deadline !== 'string' || isNaN(parseInt(permitData.deadline, 10))) {
         if (index < 10) { console.warn(`Worker: Permit [${index}] has invalid deadline format: ${permitData.deadline}. Filtering out.`); }
         return null;
     }
    const deadlineInt = parseInt(permitData.deadline, 10);
    if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
        if (index < 10) { console.warn(`Worker: Permit [${index}] is expired. Filtering out.`); }
        return null;
    }
    return permitData;
}

// Function to fetch permits from Supabase - uses github_id string for beneficiary_id
async function fetchPermitsFromDb(userGitHubId: string, lastCheckTimestamp: string | null): Promise<PermitRow[]> {
    if (!supabase) throw new Error("Supabase client not initialized.");

    let query = supabase.from(PERMITS_TABLE)
        .select(`*, created, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: ${LOCATIONS_TABLE} (node_url)`)
        .eq("beneficiary_id", userGitHubId as any)
        .is("transaction", null);

    if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
        query = query.gt('created', lastCheckTimestamp);
    } else if (lastCheckTimestamp) {
        console.warn(`Worker: Received invalid lastCheckTimestamp: ${lastCheckTimestamp}. Fetching all permits.`);
    }

    const { data: potentialPermitsData, error: permitError } = await query;

    if (permitError) throw new Error(`Supabase permit fetch error: ${permitError.message}`);

    if (!potentialPermitsData || potentialPermitsData.length === 0) {
        return [];
    }

    return potentialPermitsData as unknown as PermitRow[];
}

// --- On-Chain Validation ---

// Function to perform batch validation using rpcClient
async function validatePermitsBatch(permitsToValidate: PermitData[]): Promise<PermitData[]> {
    if (!rpcClient) throw new Error("RPC client not initialized.");
    if (permitsToValidate.length === 0) {
        return [];
    }

    const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
    const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] = [];
    let requestIdCounter = 1;
    const permitsByKey = new Map<string, PermitData>(permitsToValidate.map(p => [`${p.nonce}-${p.networkId}`, p]));

    permitsToValidate.forEach((permit) => {
        if (permit.type !== 'erc20-permit') {
            console.warn(`Worker: Skipping validation for non-ERC20 permit: ${permit.nonce}`);
            return;
        };

        const key = `${permit.nonce}-${permit.networkId}`;
        const chainId = permit.networkId;
        const owner = permit.owner as Address;

        const wordPos = BigInt(permit.nonce) >> 8n;
        batchRequests.push({
            request: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: "0x000000000022D473030F116dDEE9F6B43aC78BA3", data: encodeFunctionData({ abi: [permit2Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) }, 'latest'], id: requestIdCounter++ },
            key, type: "nonce", chainId
        });

        if (permit.token?.address && permit.amount && permit.owner) {
            const calls = preparePermitPrerequisiteContracts(permit);
            if (calls) {
                const requiredAmount = BigInt(permit.amount);
                const [balanceCall, allowanceCall] = calls;
                batchRequests.push({
                    request: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: balanceCall.address, data: encodeFunctionData({ abi: balanceCall.abi as Abi, functionName: balanceCall.functionName, args: balanceCall.args }) }, 'latest'], id: requestIdCounter++ },
                    key, type: "balance", requiredAmount, chainId
                });
                batchRequests.push({
                    request: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: allowanceCall.address, data: encodeFunctionData({ abi: allowanceCall.abi as Abi, functionName: allowanceCall.functionName, args: allowanceCall.args }) }, 'latest'], id: requestIdCounter++ },
                    key, type: "allowance", requiredAmount, chainId
                });
            }
        } else {
             console.warn(`Worker: Skipping balance/allowance check for permit ${key} due to missing data.`);
        }
    });

    if (batchRequests.length === 0) return permitsToValidate;

    try {
        const batchPayload = batchRequests.map(br => br.request);
        const batchResponses = await rpcClient.request(100, batchPayload) as JsonRpcResponse[]; // Assuming chain 100 for now
        const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map(res => [res.id as number, res]));

        batchRequests.forEach(batchReq => {
            const permit = permitsByKey.get(batchReq.key);
            if (!permit) return;

            const res = responseMap.get(batchReq.request.id as number);
            const updateData: Partial<PermitData & { isNonceUsed?: boolean }> = checkedPermitsMap.get(batchReq.key) || {};

            if (!res) {
                updateData.checkError = `Batch response missing (${batchReq.type})`;
            } else if (res.error) {
                updateData.checkError = `Check failed (${batchReq.type}). ${res.error.message}`;
            } else if (res.result !== undefined && res.result !== null) {
                try {
                    if (batchReq.type === "balance" && batchReq.requiredAmount !== undefined) updateData.ownerBalanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
                    else if (batchReq.type === "allowance" && batchReq.requiredAmount !== undefined) updateData.permit2AllowanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
                    else if (batchReq.type === "nonce") {
                        const bitmap = BigInt(res.result as string);
                        updateData.isNonceUsed = Boolean(bitmap & (1n << (BigInt(permit.nonce) & 255n)));
                    }
                    if (updateData.checkError?.includes(`(${batchReq.type})`)) {
                        updateData.checkError = undefined;
                    }
                } catch (parseError: unknown) {
                    updateData.checkError = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
                }
            } else {
                updateData.checkError = `Empty result (${batchReq.type})`;
            }
            checkedPermitsMap.set(batchReq.key, updateData);
        });

    } catch (error: unknown) {
        console.error("Worker: Error during validation batch RPC request:", error);
        permitsToValidate.forEach(permit => {
             const key = `${permit.nonce}-${permit.networkId}`;
             const updateData = checkedPermitsMap.get(key) || { checkError: `Batch request failed: ${error instanceof Error ? error.message : String(error)}` };
             if (!updateData.checkError) {
                 updateData.checkError = `Batch request failed: ${error instanceof Error ? error.message : String(error)}`;
             }
             checkedPermitsMap.set(key, updateData);
        });
    }

    return permitsToValidate.map(permit => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        return checkData ? { ...permit, ...checkData } : permit;
    });
}


// --- Worker Message Handling ---

self.onmessage = async (event: MessageEvent<{ type: 'INIT' | 'FETCH_NEW_PERMITS' | 'FETCH_LEADERBOARD_DATA'; payload: WorkerPayload }>) => {
    const { type, payload } = event.data;

    if (type === 'INIT') {
        initializationPromise = new Promise<void>((resolve, reject) => {
            const supabaseUrl = payload.supabaseUrl;
            const supabaseAnonKey = payload.supabaseAnonKey;
            PROXY_BASE_URL = payload.proxyBaseUrl || "https://rpc.ubq.fi";

            if (supabaseUrl && supabaseAnonKey) {
                try {
                    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
                    rpcClient = createRpcClient({ baseUrl: PROXY_BASE_URL });
                    self.postMessage({ type: 'INIT_SUCCESS' });
                    resolve();
                } catch (error: unknown) {
                    console.error("Worker: Error initializing clients:", error);
                    self.postMessage({ type: 'INIT_ERROR', error: error instanceof Error ? error.message : String(error) });
                    reject(error);
                }
            } else {
                const error = new Error('Supabase/RPC credentials not received by worker.');
                self.postMessage({ type: 'INIT_ERROR', error: error.message });
                reject(error);
            }
        });
        try {
            await initializationPromise;
        } catch (initError) {
            console.error("Worker: Initialization failed immediately.", initError);
        }

    } else if (type === 'FETCH_NEW_PERMITS') {
        const address = payload.address as Address;
        const lastCheckTimestamp = payload.lastCheckTimestamp;
        try {
            if (!initializationPromise) throw new Error("Worker not initialized. INIT message must be sent first.");
            await initializationPromise;
            if (!supabase) throw new Error("Supabase client failed to initialize.");

            const lowerCaseWalletAddress = address.toLowerCase();
            const { data: userData, error: userFetchError } = await supabase.from("permit_app_users").select("github_id").ilike("wallet_address", lowerCaseWalletAddress).single();
            if (userFetchError && userFetchError.code !== 'PGRST116') throw new Error(`Supabase user fetch error: ${userFetchError.message}`);
            if (!userData) {
                self.postMessage({ type: 'NEW_PERMITS_VALIDATED', permits: [] });
                return;
            }
            const userGitHubId = userData.github_id;

            const newPermitsFromDb = await fetchPermitsFromDb(userGitHubId, lastCheckTimestamp ?? null);
            const mappedNewPermits = newPermitsFromDb.map((p: PermitRow, i: number) => mapDbPermitToPermitData(p, i, lowerCaseWalletAddress)).filter((p): p is PermitData => p !== null);

            if (mappedNewPermits.length > 0) {
                const validatedNewPermits = await validatePermitsBatch(mappedNewPermits);
                self.postMessage({ type: 'NEW_PERMITS_VALIDATED', permits: validatedNewPermits });
            } else {
                self.postMessage({ type: 'NEW_PERMITS_VALIDATED', permits: [] });
            }

        } catch (error: unknown) {
            console.error("Worker: Error fetching/validating new permits:", error);
            self.postMessage({ type: 'PERMITS_ERROR', error: error instanceof Error ? error.message : String(error) });
        }
    } else if (type === 'FETCH_LEADERBOARD_DATA') {
        console.log(`Worker: Received FETCH_LEADERBOARD_DATA`);
        try {
            if (!initializationPromise) throw new Error("Worker not initialized. INIT message must be sent first.");
            await initializationPromise;
            if (!supabase) throw new Error("Supabase client failed to initialize.");

            const combinedData = await fetchAllPermitsForLeaderboard();
            const mappedData = combinedData
                .map(mapCombinedToLeaderboardData)
                .filter((p): p is RawPermitWithUser => p !== null);

            console.log(`Worker: Mapped ${mappedData.length} permits for leaderboard result.`);
            self.postMessage({ type: 'LEADERBOARD_DATA_RESULT', payload: mappedData });

        } catch (error: unknown) {
            console.error("Worker: Error fetching leaderboard data:", error);
            self.postMessage({ type: 'LEADERBOARD_DATA_RESULT', error: error instanceof Error ? error.message : String(error) });
        }
    } else {
         console.warn(`Worker: Received unknown message type: ${type}`);
    }
};

// console.log("Permit checker worker started.");
