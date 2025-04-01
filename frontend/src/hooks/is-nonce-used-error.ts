import { ContractFunctionRevertedError, BaseError } from "viem";
import { isMaybeCodedError } from "./is-maybe-coded-error";

// Helper to check for nonce already used errors (more robust, targeting specific log structure)
export function isNonceUsedError(error: unknown): boolean {
  let currentError = error;
  let depth = 0;
  const maxDepth = 10; // Prevent infinite loops

  while (currentError && depth < maxDepth) {
    // Check 1: Direct ContractFunctionRevertedError with specific reason
    if (currentError instanceof ContractFunctionRevertedError) {
      const reason = currentError.reason?.toLowerCase();
      if (reason && (reason.includes("invalid nonce") || reason.includes("nonce already used"))) {
        // console.log("Nonce error detected via direct revert reason:", reason);
        return true;
      }
    }

    // Check 2: BaseError walk for nested ContractFunctionRevertedError
    if (currentError instanceof BaseError) {
      const nestedRevert = currentError.walk(e => e instanceof ContractFunctionRevertedError);
      if (nestedRevert instanceof ContractFunctionRevertedError) {
        const reason = nestedRevert.reason?.toLowerCase();
        if (reason && (reason.includes("invalid nonce") || reason.includes("nonce already used"))) {
          // console.log("Nonce error detected via nested revert reason:", reason);
          return true;
        }
      }
    }

    // Check 3: Check message strings for common nonce errors
    if (isMaybeCodedError(currentError) && typeof currentError.message === 'string') {
      const message = currentError.message.toLowerCase();
      if (message.includes("invalid nonce") || message.includes("nonce already used") || message.includes("nonce too low")) {
        // console.log("Nonce error detected via message keyword:", message);
        return true;
      }
    }

    // Check 4: Specifically check for the nested "VM execution error" within details, as seen in logs
    // This often masks the underlying nonce revert from Permit2 during simulation via RPC.
    if (currentError instanceof BaseError && 'details' in currentError && typeof currentError.details === 'string') {
      const details = currentError.details.toLowerCase();
      if (details.includes("vm execution error")) {
        // console.log("Nonce error potentially detected via 'VM execution error' in details.");
        return true; // Treat VM execution error during simulation as likely nonce issue
      }
    }

    // Move to the next cause
    currentError = isMaybeCodedError(currentError) ? currentError.cause : undefined;
    depth++;
  }

  // console.log("Nonce error not detected in error chain:", error);
  return false;
}
