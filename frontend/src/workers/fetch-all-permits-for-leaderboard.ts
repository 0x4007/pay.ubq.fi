import { CombinedLeaderboardData, GitHubUserInfo, PERMITS_TABLE } from "./app-worker.ts"; // Updated import path
import { getSupabase } from "./supabase-singleton.ts"; // Add .ts extension

// Function to fetch ALL permits and associated user data using two queries

export async function fetchAllPermitsForLeaderboard(): Promise<CombinedLeaderboardData[]> {
  const supabase = getSupabase();
  console.log(`Worker: Querying ALL permits for leaderboard (Step 1)...`);

  // Define permit data type based on the updated query
  interface PermitQueryResult {
    nonce: string;
    amount: string | null;
    created: string;
    beneficiary_id: number;
    token: { network: number } | null;
    location: { node_url: string | null } | null;
  }

  // Define type for discovered permit data
  interface DiscoveredPermitResult {
    permit_nonce: string;
    github_repo_owner: string | null;
    github_repo_name: string | null;
    github_comment_url: string | null;
    permit_type: string | null;
  }

  // Step 1: Fetch all permits with necessary fields
  const { data: permitsData, error: permitsError } = await supabase
    .from(PERMITS_TABLE)
    .select(`
      nonce,
      amount,
      created,
      beneficiary_id,
      token:tokens!inner(network),
      location:locations(node_url)
    `, { head: false })
    .is("transaction", null) as {
      data: PermitQueryResult[] | null;
      error: Error | null
    };

  if (permitsError) {
    console.error("Supabase leaderboard permits fetch error (Step 1):", permitsError);
    throw new Error(`Supabase leaderboard permits fetch failed: ${permitsError.message}`);
  }

  // Add a type check for permitsData before proceeding
  if (!permitsData || !Array.isArray(permitsData)) {
    console.log(`Worker: No valid permits data found for leaderboard (Step 1).`);
    return [];
  }
  console.log(`Worker: Found ${permitsData.length} permits (Step 1).`);

  // Step 2: Fetch all discovered permits
  const { data: discoveredPermitsData, error: discoveredPermitsError } = await supabase
    .from("discovered_permits")
    .select(`
      permit_nonce,
      github_repo_owner,
      github_repo_name,
      github_comment_url,
      permit_type
    `) as {
      data: DiscoveredPermitResult[] | null;
      error: Error | null
    };

  if (discoveredPermitsError) {
    console.error("Supabase discovered permits fetch error:", discoveredPermitsError);
    // Continue without discovered permits if fetch fails
    console.warn("Worker: Failed to fetch discovered permits. Leaderboard will show limited data.");
  }

  // Create a map of discovered permits by nonce for faster lookups
  const discoveredPermitsByNonce = new Map<string, DiscoveredPermitResult>();
  if (discoveredPermitsData && Array.isArray(discoveredPermitsData)) {
    console.log(`Worker: Found ${discoveredPermitsData.length} discovered permits.`);
    discoveredPermitsData.forEach(permit => {
      if (permit.permit_nonce) {
        discoveredPermitsByNonce.set(permit.permit_nonce, permit);
      }
    });
  }

  // Step 2: Extract unique beneficiary IDs, ensuring they are numbers
  const beneficiaryIds = [
    ...new Set(
      permitsData
        .map(p => p.beneficiary_id) // Access beneficiary_id safely
        .filter((id): id is number => id !== null && !isNaN(Number(id))) // Filter nulls and non-numeric IDs, assert number type
        .map(id => Number(id)) // Convert to number
    )
  ];

  // Step 3: Fetch corresponding GitHub users (if any beneficiary IDs exist)
  const usersMap = new Map<number, GitHubUserInfo>();
  if (beneficiaryIds.length > 0) {
    console.log(`Worker: Querying ${beneficiaryIds.length} unique GitHub users (Step 2)...`);

    interface UserQueryResult {
      id: number;
    }

    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id')
      .in('id', beneficiaryIds) as {
        data: UserQueryResult[] | null;
        error: Error | null;
      };

    if (usersError) {
      console.error("Supabase GitHub users fetch error (Step 2):", usersError);
      console.warn("Worker: Failed to fetch GitHub user details. Leaderboard will show placeholders.");
      // Proceed without user data if fetch fails
    } else {
      console.log(`Worker: Found ${usersData?.length ?? 0} GitHub users (Step 2).`);
      usersData?.forEach(user => {
        const userInfo: GitHubUserInfo = { id: user.id };
        usersMap.set(userInfo.id, userInfo);
      });
    }
  } else {
    console.log(`Worker: No valid beneficiary IDs found in permits. Skipping user query.`);
  }

  // Step 4: Map and filter permits data
  const combinedData: CombinedLeaderboardData[] = permitsData
    .map((permit: PermitQueryResult): CombinedLeaderboardData | null => {
      // Check if permit is a valid object and has the core properties
      if (!permit || typeof permit !== 'object' || !('nonce' in permit) || !('beneficiary_id' in permit) || permit.beneficiary_id === null || permit.beneficiary_id === undefined) {
        console.warn("Worker: Invalid permit data structure received (missing core fields):", permit);
        return null;
      }

      const beneficiaryIdNum = Number(permit.beneficiary_id);
      if (isNaN(beneficiaryIdNum)) {
        console.warn("Worker: Invalid beneficiary_id:", permit.beneficiary_id);
        return null;
      }
      const github_user = usersMap.get(beneficiaryIdNum) ?? null;

      // Safely access nested location data
      const locationData = (permit.location && typeof permit.location === 'object' && 'node_url' in permit.location)
        ? { node_url: permit.location.node_url as string | null }
        : null;

      // Safely access nested token data
      const tokenData = (permit.token && typeof permit.token === 'object' && 'network' in permit.token)
        ? { network: permit.token.network as number }
        : null;

      // Get the associated discovered permit data
      const discoveredPermit = discoveredPermitsByNonce.get(permit.nonce);

      // Extract category and repository from discovered permit if available
      const category: string | undefined = discoveredPermit?.permit_type || undefined;
      let repository: string | undefined = undefined;

      // Construct repository string if we have both owner and name
      if (discoveredPermit?.github_repo_owner && discoveredPermit?.github_repo_name) {
        repository = `${discoveredPermit.github_repo_owner}/${discoveredPermit.github_repo_name}`;
      }

      // Construct the object explicitly, ensuring all fields match CombinedLeaderboardData
      return {
        nonce: permit.nonce,
        amount: permit.amount || '', // Convert null to empty string
        created: permit.created,
        beneficiary_id: permit.beneficiary_id,
        token: tokenData,
        location: locationData,
        github_user: github_user,
        // Add parsed metadata fields
        category: category,
        repository: repository,
      };
    })
    .filter((item): item is CombinedLeaderboardData => item !== null); // Filter out nulls

  return combinedData; // Return the final filtered array
}
