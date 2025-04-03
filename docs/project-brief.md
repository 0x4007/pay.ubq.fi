# Project Brief: Permit Claiming Application (Rewrite)

## 1. Project Goal

To create a web application that allows:
1.  **Contributors** to efficiently find, validate, and claim blockchain-based "Permit" rewards posted in GitHub issue comments.
2.  **Team Leaders** to view a developer performance analytics dashboard based on aggregated permit data.

This application is forked from the `pay.ubq.fi` rewrite effort, leveraging its permit handling foundation but focusing on contributor claiming and developer analytics.

## 2. Core Requirements

*   **GitHub Integration:** Scan specified GitHub repositories/issues for comments containing Permit data.
*   **Permit Parsing:** Extract relevant Permit details (e.g., contract address, token ID, signature, deadline) from comment text.
*   **Blockchain Validation:** Verify the validity of found Permits on the relevant blockchain network (e.g., check if already claimed, check signature validity, check deadline).
*   **Batch Claiming:** Allow users to connect their Web3 wallet and claim multiple valid Permits in a single, aggregated transaction for efficiency.
*   **User Interface:** Provide a clear and intuitive interface for users to:
    *   Initiate GitHub scans (or view automatically scanned results).
    *   View found and validated Permits.
    *   Connect their wallet.
    *   Initiate the batch claim process.
    *   View transaction status and history (optional).
*   **Developer Analytics Dashboard:** Provide a view for authorized users (e.g., team leads) to:
    *   See a leaderboard of developers ranked by aggregated permit value ("XP").
    *   View developer GitHub usernames and avatars.
    *   (Future) Analyze performance based on permit metadata (e.g., task type).

## 3. Scope - Exclusions

*   Gift card purchasing, redemption, or management.
*   Integration with Reloadly or similar services.
*   Any functionality not directly related to finding, validating, and claiming GitHub Permits.

## 4. Success Metrics

*   Users can successfully find Permits posted in GitHub comments associated with their account.
*   Permit validation accurately reflects on-chain status.
*   Users can successfully claim valid Permits via the batch claim mechanism.
*   Team leads can view an accurate developer performance leaderboard.
*   The application is reliable, performant, and easy to use for both contributors and team leads.
*   The codebase is clean, well-documented, and maintainable.
