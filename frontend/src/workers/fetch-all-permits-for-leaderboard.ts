import { CombinedLeaderboardData, GitHubUserInfo, PERMITS_TABLE } from "./permit-checker.worker.ts";
import { getSupabase } from "./supabase-singleton";

// Function to fetch ALL permits and associated user data using two queries

export async function fetchAllPermitsForLeaderboard(): Promise<CombinedLeaderboardData[]> {
  const supabase = getSupabase();
  console.log(`Worker: Querying ALL permits for leaderboard (Step 1)...`);

  // Define permit data type based on the query
  interface PermitQueryResult {
    nonce: string;
    amount: string | null;
    created: string;
    beneficiary_id: number;
    token: { network: number } | null;
    location: { node_url: string | null } | null;
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
    `)
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

  // Step 2: Extract unique beneficiary IDs, ensuring they are numbers
  const beneficiaryIds = [
    ...new Set(
      permitsData
        .map(p => p.beneficiary_id) // Access beneficiary_id safely
        .filter((id): id is number => id !== null && !isNaN(Number(id))) // Filter nulls and non-numeric IDs, assert number type
        .map(id => Number(id)) // Convert to number
    )
  ];

  if (beneficiaryIds.length === 0) {
    console.log(`Worker: No valid beneficiary IDs found in permits.`);
    // Return permits without user info if no IDs to query
    return permitsData.map((p: PermitQueryResult) => ({
      nonce: p.nonce,
      amount: p.amount,
      created: p.created,
      beneficiary_id: p.beneficiary_id,
      token: p.token,
      location: p.location ? { node_url: p.location.node_url } : null,
      github_user: null
    })) as CombinedLeaderboardData[];
  }

  console.log(`Worker: Querying ${beneficiaryIds.length} unique GitHub users (Step 2)...`);

  interface UserQueryResult {
    id: number;
  }

  // Step 3: Fetch corresponding GitHub users
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
    // Return permits without user info if user fetch fails
    return permitsData.map((p: PermitQueryResult) => ({
      nonce: p.nonce,
      amount: p.amount,
      created: p.created,
      beneficiary_id: p.beneficiary_id,
      token: p.token,
      location: p.location ? { node_url: p.location.node_url } : null,
      github_user: null
    })) as CombinedLeaderboardData[];
  }

  console.log(`Worker: Found ${usersData?.length ?? 0} GitHub users (Step 2).`);

  // Step 4: Combine the data
  const usersMap = new Map<number, GitHubUserInfo>();
  usersData?.forEach(user => {
    const userInfo: GitHubUserInfo = { id: user.id };
    usersMap.set(userInfo.id, userInfo);
  });

  // Explicitly construct the CombinedLeaderboardData object with type checks
  const combinedData: CombinedLeaderboardData[] = permitsData
    .map((permit: PermitQueryResult): CombinedLeaderboardData | null => {
      // Check if permit is a valid object and has the core properties
      if (!permit || typeof permit !== 'object' ||
        !('nonce' in permit) ||
        !('beneficiary_id' in permit) || // Check existence before use
        permit.beneficiary_id === null || permit.beneficiary_id === undefined) {
        console.warn("Worker: Invalid permit data structure received:", permit);
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

      // Construct the object explicitly, ensuring all fields match CombinedLeaderboardData
      return {
        nonce: permit.nonce,
        amount: permit.amount || '',  // Convert null to empty string
        created: permit.created,
        beneficiary_id: permit.beneficiary_id,
        token: tokenData,
        location: locationData,
        github_user: github_user
      };
    })
    .filter((item): item is CombinedLeaderboardData => item !== null); // Filter out any nulls from invalid data

  return combinedData;
}
