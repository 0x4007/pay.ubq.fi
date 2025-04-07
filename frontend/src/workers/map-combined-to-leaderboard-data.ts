import type { CombinedLeaderboardData } from "./app-worker.ts"; // Import only necessary type

// Define the return type locally as it wasn't exported from app-worker
type RawPermitWithUser = {
  nonce: string;
  networkId: number;
  amount?: string; // Optional amount
  githubUsername: string;
  avatarUrl: string;
  node_url: string | null; // Include node_url
  created_at: string | null; // Include creation date if needed
};


// Function to map the *combined* data for the leaderboard hook

export function mapCombinedToLeaderboardData(permit: CombinedLeaderboardData): RawPermitWithUser | null {
  const networkIdNum = Number(permit.token?.network ?? 0); // Default to 0 if token or network is null


  // Safely access joined data, providing defaults
  const githubUser = permit.github_user; // Access the potentially null user info

  // Use the GitHub ID as the username identifier since no username column exists
  const githubUsername = githubUser ? `GitHub ID: ${githubUser.id}` : `UnknownUser(${permit.beneficiary_id})`; // Use beneficiary_id in fallback
  const avatarUrl = ''; // Set to empty string as it's not available from DB
  const nodeUrl = permit.location?.node_url ?? null; // Extract node_url


  // Basic validation: Ensure we have a valid user and node_url
  if (!githubUser || !nodeUrl) {

    return null;
  }

  // Ensure amount is parseable (though hook does parseFloat too)
  // This check might be less relevant now if XP comes from metadata, but keep for safety
  if (permit.amount !== undefined && permit.amount !== null) {
    try {
      parseFloat(permit.amount);
      if (isNaN(parseFloat(permit.amount))) throw new Error("Amount is NaN");
    } catch (e) {

      return null;
    }
  }


  return {
    nonce: String(permit.nonce),
    networkId: networkIdNum,
    amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined, // Keep original amount
    githubUsername: githubUsername,
    avatarUrl: avatarUrl,
    node_url: nodeUrl, // Include node_url
    created_at: permit.created // Include creation date if needed
  };
}
