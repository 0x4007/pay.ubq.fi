0# System Patterns: Permit Claiming Application (Rewrite)

This document outlines the high-level architecture and key design patterns for the rewritten Permit Claiming application, based on the initial `rewrite-plan.md`.

## 1. Architecture Overview

The system follows a decoupled architecture comprising a frontend SPA, backend Deno Deploy functions (API and Scanner), and a Supabase database.

```mermaid
graph LR
    subgraph Browser
        direction LR
        Router[React Router]
        subgraph Frontend UI (React/TS)
            direction TB
            DashboardView[Dashboard Page]
            LeaderboardView[Leaderboard Page]
            LoginView[Login Page]
        end
        Router --> LoginView
        Router --> DashboardView
        Router --> LeaderboardView

        DashboardView -->|Wallet Ops| Wallet[Web3 Wallet]
        DashboardView -->|Worker Msgs (FETCH_NEW_PERMITS)| Worker[Permit Checker Worker]
        LeaderboardView -->|Worker Msgs (FETCH_LEADERBOARD_DATA)| Worker

        Worker -->|Batch RPC Calls (Validation)| Blockchain[Blockchain RPC]
        Worker -->|Read Permits| DB[(Database - Supabase)]
        Worker -->|Read Users| DB
    end

    Wallet -->|Sign/Send Tx| Blockchain

    style DB fill:#f9f,stroke:#333,stroke-width:2px
```

*   **Frontend:** Handles user interaction via different views managed by **React Router**. Connects wallet (`wagmi`), displays permits/leaderboard, initiates claims. Uses raw CSS.
*   **Permit Checker Worker (`app-worker.ts`):** The main worker entry point (previously `permit-checker.worker.ts`), instantiated via `worker-context.tsx`. Runs in the browser background. Handles multiple message types by orchestrating helper modules within `frontend/src/workers/`:
    *   `INIT`: Initializes Supabase clients and stores the provided GitHub token. **Note:** Cache clearing based on token changes during init has been removed; caches now rely solely on their internal TTLs.
    *   `FETCH_NEW_PERMITS`: Fetches (`fetch-permits-from-db.ts`), maps (`map-db-permit-to-permit-data.ts`), and validates (`validate-permits-batch.ts`) permits for the *connected user* based on wallet ID (looked up from address) and timestamp.
    *   `FETCH_LEADERBOARD_DATA`: Fetches all permits/users (`fetch-all-permits-for-leaderboard.ts`) and processes/aggregates (`leaderboard-processing.ts`, using `github-comment-cache.ts`) data for the leaderboard. Returns the final processed `LeaderboardEntry[]`.
*   **Frontend Hook (`usePermitData`):** Orchestrates fetching and validation for the *connected user's* permits (Dashboard view).
    *   Manages `localStorage` for `lastCheckTimestamp` and `permitDataCache` (containing full `PermitData` objects including validation status).
    *   On load/refresh, displays cached data immediately, then sends `FETCH_NEW_PERMITS` message to worker with the last timestamp.
    *   Receives the validated list from the worker, merges it into the `localStorage` cache, saves the cache and new timestamp to `localStorage`.
    *   **Quote Fetching:** If a preferred reward token is set (via `localStorage`), fetches quotes from CowSwap API (via `cowswap-utils.ts`) for claimable permits needing swaps. Stores estimated amounts (`estimatedAmountOut`, `quoteError`) in the permit data map (`allPermitsRef`).
    *   Updates the UI state after filtering and potentially adding quote estimates.
*   **Frontend Hook (`useLeaderboardData.ts`):** Orchestrates fetching and caching for the leaderboard view.
    *   Checks IndexedDB cache (`utils/leaderboard-cache.ts`) for processed `LeaderboardEntry[]` data first (1-hour TTL).
    *   If cache miss, sends `FETCH_LEADERBOARD_DATA` message to the worker.
    *   Receives the final processed `LeaderboardEntry[]` list from the worker.
    *   Caches the received processed data in IndexedDB.
    *   Provides the leaderboard data, loading state, and error state to the UI component. (Filtering logic moved to worker/component).
*   **Frontend Hook (`usePermitClaiming`):** Handles claim logic (Dashboard view).
    *   Currently uses `handleClaimAllValidSequential` for "Claim All", which simulates and claims permits one by one.
    *   **Post-Claim Swapping:** After sequential claims complete, identifies successfully claimed tokens, groups them, and triggers CowSwap order submissions (via `cowswap-utils.ts` and `initiateCowSwap`) for tokens needing to be swapped to the preferred token.
    *   Updates `localStorage` permit cache immediately upon successful claim confirmation.
    *   Manages state for swap submission status (`swapSubmissionStatus`).
*   **Frontend Component (`DashboardPage.tsx`):** Displays permits for the connected user, allows claiming. Uses `usePermitData` and `usePermitClaiming`.
*   **Frontend Component (`DeveloperLeaderboard.tsx`):** Displays the developer XP leaderboard using a **stacked bar chart (`recharts`)** to visualize XP breakdown by category. Uses `useLeaderboardData`. Includes filtering controls (category, repository) **and a time range radio button group (1W, 2W, 1M, 3M, 1Y)**. Manages `selectedWeeks` state. Styling in `leaderboard-styles.css`.
*   **Frontend Component (`LoginPage.tsx`):** Handles wallet connection prompt.
*   **Frontend Component (`RewardPreferenceSelector`):** Allows user to select preferred reward token from a list (defined in `constants/supported-reward-tokens.ts`). Saves selection to `localStorage`.
*   **Frontend Utility (`cowswap-utils.ts`):** Contains (currently placeholder) functions to interact with CowSwap API for quotes (`getCowSwapQuote`) and order submission (`initiateCowSwap`). Uses `@cowprotocol/cow-sdk`.
*   **Database (Supabase):** Stores `permits`, `users` (with GitHub info), `tokens`, etc. Queried by the worker.
*   **Blockchain:** Source of truth for permit validity (checked via worker's batch RPC calls) and claim execution (initiated by frontend).
*   **CowSwap API:** External service used for fetching swap quotes and submitting swap orders.
*   **LocalStorage:** Caches `lastCheckTimestamp`, detailed user permit validation status (`PermitDataCache`), and the user's `preferredRewardToken`. Invalidation is managed by the `usePermitData` hook based on the timestamp.
*   **IndexedDB:** Caches final processed leaderboard data (`LeaderboardEntry[]`), GitHub user details (via `leaderboard-cache.ts`), and GitHub comment data (via `github-comment-cache.ts`). Invalidation is handled internally by these cache utilities based on time-to-live (TTL) settings, independent of token changes.

## 2. Key Patterns & Decisions

*   **Worker as Data Fetcher:** The Permit Checker Worker handles all direct database interactions (fetching permits, users) for both the dashboard and leaderboard views, acting as a data access layer for the frontend.
*   **Database as Source:** Supabase is the primary source for permit and user data. Assumes data is populated externally.
*   **Client-Side Routing:** `react-router-dom` manages navigation between Login, Dashboard, and Leaderboard views. Authentication checks are handled via a `ProtectedRoute` component using `wagmi`'s `useAccount`.
*   **Client-Side Claiming:** Claim transactions (`permitTransferFrom`) are constructed and signed on the frontend using `wagmi`/`viem` (Dashboard view). Currently sequential for "Claim All".
*   **Client-Side Swapping:** Swap orders (via CowSwap) are constructed, signed, and submitted from the frontend using `@cowprotocol/cow-sdk` and `wagmi`/`viem` (Dashboard view).
*   **Multicall Aggregation:** Planned for future batch claiming feature, but the utility file (`multicall-utils.ts`) is currently missing. Single claims are implemented in `usePermitClaiming`.
*   **Blockchain Interaction Library:** `viem` used across frontend (claiming) and worker (validation).
*   **RPC Management:** `@pavlovcik/permit2-rpc-manager` will be used for managing RPC connections and potentially handling fallbacks/retries (to be integrated in backend).
*   **Type Safety:** TypeScript used across frontend, backend, and shared types. API validation is basic.
*   **Testing:** `bun test` for unit/integration tests, React Testing Library for component tests (if using React).

## 3. Data Flow

1.  **Wallet Connection:** Frontend (User Action) -> Wallet (Approve Connection) -> Frontend (`useAccount` hook updates).
2.  **Preference Selection:** Frontend (`RewardPreferenceSelector`) -> Save Address (`localStorage`).
3.  **Permit Fetching & Validation (Dashboard):** Frontend (`usePermitData` on connect/refresh) -> Read Timestamp/Cache (`localStorage`) & Display Cache -> Worker (`FETCH_NEW_PERMITS` with timestamp) -> Worker (Lookup Wallet ID, Fetch DB (`fetch-permits-from-db.ts`), Map (`map-db-permit-to-permit-data.ts`), Validate Batch RPC (`validate-permits-batch.ts`)) -> Worker (Return validated list) -> Frontend (`usePermitData` receives list) -> Frontend (Merge into `localStorage` cache).
4.  **Leaderboard Fetching, Processing & Display:** Frontend (`DeveloperLeaderboard` mount) -> `useLeaderboardData` -> Check Cache (`leaderboard-cache.ts` - IndexedDB) -> If Cache Miss: Worker (`FETCH_LEADERBOARD_DATA`) -> Worker (Fetch DB (`fetch-all-permits-for-leaderboard.ts`), Process/Aggregate (`leaderboard-processing.ts` using `github-comment-cache.ts`)) -> Worker (Return final `LeaderboardEntry[]`) -> Frontend (`useLeaderboardData` receives list) -> Frontend (Cache result in IndexedDB) -> Frontend (`DeveloperLeaderboard` displays data **as a stacked bar chart**).
5.  **Quote Fetching (Conditional - Dashboard):** Frontend (`usePermitData` after validation or preference change) -> Check Preference (`localStorage`) -> If set, Group Permits -> CowSwap API (`getCowSwapQuote`) -> Frontend (Update Permit Data with `estimatedAmountOut`/`quoteError`) -> Frontend (Update UI).
6.  **Claiming (Sequential "Claim All" - Dashboard):** Frontend (`DashboardPage` User Click) -> `usePermitClaiming` (`handleClaimAllValidSequential`) -> Loop: [ Simulate -> `handleClaimPermit` -> Wallet (Sign Tx) -> Blockchain (`permitTransferFrom`) -> Wait for Receipt -> Update Permit State/Cache (`localStorage`) ].
7.  **Post-Claim Swapping (Conditional - Dashboard):** Frontend (`usePermitClaiming` after loop) -> Read Preference (`localStorage`) -> Group Successful Claims -> Loop: [ CowSwap API (`initiateCowSwap`) -> Wallet (Sign Order) -> CowSwap API (Submit Order) ] -> Frontend (Update Swap Status UI).

*(This document will be updated as implementation progresses and patterns solidify.)*
