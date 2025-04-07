# Leaderboard Analytics Dashboard Plan

---

## 1. Core Data Model

- **Entities:**
  - **Contributor (Person)**
  - **Repository**
  - **XP Events**
    - Type
    - Amount
    - Timestamp
  - **Specs (GitHub Issues)**
    - Author (Contributor)
    - Status (open/closed)
    - Quality scores (relevance, readability)
    - Completion rate (closed / total)
  - **Reviews**
    - Lines of code reviewed
    - PRs reviewed
  - **Comments**
    - Quality score (if available)
- **Composite Metric:** Total XP accrued (sum of XP)

---

## 2. Visualization Views

### A. Default View: Stacked Bar Chart
- **Axes:**
  - X-axis: **Contributor**
  - Y-axis: **Total XP accrued**
  - Stack: **Repository**
- **Purpose:** See who contributes most XP and where.
- **Features:**
  - Filter by date range, repo, XP type
  - Tooltip with XP breakdown

---

### B. Spec Quality & Completion View: Scatter Plot
- **Axes:**
  - X-axis: **Specs written**
  - Y-axis: **% Specs Closed**
  - Bubble size: **Avg Spec Quality (relevance/readability)**
  - Color: **Repository**
- **Purpose:** Identify contributors who write many actionable, high-quality specs.
- **Features:**
  - Filter by repo, date
  - Tooltip with spec details

---

### C. Spec Status View: Grouped Bar Chart
- **Axes:**
  - X-axis: **Contributor**
  - Bars: **Specs Open vs. Closed**
  - Grouped by **Repository** or **Time Period**
- **Purpose:** See spec completion rates per contributor.
- **Features:**
  - Filter by repo, date
  - Tooltip with counts and rates

---

### D. Review Activity View: Grouped Bar or Stacked Bar
- **Axes:**
  - X-axis: **Contributor**
  - Y-axis: **Lines of Code Reviewed** or **PRs Reviewed**
  - Grouped or stacked by **Repository**
- **Purpose:** Assess review contributions.
- **Features:**
  - Filter by date, repo
  - Tooltip with review details

---

### E. Comment Quality View: Heatmap or Bar Chart
- **Axes:**
  - X-axis: **Contributor**
  - Y-axis: **Repository** or **Date**
  - Color intensity: **Avg Comment Quality**
- **Purpose:** Spot high-quality communicators.
- **Features:**
  - Filter by date, repo
  - Tooltip with comment stats

---

### F. Time Series View: Line Chart
- **Axes:**
  - X-axis: **Date**
  - Y-axis: **XP accrued** or **Specs closed**
  - Lines: **Contributors**
- **Purpose:** Track progress and trends over time.
- **Features:**
  - Filter by repo, XP type
  - Tooltip with time-specific data

---

## 3. Implementation Phases

**Phase 1:**
- Build **default stacked bar chart** (Contributor x XP x Repo)
- Set up data pipeline for XP events and repo mapping

**Phase 2:**
- Add **spec parsing** (identify specs, compute quality, status)
- Implement **scatter plot** for spec quality/completion

**Phase 3:**
- Add **grouped bar** for spec status
- Add **review activity** charts

**Phase 4:**
- Add **comment quality** heatmap/bar
- Add **time series** views

**Phase 5:**
- Polish UI, add filters, tooltips, export options
- User testing and iteration

---

## 4. UI Design Notes

- **Tabs or dropdowns** to switch between views
- **Consistent contributor axis** across views
- **Filter panel** for repo, date, XP type, quality thresholds
- **Export/share** options for reports

---

## Summary

- Start with the **stacked bar chart** (most actionable, easiest to build).
- Expand to **scatter plots, grouped bars, heatmaps, and time series** for deeper insights.
- Use **separate views** to avoid clutter and tailor insights.
- This phased approach ensures quick wins while enabling rich analytics over time.
