# Product Context: Permit Claiming Application

## 1. Problem Statement

Contributors to Ubiquity DAO's GitHub repositories are rewarded with blockchain-based "Permits" for their participation (e.g., fixing issues, reviewing PRs). These Permits represent potential cash rewards but are currently posted manually by a bot within GitHub issue comments.

Finding these Permits across numerous repositories and issues is tedious for contributors. Furthermore, each Permit needs to be individually checked for validity (Is it still claimable? Has the deadline passed?) and then claimed via a separate blockchain transaction. This process is inefficient, time-consuming, and prone to missing rewards, creating a poor experience for contributors.

Additionally, team leaders lack a centralized view to understand developer contributions and performance as represented by these permit rewards. Aggregating this data manually is impractical.

## 2. Proposed Solution

This application aims to serve two primary user groups: Contributors and Team Leaders.

**For Contributors:** Streamline the Permit claiming process by acting as a central hub to:

1.  **Discover:** Access permit data associated with the user's connected wallet address. (The backend needs to handle the association between wallets and permits, potentially leveraging existing database links or other mechanisms).
2.  **Validate:** Check the on-chain status of each discovered Permit to ensure it's valid and claimable.
3.  **Aggregate & Claim:** Allow users to use their connected Web3 wallet to claim all their valid Permits in a single, consolidated blockchain transaction (future feature) or individually, saving time and gas fees.

**For Team Leaders:** Provide a performance analytics dashboard to:
1.  **Visualize Performance:** Display a leaderboard ranking developers based on the aggregated value ("XP") of their earned permits.
2.  **Identify Contributors:** Show GitHub usernames and avatars for easy identification.
3.  **(Future) Analyze Contributions:** Offer insights into the types of tasks generating rewards by parsing permit metadata.

## 3. Target Users

*   **Contributors:** Developers and other participants in Ubiquity DAO's GitHub repositories who receive Permit rewards.
*   **Team Leaders / Managers:** Individuals responsible for overseeing developer teams and understanding contribution patterns.

## 4. User Goals & Needs

*   **Efficiency:** Quickly find all Permits they are eligible for without manually searching GitHub.
*   **Clarity (Contributor):** Easily see which Permits are valid and ready to be claimed.
*   **Simplicity (Contributor):** Claim all valid Permits with minimal effort and fewer transactions.
*   **Confidence (Contributor):** Trust that the application accurately finds and validates Permits.
*   **Cost Savings (Contributor):** Reduce gas fees by batching claims into a single transaction.
*   **Performance Overview (Team Leader):** Quickly understand relative developer performance based on earned XP.
*   **Contribution Insight (Team Leader):** Gain visibility into how rewards are distributed across the team.

## 5. Key User Experience Principles

*   **Automated Discovery:** Minimize manual searching.
*   **Clear Status:** Provide unambiguous feedback on Permit validity.
*   **One-Click Claiming:** Simplify the claiming process as much as possible.
*   **Transparency (Contributor):** Show the source of Permits (link back to GitHub comment) and the validation status details.
*   **Data Aggregation (Team Leader):** Provide a reliable, aggregated view of permit data across all developers.
*   **Clear Visualization (Team Leader):** Present performance data in an easy-to-understand leaderboard format.

## 6. User Flow

1.  **Access Application:** The user navigates to the application URL.
2.  **Wallet Connection Prompt:** The user is presented with options to connect their Web3 wallet (e.g., MetaMask, WalletConnect).
3.  **Wallet Connection:** The user selects their preferred wallet and approves the connection request through their wallet extension/application.
4.  **Permit Discovery & Display (Contributor):** Upon successful connection, the application uses the user's wallet address to query the backend for associated permits.
5.  **Validation (Contributor):** Found permits are displayed in the UI, and the validation process begins (checking on-chain status).
6.  **Access Leaderboard (Team Leader):** Navigate to the dedicated leaderboard section.
7.  **View Leaderboard:** The application fetches and displays aggregated permit data for all developers, ranked by XP.
