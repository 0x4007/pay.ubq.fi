import type { Dispatch, SetStateAction } from "react";
import type { PermitData } from "../types";
import { isNonceUsedError } from "./is-nonce-used-error";
import { isUserRejection } from "./is-user-rejection";
import { CachedPermitStatus } from "./use-permit-claiming"; // Assuming CachedPermitStatus is exported

// Type for the error from useWriteContract (can be Error or null)
type WriteContractErrorType = Error | null;

export function handleClaimSubmissionError(
  writeContractError: WriteContractErrorType,
  permits: PermitData[],
  updatePermitStatusCache: (permitKey: string, status: Partial<CachedPermitStatus>) => void,
  setPermits: Dispatch<SetStateAction<PermitData[]>>,
  setError: Dispatch<SetStateAction<string | null>>
) {
  // No useEffect needed, run the logic directly if there's an error
  if (writeContractError) {
    console.warn("Claim submission error:", writeContractError);
    let pendingPermitKey: string | null = null;
      let permitNonce: string | null = null;
      let permitNetworkId: number | null = null;

      // Find the permit that was in the "Pending" state without a hash
      const permitWithError = permits.find(p => p.claimStatus === "Pending" && !p.transactionHash);
      if (permitWithError) {
        pendingPermitKey = `${permitWithError.nonce}-${permitWithError.networkId}`;
        permitNonce = permitWithError.nonce;
        permitNetworkId = permitWithError.networkId;
      }

      if (pendingPermitKey && isNonceUsedError(writeContractError)) {
        // If submission failed due to nonce, treat as claimed
        // console.log("Nonce already used detected during submission. Marking as claimed.");
        updatePermitStatusCache(pendingPermitKey, { isNonceUsed: true, checkError: undefined });
        setPermits((current: PermitData[]) => current.map((p: PermitData) => p.nonce === permitNonce && p.networkId === permitNetworkId
          ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } // Mark as claimed
          : p
        ));
      } else if (isUserRejection(writeContractError)) {
        // Handle user rejection
        // console.log("User rejected claim submission.");
        setPermits((current: PermitData[]) => current.map((p: PermitData) => p.nonce === permitNonce && p.networkId === permitNetworkId
          ? { ...p, claimStatus: "Idle", claimError: undefined } // Reset to Idle
          : p
        ));
      } else {
        // Handle other submission errors globally
        setError("Claim failed. Please try again.");
        setPermits((current: PermitData[]) => current.map((p: PermitData) => p.nonce === permitNonce && p.networkId === permitNetworkId
          ? { ...p, claimStatus: "Error", claimError: undefined } // Set Error
          : p
        ));
      }
    }
}
