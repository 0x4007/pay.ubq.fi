
// --- On-Chain Validation ---
// Function to perform batch validation using rpcClient

import { JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { encodeFunctionData, Abi } from "viem";
import { PermitData } from "../types.ts";
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils.ts";
import { rpcClient, JsonRpcRequest, permit2Abi } from "./permit-checker.worker.ts";

export async function validatePermitsBatch(permitsToValidate: PermitData[]): Promise<PermitData[]> {
  if (!rpcClient) throw new Error("RPC client not initialized.");
  if (permitsToValidate.length === 0) {
    return [];
  }

  const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean; }>>();
  const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number; }[] = [];
  let requestIdCounter = 1;
  const permitsByKey = new Map<string, PermitData>(permitsToValidate.map(p => [`${p.nonce}-${p.networkId}`, p]));

  permitsToValidate.forEach((permit) => {
    if (permit.type !== 'erc20-permit') {
      console.warn(`Worker: Skipping validation for non-ERC20 permit: ${permit.nonce}`);
      return;
    };

    const key = `${permit.nonce}-${permit.networkId}`;
    const chainId = permit.networkId;
    const owner = permit.owner as string;

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
      const updateData: Partial<PermitData & { isNonceUsed?: boolean; }> = checkedPermitsMap.get(batchReq.key) || {};

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
