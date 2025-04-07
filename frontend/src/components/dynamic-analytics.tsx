import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useLeaderboardData } from "../hooks/use-leaderboard-data.ts";

const DIMENSIONS = [
  { key: "contributor", label: "Contributor" },
  { key: "repository", label: "Repository" },
  { key: "time", label: "Time" },
  { key: "xpAmount", label: "XP Amount" },
  { key: "xpType", label: "XP Type" },
  { key: "specStatus", label: "Spec Status" },
  { key: "issueSpecificationXp", label: "Spec XP" },
  { key: "issueAuthorXp", label: "Issue Author XP" },
  { key: "issueAssigneeXp", label: "Issue Assignee XP" },
  { key: "issueCollaboratorXp", label: "Issue Collaborator XP" },
  { key: "pullAuthorXp", label: "Pull Author XP" },
  { key: "pullAssigneeXp", label: "Pull Assignee XP" },
  { key: "pullCollaboratorXp", label: "Pull Collaborator XP" },

  { key: "avgReadability_issueSpecification", label: "Avg Readability (Spec)" },
  { key: "avgRelevance_issueSpecification", label: "Avg Relevance (Spec)" },
  { key: "avgWordCount_issueSpecification", label: "Avg Word Count (Spec)" },
  { key: "totalWords_issueSpecification", label: "Total Words (Spec)" },

  { key: "avgReadability_issueAuthor", label: "Avg Readability (Issue Author)" },
  { key: "avgRelevance_issueAuthor", label: "Avg Relevance (Issue Author)" },
  { key: "avgWordCount_issueAuthor", label: "Avg Word Count (Issue Author)" },
  { key: "totalWords_issueAuthor", label: "Total Words (Issue Author)" },

  { key: "avgReadability_issueAssignee", label: "Avg Readability (Issue Assignee)" },
  { key: "avgRelevance_issueAssignee", label: "Avg Relevance (Issue Assignee)" },
  { key: "avgWordCount_issueAssignee", label: "Avg Word Count (Issue Assignee)" },
  { key: "totalWords_issueAssignee", label: "Total Words (Issue Assignee)" },

  { key: "avgReadability_issueCollaborator", label: "Avg Readability (Issue Collaborator)" },
  { key: "avgRelevance_issueCollaborator", label: "Avg Relevance (Issue Collaborator)" },
  { key: "avgWordCount_issueCollaborator", label: "Avg Word Count (Issue Collaborator)" },
  { key: "totalWords_issueCollaborator", label: "Total Words (Issue Collaborator)" },

  { key: "avgReadability_pullAuthor", label: "Avg Readability (Pull Author)" },
  { key: "avgRelevance_pullAuthor", label: "Avg Relevance (Pull Author)" },
  { key: "avgWordCount_pullAuthor", label: "Avg Word Count (Pull Author)" },
  { key: "totalWords_pullAuthor", label: "Total Words (Pull Author)" },

  { key: "avgReadability_pullAssignee", label: "Avg Readability (Pull Assignee)" },
  { key: "avgRelevance_pullAssignee", label: "Avg Relevance (Pull Assignee)" },
  { key: "avgWordCount_pullAssignee", label: "Avg Word Count (Pull Assignee)" },
  { key: "totalWords_pullAssignee", label: "Total Words (Pull Assignee)" },

  { key: "avgReadability_pullCollaborator", label: "Avg Readability (Pull Collaborator)" },
  { key: "avgRelevance_pullCollaborator", label: "Avg Relevance (Pull Collaborator)" },
  { key: "avgWordCount_pullCollaborator", label: "Avg Word Count (Pull Collaborator)" },
  { key: "totalWords_pullCollaborator", label: "Total Words (Pull Collaborator)" },
];

export function DynamicAnalytics() {
  const [primary, setPrimary] = useState("contributor");
  const [secondary, setSecondary] = useState("repository");
  const [tertiary, setTertiary] = useState("xpAmount");

  const { leaderboardData, isLoading, error } = useLeaderboardData({
    selectedWeeks: 4,
    selectedRepository: null,
    refreshCounter: 0,
  });

  const [metadataMap, setMetadataMap] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    async function loadPermitMetadata() {
      const dbRequest = indexedDB.open("ubiquityCache");
      dbRequest.onerror = (e) => console.error("Error opening DB", e);
      dbRequest.onsuccess = () => {
        const db = dbRequest.result;
        const tx = db.transaction("permitMetadata", "readonly");
        const store = tx.objectStore("permitMetadata");
        const getAllRequest = store.getAll();
        const getAllKeysRequest = store.getAllKeys();

        getAllRequest.onsuccess = () => {
          getAllKeysRequest.onsuccess = () => {
            const keys = getAllKeysRequest.result;
            const values = getAllRequest.result;
            const map: Record<string, Record<string, any>> = {};

            keys.forEach((key: string, idx: number) => {
              const val = values[idx];
              if (!val || !val.metadata || !val.metadata.output) return;

              const output = val.metadata.output;
              map[key] = {};

              for (const userKey in output) {
                const userData = output[userKey];
                const commentGroups: Record<string, any> = {};

                for (const comment of userData.comments || []) {
                  const type = comment.commentType;
                  if (!commentGroups[type]) {
                    commentGroups[type] = {
                      xp: 0,
                      count: 0,
                      totalWords: 0,
                      totalReadability: 0,
                      totalRelevance: 0,
                      totalWordCount: 0,
                    };
                  }
                  const group = commentGroups[type];
                  const score = comment.score || {};

                  group.xp += score.reward || 0;
                  group.count += 1;
                  group.totalWords += score.words?.wordCount || 0;
                  group.totalReadability += score.readability?.fleschKincaid || 0;
                  group.totalRelevance += score.relevance || 0;
                  group.totalWordCount += score.words?.wordCount || 0;
                }

                // Compute averages
                for (const type in commentGroups) {
                  const g = commentGroups[type];
                  const count = g.count || 1;
                  g.avgReadability = g.totalReadability / count;
                  g.avgRelevance = g.totalRelevance / count;
                  g.avgWordCount = g.totalWordCount / count;
                }

                map[key][userKey] = commentGroups;
              }
            });

            setMetadataMap(map);
          };
        };
      };
    }

    loadPermitMetadata();
  }, []);

  function getMetrics(contributor: string, repo: string) {
    const issueUrl = Object.keys(metadataMap).find((url) =>
      url.includes(repo)
    );
    if (!issueUrl) return {};

    const userMap = metadataMap[issueUrl];
    if (!userMap) return {};

    const commentGroups = userMap[contributor];
    if (!commentGroups) return {};

    const spec = commentGroups["ISSUE_SPECIFICATION"] || {};
    const issueAuthor = commentGroups["ISSUE_AUTHOR"] || {};
    const issueAssignee = commentGroups["ISSUE_ASSIGNEE"] || {};
    const issueCollaborator = commentGroups["ISSUE_COLLABORATOR"] || {};
    const pullAuthor = commentGroups["PULL_AUTHOR"] || {};
    const pullAssignee = commentGroups["PULL_ASSIGNEE"] || {};
    const pullCollaborator = commentGroups["PULL_COLLABORATOR"] || {};

    return {
      issueSpecificationXp: spec.xp || 0,
      issueAuthorXp: issueAuthor.xp || 0,
      issueAssigneeXp: issueAssignee.xp || 0,
      issueCollaboratorXp: issueCollaborator.xp || 0,
      pullAuthorXp: pullAuthor.xp || 0,
      pullAssigneeXp: pullAssignee.xp || 0,
      pullCollaboratorXp: pullCollaborator.xp || 0,

      avgReadability_issueSpecification: spec.avgReadability || 0,
      avgRelevance_issueSpecification: spec.avgRelevance || 0,
      avgWordCount_issueSpecification: spec.avgWordCount || 0,
      totalWords_issueSpecification: spec.totalWords || 0,

      avgReadability_issueAuthor: issueAuthor.avgReadability || 0,
      avgRelevance_issueAuthor: issueAuthor.avgRelevance || 0,
      avgWordCount_issueAuthor: issueAuthor.avgWordCount || 0,
      totalWords_issueAuthor: issueAuthor.totalWords || 0,

      avgReadability_issueAssignee: issueAssignee.avgReadability || 0,
      avgRelevance_issueAssignee: issueAssignee.avgRelevance || 0,
      avgWordCount_issueAssignee: issueAssignee.avgWordCount || 0,
      totalWords_issueAssignee: issueAssignee.totalWords || 0,

      avgReadability_issueCollaborator: issueCollaborator.avgReadability || 0,
      avgRelevance_issueCollaborator: issueCollaborator.avgRelevance || 0,
      avgWordCount_issueCollaborator: issueCollaborator.avgWordCount || 0,
      totalWords_issueCollaborator: issueCollaborator.totalWords || 0,

      avgReadability_pullAuthor: pullAuthor.avgReadability || 0,
      avgRelevance_pullAuthor: pullAuthor.avgRelevance || 0,
      avgWordCount_pullAuthor: pullAuthor.avgWordCount || 0,
      totalWords_pullAuthor: pullAuthor.totalWords || 0,

      avgReadability_pullAssignee: pullAssignee.avgReadability || 0,
      avgRelevance_pullAssignee: pullAssignee.avgRelevance || 0,
      avgWordCount_pullAssignee: pullAssignee.avgWordCount || 0,
      totalWords_pullAssignee: pullAssignee.totalWords || 0,

      avgReadability_pullCollaborator: pullCollaborator.avgReadability || 0,
      avgRelevance_pullCollaborator: pullCollaborator.avgRelevance || 0,
      avgWordCount_pullCollaborator: pullCollaborator.avgWordCount || 0,
      totalWords_pullCollaborator: pullCollaborator.totalWords || 0,
    };
  }

  const flatData = leaderboardData.flatMap((entry) => {
    return Object.entries(entry.xpByRepository).map(([repo, xp]) => {
      const metrics = getMetrics(entry.githubUsername, repo);
      const commentGroups = getMetrics(entry.githubUsername, repo);
      let dominantType = "Unknown";
      let maxXp = 0;
      for (const key of Object.keys(commentGroups)) {
        if (key.endsWith("Xp")) {
          const val = (commentGroups as any)[key];
          if (typeof val === "number" && val > maxXp) {
            maxXp = val;
            dominantType = key.replace("Xp", "");
          }
        }
      }

      return {
        contributor: entry.githubUsername,
        repository: repo,
        time: "N/A",
        xpAmount: xp,
        xpType: dominantType,
        specStatus: "Unknown", // Placeholder, no status info yet
        ...metrics,
      };
    });
  });

  const categoricalDimensions = new Set([
    "contributor",
    "repository",
    "time",
    "xpType",
    "specStatus",
  ]);

  const continuousDimensions = new Set([
    "xpAmount",
    "issueSpecificationXp",
    "issueAuthorXp",
    "issueAssigneeXp",
    "issueCollaboratorXp",
    "pullAuthorXp",
    "pullAssigneeXp",
    "pullCollaboratorXp",
    "avgReadability_issueSpecification",
    "avgRelevance_issueSpecification",
    "avgWordCount_issueSpecification",
    "totalWords_issueSpecification",
    "avgReadability_issueAuthor",
    "avgRelevance_issueAuthor",
    "avgWordCount_issueAuthor",
    "totalWords_issueAuthor",
    "avgReadability_issueAssignee",
    "avgRelevance_issueAssignee",
    "avgWordCount_issueAssignee",
    "totalWords_issueAssignee",
    "avgReadability_issueCollaborator",
    "avgRelevance_issueCollaborator",
    "avgWordCount_issueCollaborator",
    "totalWords_issueCollaborator",
    "avgReadability_pullAuthor",
    "avgRelevance_pullAuthor",
    "avgWordCount_pullAuthor",
    "totalWords_pullAuthor",
    "avgReadability_pullAssignee",
    "avgRelevance_pullAssignee",
    "avgWordCount_pullAssignee",
    "totalWords_pullAssignee",
    "avgReadability_pullCollaborator",
    "avgRelevance_pullCollaborator",
    "avgWordCount_pullCollaborator",
    "totalWords_pullCollaborator",
  ]);

  let chartType: "stackedBar" | "scatter" = "stackedBar";

  if (
    continuousDimensions.has(primary) &&
    continuousDimensions.has(secondary)
  ) {
    chartType = "scatter";
  } else if (
    categoricalDimensions.has(primary) &&
    categoricalDimensions.has(secondary)
  ) {
    chartType = "stackedBar";
  } else if (
    categoricalDimensions.has(primary) &&
    continuousDimensions.has(secondary)
  ) {
    chartType = "stackedBar";
  } else if (
    continuousDimensions.has(primary) &&
    categoricalDimensions.has(secondary)
  ) {
    chartType = "scatter";
  } else {
    chartType = "stackedBar";
  }

  return (
    <div style={{ width: "100%", height: "600px" }}>
      <h2>Dynamic Analytics Explorer</h2>

<div
  style={{
    marginBottom: "1rem",
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap",
    border: "1px solid #888",
    borderRadius: "8px",
    padding: "1rem",
    background: "transparent",
  }}
>
  <label style={{ display: "flex", flexDirection: "column", fontWeight: "bold" }}>
    Primary Dimension
    <select
      value={primary}
      onChange={(e) => setPrimary(e.target.value)}
      style={{ padding: "0.3rem", fontSize: "1rem" }}
    >
      {DIMENSIONS.map((d) => (
        <option key={d.key} value={d.key}>
          {d.label}
        </option>
      ))}
    </select>
  </label>

  <label style={{ display: "flex", flexDirection: "column", fontWeight: "bold" }}>
    Secondary Dimension
    <select
      value={secondary}
      onChange={(e) => setSecondary(e.target.value)}
      style={{ padding: "0.3rem", fontSize: "1rem" }}
    >
      {DIMENSIONS.map((d) => (
        <option key={d.key} value={d.key}>
          {d.label}
        </option>
      ))}
    </select>
  </label>

  <label style={{ display: "flex", flexDirection: "column", fontWeight: "bold" }}>
    Tertiary Dimension
    <select
      value={tertiary}
      onChange={(e) => setTertiary(e.target.value)}
      style={{ padding: "0.3rem", fontSize: "1rem" }}
    >
      {DIMENSIONS.map((d) => (
        <option key={d.key} value={d.key}>
          {d.label}
        </option>
      ))}
    </select>
  </label>
</div>

      {isLoading && <p>Loading data...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!isLoading && !error && (
        <>
          {chartType === "stackedBar" && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flatData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={primary} angle={-45} textAnchor="end" interval={0} height={100} />
                <YAxis />
                <Tooltip contentStyle={{ backgroundColor: "#222", color: "#fff", border: "1px solid #555" }} />
                <Legend verticalAlign="top" height={36} />
                {Array.from(new Set(flatData.map((d) => d[secondary]))).map((key, idx) => (
                  <Bar
                    key={key}
                    dataKey={(d) => ((d as any)[secondary] === key ? (d as any).xpAmount : 0)}
                    name={key}
                    stackId="stack"
                    fill={`hsl(${(idx * 60) % 360}, 70%, 50%)`}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartType === "scatter" && (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={primary} name={primary} />
                <YAxis dataKey={secondary} name={secondary} />
                <ZAxis dataKey={tertiary} range={[50, 500]} name={tertiary} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ backgroundColor: "#222", color: "#fff", border: "1px solid #555" }}
                />
                <Legend />
                <Scatter
                  name="Data Points"
                  data={flatData}
                  fill="#8884d8"
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
}

export default DynamicAnalytics;
