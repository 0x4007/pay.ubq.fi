0# System Patterns: Permit Claiming Application (Rewrite)

This document outlines the high-level architecture and key design patterns for the rewritten Permit Claiming application, based on the initial `rewrite-plan.md`.

## 1. Architecture Overview

The system comprises a frontend SPA (React/Vite), a backend API bundled within a Deno server (Hono), a Web Worker for validation, and a Supabase database.

```mermaid
graph LR
    subgraph Browser
        direction LR
        FrontendUI[Frontend UI (React/TS)] -->|Wallet Ops| Wallet[Web3 Wallet]
        FrontendUI -->|Worker Msgs| Worker[Permit Checker Worker]
        FrontendUI -->|API Call /api/permits/record-claim| BackendAPI[Backend API (Deno/Hono)]
        Worker -->|Batch RPC Calls| BlockchainRPC[Blockchain RPC]
    end

    subgraph Server (Deno Deploy)
        BackendAPI -->|Read/Write| DB[(Database - Supabase)]
    end

    Worker -->|Read| DB # Worker reads permits

    Wallet -->|Sign/Send Tx| BlockchainRPC
    BlockchainRPC -->|Tx Confirmation| FrontendUI # Via wagmi hooks

    style DB fill:#f9f,stroke:#333,stroke-width:2px
```

*   **Frontend UI (React/Vite):** Handles user interaction, wallet connection (`wagmi`), permit display, initiates claims, and calls the backend API to record successful claims. Uses raw CSS.
*   **Permit Checker Worker:** Runs in the browser background. Fetches permits from Supabase and performs batch on-chain validation via RPC.
    *   Receives wallet address and optional `lastCheckTimestamp`.
    *   Fetches permits from Supabase (all if no valid timestamp, otherwise only newer ones).
    *   Maps results, classifies as ERC20.
    *   Performs batch on-chain validation (nonce, balance, allowance).
    *   Returns the validated list to the main thread.
*   **Frontend Hook (`usePermitData`):** Orchestrates permit fetching and validation.
    *   Manages `localStorage` caching (`lastCheckTimestamp`, `permitDataCache`).
    *   Displays cached data, triggers worker fetch/validation.
    *   Merges results into cache and UI state.
    *   Handles optional CowSwap quote fetching based on user preference.
*   **Frontend Hook (`usePermitClaiming`):** Handles claim logic.
    *   Initiates single claims via `wagmi`/`viem`.
    *   Handles transaction confirmation.
    *   **Calls Backend API:** On successful confirmation, sends `nonce`, `txHash`, and `claimerAddress` to `/api/permits/record-claim`.
    *   Handles sequential claiming logic (future: multicall).
    *   **Handles Post-Claim Swapping:** If a preferred token is set and differs from the claimed token, instantiates `@cowprotocol/cow-sdk`'s `TradingSdk` and calls `postSwapOrder` to build, sign (via wallet), and submit the swap order.
*   **Backend API (Deno/Hono):** Bundled within `frontend/server.ts`.
    *   Serves static frontend build (`dist/`).
    *   Provides API endpoints (e.g., `/api/permits/record-claim`).
    *   Uses Supabase admin client to interact with the database (e.g., update `transaction` column).
    *   Loads environment variables from `.env` for local testing using `dotenv/load`.
*   **Database (Supabase):** Stores permit details. Read by the worker, written to by the backend API.
*   **Blockchain:** Source of truth for permit validity and claim execution.
*   **CowSwap API:** External service for quotes and swaps.
*   **LocalStorage:** Caches validation status, timestamp, and user preferences.

## 2. Key Patterns & Decisions

*   **Bundled Backend:** The backend API logic is included directly in the Deno server (`frontend/server.ts`) that also serves the static frontend assets. This simplifies deployment for Deno Deploy.
*   **Worker for Validation:** Offloads RPC-intensive validation tasks from the main thread to a Web Worker.
*   **Database Writes via Backend API:** All database modifications (like recording claim transactions) go through the controlled backend API, which performs necessary security checks (e.g., verifying claimer matches beneficiary).
*   **Client-Side Claiming:** Claim transactions are constructed and signed on the frontend.
*   **Client-Side Swapping (via TradingSdk):** Swap orders are built, signed (via wallet interaction), and submitted using `@cowprotocol/cow-sdk`'s `TradingSdk.postSwapOrder` method, simplifying the process.
*   **Nonce as Identifier:** Using the permit `nonce` (unique per user/token/spender) as the key identifier when communicating with the backend API to update claim status.
*   **Build Process:** Using Vite for frontend bundling. Build script (`bun run build`) includes `tsc -b && vite build`, which has shown intermittent hangs (workaround: run `bunx vite build` after clean install). Development uses Vite dev server (`bun run dev`).
*   (Other patterns like `viem`, `wagmi`, `localStorage` caching remain).

## 3. Data Flow (Claim Recording Added)

1.  **Wallet Connection:** Frontend -> Wallet -> Frontend.
2.  **Preference Selection:** Frontend -> `localStorage`.
3.  **Permit Fetching & Validation:** Frontend -> Worker -> Supabase (Read) -> Worker (RPC Validation) -> Frontend.
4.  **Quote Fetching (Conditional):** Frontend -> CowSwap API -> Frontend.
5.  **Claiming:** Frontend (`usePermitClaiming`) -> Simulate -> Wallet (Sign Tx) -> Blockchain (`permitTransferFrom`).
6.  **Claim Confirmation:** Blockchain -> Frontend (`useWaitForTransactionReceipt`).
7.  **Record Claim:** Frontend (`usePermitClaiming` on confirmation) -> **Backend API (`/api/permits/record-claim` with nonce, txHash, claimer)** -> Supabase (Update `transaction` column).
8.  **Post-Claim Swapping (Conditional):** Frontend (`usePermitClaiming`) -> Instantiate `TradingSdk` -> Call `TradingSdk.postSwapOrder` -> Wallet (Sign Order via SDK) -> CowSwap API (Submit via SDK) -> Frontend (Order ID).

*(This document will be updated as implementation progresses and patterns solidify.)*
