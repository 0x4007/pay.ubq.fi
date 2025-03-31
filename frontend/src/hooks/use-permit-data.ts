import { useState, useCallback, useEffect, useMemo } from "react";
import { type Address, encodeFunctionData, decodeFunctionResult } from "viem"; // Removed Abi
import { createClient } from '@supabase/supabase-js'; // Removed SupabaseClient
import { createRpcClient } from '@ubiquity-dao/permit2-rpc-client';
import type { JsonRpcRequest, JsonRpcResponse } from '@ubiquity-dao/permit2-rpc-client';
import type { PermitData } from "../types";
import permit2Abi from "../fixtures/permit2-abi"; // Changed to default import

// --- Constants ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PROXY_BASE_URL = "https://rpc.ubq.fi"; // Update to production domain
const PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Uniswap Permit2 Address

// Minimal ERC20 ABI for balance and allowance checks
const erc20Abi = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const; // Use 'as const' for better type inference with viem

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
}

// Helper function to make RPC requests via the client
async function makeRpcRequest<T = unknown>(
  rpcClient: ReturnType<typeof createRpcClient>,
  chainId: number,
  payload: JsonRpcRequest
): Promise<{ result?: T; error?: string }> {
  try {
    const response = await rpcClient.request(chainId, payload) as JsonRpcResponse;
    if (response.error) {
      console.error(`RPC Error (${payload.method}): ${response.error.code} - ${response.error.message}`, payload);
      return { error: response.error.message };
    }
    if (response.result !== undefined) {
      return { result: response.result as T };
    }
    console.error("Unexpected RPC response:", response, payload);
    return { error: "Unexpected RPC response structure." };
  } catch (error) {
    console.error(`Network/Fetch Error (${payload.method}):`, error, payload);
    return { error: error instanceof Error ? error.message : "Network/Fetch error" };
  }
}

export function usePermitData({ address, isConnected }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize clients - useMemo to prevent recreation on every render
  const supabaseClient = useMemo(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Supabase URL or Anon Key missing.");
      return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }, []);

  const rpcClient = useMemo(() => createRpcClient({ baseUrl: PROXY_BASE_URL }), []);

  // --- Fetch and Check Logic ---
  const fetchPermitsAndCheck = useCallback(async () => {
    if (!isConnected || !address) {
      // setError("Wallet not connected."); // Avoid setting error here, let UI handle disconnected state
      setPermits([]);
      setIsLoading(false); // Ensure loading stops if disconnected
      setInitialLoadComplete(false); // Reset load complete state
      return;
    }
    if (!supabaseClient) {
      setError("Supabase client not initialized.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setInitialLoadComplete(false); // Reset on new fetch

    try {
      // 1. Fetch permits from Supabase
      const { data: fetchedPermits, error: dbError } = await supabaseClient
        .from('permits') // Adjust table name if needed
        .from('permit2_permits') // Try the correct table name
        .select('*'); // First just get all records to see the structure

      if (dbError) {
        throw new Error(`Supabase error: ${dbError.message}`);
      }

      if (!fetchedPermits || fetchedPermits.length === 0) {
        setPermits([]);
        setIsLoading(false);
        setInitialLoadComplete(true);
        return;
      }

      // 2. Perform on-chain checks for each permit via RPC proxy
      const checkedPermits = await Promise.all(
        fetchedPermits.map(async (permit): Promise<PermitData> => {
          const updatedPermit: PermitData = { ...permit, checkError: null, ownerBalanceSufficient: null, permit2AllowanceSufficient: null }; // Initialize check fields
          const chainId = permit.networkId; // Assuming networkId is the chainId

          if (!chainId) {
            return { ...updatedPermit, checkError: "Missing networkId" };
          }

          try {
            // a) Check if claimed using nonceBitmap
            const wordPos = BigInt(permit.nonce) >> 8n; // Equivalent to / 256
            const bitPos = BigInt(permit.nonce) & 0xffn; // Equivalent to % 256

            const bitmapPayload: JsonRpcRequest = {
              jsonrpc: '2.0', method: 'eth_call', id: `bitmap-${permit.id}`,
              params: [{
                to: PERMIT2_ADDRESS,
                data: encodeFunctionData({
                  abi: permit2Abi,
                  functionName: 'nonceBitmap',
                  args: [address, wordPos] // owner, wordPos
                })
              }, 'latest']
            };
            const bitmapResp = await makeRpcRequest<`0x${string}`>(rpcClient, chainId, bitmapPayload);

            if (bitmapResp.error) throw new Error(`Bitmap check failed: ${bitmapResp.error}`);
            if (typeof bitmapResp.result !== 'string') throw new Error("Invalid bitmap response");

            // bitmapResp.result is already typed as `0x${string}`, safe for BigInt
            const bitmap = BigInt(bitmapResp.result);
            const isClaimed = (bitmap >> bitPos) & 1n;

            if (isClaimed === 1n) {
              updatedPermit.status = "Claimed"; // Update status if claimed
              // Skip further checks if already claimed
              return updatedPermit;
            } else {
               updatedPermit.status = "Valid"; // Mark as valid if not claimed (can be refined)
            }

            // b) Check owner balance (only for ERC20)
            if (permit.type === 'erc20-permit' && permit.tokenAddress && permit.amount) {
              const balancePayload: JsonRpcRequest = {
                jsonrpc: '2.0', method: 'eth_call', id: `balance-${permit.id}`,
                params: [{
                  to: permit.tokenAddress as Address, // Cast to Address
                  data: encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [address] })
                }, 'latest']
              };
              const balanceResp = await makeRpcRequest<`0x${string}`>(rpcClient, chainId, balancePayload);

              if (balanceResp.error) throw new Error(`Balance check failed: ${balanceResp.error}`);
              if (typeof balanceResp.result !== 'string') throw new Error("Invalid balance response");

              // balanceResp.result is already typed as `0x${string}`, safe for decodeFunctionResult
              const balance = decodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', data: balanceResp.result });
              updatedPermit.ownerBalanceSufficient = balance >= BigInt(permit.amount);

              // c) Check Permit2 allowance (only for ERC20)
              const allowancePayload: JsonRpcRequest = {
                jsonrpc: '2.0', method: 'eth_call', id: `allowance-${permit.id}`,
                params: [{
                  to: permit.tokenAddress as Address, // Cast to Address
                  data: encodeFunctionData({ abi: erc20Abi, functionName: 'allowance', args: [address, PERMIT2_ADDRESS] })
                }, 'latest']
              };
              const allowanceResp = await makeRpcRequest<`0x${string}`>(rpcClient, chainId, allowancePayload);

              if (allowanceResp.error) throw new Error(`Allowance check failed: ${allowanceResp.error}`);
              if (typeof allowanceResp.result !== 'string') throw new Error("Invalid allowance response");

              // allowanceResp.result is already typed as `0x${string}`, safe for decodeFunctionResult
              const allowance = decodeFunctionResult({ abi: erc20Abi, functionName: 'allowance', data: allowanceResp.result });
              // Permit2 uses amount=0 for max allowance, but practically any non-zero allowance might work if Permit2 handles it.
              // A safer check is if allowance is >= amount needed.
              updatedPermit.permit2AllowanceSufficient = allowance >= BigInt(permit.amount);
            }

          } catch (checkError) {
            console.error(`Error checking permit ${permit.id}:`, checkError);
            updatedPermit.checkError = checkError instanceof Error ? checkError.message : "Unknown check error";
            updatedPermit.status = "Check Failed"; // Indicate check failure
          }
          return updatedPermit;
        })
      );

      setPermits(checkedPermits);

    } catch (err) {
      console.error("Error in fetchPermitsAndCheck:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setPermits([]); // Clear permits on error
    } finally {
      setIsLoading(false);
      setInitialLoadComplete(true);
    }
  }, [address, isConnected, supabaseClient, rpcClient]);

  // Effect to trigger fetch when address or connection status changes
  useEffect(() => {
    if (isConnected && address) {
      fetchPermitsAndCheck();
    } else {
      // Clear permits if disconnected or address changes to undefined
      setPermits([]);
      setInitialLoadComplete(false);
      setIsLoading(false); // Stop loading if disconnected
    }
  }, [address, isConnected, fetchPermitsAndCheck]); // fetchPermitsAndCheck is stable due to useCallback

  return {
    permits,
    setPermits, // Still needed by usePermitClaiming hook
    isLoading,
    initialLoadComplete,
    error,
    setError,
    fetchPermitsAndCheck,
    // isWorkerInitialized is removed
  };
}
