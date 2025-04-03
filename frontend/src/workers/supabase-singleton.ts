import { SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

let supabaseInstance: SupabaseClient<Database> | null = null;

export async function initializeSupabase(url: string, key: string): Promise<void> {
  if (supabaseInstance) {
    console.log("Supabase: Already initialized");
    return;
  }

  console.log("Supabase: Initializing client...");
  const client = createClient<Database>(url, key);

  // Test the connection
  try {
    await client.auth.getSession();
    console.log("Supabase: Connection test successful");
    supabaseInstance = client;
  } catch (error) {
    console.error("Supabase: Connection test failed:", error);
    throw new Error("Failed to initialize Supabase connection");
  }
}

export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseInstance) {
    throw new Error("Supabase client not initialized. Call initializeSupabase first.");
  }
  return supabaseInstance;
}
