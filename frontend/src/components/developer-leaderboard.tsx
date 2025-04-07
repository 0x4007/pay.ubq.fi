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
import type { LeaderboardEntry } from "../workers/leaderboard-aggregator.ts";
import "./leaderboard-styles.css"; // Import styles

// Define colors for categories (adjust as needed for better contrast/aesthetics)
const CATEGORY_COLORS = {
  comments: "#8884d8",
  task: "#82ca9d",
  reviewRewards: "#ffc658",
  // Add more categories and colors if they exist
};

// Helper function to format XP (optional) - Keep this if used elsewhere or for tooltip
function formatXp(xp: number): string {
  // Add any desired formatting, e.g., thousands separators
  return xp.toLocaleString();
}

// Helper function to extract unique categories/repos from data
const getUniqueFilterOptions = (data: LeaderboardEntry[]) => {
  const categories = new Set<string>();
  const repositories = new Set<string>();

  data.forEach((entry: LeaderboardEntry) => {
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

  // Fetch data using the hook, passing selectedWeeks
  const { leaderboardData: rawLeaderboardData, isLoading, error } = useLeaderboardData({
    selectedWeeks,
    selectedRepository
  });

  // Calculate available filter options based on the fetched data
  const { availableCategories, availableRepositories } = useMemo(() => {
    return getUniqueFilterOptions(rawLeaderboardData || []);
  }, [rawLeaderboardData]);

  // Apply filtering locally based on state
  const filteredLeaderboardData = useMemo(() => {
    if (!rawLeaderboardData) return [];

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
    hasRawData: !!rawLeaderboardData,
    rawDataLength: rawLeaderboardData?.length,
    filteredDataLength: filteredLeaderboardData?.length,
    sampleEntry: filteredLeaderboardData?.[0]
  });


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

  // Show loading only if not errored and data hasn't loaded yet
  if (isLoading && !rawLeaderboardData?.length) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div>Loading leaderboard data...</div>
      </div>
    );
  }


  // Handle case where data is loaded but filtering results in empty list
  if (!isLoading && filteredLeaderboardData.length === 0) {
     console.log("DeveloperLeaderboard: No data available after filtering");
     // Keep filter controls visible even when no data matches
     // return (
     //   <div className="info-container">
     //     <p>No leaderboard data matches the current filters.</p>
     //     <button onClick={() => window.location.reload()} className="retry-button">Refresh</button>
     //   </div>
     // );
     // Instead of returning, we'll render the filters and an empty chart area below
  } else if (!isLoading && !rawLeaderboardData?.length) {
     // Handle case where initial fetch returned no data at all
     console.log("DeveloperLeaderboard: No data available from source");
     return (
       <div className="info-container">
         <p>No leaderboard data available</p>
        <button
          onClick={() => {
            console.log("Retrying leaderboard fetch...");
            window.location.reload();
          }}
          className="retry-button"
        >
          Refresh
        </button>
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
            { label: "1 Week", weeks: 1 },
            { label: "2 Weeks", weeks: 2 },
            { label: "1 Month", weeks: 4 },
            { label: "3 Months", weeks: 13 },
            { label: "1 Year", weeks: 52 },
          ].map(({ label, weeks }) => (
            <label key={weeks} className="radio-label">
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
            {/* Define stacked bars for each category */}
            {/* Ensure the keys match the properties in xpByCategory */}
            <Bar dataKey="xpByCategory.comments" stackId="a" fill={CATEGORY_COLORS.comments} name="Comments XP" />
            <Bar dataKey="xpByCategory.task" stackId="a" fill={CATEGORY_COLORS.task} name="Task XP" />
            <Bar dataKey="xpByCategory.reviewRewards" stackId="a" fill={CATEGORY_COLORS.reviewRewards} name="Reviews XP" />
            {/* Add more <Bar> components here if other categories exist in xpByCategory */}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Removed inline style block */}
    </div>
  );
}
