import { createIdbKeyval } from "./idb-keyval.ts";

interface GitHubComment {
  id: number;
  body?: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
}

interface CachedComments {
  comments: GitHubComment[];
  timestamp: number;
  // Add a TTL of 1 hour
  ttl: number;
}

const commentStore = createIdbKeyval<CachedComments>("githubComments");
const ONE_HOUR = 60 * 60 * 1000;

export const githubCommentCache = {
  async getComments(issueUrl: string): Promise<CachedComments | null> {
    const cached = await commentStore.get(issueUrl);
    if (!cached) return null;

    // Check if cache has expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      await commentStore.del(issueUrl);
      return null;
    }

    return cached;
  },

  async setComments(issueUrl: string, comments: GitHubComment[]): Promise<void> {
    const cachedData: CachedComments = {
      comments,
      timestamp: Date.now(),
      ttl: ONE_HOUR
    };
    await commentStore.set(issueUrl, cachedData);
  },

  async clearCache(): Promise<void> {
    await commentStore.clear();
  }
};
