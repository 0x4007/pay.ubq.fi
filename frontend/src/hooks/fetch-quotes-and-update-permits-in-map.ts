import React, { useCallback } from "react"; // Import React
import type { Address } from "viem";
import type { PermitData } from "../types";
import { getCowSwapQuote } from "../utils/cowswap-utils";

// Rename function and add types
export function useFetchQuotesAndUpdatePermitsInMap(
  preferredRewardTokenAddress: Address | null, // Use Address type
  address: Address | undefined, // Use Address type
  chainId: number | undefined,
  setIsQuoting: React.Dispatch<React.SetStateAction<boolean>> // Add type
) {
  return useCallback(async (permitsMap: Map<string, PermitData>): Promise<Map<string, PermitData>> => {
    if (!preferredRewardTokenAddress || !address || !chainId) {
      // Clear existing quote data if preference is removed or user/chain disconnected
      permitsMap.forEach(permit => {
        delete permit.estimatedAmountOut;
        delete permit.quoteError;
      });
      return permitsMap; // No preference set or missing info, return map as is
    }

    // console.log(`Starting quote fetching for preferred token: ${preferredRewardTokenAddress}`);
    setIsQuoting(true);
    const updatedPermitsMap = new Map(permitsMap); // Create a mutable copy



    // Group permits by their original token address
    const permitsByToken = new Map<Address, PermitData[]>();
    updatedPermitsMap.forEach(permit => {
      // Only consider claimable ERC20 permits for quoting
      if (permit.tokenAddress && permit.type === 'erc20-permit' && permit.status !== 'Claimed' && permit.claimStatus !== 'Success' && permit.claimStatus !== 'Pending') {
        const group = permitsByToken.get(permit.tokenAddress as Address) || [];
        group.push(permit);
        permitsByToken.set(permit.tokenAddress as Address, group);
      }
    });

    // Fetch quote for each group that needs swapping
    for (const [tokenInAddress, groupPermits] of permitsByToken.entries()) {
      // Skip if the group's token is already the preferred token
      if (tokenInAddress.toLowerCase() === preferredRewardTokenAddress.toLowerCase()) {
        // Clear any previous quote errors for this group
        groupPermits.forEach(p => {
          delete p.estimatedAmountOut;
          delete p.quoteError;
          updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p);
        });
        continue;
      }

      // Sum total amount for the group
      let totalAmountInWei = 0n;
      groupPermits.forEach(p => {
        if (p.amount) {
          try {
            totalAmountInWei += BigInt(p.amount);
          } catch (e) {
            console.error(`Error parsing amount for quote: ${p.amount}`, e); // Log the error object
          }
        }
      });

      if (totalAmountInWei === 0n) {
        // Clear quote fields if total amount is zero
        groupPermits.forEach(p => {
          delete p.estimatedAmountOut;
          delete p.quoteError;
          updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p);
        });
        continue; // Skip fetching quote if nothing to swap
      }

      try {
        // console.log(`Fetching quote: ${totalAmountInWei} ${tokenInAddress} -> ${preferredRewardTokenAddress}`);
        const quoteResult = await getCowSwapQuote({
          tokenIn: tokenInAddress, // Already Address type
          tokenOut: preferredRewardTokenAddress, // Already Address type
          amountIn: totalAmountInWei,
          userAddress: address, // Already Address type
          chainId: chainId, // Pass chainId
        });

        // Placeholder quote returns the total output amount in the output token's smallest unit
        const groupEstimatedTotalOut_InOutputUnits = quoteResult.estimatedAmountOut;

        groupPermits.forEach(p => {
          if (p.amount && totalAmountInWei > 0n) { // Ensure permit amount and group total exist and are non-zero
            try {
              const permitAmount_InInputUnits = BigInt(p.amount);

              // Calculate the permit's proportional share of the *total estimated output*
              // individual_output = (permit_input / group_total_input) * group_total_output
              // Use BigInt math throughout to maintain precision
              const individualEstimatedOut_InOutputUnits = (permitAmount_InInputUnits * groupEstimatedTotalOut_InOutputUnits) / totalAmountInWei;

              // **** Add Detailed Logging ****
              // console.log(`DEBUG Permit ${p.nonce}: Input Amount (Input Units): ${permitAmount_InInputUnits}, Group Total Input: ${totalAmountInWei}, Group Total Output (Output Units): ${groupEstimatedTotalOut_InOutputUnits}, Calculated Individual Output (Output Units): ${individualEstimatedOut_InOutputUnits}`);
              // **** End Logging ****
              // **** Add Logging Before toString() ****
              // console.log(`DEBUG Permit ${p.nonce}: Storing estimatedAmountOut = ${individualEstimatedOut_InOutputUnits} (Type: ${typeof individualEstimatedOut_InOutputUnits})`);
              // **** End Logging ****
              p.estimatedAmountOut = individualEstimatedOut_InOutputUnits.toString(); // Store individual estimate (already in output units)
              p.quoteError = null; // Clear previous errors
            } catch (calcError) {
              console.error(`Error calculating proportional estimate for permit ${p.nonce}:`, calcError);
              p.estimatedAmountOut = undefined; // Clear estimate on error
              p.quoteError = "Calculation error";
            }
          } else {
            p.estimatedAmountOut = undefined; // Clear if permit amount is missing or group total is zero
            p.quoteError = p.amount ? "Group total is zero" : "Missing amount";
          }
          updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p); // Update the map
        });
        // Correct variable name in log message
        // console.log(`Quote success for group ${tokenInAddress}: Total Est. Out ${groupEstimatedTotalOut_InOutputUnits} ${preferredRewardTokenAddress}`);
      } catch (quoteError) {
        console.error(`Quote failed for ${tokenInAddress} -> ${preferredRewardTokenAddress}:`, quoteError);
        const errorMessage = quoteError instanceof Error ? quoteError.message : "Quote fetching failed";
        // Apply error to all permits in the group
        groupPermits.forEach(p => {
          delete p.estimatedAmountOut; // Clear previous estimate
          p.quoteError = errorMessage;
          updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p); // Update the map
        });
      }
    }

    setIsQuoting(false);
    // console.log("Quote fetching finished.");
    return updatedPermitsMap; // Return the map with updated quote info
    // Add missing dependency
  }, [preferredRewardTokenAddress, address, chainId, setIsQuoting]);
}
