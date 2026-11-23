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
