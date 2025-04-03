import { LeaderboardEntry, useLeaderboardData } from "../hooks/use-leaderboard-data.ts";
// Assuming app-styles.css or similar is imported globally (e.g., in main.tsx)
// import "../app-styles.css"; // Import styles if needed locally

// Helper function to format XP (optional)
function formatXp(xp: number): string {
  // Add any desired formatting, e.g., thousands separators
  return xp.toLocaleString();
}

export function DeveloperLeaderboard() {
  const { leaderboardData, isLoading, error } = useLeaderboardData();

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
      <table className="leaderboard-table"> {/* Add specific class for styling */}
        <thead>
          <tr>
            <th>Rank</th>
            <th>Developer</th>
            <th>Comments XP</th>
            <th>Task XP</th>
            <th>Reviews XP</th>
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
              <td>{formatXp(entry.xpByCategory?.comments || 0)}</td>
              <td>{formatXp(entry.xpByCategory?.task || 0)}</td>
              <td>{formatXp(entry.xpByCategory?.reviewRewards || 0)}</td>
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
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
        .leaderboard-table th, .leaderboard-table td {
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 12px;
          text-align: left;
        }
        .leaderboard-table th {
          background: rgba(255, 255, 255, 0.1);
          font-weight: bold;
        }
        .developer-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .avatar {
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          width: 30px;
          height: 30px;
          object-fit: cover;
        }
        .loading-container, .error-container, .info-container {
          padding: 40px;
          text-align: center;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          margin: 20px;
        }
        .loading-spinner {
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top: 3px solid #fff;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .retry-button {
          margin-top: 20px;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          color: white;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .retry-button:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
