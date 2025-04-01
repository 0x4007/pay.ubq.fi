import { MaybeCodedError } from "./use-permit-claiming";


export function isMaybeCodedError(e: unknown): e is MaybeCodedError {
  return typeof e === 'object' && e !== null;
}
