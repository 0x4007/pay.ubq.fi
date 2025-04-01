import { type Address, type Hex, BaseError, ContractFunctionRevertedError, type PublicClient, type Chain } from "viem";
import type { Dispatch, SetStateAction } from "react";
import permit2ABI from "../fixtures/permit2-abi";
import type { PermitData } from "../types";
import { isNonceUsedError } from "./is-nonce-used-error";
import { CachedPermitStatus, PERMIT2_ADDRESS } from "./use-permit-claiming"; // Assuming CachedPermitStatus is exported

export function handleSequentialPermitClaims(
  setSequentialClaimError: Dispatch<SetStateAction<string | null>>,
  setIsClaimingSequentially: Dispatch<SetStateAction<boolean>>,
  publicClient: PublicClient | undefined,
  address: Address | undefined,
  chain: Chain | undefined,
  claimablePermits: PermitData[],
  updatePermitStatusCache: (permitKey: string, status: Partial<CachedPermitStatus>) => void,
  setPermits: Dispatch<SetStateAction<PermitData[]>>,
  handleClaimPermit: (permitToClaim: PermitData) => Promise<boolean>,
  setError: Dispatch<SetStateAction<string | null>>,
  initiateSwapsAfterClaims: (claimedInBatch: PermitData[]) => Promise<void>
) {
  // Return the async function directly
  return async () => {
    setSequentialClaimError(null);
    setIsClaimingSequentially(true);
    // console.log("Attempting sequential claim: Finding all valid permits...");
    if (!publicClient || !address || !chain) {
      setSequentialClaimError("Wallet not connected or client unavailable.");
      setIsClaimingSequentially(false);
      return;
    }

    const candidatePermits = claimablePermits; // Use pre-filtered list

    if (candidatePermits.length === 0) {
      setSequentialClaimError("No valid permits found on this network to claim.");
      setIsClaimingSequentially(false);
      return;
    }

    const validPermitsToClaim: PermitData[] = [];
    // console.log(`Found ${candidatePermits.length} candidates. Simulating individually...`);
    // --- Simulation Phase ---
    for (const permit of candidatePermits) {
      const permitKey = `${permit.nonce}-${permit.networkId}`;
      // console.log(`  Simulating permit nonce: ${permit.nonce}...`);
      try {
        // Ensure required fields for simulation
        if (permit.type !== "erc20-permit" || !permit.amount || !permit.token?.address || !permit.owner || !permit.signature || !permit.beneficiary || !permit.deadline) {
          throw new Error("Incomplete data for simulation.");
        }
        const permitArgs = {
          permitted: { token: permit.token.address as Address, amount: BigInt(permit.amount) },
          nonce: BigInt(permit.nonce),
          deadline: BigInt(permit.deadline),
        };
        const transferDetailsArgs = { to: permit.beneficiary as Address, requestedAmount: BigInt(permit.amount) };

        await publicClient.simulateContract({
          address: PERMIT2_ADDRESS,
          abi: permit2ABI,
          functionName: "permitTransferFrom",
          args: [permitArgs, transferDetailsArgs, permit.owner as Address, permit.signature as Hex],
          account: address,
        });

        // console.log(`    Permit ${permit.nonce} simulation successful.`);
        validPermitsToClaim.push(permit);
      } catch (simError: unknown) {
        let reason = "Unknown simulation error";
        if (simError instanceof BaseError) {
          const revertError = simError.walk((err: unknown) => err instanceof Error && err.cause instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
          reason = revertError?.reason ?? revertError?.shortMessage ?? simError.shortMessage ?? simError.message;
        } else if (simError instanceof Error) {
          reason = simError.message;
        }
        console.warn(`    Permit ${permit.nonce} simulation failed: ${reason}`);

        // Check if simulation failed due to nonce used
        if (isNonceUsedError(simError)) {
          // console.log(`Nonce already used for ${permitKey} detected during simulation. Marking as claimed.`);
          updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined });
          setPermits((current: PermitData[]) => current.map((p: PermitData) => p.nonce === permit.nonce && p.networkId === permit.networkId
            ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined }
            : p
          ));
        } else {
          // Mark as error for other simulation failures
          setPermits((current: PermitData[]) => current.map((p: PermitData) => p.nonce === permit.nonce && p.networkId === permit.networkId ? { ...p, claimStatus: "Error", claimError: `Sim fail: ${reason}` } : p
          ));
        }
      }
    }

    if (validPermitsToClaim.length === 0) {
      setSequentialClaimError("Could not find any permits that passed simulation.");
      setIsClaimingSequentially(false);
      return;
    }

    // --- Submission Phase ---
    // console.log(`Proceeding to claim ${validPermitsToClaim.length} validated permits sequentially:`, validPermitsToClaim.map((p) => p.nonce));
    let failures = 0;
    for (const permit of validPermitsToClaim) {
      const success = await handleClaimPermit(permit); // Reuse single claim logic (handles errors internally)
      if (!success) {
        // Failure already handled within handleClaimPermit (state set, error potentially shown)
        failures++;
      }
      // Optional: Add a small delay between sequential claims if needed
      // await new Promise(resolve => setTimeout(resolve, 500));
    } // Corrected closing brace for the for loop



    // console.log(`Sequential claim process finished. Failures: ${failures}`); // Removed successes
    if (failures > 0) {
      // Use global error for summary, individual errors handled by handleClaimPermit
      setError(`${failures} out of ${validPermitsToClaim.length} claim submissions failed or were rejected. Check individual permits.`);
    }

    // --- Initiate Swaps After Sequential Claims ---
    // Pass the list of permits *attempted* in this batch to the swap helper
    await initiateSwapsAfterClaims(validPermitsToClaim);

    setIsClaimingSequentially(false); // Finished claims and swap attempts
  }; // End of returned async function
}
