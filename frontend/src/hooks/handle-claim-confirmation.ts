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
        // Fallback: If we couldn't get nonce/networkId from localStorage
        console.warn(`Could not reliably identify permit key from localStorage for tx ${claimTxHash}. Attempting update via txHash match.`);

        let fallbackPermitKey: string | null = null;

        // Update UI state and try to find the permit key
        setPermits((current: PermitData[]) => current.map((p: PermitData) => {
          // Check if transactionHash exists on the permit before comparing
          if (p.transactionHash && p.transactionHash === claimTxHash) {
            // Found the permit based on hash
            fallbackPermitKey = `${p.nonce}-${p.networkId}`; // Get the key
            console.log(`DEBUG: Fallback found permit key ${fallbackPermitKey} matching txHash ${claimTxHash}`);
            // Update UI state, including isNonceUsed
            return { ...p, claimStatus: "Success", status: "Claimed", isNonceUsed: true, claimError: undefined };
          }
          return p;
        }));

        // If we found the key via the hash match, update the cache
        if (fallbackPermitKey) {
          console.log(`DEBUG: Fallback updating cache for key ${fallbackPermitKey} with isNonceUsed=true`);
          updatePermitStatusCache(fallbackPermitKey, { isNonceUsed: true, checkError: undefined });
        } else {
          // This might happen if the setPermits update hasn't flushed yet, or the permit wasn't in the state.
          // It's less critical as the primary cache update path failed anyway.
          console.warn(`Could not find permit matching txHash ${claimTxHash} in current state for fallback cache update.`);
        }
      }

      // 4. Clean up localStorage regardless of success/failure to prevent stale entries
      console.log(`DEBUG: Removing localStorage entry for key ${storageKey}`);
      localStorage.removeItem(storageKey);
    }
}
