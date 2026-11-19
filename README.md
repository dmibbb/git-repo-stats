# 📊 Git Repo Stats & Changelog Generator (`git-history`)

> Current version: 1.0.0

A zero-dependency Node.js CLI tool that parses `git log` history and generates a detailed daily changelog and visual analytics report in both **Markdown** (`repo-stats.md`) and **HTML** (`repo-stats.html`).

### ✨ Key Features

- **Repository Overview:** Repo age, active vs. calendar days ratio, total commits, net code change, averages per commit/day, longest streaks, and longest breaks.
- **Records & Hotspots:** Highlights the busiest day, highest code churn day, largest single commit, top most frequently modified files, and tech stack breakdown by file extension.
- **Visual Histograms:** Activity distribution by day of the week and by month (rendered as ASCII bars in Markdown and responsive CSS bars with Light/Dark theme support in HTML).
- **Smart Filtering:** Automatically excludes lock files (`package-lock.json`, `yarn.lock`, etc.), build folders (`dist/`, `build/`), and minified files from statistical calculations while keeping them visible in commit tables.
- **Daily Commit Log:** Groups commits by date with clickable file links and collapsible `<details>` lists for large commits.

### 🚀 Usage

Run the script from any directory using Node.js (no `npm install` required):

```bash
# Analyze the current git repository
node path/to/git-history.js

# Analyze a specific repository
node path/to/git-history.js path/to/target-repo
```

The tool will generate `repo-stats.md` and `repo-stats.html` directly in the root of the target repository.
