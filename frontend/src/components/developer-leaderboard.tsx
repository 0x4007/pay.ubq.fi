import React, { useState, useEffect, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLeaderboardData } from "../hooks/use-leaderboard-data.ts";
import { leaderboardCache } from "../utils/leaderboard-cache.ts";
import type { LeaderboardEntry } from "../workers/leaderboard-aggregator.ts";
import { getWhitelistedRepositories } from "../workers/leaderboard-aggregator.ts";
import "./leaderboard-styles.css";

const REPO_COLORS: Record<string, string> = {};

function displayRepoName(repoId: string): string {
  const firstUnderscore = repoId.indexOf("_");
  if (firstUnderscore === -1) return repoId;
  const owner = repoId.slice(0, firstUnderscore);
  const rest = repoId.slice(firstUnderscore + 1).replace(/_/g, ".");
  return `${owner}/${rest}`;
}

function generateColor(index: number): string {
  const colors = [
    "#8884d8",
    "#82ca9d",
    "#ffc658",
    "#ff7f50",
    "#87ceeb",
    "#da70d6",
    "#32cd32",
    "#ff69b4",
    "#ba55d3",
    "#cd5c5c",
    "#ffa500",
    "#40e0d0",
    "#ff6347",
    "#7b68ee",
    "#00fa9a",
    "#ffd700",
    "#dc143c",
    "#00ced1",
    "#ff1493",
    "#1e90ff",
  ];
  return colors[index % colors.length];
}

function formatXp(xp: number): string {
  return xp.toLocaleString();
}

const getUniqueFilterOptions = (data: LeaderboardEntry[]) => {
  const categories = new Set<string>();
  const repositories = new Set<string>();

  data.forEach((entry) => {
    Object.keys(entry.xpByCategory).forEach((cat) => categories.add(cat));
    entry.repositories.forEach((repo) => repositories.add(repo));
  });

  return {
    availableCategories: Array.from(categories).sort(),
    availableRepositories: Array.from(repositories).sort(),
  };
};

export function DeveloperLeaderboard() {
  const [selectedWeeks, setSelectedWeeks] = useState(52);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [repoWhitelist, setRepoWhitelist] = useState<Set<string>>(new Set());

  useEffect(() => {
    getWhitelistedRepositories().then(setRepoWhitelist);
  }, []);

  const getCacheKey = (weeks: number, repo: string | null | undefined) => (repo ? `${weeks}_weeks_repo_${repo}` : `${weeks}_weeks`);

  const refreshLeaderboard = async () => {
    const cacheKey = getCacheKey(selectedWeeks, selectedRepository);

    await leaderboardCache.clearProcessedData(cacheKey);
    setRefreshCounter((prev) => prev + 1);
  };

  const {
    leaderboardData: rawLeaderboardData,
    isLoading,
    error,
  } = useLeaderboardData({
    selectedWeeks,
    selectedRepository,
    refreshCounter,
  });

  const { availableCategories, availableRepositories: allRepos } = useMemo(() => {
    if (!Array.isArray(rawLeaderboardData)) {
      return { availableCategories: [], availableRepositories: [] };
    }
    return getUniqueFilterOptions(rawLeaderboardData);
  }, [rawLeaderboardData]);

  const whitelistedRepositories = useMemo(() => {
    const normalizedWhitelist = new Set(Array.from(repoWhitelist).map((r) => r.toLowerCase().replace(/\./g, "_").replace(/\//g, "_")));

    const normalizedAllRepos = allRepos.map((r) => r.toLowerCase().replace(/\./g, "_").replace(/\//g, "_"));

    const filtered = allRepos.filter((repo, idx) => {
      const normalized = normalizedAllRepos[idx];
      return normalizedWhitelist.has(normalized);
    });

    return filtered;
  }, [allRepos, repoWhitelist]);

  const filteredLeaderboardData = useMemo(() => {
    if (!Array.isArray(rawLeaderboardData)) return [];

    return rawLeaderboardData
      .map((entry) => {
        const filteredRepos = entry.repositories.filter((repo) => repoWhitelist.has(repo));
        const filteredXpByRepo: Record<string, number> = {};
        let totalXp = 0;
        Object.entries(entry.xpByRepository).forEach(([repoKey, xp]) => {
          const repoName = repoKey.replace(/_/g, "/");
          if (repoWhitelist.has(repoName)) {
            filteredXpByRepo[repoKey] = xp;
            totalXp += xp;
          }
        });
        return {
          ...entry,
          repositories: filteredRepos,
          xpByRepository: filteredXpByRepo,
          totalXpForWhitelist: totalXp,
        };
      })
      .filter((entry) => entry.totalXpForWhitelist > 0);
  }, [rawLeaderboardData, repoWhitelist]);

  if (error) {
    return (
      <div className="error-container">
        <h3>Error Loading Leaderboard</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div>Loading leaderboard data...</div>
      </div>
    );
  }

  if (!isLoading && filteredLeaderboardData.length === 0) {
    return (
      <div className="leaderboard-container page-container">
        <h2>Developer XP Leaderboard</h2>
        <p>No leaderboard data available for whitelisted repositories.</p>
        <button onClick={refreshLeaderboard} className="retry-button">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="leaderboard-container page-container">
      <h2>Developer XP Leaderboard</h2>

      <div className="filters-container">
        <label>
          Category:
          <select value={selectedCategory ?? ""} onChange={(e) => setSelectedCategory(e.target.value || null)} disabled={isLoading}>
            <option value="">All Categories</option>
            {availableCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Repository:
          <select value={selectedRepository ?? ""} onChange={(e) => setSelectedRepository(e.target.value || null)} disabled={isLoading}>
            <option value="">All Repositories</option>
            {whitelistedRepositories.map((repo) => (
              <option key={repo} value={repo}>
                {displayRepoName(repo)}
              </option>
            ))}
          </select>
        </label>
        <div className="time-radio-group">
          <span className="time-radio-label">Time Range:</span>
          {[
            { label: "All Time", weeks: 0 },
            { label: "1 Week", weeks: 1 },
            { label: "2 Weeks", weeks: 2 },
            { label: "1 Month", weeks: 4 },
            { label: "3 Months", weeks: 13 },
            { label: "1 Year", weeks: 52 },
          ].map(({ label, weeks }) => (
            <label key={label} className="radio-label">
              <input
                type="radio"
                name="timeRange"
                value={weeks}
                checked={selectedWeeks === weeks}
                onChange={(e) => setSelectedWeeks(parseInt(e.target.value, 10))}
                disabled={isLoading}
                className="radio-input"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={filteredLeaderboardData} margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
            <XAxis type="number" stroke="rgba(255, 255, 255, 0.7)" />
            <YAxis dataKey="githubUsername" type="category" stroke="rgba(255, 255, 255, 0.7)" width={100} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.3)",
                color: "white",
              }}
              formatter={(value: number, name: string) => [formatXp(value), name]}
            />
            <Legend wrapperStyle={{ color: "white", paddingTop: "10px" }} />
            {whitelistedRepositories.map((repo, idx) => {
              const sanitizedRepo = repo.replace(/[/.]/g, "_");
              if (!REPO_COLORS[sanitizedRepo]) {
                REPO_COLORS[sanitizedRepo] = generateColor(idx);
              }
              return (
                <Bar
                  key={sanitizedRepo}
                  dataKey={`xpByRepository.${sanitizedRepo}`}
                  stackId="a"
                  fill={REPO_COLORS[sanitizedRepo]}
                  name={displayRepoName(repo)}
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
