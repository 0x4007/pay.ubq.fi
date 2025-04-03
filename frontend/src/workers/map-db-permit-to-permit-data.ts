import type { PermitData } from "../types.ts";
import { PermitRow, undefined } from "./permit-checker.worker.ts";

// --- Original Permit Fetching and Mapping ---
// Function to map DB result to PermitData (ERC20 only focus)


export function mapDbPermitToPermitData(permit: PermitRow, index: number, lowerCaseWalletAddress: string): PermitData | null {
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
