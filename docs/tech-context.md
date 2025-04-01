# Tech Context: Permit Claiming Application (Rewrite)

This document outlines the technology stack and development environment for the rewritten Permit Claiming application, based on the initial `rewrite-plan.md`.

## 1. Core Technologies

*   **Language:** TypeScript (across frontend, backend, shared code)
*   **Frontend:**
    *   Framework: React
    *   Wallet Integration: `wagmi` (using viem)
    *   Styling: Raw CSS
*   **Backend:**
    *   Platform: Deno Deploy
    *   Routing: Hono
*   **Database:** Supabase (PostgreSQL)
*   **Blockchain Interaction:**
    *   Library: `viem` (latest)
    *   RPC Management: `@pavlovcik/permit2-rpc-manager` (to be integrated).
    *   Contracts: Uniswap Permit2, Custom NFT Reward Contract, Existing deployed Multicall Contracts (e.g., MakerDAO's)

## 2. Development Environment & Tooling

*   **Package Manager:** Bun (used for frontend dependencies and scripts)
*   **Repository Structure:** Standard repository structure.
*   **Build Tools:** Vite (for frontend bundling), `tsc` (for type checking), Deno CLI tools.
*   **Testing:**
    *   Unit/Integration: `bun test`
    *   Component: React Testing Library (if using React)
*   **Linting/Formatting:** ESLint, Prettier (using existing configurations), Deno fmt/lint
*   **Version Control:** Git, GitHub

## 3. Key Libraries & Dependencies (Anticipated)

*   `viem`: Blockchain interaction (frontend & backend).
*   `@octokit/rest`: GitHub API interaction (planned for backend scanner).
*   `@supabase/supabase-js`: Database interaction.
*   `react`, `react-dom`: Frontend framework.
*   `hono`: Backend routing (in `server.ts`).
*   `wagmi`: React hooks for wallet connection and interaction.
*   `@cowprotocol/cow-sdk`: For interacting with CowSwap API (quotes, orders).
*   `@pavlovcik/permit2-rpc-manager`: RPC management library (to be integrated).
*   `deno.land/std/dotenv`: Used in `server.ts` to load `.env` for local Deno execution.
*   Testing libraries (`@testing-library/react`).

## 4. Infrastructure & Deployment

*   **Backend API Hosting:** Deno Deploy (via `frontend/server.ts`).
*   **Frontend Hosting:** Deno Deploy (serving static build via the same `frontend/server.ts`).
*   **Database Hosting:** Supabase Cloud.
*   **Deployment:**
    *   Frontend/Backend: Automated via `scripts/deploy-frontend.sh` (runnable via `bun run deploy` in `frontend/`). Script handles build (`bun run build` - currently needs workaround) and deployment of `frontend/server.ts` using `deployctl`. Requires `deployctl` v1.12.0+.
    *   GitHub Actions: TBD for CI/CD.

## 5. Technical Constraints & Considerations

*   **Build Stability:** The `bun run build` script (running `tsc -b && vite build`) has shown intermittent hangs, potentially related to the `tsc -b` step or Bun/Vite interaction. Workaround involves running `bunx vite build` after a clean install. Requires further investigation for reliable automated builds.
*   **Deno `.env` Loading:** The Deno server (`server.ts`) requires explicit loading of `.env` files using the standard library for local development, as Deno doesn't load them automatically.
*   Deno Deploy environment specifics and limitations.
*   GitHub API rate limits.
*   RPC provider reliability and rate limits.
*   CowSwap API rate limits and reliability.
*   Security of GitHub tokens and other secrets within Deno Deploy environment variables.
*   Browser compatibility for frontend features (Wallet connection, CowSwap signing, etc.).

*(This document will be updated as technology choices are finalized and new dependencies are added.)*
