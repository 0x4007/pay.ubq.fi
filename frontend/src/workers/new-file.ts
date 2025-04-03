import { createClient } from "@supabase/supabase-js";
import { createRpcClient } from "../../$node_modules/@ubiquity-dao/permit2-rpc-client/dist/client";
import type { Address } from "../../$node_modules/abitype/dist/types/abi";
import type { Database } from "../database.types.ts";
import type { PermitData } from "../types.ts";
import { fetchAllPermitsForLeaderboard } from "./fetchAllPermitsForLeaderboard.ts";
import { fetchPermitsFromDb } from "./fetchPermitsFromDb.ts";
import { mapCombinedToLeaderboardData } from "./mapCombinedToLeaderboardData.ts";
import { mapDbPermitToPermitData } from "./mapDbPermitToPermitData.ts";
import {
  initializationPromise,
  PermitRow,
  PROXY_BASE_URL,
  RawPermitWithUser,
  rpcClient,
  supabase,
  WorkerPayload,
} from "./permit-checker.worker.ts";
import { validatePermitsBatch } from "./validatePermitsBatch.ts";

// --- Worker Message Handling ---
self.onmessage = async (event: MessageEvent<{ type: "INIT" | "FETCH_NEW_PERMITS" | "FETCH_LEADERBOARD_DATA"; payload: WorkerPayload }>) => {
  const { type, payload } = event.data;

  if (type === "INIT") {
    initializationPromise = new Promise<void>((resolve, reject) => {
      const supabaseUrl = payload.supabaseUrl;
      const supabaseAnonKey = payload.supabaseAnonKey;
      PROXY_BASE_URL = payload.proxyBaseUrl || "https://rpc.ubq.fi";

      if (supabaseUrl && supabaseAnonKey) {
        try {
          supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
          rpcClient = createRpcClient({ baseUrl: PROXY_BASE_URL });
          self.postMessage({ type: "INIT_SUCCESS" });
          resolve();
        } catch (error: unknown) {
          console.error("Worker: Error initializing clients:", error);
          self.postMessage({ type: "INIT_ERROR", error: error instanceof Error ? error.message : String(error) });
          reject(error);
        }
      } else {
        const error = new Error("Supabase/RPC credentials not received by worker.");
        self.postMessage({ type: "INIT_ERROR", error: error.message });
        reject(error);
      }
    });
    try {
      await initializationPromise;
    } catch (initError) {
      console.error("Worker: Initialization failed immediately.", initError);
    }
  } else if (type === "FETCH_NEW_PERMITS") {
    const address = payload.address as Address;
    const lastCheckTimestamp = payload.lastCheckTimestamp;
    try {
      if (!initializationPromise) throw new Error("Worker not initialized. INIT message must be sent first.");
      await initializationPromise;
      if (!supabase) throw new Error("Supabase client failed to initialize.");

      const lowerCaseWalletAddress = address.toLowerCase();
      const { data: userData, error: userFetchError } = await supabase
        .from("permit_app_users")
        .select("github_id")
        .ilike("wallet_address", lowerCaseWalletAddress)
        .single();
      if (userFetchError && userFetchError.code !== "PGRST116") throw new Error(`Supabase user fetch error: ${userFetchError.message}`);
      if (!userData) {
        self.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: [] });
        return;
      }
      const userGitHubId = userData.github_id;

      const newPermitsFromDb = await fetchPermitsFromDb(userGitHubId, lastCheckTimestamp ?? null);
      const mappedNewPermits = newPermitsFromDb
        .map((p: PermitRow, i: number) => mapDbPermitToPermitData(p, i, lowerCaseWalletAddress))
        .filter((p): p is PermitData => p !== null);

      if (mappedNewPermits.length > 0) {
        const validatedNewPermits = await validatePermitsBatch(mappedNewPermits);
        self.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: validatedNewPermits });
      } else {
        self.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: [] });
      }
    } catch (error: unknown) {
      console.error("Worker: Error fetching/validating new permits:", error);
      self.postMessage({ type: "PERMITS_ERROR", error: error instanceof Error ? error.message : String(error) });
    }
  } else if (type === "FETCH_LEADERBOARD_DATA") {
    console.log(`Worker: Received FETCH_LEADERBOARD_DATA`);
    try {
      if (!initializationPromise) throw new Error("Worker not initialized. INIT message must be sent first.");
      await initializationPromise;
      if (!supabase) throw new Error("Supabase client failed to initialize.");

      const combinedData = await fetchAllPermitsForLeaderboard();
      const mappedData = combinedData.map(mapCombinedToLeaderboardData).filter((p): p is RawPermitWithUser => p !== null);

      console.log(`Worker: Mapped ${mappedData.length} permits for leaderboard result.`);
      self.postMessage({ type: "LEADERBOARD_DATA_RESULT", payload: mappedData });
    } catch (error: unknown) {
      console.error("Worker: Error fetching leaderboard data:", error);
      self.postMessage({ type: "LEADERBOARD_DATA_RESULT", error: error instanceof Error ? error.message : String(error) });
    }
  } else {
    console.warn(`Worker: Received unknown message type: ${type}`);
  }
};
