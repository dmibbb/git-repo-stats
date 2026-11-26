# 📊 git-repo-stats — Agent & Developer Context

> **Audience:** LLM agents & contributors
> **Purpose:** Full architectural context and project invariants to modify, extend, or debug this codebase safely.

---

## 🎯 1. Project Identity & Mission

**`git-repo-stats`** is a zero-runtime-dependency Node.js CLI that analyzes a Git repository's commit history and produces:

1. **`repo-stats.html`** — a self-contained, interactive analytics dashboard (HTML + inline CSS + inline JS)
2. **`repo-stats.md`** — a Markdown changelog with ASCII histograms

It runs **completely offline**, requires **no `npm install`** for end users, and outputs a single portable HTML file that can be shared by email, committed to a repo, or opened locally.

| Principle                     | Meaning                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Zero runtime dependencies** | Only Node.js stdlib (`fs`, `path`, `child_process`). `devDependencies` (ESLint) are allowed.                                        |
| **Self-contained output**     | The HTML file must work when opened directly via `file://` — no server, no CDN, no external assets.                                 |
| **Offline-first**             | No network calls, no telemetry, no analytics.                                                                                       |
| **XSS-safe by default**       | Every user-controlled string (commit subject, author, tag, file path, repo name) MUST pass through `escapeHtml()` before embedding. |
| **Graceful degradation**      | Empty/unborn repos, missing authors, binary-only commits, weird filenames — must never throw.                                       |
| **Fast on big repos**         | Target: < 5s for 50k commits on modern hardware.                                                                                    |

---

## 🏗️ 2. Architecture & File Map

```
┌──────────────────┐ git CLI       ┌──────────────┐
│ git-repo-stats.js│─────────────▶│ git-client.js│ (fetch + parse raw log)
│ (CLI entry)      │               └──────┬───────┘
└────────┬─────────┘                      │ commits[]
         │                                ▼
         │                       ┌──────────────┐
         ├─────────────────────▶│ stats.js      │ (aggregations)
         │                       └──────┬───────┘
         │                              │ stats object
         │                 ┌────────────┴────────────┐
         │                 ▼                         ▼
         │               ┌──────────────┐ ┌──────────────┐
         │               │ render-md.js │ │ render-html.js│
         │               └──────────────┘ └──────┬───────┘
         │                                       │
         │                              ┌────────┴────────┐
         │                              ▼                 ▼
         │                              repo-stats.md repo-stats.html
         │                              (with inline CSS+JS
         │                              from repo-stats.css
         │                              + repo-stats-client.js)
         ▼
utils.js, lang-icons.js (shared helpers)
```

### Data flow

1. `git log --pretty=... --raw --numstat` → raw string (returns `''` gracefully on unborn `HEAD` with zero commits)
2. `parseRawLog()` splits by `COMMIT_SEP` (`\x1e===COMMIT===\x1e`) → commit objects
3. `groupCommitsByDate()` → `{ 'YYYY-MM-DD': { commits, totalInsertions, ... } }`
4. Pure aggregation functions in `stats.js` compute KPIs, streaks, releases, and distributions
5. Renderers produce HTML/MD strings
6. `wrapInHTMLTemplate()` injects CSS + client JS inline

### File Map

| File                   | Role                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `config.js`            | Configuration file with all defaults                       |
| `git-repo-stats.js`    | CLI entry, arg parsing, orchestration                      |
| `git-client.js`        | Shells out to `git`, parses raw log                        |
| `stats.js`             | Pure aggregation functions (no I/O)                        |
| `render-html.js`       | HTML dashboard renderer                                    |
| `render-md.js`         | Markdown renderer                                          |
| `repo-stats-client.js` | Browser-side JS (theme, search, tabs, dropdown, tooltips)  |
| `repo-stats.css`       | All dashboard styles (light/dark/print)                    |
| `utils.js`             | Shared helpers (formatting, dates, path normalization)     |
| `lang-icons.js`        | Inline SVG icons for 21 languages (+ 31 extension aliases) |
| `test/*.test.js`       | Node's built-in test runner (`node:test`)                  |

---

## 🔒 3. Core Constraints (HARD RULES)

These are **non-negotiable**. Violating any of them breaks the project's value proposition.

1. **NO runtime dependencies.** Do not add anything to `"dependencies"` in `package.json`. Ever. If you need a library, inline the logic.
2. **CommonJS only.** Use `require()` / `module.exports`. No ESM (`import`/`export`). The package targets Node 20+ with `sourceType: 'commonjs'`.
3. **Node.js 20+ only.** Engine constraint: `^20.19.0 || ^22.13.0 || >=24`. Do not use APIs added after Node 20.
4. **Single-file HTML output.** The generated `repo-stats.html` must embed all CSS and JS inline. No `<link>` or external `<script src>`.
5. **Escape everything.** Use `escapeHtml()` for HTML context, `escapePipe()` + `wrapInlineCode()` for Markdown. Test with payloads like `<script>alert(1)</script>` in commit subjects.
6. **No `eval`, no `Function()`, no dynamic code execution.**
7. **Preserve `--no-merges` semantics.** Merge commits are intentionally excluded from all stats.
8. **Keep the "ignored files" contract.** Lock files (`package-lock.json`, `yarn.lock`, etc.), `dist/`, `build/`, `*.min.js`, and generated reports (`repo-stats.html`, `repo-stats.md`, `repo-stats-changelog.md`) are excluded from statistics but MUST remain visible in commit tables (marked with `*` in MD, `(ignored)` in HTML).
9. **Respect `TODO.md` boundaries.** `TODO.md` is the author's backlog — do not implement upcoming features from it unless explicitly asked.

---

## 🎨 4. Code Style

- **ESLint** configured in `eslint.config.js` (`@eslint/js` recommended, separate browser globals block for `repo-stats-client.js`). Run `npm run lint` before committing.
- **JSDoc comments** on every exported function. Keep them short and accurate.
- **Named exports** preferred over default exports.
- **`const` by default**, `let` only when reassignment is needed, never `var`.
- **Semicolons are mandatory**; use **single quotes** for strings and template literals for interpolation.
- **Magic numbers belong in named constants** at the top of the file (see `SVG_HEIGHT`, `Y_AXIS_WIDTH`, `MAX_FILES_PER_COMMIT`, etc.).

---

## ⌨️ 5. CLI Interface

```
repo-stats [path] [options]

Options:
--since=YYYY-MM-DD   Filter commits starting from this date
--until=YYYY-MM-DD   Filter commits up to this date
--out=DIR            Custom output directory
--html               Generate HTML (default if no flags)
--md                 Generate Markdown
--changelog          Generate standalone release changelog (repo-stats-changelog.md)
--open               Open HTML in default browser
-h, --help           Show help
```

**Default behavior:** no flags → HTML only, output in repo root.

**Flag parsing rules:**

- Supports both `--flag=value` and `--flag value`
- Unknown flags → `console.warn` + continue (do NOT crash)
- Invalid dates → warn + ignore (do NOT crash)
- `--since > --until` → warn (but still run)

---

## 🧪 6. Testing Strategy

- **Test runner:** Node's built-in `node:test` (no Jest, no Mocha). Run with `npm test`.
- **Coverage target:** every exported function in `utils.js`, `stats.js`, `git-client.js` has at least one test.
- **Edge cases are first-class citizens:**
  - Empty/unborn repos (`git init` with zero commits), empty commits (`--allow-empty`)
  - Missing authors → `'Unknown'`
  - XSS payloads in subjects/authors/tags
  - Git rename syntax: `old => new`, `src/{old => new}.js`, `{a => b}/c.js`
  - Binary files (`-\t-\tfile.png`)
  - Very long file paths & KPI commit subjects, CRLF line endings, Unicode / emoji in subjects
- **When adding a feature, add 3+ tests:** happy path, edge case, empty/null input.

---

## 🚫 7. Do's and Don'ts

### ✅ Do

- Use `execFileSync` (not `execSync`) when possible — it's safer and avoids shell injection.
- Normalize git paths with `normalizeGitPath()` before using them as Map keys.
- Use UTC dates internally (`Date.UTC`, `getUTCFullYear`) to avoid DST bugs.
- Keep `render-html.js` functions pure (input → HTML string, no side effects).
- Use the `--release` CSS variable for release/tag pills, badges, timeline markers, and tagged commit highlights instead of hardcoding `--accent`.
- Keep `min-width: 0` on `.card` and `.kpi-sub-subject` / `.kpi-sub-date` structure in KPI cards so long commit subjects truncate cleanly with ellipsis without stretching grid columns or hiding the date.
- Test with `makeCommit()` helper from `test/stats.test.js` when adding stat tests.
- Pass `{ cause: err }` when re-throwing wrapped errors inside `catch (err)` blocks.

### ❌ Don't

- Don't add a dependency "just for convenience" (no `chalk`, no `commander`, no `dayjs`, no `lodash`).
- Don't use `innerHTML` on the client side without `escapeHtml()` — even for "trusted" data.
- Don't hardcode file counts (use `TOP_FILES_COUNT = 5`, `MAX_FILES_PER_COMMIT = 10`).
- Don't break the `data-*` attribute contract — client JS relies on `data-date`, `data-time`, `data-row-id`, `data-files` (newline-separated normalized file paths on `.commit-row` so search matches renamed files like `src/{old => new}.js` by their normalized path), `data-filter-file` (used for files, extensions, lifecycle statuses, and `Author: <name>`), `data-release-id`, `data-tab`, `data-panel`, `data-heatmap-view`, and `data-value` (on `.heatmap-option`).
- Don't hijack native browser keyboard shortcuts (like `Ctrl+K` / `Cmd+K` or `Ctrl+F`) — only handle `Escape` inside `.search-input` and `.heatmap-dropdown`.
- Don't remove the `content-visibility: auto` optimization on `.changelog-day` — it's critical for rendering large dashboards.
- Don't change `COMMIT_SEP` / `FIELD_SEP` without updating the parser AND tests.

---

## ⚠️ 8. Known Limitations

| Limitation                       | Reason                                                                       | Workaround                           |
| -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| 200 MB git log buffer            | Default cap in `config.js`; protects memory                                  | Set `REPO_STATS_MAX_BUFFER` env var  |
| No merge commits                 | `--no-merges` is hardcoded                                                   | By design — merge commits skew stats |
| Timezone for "today"             | Uses local calendar date; commits use author's local timezone (`--date=iso`) | Documented; acceptable for CLI tool  |
| No streaming parser              | Whole log loaded into memory                                                 | Fine up to ~100k commits             |
| No PR/issue linking              | Out of scope for v1.0                                                        | Could be added via `--repo-url` flag |
| No `--author` / `--path` filters | Not implemented yet                                                          | High-priority feature request        |

---

## ❌ 9. Consciously Rejected / Out of Scope

- **Filtering changelog by tag name on pill click:** searching by tag string (e.g., `v1.0.0`) hides all untagged commits belonging to that release. Direct navigation to the release card (`#release-...`) is more logical and comprehensive.
- **Preserving expanded `<details>` state on "Back":** standard browser behavior applies on local `file://` reload; storing hundreds of block states in `sessionStorage` adds complexity with minimal benefit.
- **Exporting individual `.md` files per release:** clutters the output directory. The `📋 Copy` button in HTML and the `Releases` section in `repo-stats.md` are sufficient.
- **Streaming `git log` parsing via `spawn` + `readline`:** heavy architectural complication needed only for Chromium-level monorepos. The 200 MB `MAX_BUFFER` cap covers 99.9% of use cases.
- **First-response time metric by PR:** requires external GitHub/GitLab API data, breaking the offline, zero-dependency philosophy.
- **Custom `Ctrl+K` / `Cmd+K` search shortcut:** hijacks native browser address/search bar shortcuts on local `file://` pages. Keep keyboard handling scoped to `Escape` inside `.search-input`.

---

## 🔧 10. When Modifying X, Remember Y

| If you change…                 | Also check…                                                           |
| ------------------------------ | --------------------------------------------------------------------- |
| `git-client.js` parser         | `test/git-client.test.js` — 7+ test cases depend on exact field order |
| `stats.js` aggregation         | Both renderers (`render-html.js` and `render-md.js`)                  |
| `render-html.js` DOM structure | `repo-stats-client.js` (CSS selectors + `data-*` attrs)               |
| `repo-stats.css` class names   | Both `render-html.js` AND `repo-stats-client.js`                      |
| `utils.js` exports             | All files import from it — check for breaking changes                 |
| `COMMIT_SEP` / `FIELD_SEP`     | `parseRawLog`, `parseCommitEntry`, and all tests                      |
| `package.json` engines         | CI matrix, README, `printHelp()` output                               |
| `config.js` defaults           | `test/git-repo-stats.test.js` and `utils.js` re-exports               |

---

## 🎁 11. Key Features & UI Rules to Preserve

When refactoring, **do not regress** these user-visible features:

- 🌓 3-state theme toggle (System → Dark → Light), persisted in `localStorage['repo-stats-theme']`
- 🔍 Debounced search (150ms) with clear button, `Esc` to reset, result counter
- 🗓️ GitHub-style contribution heatmap with custom rounded period dropdown (`.heatmap-dropdown`)
- 📉 SVG churn timeline with Linear/Log toggle, flush peak bars, and hover tooltips
- 🏷️ One-click "Copy release notes" button matching `repo-stats-changelog.md` formatting (with `navigator.clipboard` + `execCommand` fallback)
- 🖨️ Print styles that auto-expand all `<details>` before printing
- ⌨️ Sticky TOC with active-section highlighting
- 🎯 Clickable KPI cards that jump to the record day/commit
- 📂 Click-to-filter navigation (click any file badge, extension, lifecycle bar, or contributor row → jumps to changelog filtered by that query)
- 🔗 Hash deep links (`#day-YYYY-MM-DD`, `#commit-...`, `#release-...`) that auto-expand parent `<details>` and highlight the target on page load / `hashchange`

### Icon & Emoji Rules

- **Section titles (`.section-title`):** emoji on the **left**, must match 1:1 with the corresponding Sticky TOC link.
- **Cards without header controls (KPI cards, histograms, Contributors):** large emoji (`1.7rem`) on the **right** via `.card-icon`; `.card-title` contains plain text only.
- **Cards with header controls (tabs, `.heatmap-dropdown`, chart legend):** inline emoji on the **left** inside `.card-title` (may echo its parent section's emoji, must not duplicate a neighboring card's emoji in the same row).
- **HTML ↔ Markdown parity:** keep section and metric icons synchronized between `render-html.js` and `render-md.js`.
- **Search-sensitive labels:** NEVER add emojis inside `.delta-breakdown` (`Added:`, `Modified:`, `Renamed:`, `Deleted:`) or `.commit-author` (`Author:`), because click-to-filter navigation matches against `row.textContent`.

---

## 📦 12. Release Checklist

Before tagging a release:

- [ ] `npm run lint` — clean
- [ ] `npm test` — all green
- [ ] Update `version` in `package.json` and `README.md`
- [ ] Generate / update `CHANGELOG.md`
