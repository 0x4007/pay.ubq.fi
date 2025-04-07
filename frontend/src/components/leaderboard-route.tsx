import React from "react";
import { DeveloperLeaderboard } from "./developer-leaderboard.tsx";

// This component provides a dedicated wrapper for the leaderboard
// that doesn't depend on the global worker context
export function LeaderboardRoute() {
  return (
    <div className="leaderboard-route">
      <DeveloperLeaderboard />
    </div>
  );
}
