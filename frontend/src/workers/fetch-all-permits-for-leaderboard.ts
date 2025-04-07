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
        console.debug(`Worker: [Repository] Empty owner/repo: ${owner}/${repo}`);
        return undefined;
      }
      if (!validateGitHubRepo.owner(cleanOwner)) {
        validateGitHubRepo.validationErrors.invalidOwner++;
        console.debug(`Worker: [Repository] Invalid owner format: ${cleanOwner}`);
        return undefined;
      }
      if (!validateGitHubRepo.name(cleanRepo)) {
        validateGitHubRepo.validationErrors.invalidRepo++;
        console.debug(`Worker: [Repository] Invalid repo format: ${cleanRepo}`);
        return undefined;
      }

      return `${cleanOwner}/${cleanRepo}`;
    }
};

// Function to fetch permits and associated user data using two queries, filtered by date
export async function fetchAllPermitsForLeaderboard(cutoffDateIsoString: string): Promise<CombinedLeaderboardData[]> {
  const supabase = getSupabase();
  console.log(`Worker: Querying permits created on or after ${cutoffDateIsoString} for leaderboard (Step 1)...`); // Updated log

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
  const { data: permitsData, error: permitsError } = (await supabase // Added parenthesis
    .from(PERMITS_TABLE)
    .select(`
      nonce,
      amount,
      created,
      beneficiary_id,
      token:tokens!inner(network),
      location:locations(node_url)
    `, { head: false })
    .is("transaction", null)
    .gte('created', cutoffDateIsoString) // Added date filter
  ) as { // Moved 'as' to wrap the await expression
      data: PermitQueryResult[] | null;
      error: Error | null
    };

  if (permitsError) {
    console.error("Supabase leaderboard permits fetch error (Step 1):", permitsError);
    throw new Error(`Supabase leaderboard permits fetch failed: ${permitsError.message}`);
  }

  // Add a type check for permitsData before proceeding
  if (!permitsData || !Array.isArray(permitsData)) {
    console.log(`Worker: No valid permits data found for leaderboard (Step 1) after date filter.`); // Updated log
    return [];
  }
  console.log(`Worker: Found ${permitsData.length} permits (Step 1) after date filter.`); // Updated log

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
    console.error("Worker: [Repository] Failed to fetch discovered permits:", discoveredPermitsError);
    // Continue without discovered permits if fetch fails
    console.debug("Worker: [Repository] Continuing without discovered permits data");
  } else {
    console.debug(`Worker: [Repository] Fetched ${discoveredPermitsData?.length ?? 0} discovered permits`);
  }

  // Create a map of discovered permits by nonce for faster lookups
  const discoveredPermitsByNonce = new Map<string, DiscoveredPermitResult>();
  if (discoveredPermitsData && Array.isArray(discoveredPermitsData)) {
    console.debug(`Worker: [Repository] Processing ${discoveredPermitsData.length} permits for repository info...`);
    discoveredPermitsData.forEach(permit => {
      // Validate permit data structure
      if (!permit || typeof permit !== 'object') {
        console.debug(`Worker: [Repository] Skipping invalid permit entry`);
        return;
      }

      // Validate required fields
      if (!permit.permit_nonce) {
        console.debug(`Worker: [Repository] Skipping permit with missing nonce`);
        return;
      }

      // Log repository information if present
      if (permit.github_repo_owner && permit.github_repo_name) {
        console.debug(`Worker: [Repository] Found ${permit.github_repo_owner}/${permit.github_repo_name} for permit ${permit.permit_nonce}`);
      }

      discoveredPermitsByNonce.set(permit.permit_nonce, permit);
    });
    console.debug(`Worker: [Repository] Mapped ${discoveredPermitsByNonce.size} permits with repository info`);
  } else {
    console.debug(`Worker: [Repository] No valid discovered permits data found`);
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
    console.log(`Worker: No valid beneficiary IDs found in filtered permits. Skipping user query.`); // Updated log
  }

  // Step 5: Map and filter permits data (no date filtering needed here anymore)
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

      // Try to get repository from discovered permits first
      let repository: string | undefined = undefined;
      if (discoveredPermit?.github_repo_owner && discoveredPermit?.github_repo_name) {
        repository = validateGitHubRepo.sanitize(discoveredPermit.github_repo_owner, discoveredPermit.github_repo_name);
        if (repository) {
          console.debug(`Worker: [Repository] Using ${repository} from discovered permit ${permit.nonce}`);
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
                console.debug(`Worker: [Repository] Extracted ${repository} from URL for permit ${permit.nonce}`);
              }
            }
          }
          if (!repository) {
            console.debug(`Worker: [Repository] Could not extract from URL for permit ${permit.nonce}: ${locationUrl}`);
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
