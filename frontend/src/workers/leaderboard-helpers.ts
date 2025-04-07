/**
 * Extracts the GitHub user ID from a placeholder string.
 * E.g., "GitHub ID: 12345" -> 12345
 */
export const extractGitHubId = (placeholder: string): number | null => {
  const match = placeholder.match(/GitHub ID: (\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Parses a GitHub issue or pull request URL to extract owner, repo, and issue number.
 */
export const parseGitHubIssueUrl = (url: string): { owner: string; repo: string; issueNumber: number } | null => {
  // Matches URLs like:
  // https://github.com/owner/repo/issues/123
  // https://github.com/owner/repo/pull/123
  // http://github.com/owner/repo/issues/123
  // github.com/owner/repo/issues/123
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/);
  if (match) {
    return { owner: match[1], repo: match[2], issueNumber: parseInt(match[3], 10) };
  }
  return null;
};
