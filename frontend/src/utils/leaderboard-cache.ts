// Import LeaderboardEntry from its new location
import type { LeaderboardEntry } from "../workers/leaderboard-processing.ts";
import { createIdbKeyval } from "./idb-keyval.ts";

// Removed unused CachedLeaderboardData interface

interface GitHubUserDetails {
  id: number;
  login: string;
  avatar_url: string;
}

interface PermitCommentMetadata {
  output: {
    [key: string]: {
      userId: number;
      total: number;
    };
  };
}

// Define a new interface for the processed data cache
interface CachedProcessedLeaderboardData {
  processedData: LeaderboardEntry[];
  timestamp: number;
  ttl: number;
}


interface CachedMetadata {
  metadata: PermitCommentMetadata;
  timestamp: number;
  ttl: number;
}

interface CachedUserDetails {
  details: GitHubUserDetails;
  timestamp: number;
  ttl: number;
}

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

// Initialize stores with error handling
const initializeStores = () => {
  try {
    return {
      processedLeaderboardStore: createIdbKeyval<CachedProcessedLeaderboardData>("leaderboard_processed"),
      userDetailsStore: createIdbKeyval<CachedUserDetails>("userDetails"),
      metadataStore: createIdbKeyval<CachedMetadata>("permitMetadata")
    };
  } catch (error) {
    console.error("Failed to initialize IndexedDB stores:", error);
    return null;
  }
};

const stores = initializeStores();

export const leaderboardCache = {
  async getProcessedData(): Promise<LeaderboardEntry[] | null> {
    if (!stores) return null;
    try {
      const cached = await stores.processedLeaderboardStore.get("leaderboard_processed");
      if (!cached) return null;

      if (Date.now() - cached.timestamp > cached.ttl) {
        await stores.processedLeaderboardStore.del("leaderboard_processed");
        return null;
      }
      return cached.processedData;
    } catch (error) {
      console.error("Failed to get processed data:", error);
      return null;
    }
  },

  async setProcessedData(processedData: LeaderboardEntry[]): Promise<void> {
    if (!stores) return;
    try {
      const cachedData: CachedProcessedLeaderboardData = {
        processedData,
        timestamp: Date.now(),
        ttl: ONE_HOUR
      };
      await stores.processedLeaderboardStore.set("leaderboard_processed", cachedData);
    } catch (error) {
      console.error("Failed to cache processed leaderboard data:", error);
    }
  },

  async getUserDetails(userId: number): Promise<GitHubUserDetails | null> {
    if (!stores) return null;
    try {
      const cached = await stores.userDetailsStore.get(userId.toString());
      if (!cached) return null;

      if (Date.now() - cached.timestamp > cached.ttl) {
        await stores.userDetailsStore.del(userId.toString());
        return null;
      }
      return cached.details;
    } catch (error) {
      console.error("Failed to get user details:", error);
      return null;
    }
  },

  async setUserDetails(userId: number, details: GitHubUserDetails): Promise<void> {
    if (!stores) return;
    try {
      const cachedData: CachedUserDetails = {
        details,
        timestamp: Date.now(),
        ttl: ONE_DAY
      };
      await stores.userDetailsStore.set(userId.toString(), cachedData);
    } catch (error) {
      console.error("Failed to cache user details:", error);
    }
  },

  async getMetadata(issueUrl: string): Promise<PermitCommentMetadata | null> {
    if (!stores) return null;
    try {
      const cached = await stores.metadataStore.get(issueUrl);
      if (!cached) return null;

      if (Date.now() - cached.timestamp > cached.ttl) {
        await stores.metadataStore.del(issueUrl);
        return null;
      }
      return cached.metadata;
    } catch (error) {
      console.error("Failed to get metadata:", error);
      return null;
    }
  },

  async setMetadata(issueUrl: string, metadata: PermitCommentMetadata): Promise<void> {
    if (!stores) return;
    try {
      const cachedData: CachedMetadata = {
        metadata,
        timestamp: Date.now(),
        ttl: ONE_DAY
      };
      await stores.metadataStore.set(issueUrl, cachedData);
    } catch (error) {
      console.error("Failed to cache metadata:", error);
    }
  },

  async clearAll(): Promise<void> {
    if (!stores) return;
    try {
      await Promise.all([
        stores.processedLeaderboardStore.clear(),
        stores.userDetailsStore.clear(),
        stores.metadataStore.clear()
      ]);
    } catch (error) {
      console.error("Failed to clear caches:", error);
    }
  }
};
