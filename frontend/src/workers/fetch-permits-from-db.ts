import { LOCATIONS_TABLE, PARTNERS_TABLE, PermitRow, PERMITS_TABLE, TOKENS_TABLE, WALLETS_TABLE } from "./app-worker.ts"; // Updated import path
import { getSupabase } from "./supabase-singleton";

// Function to fetch permits from Supabase - uses github_id string for beneficiary_id

export async function fetchPermitsFromDb(userGitHubId: number, lastCheckTimestamp: string | null): Promise<PermitRow[]> {
  const supabase = getSupabase();
  let query = supabase.from(PERMITS_TABLE)
    .select(`*, created, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: ${LOCATIONS_TABLE} (node_url)`)
    .eq("beneficiary_id", userGitHubId)
    .is("transaction", null);

  if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
    query = query.gt('created', lastCheckTimestamp);
  } else if (lastCheckTimestamp) {
    console.warn(`Worker: Received invalid lastCheckTimestamp: ${lastCheckTimestamp}. Fetching all permits.`);
  }

  const { data: potentialPermitsData, error: permitError } = await query;

  if (permitError) throw new Error(`Supabase permit fetch error: ${permitError.message}`);

  if (!potentialPermitsData || potentialPermitsData.length === 0) {
    return [];
  }

  return potentialPermitsData as unknown as PermitRow[];
}
