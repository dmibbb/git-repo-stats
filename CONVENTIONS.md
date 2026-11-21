# 📊 git-repo-stats — AI Context

> **Project version:** 1.0.0 · **Last updated:** 2026-11-22
> **Audience:** LLM agents (Claude, GPT, Cursor, Copilot, Qwen, etc.)
> **Purpose:** Give an AI assistant full context to modify, extend, or debug this project without re-reading the whole codebase.

---

## 🎯 1. Project Identity

**`git-repo-stats`** is a zero-runtime-dependency Node.js CLI that analyzes a Git repository's commit history and produces:

1. **`repo-stats.html`** — a self-contained, interactive analytics dashboard (HTML + inline CSS + inline JS)
2. **`repo-stats.md`** — a Markdown changelog with ASCII histograms

It runs **completely offline**, requires **no `npm install`** for end users, and outputs a single portable HTML file that can be shared by email, committed to a repo, or opened locally.

### Target users

- Solo developers wanting a "GitHub-style" stats page for their own repo
- Teams doing retrospectives or release notes
- OSS maintainers generating public contribution dashboards

---

## 🧭 2. Mission & Philosophy

| Principle                     | Meaning                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Zero runtime dependencies** | Only Node.js stdlib (`fs`, `path`, `child_process`). `devDependencies` (ESLint) are allowed.                                        |
| **Self-contained output**     | The HTML file must work when opened directly via `file://` — no server, no CDN, no external assets.                                 |
| **Offline-first**             | No network calls, no telemetry, no analytics.                                                                                       |
| **XSS-safe by default**       | Every user-controlled string (commit subject, author, tag, file path, repo name) MUST pass through `escapeHtml()` before embedding. |
| **Graceful degradation**      | Empty repos, missing authors, binary-only commits, weird filenames — must never throw.                                              |
| **Fast on big repos**         | Target: < 5s for 50k commits on modern hardware.                                                                                    |

---

## 🏗️ 3. Architecture Overview

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

### 🏂 Data flow

1. `git log --pretty=... --raw --numstat` → raw string
2. `parseRawLog()` splits by `COMMIT_SEP` (`\x1e===COMMIT===\x1e`) → commit objects
3. `groupCommitsByDate()` → `{ 'YYYY-MM-DD': { commits, totalInsertions, ... } }`
4. 19 aggregation functions in `stats.js` compute KPIs
5. Renderers produce HTML/MD strings
6. `wrapInHTMLTemplate()` injects CSS + client JS inline

---

## 📁 4. File Map

| File                   | Role                                                       | Lines      |
| ---------------------- | ---------------------------------------------------------- | ---------- |
| `git-repo-stats.js`    | CLI entry, arg parsing, orchestration                      | ~280       |
| `git-client.js`        | Shells out to `git`, parses raw log                        | ~180       |
| `stats.js`             | Pure aggregation functions (no I/O)                        | ~500       |
| `render-html.js`       | HTML dashboard renderer                                    | ~900       |
| `render-md.js`         | Markdown renderer                                          | ~350       |
| `repo-stats-client.js` | Browser-side JS (theme, search, tabs, tooltips)            | ~450       |
| `repo-stats.css`       | All dashboard styles (light/dark/print)                    | ~900       |
| `utils.js`             | Shared helpers (formatting, dates, path normalization)     | ~250       |
| `lang-icons.js`        | Inline SVG icons for 21 languages (+ 31 extension aliases) | ~120       |
| `test/*.test.js`       | Node's built-in test runner (`node:test`)                  | ~900 total |

---

## 🔒 5. Core Constraints (HARD RULES)

These are **non-negotiable**. Violating any of them breaks the project's value proposition.

1. **NO runtime dependencies.** Do not add anything to `"dependencies"` in `package.json`. Ever. If you need a library, inline the logic.
2. **CommonJS only.** Use `require()` / `module.exports`. No ESM (`import`/`export`). The package targets Node 20+ with `sourceType: 'commonjs'`.
3. **Node.js 20+ only.** Engine constraint: `^20.19.0 || ^22.13.0 || >=24`. Do not use APIs added after Node 20.
4. **Single-file HTML output.** The generated `repo-stats.html` must embed all CSS and JS inline. No `<link>` or external `<script src>`.
5. **Escape everything.** Use `escapeHtml()` for HTML context, `escapePipe()` + `wrapInlineCode()` for Markdown. Test with payloads like `<script>alert(1)</script>` in commit subjects.
6. **No `eval`, no `Function()`, no dynamic code execution.**
7. **Preserve `--no-merges` semantics.** Merge commits are intentionally excluded from all stats.
8. **Keep the "ignored files" contract.** Lock files (`package-lock.json`, `yarn.lock`, etc.), `dist/`, `build/`, `*.min.js` are excluded from statistics but MUST remain visible in commit tables (marked with `*` in MD, `(ignored)` in HTML).

---

## 🎨 6. Code Style

- **ESLint** with `@eslint/js` recommended config. Run `npm run lint` before committing.
- **JSDoc comments** on every exported function. Keep them short and accurate.
- **Named exports** preferred over default exports.
- **`const` by default**, `let` only when reassignment is needed, never `var`.
- **No semicolon-less style** — semicolons are mandatory.
- **Single quotes** for strings, template literals for interpolation.
- **`argsIgnorePattern: '^_'`** for unused function arguments (ESLint rule).
- **`repo-stats-client.js` is linted separately** with `globals.browser` — do NOT add Node globals to it.
- **Magic numbers belong in named constants** at the top of the file (see `SVG_HEIGHT`, `Y_AXIS_WIDTH`, `MAX_FILES_PER_COMMIT`, etc.).

---

## ⌨️ 7. CLI Interface

```
repo-stats [path] [options]
Options:
--since=YYYY-MM-DD Filter commits starting from this date
--until=YYYY-MM-DD Filter commits up to this date
--out=DIR Custom output directory
--html Generate HTML (default if no flags)
--md Generate Markdown
--open Open HTML in default browser
-h, --help Show help
```

**Default behavior:** no flags → HTML only, output in repo root.

**Flag parsing rules:**

- Supports both `--flag=value` and `--flag value`
- Unknown flags → `console.warn` + continue (do NOT crash)
- Invalid dates → warn + ignore (do NOT crash)
- `--since > --until` → warn (but still run)

---

## 🧪 8. Testing Strategy

- **Test runner:** Node's built-in `node:test` (no Jest, no Mocha).
- **Run:** `npm test`
- **Coverage target:** every exported function in `utils.js`, `stats.js`, `git-client.js` has at least one test.
- **Edge cases are first-class citizens.** Existing tests cover:
  - Empty repos, empty commits (`--allow-empty`)
  - Missing authors → `'Unknown'`
  - XSS payloads in subjects/authors/tags
  - Git rename syntax: `old => new`, `src/{old => new}.js`, `{a => b}/c.js`
  - Binary files (`-\t-\tfile.png`)
  - Very long file paths
  - CRLF line endings
  - Unicode / emoji in subjects
- **When adding a feature, add 3+ tests:** happy path, edge case, empty/null input.

---

## 🚫 9. Do's and Don'ts

### ✅ Do

- Use `execFileSync` (not `execSync`) when possible — it's safer and avoids shell injection.
- Normalize git paths with `normalizeGitPath()` before using them as Map keys.
- Use UTC dates internally (`Date.UTC`, `getUTCFullYear`) to avoid DST bugs.
- Keep `render-html.js` functions pure (input → HTML string, no side effects).
- Test with `makeCommit()` helper from `test/stats.test.js` when adding stat tests.
- Pass `{ cause: err }` when re-throwing wrapped errors inside `catch (err)` blocks (enforced by ESLint 10 `preserve-caught-error` rule).

### ❌ Don't

- Don't add a dependency "just for convenience" (no `chalk`, no `commander`, no `dayjs`, no `lodash`).
- Don't use `innerHTML` on the client side without `escapeHtml()` — even for "trusted" data.
- Don't hardcode file counts (use `TOP_FILES_COUNT = 5`, `MAX_FILES_PER_COMMIT = 10`).
- Don't break the `data-*` attribute contract — the client JS relies on `data-date`, `data-time`, `data-row-id`, `data-filter-file`, `data-release-id`, `data-tab`, `data-panel`, `data-heatmap-view`.
- Don't remove the `content-visibility: auto` optimization on `.changelog-day` — it's critical for rendering large dashboards.
- Don't change `COMMIT_SEP` / `FIELD_SEP` without updating the parser AND tests.

---

## ⚠️ 10. Known Limitations

| Limitation                       | Reason                                                                       | Workaround                           |
| -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| 200 MB git log buffer            | Default cap in `utils.js`; protects memory                                   | Set `REPO_STATS_MAX_BUFFER` env var  |
| No merge commits                 | `--no-merges` is hardcoded                                                   | By design — merge commits skew stats |
| Timezone for "today"             | Uses local calendar date; commits use author's local timezone (`--date=iso`) | Documented; acceptable for CLI tool  |
| No streaming parser              | Whole log loaded into memory                                                 | Fine up to ~100k commits             |
| No PR/issue linking              | Out of scope for v1.0                                                        | Could be added via `--repo-url` flag |
| No `--author` / `--path` filters | Not implemented yet                                                          | High-priority feature request        |

---

## ❌ 10.5. Consciously Rejected / Out of Scope

The following features or changes were explicitly evaluated and rejected to preserve the project's core philosophy (zero-dependency, offline-first, simple architecture).

- **Filtering changelog by tag name on pill click** (#2)
  - Searching by tag string (e.g., `v1.0.0`) would hide all untagged commits belonging to that release. The current direct navigation to the release card (`#release-...`) is much more logical and comprehensive.

- **Preserving expanded `<details>` state on "Back"** (#10)
  - Standard browser behavior applies on local `file://` reload. Storing the state of hundreds of blocks in `sessionStorage` would overcomplicate the code with no real user benefit.

- **Exporting individual `.md` files per release** (#17)
  - Clutters the user's output directory. The `📋 Copy` button in the HTML dashboard and the consolidated `Releases` section in `repo-stats.md` are more than sufficient.

- **Streaming `git log` parsing via `spawn` + `readline`** (#20.2)
  - Heavy architectural complication needed only for Chromium-level monorepos. Raising `MAX_BUFFER` to 200 MB is more than enough for 99.9% of use cases.

- **First-response time metric by PR** (#16)
  - Requires external GitHub/GitLab API data, which directly breaks the core concept of an offline, zero-dependency utility.

- **Separate ESLint config for `repo-stats-client.js`** (#22)
  - Unnecessary. It is already configured correctly — the file is linted in a separate block with `globals.browser` in `eslint.config.js`.

---

## 🔧 11. When Modifying X, Remember Y

| If you change…                 | Also check…                                                           |
| ------------------------------ | --------------------------------------------------------------------- |
| `git-client.js` parser         | `test/git-client.test.js` — 7+ test cases depend on exact field order |
| `stats.js` aggregation         | Both renderers (`render-html.js` and `render-md.js`)                  |
| `render-html.js` DOM structure | `repo-stats-client.js` (CSS selectors + `data-*` attrs)               |
| `repo-stats.css` class names   | Both `render-html.js` AND `repo-stats-client.js`                      |
| `utils.js` exports             | All files import from it — check for breaking changes                 |
| `COMMIT_SEP` / `FIELD_SEP`     | `parseRawLog`, `parseCommitEntry`, and all tests                      |
| `package.json` engines         | CI matrix, README, `printHelp()` output                               |

---

## 🎁 12. Key Features to Preserve

When refactoring, **do not regress** these user-visible features:

- 🌓 3-state theme toggle (System → Dark → Light), persisted in `localStorage['repo-stats-theme']`
- 🔍 Debounced search (150ms) with clear button, Esc to reset, result counter
- 🗓️ GitHub-style contribution heatmap with year selector
- 📉 SVG churn timeline with Linear/Log toggle and hover tooltips
- 🏷️ One-click "Copy release notes" button (with `navigator.clipboard` + `execCommand` fallback)
- 📂 File filter navigation (click any file badge → jumps to changelog filtered by that file)
- 🖨️ Print styles that auto-expand all `<details>` before printing
- ⌨️ Sticky TOC with active-section highlighting
- 🎯 Clickable KPI cards that jump to the record day/commit

---

## 📦 13. Build / Release Checklist

Before tagging a release:

- [ ] `npm run lint` — clean
- [ ] `npm test` — all green
- [ ] Run `node git-repo-stats.js` on 3+ real repos (small, medium, huge)
- [ ] Open `repo-stats.html` in Chrome, Firefox, Safari
- [ ] Print to PDF — verify all sections expanded
- [ ] Verify `--md` output renders on GitHub
- [ ] Update `version` in `package.json` and `README.md`
- [ ] Add entry to `CHANGELOG.md` (when it exists)

---

_End of AI context. Keep this file updated as the project evolves._
