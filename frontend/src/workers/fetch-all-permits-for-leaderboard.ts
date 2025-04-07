import { CombinedLeaderboardData, GitHubUserInfo, PERMITS_TABLE } from "./app-worker.ts"; // Updated import path
import { getSupabase } from "./supabase-singleton.ts"; // Add .ts extension

  // GitHub repository name validation helpers
  const validateGitHubRepo = {
    // Track validation failures for debugging
    validationErrors: {
      emptyFields: 0,
      invalidOwner: 0,
      invalidRepo: 0
    },

    owner: (name: string) => /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(name),
    name: (name: string) => /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(name),

  // Convert and validate a repository string
    sanitize: (owner: string, repo: string): string | undefined => {
      const cleanOwner = owner.trim().toLowerCase();
      const cleanRepo = repo.trim().toLowerCase()
        .replace(/\.git$/, '')
        .replace(/\/+$/, '');

      if (!cleanOwner || !cleanRepo) {
        validateGitHubRepo.validationErrors.emptyFields++;

        return undefined;
      }
      if (!validateGitHubRepo.owner(cleanOwner)) {
        validateGitHubRepo.validationErrors.invalidOwner++;

        return undefined;
      }
      if (!validateGitHubRepo.name(cleanRepo)) {
        validateGitHubRepo.validationErrors.invalidRepo++;

        return undefined;
      }

      return `${cleanOwner}/${cleanRepo}`;
    }
};

export async function fetchAllPermitsForLeaderboard(cutoffDateIsoString?: string): Promise<CombinedLeaderboardData[]> {
  const supabase = getSupabase();
  if (cutoffDateIsoString) {

  } else {

  }

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
  let query = supabase
    .from(PERMITS_TABLE)
    .select(`
      nonce,
      amount,
      created,
      beneficiary_id,
      token:tokens!inner(network),
      location:locations(node_url)
    `, { head: false })
    .is("transaction", null);

  if (cutoffDateIsoString) {
    query = query.gte('created', cutoffDateIsoString);
  }

  const { data: permitsData, error: permitsError } = await query as {
    data: PermitQueryResult[] | null;
    error: Error | null;
  };

  if (permitsError) {

    throw new Error(`Supabase leaderboard permits fetch failed: ${permitsError.message}`);
  }

  // Add a type check for permitsData before proceeding
  if (!permitsData || !Array.isArray(permitsData)) {
     // Updated log
    return [];
  }
   // Updated log

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

    // Continue without discovered permits if fetch fails

  } else {

  }

  // Create a map of discovered permits by nonce for faster lookups
  const discoveredPermitsByNonce = new Map<string, DiscoveredPermitResult>();
  if (discoveredPermitsData && Array.isArray(discoveredPermitsData)) {

    discoveredPermitsData.forEach(permit => {
      // Validate permit data structure
      if (!permit || typeof permit !== 'object') {

        return;
      }

      // Validate required fields
      if (!permit.permit_nonce) {

        return;
      }

      // Log repository information if present
      if (permit.github_repo_owner && permit.github_repo_name) {

      }

      discoveredPermitsByNonce.set(permit.permit_nonce, permit);
    });

  } else {

  }

  // Step 3: Extract unique beneficiary IDs from the *filtered* permitsData
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


      // Proceed without user data if fetch fails
    } else {

      usersData?.forEach(user => {
        const userInfo: GitHubUserInfo = { id: user.id };
        usersMap.set(userInfo.id, userInfo);
      });
    }
  } else {
     // Updated log
  }

  // Step 5: Map and filter permits data (no date filtering needed here anymore)
  const combinedData: CombinedLeaderboardData[] = permitsData
    .map((permit: PermitQueryResult): CombinedLeaderboardData | null => {
      // Check if permit is a valid object and has the core properties
      if (!permit || typeof permit !== 'object' || !('nonce' in permit) || !('beneficiary_id' in permit) || permit.beneficiary_id === null || permit.beneficiary_id === undefined) {

        return null;
      }

      const beneficiaryIdNum = Number(permit.beneficiary_id);
      if (isNaN(beneficiaryIdNum)) {

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

      // Try to get repository from discovered permits first
      let repository: string | undefined = undefined;
      if (discoveredPermit?.github_repo_owner && discoveredPermit?.github_repo_name) {
        repository = validateGitHubRepo.sanitize(discoveredPermit.github_repo_owner, discoveredPermit.github_repo_name);
        if (repository) {

        }
      }

      // Fallback to extracting from GitHub issue URL if not found in discovered permits
      if (!repository) {
        const locationUrl = permit.location?.node_url;
        if (locationUrl && locationUrl.includes('github.com')) {
          const parts = locationUrl.split('github.com/');
          if (parts.length > 1) {
            const pathParts = parts[1].split('/');
            if (pathParts.length >= 2) {
              repository = validateGitHubRepo.sanitize(pathParts[0], pathParts[1]);
              if (repository) {

              }
            }
          }
          if (!repository) {

          }
        }
      }

      // Extract category from discovered permit if available
      const category: string | undefined = discoveredPermit?.permit_type || undefined;

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

  // Calculate repository extraction stats
  const repoStats = {
    total: combinedData.length,
    withRepo: combinedData.filter(item => item.repository).length,
    fromDiscovered: combinedData.filter(item => {
      const permit = discoveredPermitsByNonce.get(item.nonce);
      return permit?.github_repo_owner && permit?.github_repo_name;
    }).length,
    fromUrl: combinedData.filter(item => item.location?.node_url?.includes('github.com')).length,
    uniqueRepos: new Set(combinedData.map(item => item.repository).filter(Boolean)).size
  };

  // Log detailed extraction summary
  console.debug(`Worker: [Repository] Extraction stats:
    - Total permits: ${repoStats.total}
    - With valid repos: ${repoStats.withRepo} (${((repoStats.withRepo / repoStats.total) * 100).toFixed(1)}%)
    - From discovered: ${repoStats.fromDiscovered}
    - With GitHub URLs: ${repoStats.fromUrl}
    - Unique repos: ${repoStats.uniqueRepos}

    Validation failures:
    - Empty fields: ${validateGitHubRepo.validationErrors.emptyFields}
    - Invalid owner format: ${validateGitHubRepo.validationErrors.invalidOwner}
    - Invalid repo format: ${validateGitHubRepo.validationErrors.invalidRepo}
  `);

  // Reset validation error counters for next run
  validateGitHubRepo.validationErrors = {
    emptyFields: 0,
    invalidOwner: 0,
    invalidRepo: 0
  };

  return combinedData; // Return the final filtered array
}
