# GitHub Data Substitution Plan

---

## Overview

This document outlines a detailed plan to **replace live GitHub API calls** with **local JSON fixtures** for the Ubiquity OS Marketplace demo. This will enable offline/demo mode operation without relying on GitHub API rate limits or network connectivity, except for fetching user avatars/usernames.

---

## Current GitHub Data Fetching

| Data Type                          | API Endpoint                                                      | Purpose                                                      | Replaceable? |
|-----------------------------------|-------------------------------------------------------------------|--------------------------------------------------------------|--------------|
| **Issue Comments**                | `https://api.github.com/repos/{owner}/{repo}/issues/{num}/comments` | Extract embedded metadata JSON from bot comment              | **Yes**      |
| **User Profile Info**             | `https://api.github.com/user/{userId}`                            | Display contributor login and avatar                         | **No**       |

---

## What is in the Fixtures?

- Located in: `frontend/src/fixtures/database/`
- Files named like: `ubiquity-os-marketplace_command-start-stop_148.json`
- Contain **parsed metadata** for each issue, including:
  - User IDs
  - Usernames (as keys)
  - Total rewards
  - Task rewards
  - Comments with content, URLs, scores
  - Review rewards
  - Pre-rendered HTML summaries (`evaluationCommentHtml`)

---

## Substitution Strategy

### 1. Replace Issue Metadata Fetching

**Current:**

- `fetchAndCacheIssueMetadata()` fetches comments from GitHub API
- Parses embedded JSON metadata from bot comment
- Caches parsed metadata

**New:**

- **Bypass GitHub API call entirely**
- Instead, **load the corresponding JSON fixture file** for the issue
- Return the parsed metadata directly from the fixture
- Maintain the same return type (`PermitCommentMetadata`)

---

### 2. Keep User Profile Fetching

- Continue fetching user profile info (login, avatar) live from GitHub API
- This data is **not** included in fixtures
- Needed for accurate contributor display

---

### 3. Implementation Details

- **Create a utility** to load fixture JSON by repo + issue number:

  ```ts
  async function loadFixtureMetadata(owner: string, repo: string, issueNumber: number): Promise<PermitCommentMetadata | null>
  ```

- **File naming convention:**

  ```
  frontend/src/fixtures/database/{repo}_{issueNumber}.json
  ```

  Example:

  ```
  ubiquity-os-marketplace_command-start-stop_148.json
  ```

- **Modify `fetchAndCacheIssueMetadata()`**:

  - Add a flag or environment variable (e.g., `USE_FIXTURES=true`)
  - If enabled, load from fixture instead of calling GitHub API
  - Else, fallback to live API call (for production)

- **Cache fixture data** similarly to API data to avoid repeated loads

---

### 4. Optional: Toggle Mode

- Add a **global toggle** (env var or config):

  ```
  USE_GITHUB_FIXTURES=true
  ```

- When true:
  - **Always load from fixtures**
  - Skip GitHub API calls for issue comments
- When false:
  - Use live GitHub API calls

---

## Benefits

- **Offline/demo mode** without GitHub API dependency
- **Avoid rate limits** and network failures
- **Faster load times** for demo scenarios
- **Deterministic data** for consistent demos

---

## Limitations

- User avatars/usernames still fetched live
- Fixtures must be **kept up to date** with real GitHub data for accuracy
- New issues require new fixture files

---

## Summary

| Step                                    | Action                                                      |
|-----------------------------------------|-------------------------------------------------------------|
| Identify issue                          | Map repo + issue number to fixture filename                 |
| Load metadata                           | Read JSON from fixture file                                 |
| Return metadata                         | Use as if parsed from GitHub comment                        |
| Fetch user profiles                     | Continue live fetch for avatars/usernames                   |
| Add toggle                             | Switch between fixture/demo mode and live mode              |

---

## Next Steps

1. Implement fixture loading utility
2. Modify `fetchAndCacheIssueMetadata()` to support fixture mode
3. Add toggle/config for switching modes
4. Test substitution in demo environment
5. Document usage for developers
