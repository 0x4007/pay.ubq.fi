import { type Address, type Hex, BaseError, type Chain, type PublicClient, type Abi } from "viem"; // Import Abi
import type { Dispatch, SetStateAction } from "react";
import type { WriteContractReturnType } from "wagmi/actions"; // Import the specific type for writeContractAsync result
import permit2ABI from "../fixtures/permit2-abi";
import type { PermitData } from "../types";
import { hasRequiredFields } from "../utils/permit-utils";
import { isNonceUsedError } from "./is-nonce-used-error";
import { isUserRejection } from "./is-user-rejection";
import { CachedPermitStatus, PERMIT2_ADDRESS } from "./use-permit-claiming"; // Assuming CachedPermitStatus is exported

// Define the type for writeContractAsync based on wagmi's useWriteContract
type WriteContractAsyncFunction = (args: {
  address: Address;
  abi: Abi; // Use Abi type
  functionName: string;
  args: unknown[]; // Use unknown[] instead of any[]
}) => Promise<WriteContractReturnType>;

export function handlePermitClaim(
  isConnected: boolean,
  address: Address | undefined, // Use Address type
  chain: Chain | undefined,
  writeContractAsync: WriteContractAsyncFunction | undefined, // Use the defined type
  setError: Dispatch<SetStateAction<string | null>>,
  resetWriteContract: () => void,
  setPermits: Dispatch<SetStateAction<PermitData[]>>,
  publicClient: PublicClient | undefined,
  updatePermitStatusCache: (permitKey: string, status: Partial<CachedPermitStatus>) => void
) {
  // Return the async function directly
  return async (permitToClaim: PermitData): Promise<boolean> => {
    const permitKey = `${permitToClaim.nonce}-${permitToClaim.networkId}`;
    // console.log(`Attempting to claim permit: ${permitKey}`);
    // --- Pre-claim checks ---
    if (!isConnected || !address || !chain || !writeContractAsync) {
      setError("Wallet not connected or chain/write function missing.");
      // No state update needed here as button should already be disabled
      return false;
    }
    if (permitToClaim.networkId !== chain.id) {
      const networkError = `Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`;
      setError(networkError);
      // No state update needed here as button should already be disabled
      return false;
    }
    if (!hasRequiredFields(permitToClaim)) {
      const incompleteError = "Permit data is incomplete.";
      setError(incompleteError);
      // No state update needed here as button should already be disabled
      return false;
    }
    // Re-check prerequisites just before claiming
    if (permitToClaim.type === "erc20-permit") {
      const balanceErrorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
      const allowanceErrorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
      // Corrected typo: checkErrorMsg -> permitToClaim.checkError
      if (permitToClaim.ownerBalanceSufficient === false) {
        console.error(balanceErrorMsg);
        setError(balanceErrorMsg); // Show global error
        return false;
      }
      if (permitToClaim.permit2AllowanceSufficient === false) {
        console.error(allowanceErrorMsg);
        setError(allowanceErrorMsg); // Show global error
        return false;
      }
      if (permitToClaim.checkError) {
        // Use the actual error message from the permit data
        const checkErrorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;
        console.error(checkErrorMsg);
        setError(checkErrorMsg); // Show global error
        return false;
      }
    }

    // --- Claim Submission ---
    resetWriteContract(); // Reset previous write state



    // Set UI state to Pending
    setPermits((currentPermits: PermitData[]) => currentPermits.map((p: PermitData) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
      ? { ...p, claimStatus: "Pending", claimError: undefined, transactionHash: undefined }
      : p
    ));

    // --- Pre-Simulation ---
    let simulationSuccessful = false;
    try {
      // Add check for publicClient
      if (!publicClient) {
        throw new Error("Public client not available for simulation.");
      }
      if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
        throw new Error("Invalid ERC20 permit data for simulation.");
      }
      const permitArgs = {
        permitted: { token: permitToClaim.token.address as Address, amount: BigInt(permitToClaim.amount) },
        nonce: BigInt(permitToClaim.nonce),
        deadline: BigInt(permitToClaim.deadline),
      };
      const transferDetailsArgs = { to: permitToClaim.beneficiary as Address, requestedAmount: BigInt(permitToClaim.amount) };

      // console.log(`Simulating claim for permit: ${permitKey}`);
      await publicClient.simulateContract({
        address: PERMIT2_ADDRESS,
        abi: permit2ABI,
        functionName: "permitTransferFrom",
        args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
        account: address, // Use connected address for simulation
      });
      // console.log(`Simulation successful for permit: ${permitKey}`);
      simulationSuccessful = true;

    } catch (simError) {
      console.warn(`Claim simulation failed for ${permitKey}:`, simError);
      if (isNonceUsedError(simError)) {
        // console.log(`Nonce already used for ${permitKey} detected during pre-simulation. Marking as claimed.`);
        setError("Permit already claimed."); // Set specific global error for the modal
        updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined }); // Update cache
        setPermits((currentPermits: PermitData[]) => // Update local state
          currentPermits.map((p: PermitData) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
            ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined, transactionHash: undefined } // Mark as claimed, clear specific error on row
            : p
          ));
      } else {
        // For other simulation errors, set the global error but clear the specific permit error
        const reason = simError instanceof BaseError ? simError.shortMessage : (simError instanceof Error ? simError.message : "Unknown simulation error");
        setError(`Claim simulation failed: ${reason}`); // Set generic global error for the modal
        setPermits((currentPermits: PermitData[]) => currentPermits.map((p: PermitData) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: "Error", claimError: undefined, transactionHash: undefined } // Set Error status, clear specific claimError
          : p
        ));
      }
      return false; // Stop claim process if simulation fails
    }

    // --- Actual Submission (only if simulation passed) ---
    if (!simulationSuccessful) {
      // Should not happen if logic above is correct, but as a safeguard
      console.error("Simulation did not succeed, but error was not caught. Aborting claim.");
      setError("Internal error during claim simulation.");
      setPermits((currentPermits: PermitData[]) => currentPermits.map((p: PermitData) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
        ? { ...p, claimStatus: "Error", claimError: "Internal simulation error", transactionHash: undefined }
        : p
      ));
      return false;
    }

    try {
      // Re-construct args (or reuse if scope allows, but safer to reconstruct)
      if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
        throw new Error("Invalid ERC20 permit data for submission."); // Should be caught earlier, but belt-and-suspenders
      }
      const permitArgs = {
        permitted: { token: permitToClaim.token.address as Address, amount: BigInt(permitToClaim.amount) },
        nonce: BigInt(permitToClaim.nonce),
        deadline: BigInt(permitToClaim.deadline),
      };
      const transferDetailsArgs = { to: permitToClaim.beneficiary as Address, requestedAmount: BigInt(permitToClaim.amount) };

      // Submit transaction
      // console.log(`Submitting actual claim transaction for permit: ${permitKey}`);
      const txHash = await writeContractAsync({
        address: PERMIT2_ADDRESS,
        abi: permit2ABI,
        functionName: "permitTransferFrom",
        args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
      });

      // console.log(`Claim transaction sent for ${permitKey}:`, txHash);
      // --->>> NEW: Store nonce and networkId in localStorage keyed by txHash <<<---
      try {
        const dataToStore = JSON.stringify({ nonce: permitToClaim.nonce, networkId: permitToClaim.networkId });
        localStorage.setItem(`pendingTx_${txHash}`, dataToStore);
        console.log(`DEBUG: Stored {nonce, networkId} in localStorage for txHash ${txHash}`);
      } catch (e) {
        console.error("Failed to store pending permit info in localStorage", e);
        // Continue even if localStorage fails, but log the error
      }
      // --->>> END NEW <<<---
      // Update permit state with hash (still Pending)
      setPermits((currentPermits: PermitData[]) => currentPermits.map((p: PermitData) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p)));
      return true; // Indicate success (submission)

    } catch (err) {
      console.warn(`Claim submission failed for ${permitKey}:`, err); // Use warn for potential rejections



      // Handle different error types
      if (isUserRejection(err)) {
        // console.log(`User rejected claim for ${permitKey}.`);
        // Reset status without error
        setPermits((currentPermits: PermitData[]) => currentPermits.map((p: PermitData) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: "Idle", claimError: undefined, transactionHash: undefined } // Reset to Idle
          : p
        ));
      } else if (isNonceUsedError(err)) {
        // If it's a nonce error, treat as claimed immediately
        // console.log(`Nonce already used for ${permitKey}. Marking as claimed.`);
        updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined });
        setPermits((currentPermits: PermitData[]) => currentPermits.map((p: PermitData) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined, transactionHash: undefined } // Mark as claimed
          : p
        ));
      } else {
        // Handle other errors globally
        setError("Claim failed. Please try again.");
        setPermits((currentPermits: PermitData[]) => currentPermits.map((p: PermitData) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: "Error", claimError: undefined, transactionHash: undefined } // Set Error, clear specific message
          : p
        ));
      }
      return false; // Indicate failure
    }
  }; // End of returned async function
}
