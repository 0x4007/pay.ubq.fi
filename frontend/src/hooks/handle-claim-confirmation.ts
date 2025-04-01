import type { Dispatch, SetStateAction } from "react";
import type { Address } from "viem";
import type { WaitForTransactionReceiptReturnType } from "wagmi/actions"; // Import type for receipt
import type { PermitData } from "../types";
import { CachedPermitStatus } from "./use-permit-claiming"; // Assuming CachedPermitStatus is exported

export function handleClaimConfirmation(
  isClaimConfirmed: boolean,
  claimReceipt: WaitForTransactionReceiptReturnType | undefined, // Add type
  claimTxHash: string | undefined,
  address: Address | undefined, // Use Address type
  updatePermitStatusCache: (permitKey: string, status: Partial<CachedPermitStatus>) => void,
  setPermits: Dispatch<SetStateAction<PermitData[]>> // Add type
) {
  // No useEffect needed, run the logic directly if confirmed
  if (isClaimConfirmed && claimReceipt && claimTxHash && address) {
    console.log("DEBUG: Claim confirmed, Tx Hash:", claimTxHash);
    const storageKey = `pendingTx_${claimTxHash}`;
      let confirmedNonce: string | null = null;
      let networkId: number | null = null;
      let claimedPermitKey: string | null = null;

      try {
        const storedDataString = localStorage.getItem(storageKey);
        if (storedDataString) {
          console.log(`DEBUG: Found stored data for ${storageKey}: ${storedDataString}`);
          const storedData = JSON.parse(storedDataString);
          if (storedData && storedData.nonce && storedData.networkId) {
            confirmedNonce = storedData.nonce;
            networkId = storedData.networkId;
            claimedPermitKey = `${confirmedNonce}-${networkId}`;
            console.log(`DEBUG: Parsed nonce ${confirmedNonce} and networkId ${networkId} from localStorage.`);
          } else {
            console.warn(`Parsed data from localStorage for ${storageKey} is missing nonce or networkId.`);
          }
        } else {
          console.warn(`No data found in localStorage for key ${storageKey}. Cannot record claim or update specific permit state reliably.`);
        }
      } catch (e) {
        console.error(`Error parsing data from localStorage for key ${storageKey}:`, e);
      }

      // If we successfully retrieved nonce and networkId
      if (claimedPermitKey && confirmedNonce && networkId) {
        // 1. Update cache
        console.log(`DEBUG: Updating cache for claimed permit: ${claimedPermitKey}`);
        updatePermitStatusCache(claimedPermitKey, { isNonceUsed: true, checkError: undefined });

        // 2. Update UI state directly using the retrieved nonce and networkId
        setPermits((current: PermitData[]) => current.map((p: PermitData) => {
          if (p.nonce === confirmedNonce && p.networkId === networkId) {
            console.log(`DEBUG: Updating UI state for permit ${claimedPermitKey} to Success/Claimed.`);
            return { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined, transactionHash: claimTxHash }; // Ensure hash is also set
          }
          return p;
        }));

        // 3. Record claim in DB
        const recordData = {
          nonce: confirmedNonce,
          transactionHash: claimTxHash,
          claimerAddress: address,
        };

        console.log(`DEBUG: Attempting to record claim for nonce ${recordData.nonce}`);
        fetch("/api/permits/record-claim", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordData),
        })
          .then(response => {
            if (!response.ok) {
              console.error(`Failed to record claim for permit nonce ${recordData.nonce}. Status: ${response.status}`);
              response.json().then(err => console.error("Error details:", err)).catch(() => { });
            } else {
              console.log(`DEBUG: Successfully recorded claim for permit nonce ${recordData.nonce}`);
            }
          })
          .catch(error => {
            console.error(`Network error recording claim for permit nonce ${recordData.nonce}:`, error);
          });

      } else {
        // Fallback: If we couldn't get nonce/networkId, update based on hash but cannot record claim
        console.warn(`Could not reliably identify permit from localStorage for tx ${claimTxHash}. Updating UI based on hash only.`);
        setPermits((current: PermitData[]) => current.map((p: PermitData) => {
          if (p.transactionHash === claimTxHash) {
            // Cannot guarantee this is the *only* permit with this hash if localStorage failed, but best effort
            return { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined };
          }
          return p;
        }));
      }

      // 4. Clean up localStorage regardless of success/failure to prevent stale entries
      console.log(`DEBUG: Removing localStorage entry for key ${storageKey}`);
      localStorage.removeItem(storageKey);
    }
}
