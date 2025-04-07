import React, { useState } from "react"; // Import useState
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
// Removed duplicate React/useState import
import { useMemo } from "react"; // Keep useMemo
// Correct import path for LeaderboardEntry and hook
import { useLeaderboardData } from "../hooks/use-leaderboard-data.ts";
import { leaderboardCache } from "../utils/leaderboard-cache.ts";
import type { LeaderboardEntry } from "../workers/leaderboard-aggregator.ts";
import "./leaderboard-styles.css"; // Import styles

const REPO_COLORS: Record<string, string> = {}; // Will be filled dynamically

// Helper to generate a color palette
function generateColor(index: number): string {
  const colors = [
    "#8884d8", "#82ca9d", "#ffc658", "#ff7f50", "#87ceeb", "#da70d6",
    "#32cd32", "#ff69b4", "#ba55d3", "#cd5c5c", "#ffa500", "#40e0d0",
    "#ff6347", "#7b68ee", "#00fa9a", "#ffd700", "#dc143c", "#00ced1",
    "#ff1493", "#1e90ff"
  ];
  return colors[index % colors.length];
}

// Helper function to format XP (optional) - Keep this if used elsewhere or for tooltip
function formatXp(xp: number): string {
  // Add any desired formatting, e.g., thousands separators
  return xp.toLocaleString();
}

// Helper function to extract unique categories/repos from data
const getUniqueFilterOptions = (data: LeaderboardEntry[]) => {
  const categories = new Set<string>();
  const repositories = new Set<string>();

  data.forEach((entry) => {
    Object.keys(entry.xpByCategory).forEach(cat => categories.add(cat));
    // Add all repositories from the entry's repositories array
    entry.repositories.forEach(repo => repositories.add(repo));
  });

  return {
    availableCategories: Array.from(categories).sort(),
    availableRepositories: Array.from(repositories).sort(),
  };
};


export function DeveloperLeaderboard() {
  // State for filters managed locally now
  const [selectedWeeks, setSelectedWeeks] = useState(52);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<string | null>(null); // Keep for future use
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Helper to compute cache key (same as in hook)
  const getCacheKey = (weeks: number, repo: string | null | undefined) =>
    repo ? `${weeks}_weeks_repo_${repo}` : `${weeks}_weeks`;

  const refreshLeaderboard = async () => {
    const cacheKey = getCacheKey(selectedWeeks, selectedRepository);
    console.log(`DeveloperLeaderboard: Clearing cache for key ${cacheKey} and refreshing leaderboard...`);
    await leaderboardCache.clearProcessedData(cacheKey);
    setRefreshCounter((prev) => prev + 1);
  };

  // Fetch data using the hook, passing selectedWeeks
  const { leaderboardData: rawLeaderboardData, isLoading, error } = useLeaderboardData({
    selectedWeeks,
    selectedRepository,
    refreshCounter
  });

  // Calculate available filter options based on the fetched data
  const { availableCategories, availableRepositories } = useMemo(() => {
    if (!Array.isArray(rawLeaderboardData)) {
      return { availableCategories: [], availableRepositories: [] };
    }
    return getUniqueFilterOptions(rawLeaderboardData);
  }, [rawLeaderboardData]);

  // Apply filtering locally based on state
  const filteredLeaderboardData = useMemo(() => {
    if (!Array.isArray(rawLeaderboardData)) return [];

    // Apply category and repository filters locally (time filtering is done in worker/hook)
    return rawLeaderboardData.filter((entry) => {
      // Category Filter: Check if the entry has XP in the selected category
      const categoryMatch = !selectedCategory || (entry.xpByCategory[selectedCategory] ?? 0) > 0;

      // Repository Filter - check if entry has the selected repository
      const repoMatch = !selectedRepository || entry.repositories.includes(selectedRepository);

      return categoryMatch && repoMatch;
    });
  }, [rawLeaderboardData, selectedCategory, selectedRepository]); // Remove selectedWeeks dependency


  // Add detailed logging for debugging
  console.log("DeveloperLeaderboard render state:", {
    isLoading, // Hook's loading state (worker fetching/processing)
    hasError: !!error,
    errorMessage: error,
    hasRawData: Array.isArray(rawLeaderboardData),
    rawDataLength: Array.isArray(rawLeaderboardData) ? rawLeaderboardData.length : 0,
    filteredDataLength: Array.isArray(filteredLeaderboardData) ? filteredLeaderboardData.length : 0,
    sampleEntry: filteredLeaderboardData?.[0]
  });

  if (filteredLeaderboardData.length > 0) {
    console.log("Sample xpByRepository for first user:", filteredLeaderboardData[0].xpByRepository);
  }


  // Prioritize error display over loading state if an error exists
  if (error) {
    console.error("DeveloperLeaderboard error:", error);
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

  // Show loading state for initial load and filter changes
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div>Loading leaderboard data...</div>
      </div>
    );
  }


  // Handle case where there's no data
  if (!isLoading && (filteredLeaderboardData.length === 0 || !Array.isArray(rawLeaderboardData) || rawLeaderboardData.length === 0)) {
    const isFiltered = !!selectedCategory || !!selectedRepository;
    const message = isFiltered
      ? "No data matches the current filters"
      : "No leaderboard data available";

    console.log(`DeveloperLeaderboard: ${message}`);
    return (
      <div className="leaderboard-container page-container">
        <h2>Developer XP Leaderboard</h2>
        {/* Keep filter controls visible even when no data */}
        <div className="filters-container">
          <label>
            Category:
            <select
              value={selectedCategory ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value || null)}
              disabled={isLoading}
            >
              <option value="">All Categories</option>
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Repository:
            <select
              value={selectedRepository ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedRepository(e.target.value || null)}
              disabled={isLoading}
            >
              <option value="">All Repositories</option>
              {availableRepositories.map(repo => (
                <option key={repo} value={repo}>
                  {repo.split('/').pop() || repo}
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedWeeks(parseInt(e.target.value, 10))}
                  disabled={isLoading}
                  className="radio-input"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="info-container">
          <p>{message}</p>
          {!isFiltered && (
            <button
              onClick={refreshLeaderboard}
              className="retry-button"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-container page-container"> {/* Reuse page-container if applicable */}
      <h2>Developer XP Leaderboard</h2>

      {/* Filter Controls */}
      <div className="filters-container">
        <label>
          Category:
          <select
            value={selectedCategory ?? ""}
            // Explicitly type the event parameter
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value || null)}
            disabled={isLoading}
          >
            <option value="">All Categories</option>
            {availableCategories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        {/* Repository filter */}
        <label>
          Repository:
          <select
            value={selectedRepository ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedRepository(e.target.value || null)}
            disabled={isLoading}
          >
            <option value="">All Repositories</option>
            {availableRepositories.map(repo => (
              <option key={repo} value={repo}>
                {repo.split('/').pop() || repo} {/* Show just repo name, not full path */}
              </option>
            ))}
          </select>
        </label>
        {/* Time Range Radio Buttons */}
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedWeeks(parseInt(e.target.value, 10))}
                  disabled={isLoading}
                  className="radio-input"
                />
                {label}
              </label>
            ))}
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical" // Use vertical layout for better readability of usernames
            data={filteredLeaderboardData} // Use locally filtered data
            margin={{
              top: 5,
              right: 30,
              left: 100, // Increase left margin for usernames
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
            <XAxis type="number" stroke="rgba(255, 255, 255, 0.7)" />
            <YAxis
              dataKey="githubUsername"
              type="category"
              stroke="rgba(255, 255, 255, 0.7)"
              width={100} // Adjust width based on longest username expected
              tick={{ fontSize: 10 }} // Smaller font size for Y-axis labels
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.3)",
                color: "white",
              }}
              formatter={(value: number, name: string) => [formatXp(value), name]} // Format tooltip value
            />
            <Legend wrapperStyle={{ color: "white", paddingTop: "10px" }} />
            {/* Define stacked bars for each repository */}
            {availableRepositories.map((repo, idx) => {
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
                  name={repo.split('/').pop() || repo}
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Removed inline style block */}
    </div>
  );
}
