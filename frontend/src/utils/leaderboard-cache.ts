// Import required types
import type { CombinedLeaderboardData } from "../workers/app-worker.ts";
import type { LeaderboardEntry } from "../workers/leaderboard-aggregator.ts";
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
  rawData: CombinedLeaderboardData[];
  timestamp: number;
  ttl: number;
  version: number; // For handling schema updates
  isComplete: boolean; // Indicates if this is fully processed data
}

// Current cache version - increment when making breaking changes
const CACHE_VERSION = 1;


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
const ONE_WEEK = 7 * ONE_DAY;

// Shorter TTL for development/testing
const PROCESSED_DATA_TTL = process.env.NODE_ENV === 'development' ? ONE_HOUR : ONE_WEEK;

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
  /**
   * Get processed leaderboard data from cache for a specific week range and repository
   */
  async getProcessedData(
    cacheKey: string,
    selectedRepository?: string | null
  ): Promise<{
    processedData: LeaderboardEntry[] | null;
    rawData: CombinedLeaderboardData[] | null;
    isComplete: boolean;
  }> {
    if (!stores) return { processedData: null, rawData: null, isComplete: false };
    try {
      const cached = await stores.processedLeaderboardStore.get(cacheKey);
      if (!cached) return { processedData: null, rawData: null, isComplete: false };

      // Handle version mismatch
      if (!cached.version || cached.version !== CACHE_VERSION) {
        console.log(`Cache version mismatch for key: ${cacheKey}`);
        await stores.processedLeaderboardStore.del(cacheKey);
        return { processedData: null, rawData: null, isComplete: false };
      }

      const now = Date.now();
      const isExpired = now - cached.timestamp > cached.ttl;
      const isValidForRepo = !selectedRepository || cached.rawData.some(permit => permit.repository === selectedRepository);

      if (isExpired || !isValidForRepo) {
        console.log(
          `Cache invalid for key: ${cacheKey}`,
          isExpired ? '(expired)' : '(repository mismatch)'
        );
        await stores.processedLeaderboardStore.del(cacheKey);
        return { processedData: null, rawData: null, isComplete: false };
      }
      return {
        processedData: cached.processedData,
        rawData: cached.rawData,
        isComplete: cached.isComplete
      };
    } catch (error) {
      console.error("Failed to get processed data:", error);
      return { processedData: null, rawData: null, isComplete: false };
    }
  },

  /**
   * Set processed leaderboard data to cache for a specific week range
   */
  async setProcessedData(
    processedData: LeaderboardEntry[],
    rawData: CombinedLeaderboardData[],
    cacheKey: string,
    isComplete = true
  ): Promise<void> {
    if (!stores) return;
    try {
      const cachedData: CachedProcessedLeaderboardData = {
        processedData,
        rawData,
        timestamp: Date.now(),
        ttl: PROCESSED_DATA_TTL,
        version: CACHE_VERSION,
        isComplete
      };
      await stores.processedLeaderboardStore.set(cacheKey, cachedData);
    } catch (error) {
      console.error(`Failed to cache processed leaderboard data for key ${cacheKey}:`, error);
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
