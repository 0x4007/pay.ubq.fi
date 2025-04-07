import React, { useState } from "react";
import { DeveloperLeaderboard } from "./developer-leaderboard.tsx";
import { LeaderboardAnalytics } from "./leaderboard-analytics.tsx";

// This component provides a dedicated wrapper for the leaderboard
// with tabs to switch between views
export function LeaderboardRoute() {
  const [activeTab, setActiveTab] = useState<"leaderboard" | "analytics">("leaderboard");

  return (
    <div className="leaderboard-route">
      <div style={{ marginBottom: "1rem" }}>
        <button
          onClick={() => setActiveTab("leaderboard")}
          disabled={activeTab === "leaderboard"}
        >
          Leaderboard
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          disabled={activeTab === "analytics"}
          style={{ marginLeft: "0.5rem" }}
        >
          Analytics
        </button>
      </div>

      {activeTab === "leaderboard" && <DeveloperLeaderboard />}
      {activeTab === "analytics" && <LeaderboardAnalytics />}
    </div>
  );
}
