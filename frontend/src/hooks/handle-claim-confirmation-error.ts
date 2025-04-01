import type { Dispatch, SetStateAction } from "react";
// Removed unused import: import type { WaitForTransactionReceiptReturnType } from "wagmi/actions";
import type { PermitData } from "../types";
import { isNonceUsedError } from "./is-nonce-used-error";
import { CachedPermitStatus } from "./use-permit-claiming"; // Assuming CachedPermitStatus is exported

// Type for the error from useWaitForTransactionReceipt (can be Error or null)
type ReceiptErrorType = Error | null;

export function handleClaimConfirmationError(
  claimReceiptError: ReceiptErrorType,
  claimTxHash: string | undefined,
  permits: PermitData[],
  updatePermitStatusCache: (permitKey: string, status: Partial<CachedPermitStatus>) => void,
  setPermits: Dispatch<SetStateAction<PermitData[]>>,
  setError: Dispatch<SetStateAction<string | null>>
  // Removed unused parameters: isClaimConfirmed, claimReceipt
) {
  // No useEffect needed, run the logic directly if there's an error
  if (claimReceiptError && claimTxHash) {
    console.error("Claim tx confirmation failed, Tx Hash:", claimTxHash, claimReceiptError);
    let failedPermitKey: string | null = null;
      let permitNonce: string | null = null;
      let permitNetworkId: number | null = null;

      // Find the permit associated with the failed hash
      const permitWithError = permits.find(p => p.transactionHash === claimTxHash);
      if (permitWithError) {
        failedPermitKey = `${permitWithError.nonce}-${permitWithError.networkId}`;
        permitNonce = permitWithError.nonce;
        permitNetworkId = permitWithError.networkId;
      }

      if (failedPermitKey && isNonceUsedError(claimReceiptError)) {
        // If confirmation failed due to nonce, treat as claimed
        // console.log(`Nonce already used detected during confirmation for Tx ${claimTxHash}. Marking as claimed.`);
        updatePermitStatusCache(failedPermitKey, { isNonceUsed: true, checkError: undefined });
        setPermits((current: PermitData[]) => current.map((p: PermitData) => p.nonce === permitNonce && p.networkId === permitNetworkId
          ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } // Mark as claimed
          : p
        ));
      } else {
        // Handle other confirmation errors globally
        setError("Claim confirmation failed. Please check the transaction or try again later.");
        setPermits((current: PermitData[]) => current.map((p: PermitData) => p.transactionHash === claimTxHash
          ? { ...p, claimStatus: "Error", claimError: undefined } // Set Error, clear specific message
          : p
        ));
      }
    }
}
