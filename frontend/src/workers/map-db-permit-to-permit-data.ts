import { Address } from "viem";
import type { PermitData } from "../types.ts";
import type { PermitRow } from "./permit-checker.worker.ts";

export function mapDbPermitToPermitData(dbPermit: PermitRow): PermitData {
  const networkId = dbPermit.token?.network ?? 1; // Default to mainnet if not specified

  return {
    nonce: dbPermit.nonce,
    networkId,
    type: 'erc20-permit', // Default type
    amount: dbPermit.amount ?? '',
    beneficiary: dbPermit.beneficiary_id.toString(),
    owner: dbPermit.partner?.wallet?.address as Address ?? '0x0',
    deadline: '0', // Will be set during validation
    signature: '', // Will be set during validation
    tokenAddress: dbPermit.token?.address,
    status: 'Fetching',
    claimStatus: undefined,
    isNonceUsed: false, // Will be checked during validation
    githubCommentUrl: dbPermit.location?.node_url ?? '',
    token: dbPermit.token ?? undefined
  };
}

export function mapDbPermitsToPermitData(dbPermits: PermitRow[]): PermitData[] {
  return dbPermits.map(mapDbPermitToPermitData);
}
