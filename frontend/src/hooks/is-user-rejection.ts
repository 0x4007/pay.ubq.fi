import { UserRejectedRequestError } from "viem";
import { isMaybeCodedError } from "./is-maybe-coded-error";

// Helper to check for user rejection errors
export function isUserRejection(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) {
    return true;
  }
  // Recursively check causes for common codes or messages
  let cause = isMaybeCodedError(error) ? error.cause : undefined;
  while (cause) {
    if (isMaybeCodedError(cause)) {
      if (cause.code === 4001 || cause.code === "ACTION_REJECTED") {
        return true;
      }
      if (typeof cause.message === "string" && (cause.message.includes("User rejected") || cause.message.includes("denied transaction signature"))) {
        return true;
      }
      cause = cause.cause; // Move to the next cause in the chain
    } else {
      break; // Stop if the cause is not an object we can inspect
    }
  }
  // Check top-level message as fallback
  if (isMaybeCodedError(error) && typeof error.message === "string" && (error.message.includes("User rejected") || error.message.includes("denied transaction signature"))) {
    return true;
  }
  return false;
}
