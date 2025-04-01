import { useCallback } from "react";
import type { PermitData } from "../types";
import React from "react"; // Import React for type definition

// Rename to follow custom hook convention
export function useApplyFinalFilteringForUi(setDisplayPermits: React.Dispatch<React.SetStateAction<PermitData[]>>) {
  return useCallback((permitsMap: Map<string, PermitData>) => {
    console.log("DEBUG: useApplyFinalFilter called with map size:", permitsMap.size); // DEBUG
    const filteredList: PermitData[] = [];
    permitsMap.forEach(permit => {
      const permitKey = `${permit.nonce}-${permit.networkId}`; // DEBUG


      // Filter if nonce is used OR if the nonce check specifically failed
      const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
      const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed;

      // Add detailed logging for the filtering decision
      console.log(`DEBUG: useApplyFinalFilter: Checking permit ${permitKey}. isNonceUsed=${permit.isNonceUsed}, nonceCheckFailed=${nonceCheckFailed}, shouldFilter=${shouldFilter}`); // DEBUG

      if (!shouldFilter) {
        filteredList.push(permit);
      } else {
        console.log(`DEBUG: useApplyFinalFilter: Filtering out permit ${permitKey}.`); // DEBUG
      }
    });
    console.log(`DEBUG: useApplyFinalFilter: Filtered list size: ${filteredList.length}. Setting display permits.`); // DEBUG




    // Log the permits *being set* to the state, focusing on nonce and used status
    // console.log('useApplyFinalFilter: Filtered permits being set:', JSON.stringify(filteredList.map(p => ({ nonce: p.nonce, isNonceUsed: p.isNonceUsed }))));
    setDisplayPermits(filteredList);
  }, [setDisplayPermits]); // Add setDisplayPermits to dependency array
}
