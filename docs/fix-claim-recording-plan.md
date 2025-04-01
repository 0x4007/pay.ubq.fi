# Plan: Fix Claim Recording & Reappearing Permits

**Date:** 2025-04-02

**Goal:** Resolve two critical bugs:
1.  The backend API call (`/api/permits/record-claim`) to record a successful claim transaction hash is not being made.
2.  Successfully claimed permits reappear in the UI after a page refresh.

**Background:**
*   Previous attempts to fix these issues in `use-permit-claiming.ts` were hampered by file system tool errors and potential state/effect timing issues.
*   The hook logic has been refactored into smaller files within `frontend/src/hooks/`.
*   The core problems likely lie in:
    *   Correctly associating the confirmed transaction hash (`claimTxHash`) with the specific permit's details (`nonce`, `networkId`) needed for the API call.
    *   Ensuring the "claimed" status (`isNonceUsed: true`) persists correctly in `localStorage` and is respected during data loading/filtering after a refresh.

## Implementation Plan

### Part 1: Fix Claim Recording API Call

**Hypothesis:** The logic handling the success confirmation from `useWaitForTransactionReceipt` (likely still within `use-permit-claiming.ts` or a related effect hook file) is failing to retrieve the `nonce` and `networkId` associated with the confirmed `claimTxHash`.

**Strategy:** Use `localStorage` to reliably pass the necessary data (`nonce`, `networkId`) from the point of transaction submission to the point of confirmation.

**Steps:**

1.  **Identify Submission Logic File:** Locate the file containing the `handleClaimPermit` function (or equivalent) where `writeContractAsync` is called. This might still be `use-permit-claiming.ts`.
2.  **Modify Submission Logic:**
    *   Inside `handleClaimPermit`, immediately after the `const txHash = await writeContractAsync(...)` call succeeds:
        *   Retrieve the `nonce` and `networkId` from the `permitToClaim` object.
        *   Store these details in `localStorage`, keyed by the `txHash`. Use JSON stringify.
        ```javascript
        // Inside handleClaimPermit, after getting txHash
        try {
          const dataToStore = JSON.stringify({ nonce: permitToClaim.nonce, networkId: permitToClaim.networkId });
          localStorage.setItem(`pendingTx_${txHash}`, dataToStore);
          console.log(`DEBUG: Stored {nonce, networkId} in localStorage for txHash ${txHash}`);
        } catch (e) {
          console.error("Failed to store pending permit info in localStorage", e);
        }
        ```
3.  **Identify Confirmation Logic File:** Locate the file containing the `useEffect` hook that depends on `isClaimConfirmed` (from `useWaitForTransactionReceipt`). This might still be `use-permit-claiming.ts`.
4.  **Modify Confirmation Logic:**
    *   Inside the `useEffect` hook:
        *   Retrieve the stored data string from `localStorage` using `localStorage.getItem(\`pendingTx_\${claimTxHash}\`)`.
        *   Safely parse the JSON string.
        *   Check if `storedData`, `storedData.nonce`, and `storedData.networkId` exist.
        *   **If data exists:**
            *   Extract `confirmedNonce` and `networkId`.
            *   Construct `claimedPermitKey = \`${confirmedNonce}-${networkId}\``.
            *   Call `updatePermitStatusCache(claimedPermitKey, { isNonceUsed: true });` (or equivalent function handling cache update). **Ensure this function only updates the cache status, not UI state directly within this effect.**
            *   Update the UI state directly using `setPermits` to mark the specific permit as "Success"/"Claimed".
            *   Construct `recordData = { nonce: confirmedNonce, transactionHash: claimTxHash, claimerAddress: address }`.
            *   Perform the `fetch` call to `/api/permits/record-claim` with `recordData`.
            *   **Crucially, remove the corresponding item from `localStorage`** using `localStorage.removeItem(\`pendingTx_\${claimTxHash}\`)` both after a successful fetch *and* if parsing/data retrieval fails (to prevent stale entries).
        *   **If data doesn't exist:** Log a warning.
    *   **Verify Dependency Array:** Ensure the dependency array for this confirmation `useEffect` **does not** include the main `permits` state array if `setPermits` is called inside, but **does** include necessary functions like `updatePermitStatusCache`, `setPermits`, and variables like `isClaimConfirmed`, `claimReceipt`, `claimTxHash`, `address`. Example: `[isClaimConfirmed, claimReceipt, claimTxHash, updatePermitStatusCache, address, setPermits]`

### Part 2: Fix Reappearing Claimed Permits

**Hypothesis:** The `isNonceUsed: true` status, although potentially set in the cache by `updatePermitStatusCache`, is being overwritten by stale data from the worker, or the final filtering logic isn't correctly excluding used permits.

**Strategy:** Ensure the merge logic prioritizes the cached "used" status and that the filtering logic correctly removes used permits.

**Steps:**

1.  **Identify Cache/Merge Logic File:** Locate the file handling the `'NEW_PERMITS_VALIDATED'` message from the worker. This might be `use-permit-data.ts` or `initializeWorkerOnMount.ts`.
2.  **Modify Merge Logic:**
    *   When merging `validatedPermit` from the worker with `existingCachedPermit` from `localStorage`:
        *   Determine the final `isNonceUsed` status. **If `existingCachedPermit?.isNonceUsed` is `true`, the `finalIsNonceUsed` MUST be `true`, regardless of the value in `validatedPermit.isNonceUsed`.**
        ```javascript
        // Inside NEW_PERMITS_VALIDATED handler
        const existingCachedPermit = currentCache[key];
        let finalIsNonceUsed = validatedPermit.isNonceUsed; // Default to worker result
        if (existingCachedPermit?.isNonceUsed === true) {
            finalIsNonceUsed = true; // Force true if cache says it's used
        }
        const mergedPermit = {
          ...existingCachedPermit,
          ...validatedPermit,
          isNonceUsed: finalIsNonceUsed, // Apply potentially forced status
        };
        // ... rest of merge logic ...
        ```
3.  **Identify Filtering Logic File:** Locate the file containing the `applyFinalFilter` logic (likely `applyFinalFilteringForUi.ts` or `use-permit-data.ts`).
4.  **Verify Filtering Logic:**
    *   Ensure the condition correctly checks `permit.isNonceUsed === true` and filters out the permit if it is true.
    ```javascript
     // Inside applyFinalFilter
     permitsMap.forEach(permit => {
        const permitKey = `${permit.nonce}-${permit.networkId}`;
        const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
        const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed; // Ensure this check is correct
        console.log(`DEBUG: applyFinalFilter: Checking permit ${permitKey}. isNonceUsed=${permit.isNonceUsed}, nonceCheckFailed=${nonceCheckFailed}, shouldFilter=${shouldFilter}`);
        if (!shouldFilter) {
            filteredList.push(permit);
        } else {
             console.log(`DEBUG: applyFinalFilter: Filtering out permit ${permitKey}.`);
        }
    });
    ```
5.  **Identify Cache Update File:** Locate the file containing the `updatePermitStatusCache` logic (likely `manuallyUpdateStatusCache.ts` or `use-permit-data.ts`).
6.  **Modify Cache Update Logic:**
    *   Ensure that *immediately after* the updated cache is saved to `localStorage` (using `saveCache` or `localStorage.setItem`), the `applyFinalFilter` function is called again with the updated data map (`allPermitsRef.current`). This forces an immediate UI refresh based on the newly cached status.
    ```javascript
    // Inside updatePermitStatusCache or equivalent
    // ... logic to update currentCache ...
    saveCache(currentCache); // Save updated cache
    // ... logic to update allPermitsRef.current ...

    // Immediately re-apply filter after cache update:
    applyFinalFilter(allPermitsRef.current);
    ```

## Testing Procedure (After Applying Fixes)

1.  **Start Servers:** Run `bun run dev` (frontend) and `deno run --allow-net --allow-read --allow-env server.ts` (backend) in separate terminals (ensure `.env` is correct).
2.  **Open App & Console:** Navigate to the dev server URL and open browser dev tools console.
3.  **Claim Permit:** Execute a claim for one permit.
4.  **Verify Claim Recording:**
    *   Check browser console for `DEBUG` logs showing the `localStorage` set/get operations and the `fetch` call to `/api/permits/record-claim`.
    *   Check Network tab for a successful POST request (Status 200 OK) to `/api/permits/record-claim`.
    *   Check Deno server logs for success messages from the API endpoint.
    *   Check Supabase `permits` table for the updated `transaction` hash.
5.  **Verify Reappearing Fix:**
    *   **Refresh the page.**
    *   Check browser console `DEBUG` logs:
        *   `loadCache` should show the claimed permit with `isNonceUsed: true`.
        *   The merge logic should show it's preserving/forcing `isNonceUsed: true`.
        *   `applyFinalFilter` should show `shouldFilter=true` for the claimed permit and filter it out.
    *   Verify the claimed permit does **not** appear in the UI table.

This detailed plan should guide the next attempt to fix these issues.
