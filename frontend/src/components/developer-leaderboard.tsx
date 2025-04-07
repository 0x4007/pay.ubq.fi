import React, { useState } from "react"; // Import useState
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  // Cell, // If needed for individual bar colors later
} from "recharts";
import { useLeaderboardData } from "../hooks/use-leaderboard-data.ts"; // Removed LeaderboardEntry
import "./leaderboard-styles.css"; // Import the new CSS file

// Define colors for categories (adjust as needed for better contrast/aesthetics)
const CATEGORY_COLORS = {
  comments: "#8884d8", // Purple
  task: "#82ca9d", // Green
  reviewRewards: "#ffc658", // Yellow/Orange
  // Add more categories and colors if they exist
};

// Helper function to format XP (optional) - Keep this if used elsewhere or for tooltip
function formatXp(xp: number): string {
  // Add any desired formatting, e.g., thousands separators
  return xp.toLocaleString();
}

export function DeveloperLeaderboard() {
  const [selectedWeeks, setSelectedWeeks] = useState(52); // State for the slider (1 to 52 weeks) - Declare BEFORE use

  const {
    leaderboardData,
    isLoading,
    error,
    availableCategories,
    availableRepositories,
    selectedCategory,
    setSelectedCategory,
    selectedRepository,
    setSelectedRepository,
  } = useLeaderboardData({ selectedWeeks }); // Pass selectedWeeks to the hook

  // Add detailed logging for debugging
  console.log("DeveloperLeaderboard render state:", {
    isLoading,
    hasError: !!error,
    errorMessage: error,
    hasData: !!leaderboardData,
    dataLength: leaderboardData?.length,
    sampleEntry: leaderboardData?.[0]
  });

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div>Loading leaderboard data...</div>
      </div>
    );
  }

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

  if (!leaderboardData || leaderboardData.length === 0) {
    console.log("DeveloperLeaderboard: No data available");
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
        <label>
          Repository:
          <select
            value={selectedRepository ?? ""}
            // Explicitly type the event parameter
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedRepository(e.target.value || null)}
            disabled={isLoading}
          >
            <option value="">All Repositories</option>
            {availableRepositories.map(repo => (
              <option key={repo} value={repo}>{repo}</option>
            ))}
          </select>
        </label>
        {/* Time Range Slider */}
        <label className="time-slider-label">
          Time Range (Weeks): {selectedWeeks}
          <input
            type="range"
            min="1"
            max="52"
            value={selectedWeeks}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedWeeks(parseInt(e.target.value, 10))}
            className="time-slider"
            disabled={isLoading}
          />
        </label>
      </div>

      {/* Stacked Bar Chart */}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical" // Use vertical layout for better readability of usernames
            data={leaderboardData}
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
