# CowSwap Implementation Plan

**Date:** 2025-04-02

**Goal:** Integrate CowSwap using `@cowprotocol/cow-sdk` to automatically swap claimed permit rewards into the user's preferred token (if selected and different from the claimed token).

## Plan Steps

1.  **Refine `frontend/src/utils/cowswap-utils.ts`:**
    *   **Target:** `initiateCowSwap` function.
    *   **Action:** Replace the placeholder logic with actual CowSwap SDK interactions.
        *   Use `@cowprotocol/cow-sdk` methods to:
            *   Fetch order parameters (potentially reusing parts of the `getQuote` logic or using a dedicated SDK method if available for order creation).
            *   Sign the order using the provided `viem` `WalletClient`. Need to confirm the exact SDK method and parameters for signing with `viem`.
            *   Submit the signed order to the CowSwap API.
        *   Ensure the `partnerFee` logic (0 bps for UUSD output on Gnosis/Mainnet, `COWSWAP_PARTNER_FEE_BPS` otherwise) is correctly applied during order creation. UUSD on Gnosis is `0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068`.
        *   Implement robust error handling for each step (parameter fetching, signing, submission).
    *   **Verification:** Ensure the function correctly returns the `orderUid` on successful submission or throws informative errors.

2.  **Integrate CowSwap into `frontend/src/hooks/use-permit-claiming.ts`:**
    *   **Target:** The `useEffect` hook that handles successful claim confirmation (`isClaimConfirmed`).
    *   **Action:**
        *   After the claim is confirmed *and* the claim recording API call is successful, check `localStorage` for the user's preferred reward token (`preferredRewardTokenAddress`).
        *   Retrieve the details of the just-claimed permit (token address `permit.tokenPermissions.token`, amount `permit.permitAmount`, chain ID `permit.chainId`).
        *   **Conditional Swap:** If `preferredRewardTokenAddress` exists AND is different from `permit.tokenPermissions.token` (case-insensitive comparison):
            *   Call `initiateCowSwap` from `cowswap-utils.ts`.
            *   Pass the necessary parameters: `tokenIn`, `tokenOut`, `amountIn`, `userAddress`, `chainId`, `walletClient`.
            *   Add state variables to track the swap status (e.g., `isSwapping`, `swapError`, `swapOrderUid`). Update these states before and after calling `initiateCowSwap`.
        *   Handle errors returned by `initiateCowSwap` and update the `swapError` state.
    *   **Verification:** Ensure the swap is only triggered under the correct conditions and that the parameters passed to `initiateCowSwap` are correct. Verify state updates for loading and errors.

3.  **Update UI Components:**
    *   **Target:** `PermitRow.tsx` (or potentially `PermitsTable.tsx`).
    *   **Action:**
        *   Pass down the swap status (`isSwapping`, `swapError`, `swapOrderUid`) from the hook to the relevant component.
        *   Display visual feedback during the swap process (e.g., loading indicator, status message).
        *   Ensure the `RewardPreferenceSelector.tsx` component correctly saves the selected token address to `localStorage` under the key `preferredRewardTokenAddress`.
    *   **Verification:** UI should clearly reflect the state of the post-claim swap attempt.

4.  **Testing:**
    *   **Unit/Integration:** Add tests for `cowswap-utils.ts` if possible (mocking SDK calls).
    *   **Manual End-to-End:** Test various scenarios on Gnosis (swap to UUSD, swap to other, no swap) and error conditions. Test on Mainnet if feasible.

5.  **Documentation & Cleanup:**
    *   **Action:** Update `docs/system-patterns.md`, `docs/progress.md`, `docs/active-context.md`. Review code against `.clinerules`. Remove placeholders.
    *   **Verification:** Docs are accurate. Code is clean.

## Updated Flow Diagram (Post-Claim Focus)

```mermaid
graph TD
    subgraph usePermitClaiming Hook
        ClaimConfirm[Claim Confirmed] --> RecordClaim{Call /api/permits/record-claim}
        RecordClaim -- Success --> CheckPref{Check localStorage Pref?}
        CheckPref -- Pref Exists & Differs --> PrepareSwap[Prepare Swap Params]
        PrepareSwap --> CallInitiateSwap[Call initiateCowSwap(...)]
        CallInitiateSwap --> UpdateSwapUI[Update UI: Swapping...]
        CallInitiateSwap -- Success --> UpdateSwapUI_Success[Update UI: Swap Submitted (UID)]
        CallInitiateSwap -- Error --> UpdateSwapUI_Error[Update UI: Swap Failed]
        CheckPref -- No Pref or Same Token --> EndSwap[End]
    end

    subgraph cowswap-utils.ts
        CallInitiateSwap --> InitiateSwapFn[initiateCowSwap Function]
        InitiateSwapFn --> GetOrderParams[Get Order Params (SDK)]
        GetOrderParams --> SignOrder[Sign Order (SDK + WalletClient)]
        SignOrder --> SubmitOrder[Submit Order (SDK)]
        SubmitOrder -- Success --> ReturnUID[Return orderUid]
        InitiateSwapFn -- Any Error --> ThrowError[Throw Error]
    end

    style EndSwap fill:#eee,stroke:#333,stroke-width:1px
