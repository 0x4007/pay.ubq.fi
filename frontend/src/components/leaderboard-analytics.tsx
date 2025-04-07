import React, { useState } from "react";
import { useLeaderboardData } from "../hooks/use-leaderboard-data.ts";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function formatRepoName(sanitizedRepo: string): string {
  const firstUnderscore = sanitizedRepo.indexOf("_");
  if (firstUnderscore === -1) return sanitizedRepo;
  const owner = sanitizedRepo.slice(0, firstUnderscore);
  const repo = sanitizedRepo.slice(firstUnderscore + 1).replace(/_/g, ".");
  return `${owner}/${repo}`;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: "black",
          color: "white",
          border: "1px solid #ccc",
          padding: "10px",
          fontSize: "0.9rem",
          maxWidth: "250px",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "5px", textAlign: "right" }}>{label}</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {payload.map((entry, idx) => (
              <tr key={idx}>
                <td style={{ color: entry.color, textAlign: "right", padding: "2px 4px" }}>
                  {formatRepoName(entry.name)}
                </td>
                <td style={{ textAlign: "right", padding: "2px 4px" }}>
                  {Number(entry.value).toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
};

interface LeaderboardAnalyticsProps {
  initialWeeks?: number;
  initialRepository?: string | null;
}

export function LeaderboardAnalytics({
  initialWeeks = 4,
  initialRepository = null,
}: LeaderboardAnalyticsProps) {
  const [selectedWeeks, setSelectedWeeks] = useState(initialWeeks);
  const [selectedRepository, setSelectedRepository] = useState<string | null>(initialRepository);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const { leaderboardData, isLoading, error } = useLeaderboardData({
    selectedWeeks,
    selectedRepository,
    refreshCounter,
  });

  // Collect repositories with XP > 0 across all users for stacking keys
  const nonZeroRepos = new Set<string>();
  leaderboardData.forEach((entry) => {
    Object.entries(entry.xpByRepository).forEach(([repo, xp]) => {
      if (xp > 0) {
        nonZeroRepos.add(repo);
      }
    });
  });
  const repoKeys = Array.from(nonZeroRepos);

  // Prepare data for Recharts, only including non-zero XP repos
  const chartData = leaderboardData.map((entry) => {
    const dataPoint: Record<string, any> = {
      username: entry.githubUsername,
    };
    repoKeys.forEach((repo) => {
      const xp = entry.xpByRepository[repo] || 0;
      if (xp > 0) {
        dataPoint[repo] = xp;
      }
    });
    return dataPoint;
  });

  return (
    <div style={{ width: "100%", height: "500px" }}>
      <h2>Contributor XP by Repository</h2>

      {/* Filters */}
      <div style={{ marginBottom: "1rem" }}>
        <label>
          Weeks:
          <select
            value={selectedWeeks}
            onChange={(e) => setSelectedWeeks(Number(e.target.value))}
          >
            <option value={0}>All Time</option>
            <option value={1}>1 Week</option>
            <option value={4}>4 Weeks</option>
            <option value={12}>12 Weeks</option>
            <option value={24}>24 Weeks</option>
            <option value={52}>52 Weeks</option>
          </select>
        </label>

        <button onClick={() => setRefreshCounter((c) => c + 1)}>Refresh</button>
      </div>

      {isLoading && <p>Loading leaderboard data...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!isLoading && !error && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="username" angle={-45} textAnchor="end" interval={0} height={100} />
            <YAxis tickFormatter={(value) => Number(value).toFixed(0)} />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} />
            {repoKeys.map((repo, idx) => (
              <Bar
                key={repo}
                dataKey={repo}
                stackId="xp"
                fill={`hsl(${(idx * 60) % 360}, 70%, 50%)`}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default LeaderboardAnalytics;
