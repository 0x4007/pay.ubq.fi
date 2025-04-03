import React from "react";
import { useLeaderboardData, LeaderboardEntry } from "../hooks/use-leaderboard-data";
// Assuming app-styles.css or similar is imported globally (e.g., in main.tsx)
// import "../app-styles.css"; // Import styles if needed locally

// Helper function to format XP (optional)
function formatXp(xp: number): string {
  // Add any desired formatting, e.g., thousands separators
  return xp.toLocaleString();
}

export function DeveloperLeaderboard() {
  const { leaderboardData, isLoading, error } = useLeaderboardData();

  if (isLoading) {
    return <div className="loading-container">Loading leaderboard...</div>;
  }

  if (error) {
    return <div className="error-container">Error loading leaderboard: {error}</div>;
  }

  if (!leaderboardData || leaderboardData.length === 0) {
    return <div className="info-container">No leaderboard data available.</div>;
  }

  return (
    <div className="leaderboard-container page-container"> {/* Reuse page-container if applicable */}
      <h2>Developer XP Leaderboard</h2>
      <table className="leaderboard-table"> {/* Add specific class for styling */}
        <thead>
          <tr>
            <th>Rank</th>
            <th>Developer</th>
            <th>Total XP</th>
          </tr>
        </thead>
        <tbody>
          {leaderboardData.map((entry: LeaderboardEntry, index: number) => (
            <tr key={entry.githubUsername}>
              <td>{index + 1}</td>
              <td>
                <div className="developer-info">
                  <img
                    src={entry.avatarUrl}
                    alt={`${entry.githubUsername}'s avatar`}
                    className="avatar" // Add class for styling
                    width="30"
                    height="30"
                  />
                  <span>{entry.githubUsername}</span>
                </div>
              </td>
              <td>{formatXp(entry.totalXp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Basic styling (can be moved to CSS file) */}
      <style>{`
        .leaderboard-container {
          padding: 20px;
        }
        .leaderboard-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }
        .leaderboard-table th, .leaderboard-table td {
          border: 1px solid #ddd; /* Example border */
          padding: 8px;
          text-align: left;
        }
        .leaderboard-table th {
          background-color: #f2f2f2; /* Example header background */
        }
        .developer-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .avatar {
          border-radius: 50%;
          border: 1px solid #ccc;
        }
        .loading-container, .error-container, .info-container {
          padding: 20px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
