import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount, useWalletClient } from "wagmi"; // Add useWalletClient
import { type Address } from "viem";
import type { PermitData } from "../types";
import { handleClaimSubmissionError } from "./handle-claim-submission-error";
import { handleClaimConfirmationError } from "./handle-claim-confirmation-error";
import { handleClaimConfirmation } from "./handle-claim-confirmation";
import { handleSequentialPermitClaims } from "./handle-sequential-permit-claims";
import { initiateSwapsAfterSuccessfulClaims } from "./initiate-swaps-after-successful-claims";
import { handlePermitClaim } from "./handle-permit-claim";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

interface UsePermitClaimingProps {
  permits: PermitData[]; // Keep permits for finding the right one in error handlers
  setPermits: React.Dispatch<React.SetStateAction<PermitData[]>>;
  claimablePermits: PermitData[]; // Pass pre-filtered claimable permits
  setError: React.Dispatch<React.SetStateAction<string | null>>; // To set general errors
  updatePermitStatusCache: (permitKey: string, status: Partial<CachedPermitStatus>) => void; // Add cache update function
}

// Type for cached status (consider sharing types later)
export type CachedPermitStatus = Pick<PermitData, "isNonceUsed" | "checkError" | "ownerBalanceSufficient" | "permit2AllowanceSufficient">;

// Helper type guard for errors with a potential 'code' property
export interface MaybeCodedError {
  code?: number | string;
  message?: string;
  cause?: unknown;
}

export function usePermitClaiming({ permits, setPermits, claimablePermits, setError, updatePermitStatusCache }: UsePermitClaimingProps) {
  const [sequentialClaimError, setSequentialClaimError] = useState<string | null>(null);
  const [isClaimingSequentially, setIsClaimingSequentially] = useState(false);
  const [swapSubmissionStatus, setSwapSubmissionStatus] = useState<Record<string, { status: 'submitting' | 'submitted' | 'error'; message?: string; orderUid?: string }>>({}); // State for swap feedback

  // Wallet and client hooks
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient(); // Get wallet client for signing swaps

  // Wagmi hooks for writing contract and waiting for receipt
  const { data: claimTxHash, error: writeContractError, writeContractAsync, reset: resetWriteContract } = useWriteContract();
  const {
    data: claimReceipt,
    isLoading: isClaimConfirming, // Expose this loading state
    isSuccess: isClaimConfirmed,
    error: claimReceiptError,
  } = useWaitForTransactionReceipt({ hash: claimTxHash });

  // --- Handle Single Claim ---
  const handleClaimPermit = handlePermitClaim(isConnected, address, chain, writeContractAsync, setError, resetWriteContract, setPermits, publicClient, updatePermitStatusCache);

  // --- Helper Function for Initiating Swaps ---
  const initiateSwapsAfterClaims = initiateSwapsAfterSuccessfulClaims(walletClient, address, chain, setError, setSwapSubmissionStatus, permits); // Dependencies for the swap helper

  // --- Handle Sequential Claim ---
  const handleClaimAllValidSequential = handleSequentialPermitClaims(setSequentialClaimError, setIsClaimingSequentially, publicClient, address, chain, claimablePermits, updatePermitStatusCache, setPermits, handleClaimPermit, setError, initiateSwapsAfterClaims); // Added initiateSwapsAfterClaims


  // --- Effects for Handling Transaction Results ---
  // Note: These are now direct function calls, not effects. They run on every render where their inputs change.
  handleClaimConfirmation(isClaimConfirmed, claimReceipt, claimTxHash, address, updatePermitStatusCache, setPermits);

  handleClaimConfirmationError(claimReceiptError, claimTxHash, permits, updatePermitStatusCache, setPermits, setError); // Removed isClaimConfirmed, claimReceipt args

  handleClaimSubmissionError(writeContractError, permits, updatePermitStatusCache, setPermits, setError);

  return {
    handleClaimPermit,
    handleClaimAllValidSequential,
    isClaimingSequentially,
    sequentialClaimError,
    setSequentialClaimError, // Expose setter if needed by component
    isClaimConfirming, // Expose confirmation loading state
    claimTxHash, // Expose hash for table row updates
    swapSubmissionStatus, // Expose swap status
  };
}
