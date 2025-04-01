import type { Address, WalletClient, Chain } from "viem";
import type { Dispatch, SetStateAction } from "react";
import { getTokenInfo } from "../constants/supported-reward-tokens";
import type { PermitData } from "../types";
import { initiateCowSwap } from "../utils/cowswap-utils";

// Define the type for the swap status state
type SwapSubmissionStatus = Record<string, { status: 'submitting' | 'submitted' | 'error'; message?: string; orderUid?: string }>;

export function initiateSwapsAfterSuccessfulClaims(
  walletClient: WalletClient | null | undefined,
  address: Address | undefined,
  chain: Chain | undefined,
  setError: Dispatch<SetStateAction<string | null>>,
  setSwapSubmissionStatus: Dispatch<SetStateAction<SwapSubmissionStatus>>,
  permits: PermitData[]
) {
  // Return the async function directly, no useCallback needed here
  return async (claimedInBatch: PermitData[]) => {
    const preferredTokenAddress = localStorage.getItem('preferredRewardToken') as Address | null;
    if (!preferredTokenAddress || !walletClient || !address || !chain) {
      // Added check for chain as well
      if (preferredTokenAddress && !walletClient) {
        console.warn("Cannot initiate swaps: Wallet client not available.");
        setError("Could not access wallet to sign swap orders.");
      }
      return; // Exit if no preference or wallet client issues
    }

    console.log("Checking for swaps needed after claims...");
    setSwapSubmissionStatus({}); // Reset swap status





    // Filter the permits passed in (those attempted in the batch) to find the ones that actually succeeded
    // We need to check the main 'permits' state here as it holds the latest 'claimStatus'
    const successfullyClaimedPermits = permits.filter(p => claimedInBatch.some(vp => vp.nonce === p.nonce && vp.networkId === p.networkId) && // Was part of the batch attempted
      p.claimStatus === 'Success' // And actually succeeded according to the main state
    );


    if (successfullyClaimedPermits.length === 0) {
      console.log("No permits were successfully claimed in this batch, skipping swaps.");
      return;
    }

    const swapsToInitiate = new Map<Address, bigint>(); // Map<tokenAddress, totalAmount>



    // Group successful claims by token address
    successfullyClaimedPermits.forEach(p => {
      if (p.tokenAddress && p.amount && p.tokenAddress.toLowerCase() !== preferredTokenAddress.toLowerCase()) {
        const currentTotal = swapsToInitiate.get(p.tokenAddress as Address) || 0n;
        try {
          swapsToInitiate.set(p.tokenAddress as Address, currentTotal + BigInt(p.amount));
        } catch (e) { console.error("Error summing amount for swap:", e); }
      }
    });

    if (swapsToInitiate.size === 0) {
      console.log("No swaps needed (all claimed tokens are the preferred token).");
      return;
    }

    console.log(`Need to initiate ${swapsToInitiate.size} swaps.`);
    setError(null); // Clear previous claim errors before showing swap status

    for (const [tokenInAddress, totalAmountIn] of swapsToInitiate.entries()) {
      const tokenInfo = getTokenInfo(chain.id, tokenInAddress);
      const symbol = tokenInfo?.symbol || tokenInAddress.substring(0, 6);
      const swapKey = tokenInAddress;

      setSwapSubmissionStatus((prev: SwapSubmissionStatus) => ({ ...prev, [swapKey]: { status: 'submitting', message: `Submitting swap for ${symbol}...` } }));

      try {
        // Ensure address is passed correctly (it's already typed as Address | undefined)
        const { orderUid } = await initiateCowSwap({
          tokenIn: tokenInAddress,
          tokenOut: preferredTokenAddress,
          amountIn: totalAmountIn,
          userAddress: address,
          walletClient: walletClient,
          chainId: chain.id,
        });
        console.log(`Swap submitted for ${symbol}. Order UID: ${orderUid}`);
        setSwapSubmissionStatus((prev: SwapSubmissionStatus) => ({ ...prev, [swapKey]: { status: 'submitted', message: `Swap for ${symbol} submitted (UID: ${orderUid.substring(0, 8)}...)`, orderUid } }));
      } catch (swapError) {
        console.error(`Swap initiation failed for ${symbol}:`, swapError);
        const message = swapError instanceof Error ? swapError.message : "Unknown swap error";
        setSwapSubmissionStatus((prev: SwapSubmissionStatus) => ({ ...prev, [swapKey]: { status: 'error', message: `Swap failed for ${symbol}: ${message}` } }));
        setError((prevError: string | null) => `${prevError ? prevError + '; ' : ''}Swap failed for ${symbol}.`);
      }
    }
  }; // End of the returned async function
}
