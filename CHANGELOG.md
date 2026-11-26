## v1.0.1

**Released on 2026/11/26**

### Fixes & Edge Cases

- **Empty repository support:** Gracefully handle initialized Git repositories with zero commits instead of crashing on `git log`.
- **KPI cards truncation:** Prevent long commit subjects in `Largest commit` and `Widest commit` from stretching grid columns or hiding the commit date.
- **Legacy files filtering:** Exclude files modified today (`0 days ago`) from the `Legacy` files ranking.
- **Average metrics formatting:** Strip trailing `.0` from whole average values (e.g., `+130 / -29` instead of `+130.0 / -29.0`).
- **Changelog day summary:** Fix duplicate unique files count in daily summary headers.
- **Release notes clipboard format:** Add blank lines after release header, release date, and `Changes:`, and use `Unreleased changes:` header for unreleased commits.

### UI & Visualization Polish

- **Custom Heatmap period dropdown:** Replace native `<select>` with a styled, rounded custom dropdown menu (`Last 365 days` + active years).
- **Code Churn Timeline scaling:** Scale peak commit bars flush to the top and bottom boundary lines (`+maxVal` / `-maxVal`).
- **Activity by time of day tooltips:** Show full commit count and percentage share on period row hover.
- **Scrollable Contributors card:** Cap max height with vertical scroll so large contributor lists do not stretch the Heatmap row.
- **Changelog table improvements:** Open changed file links in a new tab (`target="_blank"`) and add a top border separator above the file status breakdown in the `Delta` column.
- **Header layout:** Tighten top header spacing and align the theme toggle button with the repository title.

---

## v1.0.0

**Released on 2026/11/23**

### Features & CLI

- **Self-contained HTML dashboard (`repo-stats.html`) & Markdown report (`repo-stats.md`):** Zero-runtime-dependency Node.js CLI working completely offline.
- **Central configuration (`config.js`):** Single configuration module for default CLI modes, output filenames, aggregation limits, and ignored file patterns.
- **Standalone release notes generator (`--changelog`):** Generates release-grouped `repo-stats-changelog.md` from Git tags.
- **CLI filtering & options:** Added `--since=YYYY-MM-DD`, `--until=YYYY-MM-DD`, `--out=DIR`, `--html`, `--md`, `--open`, and `-h` / `--help`.
- **Smart file filtering:** Automatically excludes lockfiles, build artifacts, and minified/source-map assets from statistics while keeping them visible in commit tables (`(ignored)` / `*`).
- **Git rename & binary support:** Properly tracks renamed files (`old => new` and `{old => new}` brace syntax) and binary changes across all stats and links.

### Analytics & Dashboard Widgets

- **Overview & Volume Banner:** Total commits, insertions, deletions, net change, average per commit, unique files, repo age, active days ratio, current & max streaks, and longest gaps.
- **Records:** Clickable KPI cards for record day by commits, record day by churn, largest commit, and widest commit.
- **Contribution Heatmap & Contributors:** GitHub-style activity grid with year selector, extended day tooltips (`+ins / -del`), and clickable contributor breakdown.
- **Activity Patterns:** Histograms by time of day (with peak hour), day of week, and month.
- **Code Churn Timeline:** Interactive SVG diverging bar chart with Linear / Log scale switcher, hover tooltips, and clickable release tag markers.
- **Files, Tech Stack & File Lifecycle:** Tabbed rankings for Frequent, Hotspots, and Legacy files (top 25 by default), Tech Stack by file touches and lines changed (with inline SVG icons for 21 languages), and File Lifecycle breakdown (Added, Modified, Renamed, Deleted).
- **Releases & Changelog Details:** Grouped release cards with one-click `📋 Copy` release notes, collapsible tag ribbon, live debounced search, `Collapse All` / `Expand All`, and hash deep links (`#day-...`, `#commit-...`, `#release-...`).

### UI, Accessibility & Performance

- **3-state theme & Print styles:** System / Dark / Light theme toggle persisted in `localStorage` and print stylesheet that auto-expands all sections.
- **Accessibility & UX:** Sticky Table of Contents, Back-to-Top button, ARIA attributes, keyboard navigation, and `prefers-reduced-motion` support.
- **Performance:** Single-pass data aggregation, `content-visibility: auto` for large changelogs, 200 MB configurable `git log` buffer (`REPO_STATS_MAX_BUFFER`), and optimized Git bounds queries.

### Quality & Tooling

- Comprehensive test suite built on native `node:test` and ESLint configuration.
