<div align="center">

# 👨‍💻 Git Repository Statistics & Changelog Generator

**A zero-runtime-dependency Node.js CLI utility that analyzes Git commit history and generates an interactive, self-contained HTML analytics dashboard (`repo-stats.html`) and a collapsible Markdown changelog (`repo-stats.md`).**

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=000" alt="javaScript"/>
  <img src="https://img.shields.io/badge/Node.js-6DA55F?logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/License-GPLv3-blue" alt="License GPL-3.0"/>
  <img src="https://img.shields.io/badge/Version-1.0.0-green" alt="Version 1.0.0"/>
</p>

</div>

### ✨ Key Features

- **Interactive HTML Dashboard:** KPI cards, 6-metric volume banner, GitHub-style contribution heatmap with year selector, SVG code churn timeline (Linear / Log scales), release notes with one-click copy, sticky TOC, live search, print styles, and Light/Dark/System theme toggle.
- **Comprehensive Markdown Report:** Collapsible `<details>` sections for both **Releases & Tags** and daily **Changelog Details**, ASCII activity histograms (time of day, weekday, month), churn hotspots, legacy files, file lifecycle breakdown, and contributors.
- **Repository Overview:** Repo age, active days ratio, current & max streaks, longest gaps, commit/churn records, and dual tech stack rankings (by file touches and by lines changed) with inline SVG language icons.
- **Smart Filtering:** Automatically excludes lock files (`package-lock.json`, `yarn.lock`, `Cargo.lock`, etc.), build folders (`dist/`, `build/`, `vendor/`, etc.), and minified/map assets from statistics while keeping them visible in commit tables.
- **Zero Runtime Dependencies:** Built purely on Node.js standard library (`fs`, `path`, `child_process`). Works completely offline.

### 📋 Requirements

- **Node.js:** `^20.19.0 || ^22.13.0 || >=24`
- **Git:** Available in system `PATH`

### 🚀 Usage

Run directly with Node.js or link globally via `npm link` to use the `repo-stats` command anywhere:

```bash
# Link globally (run once inside the repository folder)
npm link

# Generate HTML dashboard for the current repository (default)
repo-stats
# or without linking:
node git-repo-stats.js

# Generate Markdown report or both formats
repo-stats --md
repo-stats --html --md

# Filter by date range, set custom output folder, and open in browser
repo-stats --since=2026-01-01 --until=2026-12-31 --out=reports --open
repo-stats --since 2026-01-01 --out reports

# Analyze a specific repository
repo-stats /path/to/target-repo
```

### 🏗️ Project Structure

- `git-repo-stats.js` — CLI entry point, argument parser, and pipeline orchestrator
- `git-client.js` — Git subprocess runner (`execFileSync`) and `--raw` / `--numstat` log parser
- `stats.js` — Statistical aggregations, streaks, releases, tech stack, and file lifecycle metrics
- `render-html.js` — Self-contained HTML dashboard and SVG chart generator
- `render-md.js` — Collapsible Markdown report and ASCII histogram generator
- `repo-stats.css` & `repo-stats-client.js` — Inlined dashboard styles and interactive client logic
- `lang-icons.js` — Inline 16×16 SVG language icons and extension aliases
- `utils.js` — Shared formatting, date arithmetic, path normalization, and ignore rules

### 🧪 Development & Testing

```bash
# Run native Node.js test suite (no external test runner required)
npm test

# Run ESLint
npm run lint
```

### 📄 License

GNU General Public License v3.0 (GPL-3.0)

<div align="center">Made with ♥ by <a href="https://github.com/dmibbb" target="_blank" rel="noopener noreferrer">Димасик</a> in 2026</div>
