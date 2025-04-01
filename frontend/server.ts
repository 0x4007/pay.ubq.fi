/// <reference types="https://deno.land/x/deno/cli/types/dts/index.d.ts" />

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"; // Use a specific std version
import { serve } from "https://deno.land/std@0.180.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.180.0/http/file_server.ts";
import { join } from "https://deno.land/std@0.180.0/path/mod.ts";
import { Hono } from "https://deno.land/x/hono@v3.12.11/mod.ts"; // Added Hono
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"; // Added Supabase
import type { Database } from "./src/database.types.ts"; // Added Database types

// --- Load .env file ---
// Loads variables from .env into Deno.env.get()
// Assumes .env is in the same directory as server.ts (i.e., frontend/)
// Use export: true to make them available via Deno.env.get()
await load({ export: true });
// --- End Load .env file ---


// --- Supabase Client Initialization ---
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Supabase environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  // In a real deployment, you might want to prevent the server from starting
}

// Use service role key for admin operations (updating transaction column)
const supabaseAdmin = createClient<Database>(supabaseUrl!, supabaseServiceKey!, {
  auth: {
    // Required for service role key
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
// --- End Supabase Client Initialization ---


// --- Hono API Router ---
const api = new Hono();

api.post('/api/permits/record-claim', async (c) => {
  let requestBody;
  try {
    requestBody = await c.req.json();
  } catch (error) {
    console.error("Failed to parse request body:", error);
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { nonce, transactionHash, claimerAddress } = requestBody;

  // Basic validation
  if (!nonce || typeof nonce !== 'string') {
    return c.json({ success: false, error: "Missing or invalid 'nonce'" }, 400);
  }
  if (!transactionHash || typeof transactionHash !== 'string' || !transactionHash.startsWith('0x')) {
    return c.json({ success: false, error: "Missing or invalid 'transactionHash'" }, 400);
  }
  if (!claimerAddress || typeof claimerAddress !== 'string' || !claimerAddress.startsWith('0x')) {
    // Basic address format check - consider more robust validation if needed
    return c.json({ success: false, error: "Missing or invalid 'claimerAddress'" }, 400);
  }

  try {
    // 1. Fetch permit beneficiary using nonce
    const { data: permitData, error: fetchError } = await supabaseAdmin
      .from('permits')
      .select('beneficiary_id, id') // Fetch beneficiary_id and id (for potential logging)
      .eq('nonce', nonce)
      .maybeSingle(); // Expect 0 or 1 result

    if (fetchError) {
      console.error(`Supabase fetch error for nonce ${nonce}:`, fetchError);
      return c.json({ success: false, error: "Database error fetching permit" }, 500);
    }

    if (!permitData) {
      console.warn(`Permit not found for nonce: ${nonce}`);
      return c.json({ success: false, error: "Permit not found" }, 404);
    }

    // Fetch the actual beneficiary wallet address using beneficiary_id
    // This assumes 'users' table links to 'wallets' table correctly
    const { data: userData, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select(`
        wallets ( address )
      `)
      .eq('id', permitData.beneficiary_id)
      .single(); // Expect exactly one user

    if (userFetchError || !userData || !userData.wallets?.address) {
        console.error(`Supabase fetch error for user ${permitData.beneficiary_id} or wallet address missing:`, userFetchError);
        return c.json({ success: false, error: "Database error fetching beneficiary address" }, 500);
    }

    const beneficiaryAddress = userData.wallets.address;

    // 2. Security Check: Compare claimer and beneficiary (case-insensitive)
    if (claimerAddress.toLowerCase() !== beneficiaryAddress.toLowerCase()) {
      console.warn(`Forbidden attempt: Claimer ${claimerAddress} != Beneficiary ${beneficiaryAddress} for nonce ${nonce}`);
      return c.json({ success: false, error: "Claimer does not match permit beneficiary" }, 403);
    }

    // 3. Update Database
    const { error: updateError } = await supabaseAdmin
      .from('permits')
      .update({ transaction: transactionHash })
      .eq('nonce', nonce); // Use nonce to identify the row to update

    if (updateError) {
      console.error(`Supabase update error for nonce ${nonce}:`, updateError);
      return c.json({ success: false, error: "Database error updating permit" }, 500);
    }

    console.log(`Successfully recorded transaction ${transactionHash} for permit nonce ${nonce}`);
    return c.json({ success: true });

  } catch (error) {
    console.error(`Unexpected error processing /api/permits/record-claim for nonce ${nonce}:`, error);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});
// --- End Hono API Router ---


// --- Main Server Logic ---
const PORT = 8000;
const STATIC_DIR = "dist"; // Vite's default output directory

console.log(`Server running. Access frontend at: http://localhost:${PORT}/`);

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Route API requests to Hono
  if (pathname.startsWith('/api/')) {
    return await api.fetch(req);
  }

  // --- Existing Static File Serving Logic ---
  try {
    const response = await serveDir(req, {
      fsRoot: STATIC_DIR,
      urlRoot: "",
      showDirListing: false,
      quiet: true,
    });
    if (response.status !== 404) {
      return response;
    }
  } catch (e) {
    console.error("Error serving static file:", e);
    // Fall through to SPA handling
  }

  // Serve index.html for SPA routing if no static file found
  const indexPath = join(STATIC_DIR, "index.html");
  try {
    const indexContent = await Deno.readFile(indexPath);
    return new Response(indexContent, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e) {
    console.error(`Error reading index.html at ${indexPath}:`, e);
    return new Response("Not Found", { status: 404 });
  }
  // --- End Static File Serving Logic ---

}, { port: PORT });
