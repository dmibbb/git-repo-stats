const path = require('path');
const { execSync, execFile } = require('child_process');

// === Configuration ===
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_FILES_PER_COMMIT = 10;
const RAW_MAX = parseInt(process.env.REPO_STATS_MAX_BUFFER, 10);
const DEFAULT_MAX_BUFFER_MB = 200;
const MAX_BUFFER = Number.isFinite(RAW_MAX) && RAW_MAX > 0 ? RAW_MAX : 1024 * 1024 * DEFAULT_MAX_BUFFER_MB;
const TOP_FILES_COUNT = 5;
const TOP_EXTENSIONS_COUNT = 5;
const HISTOGRAM_WIDTH = 25;
const OPEN_DAYS_COUNT = 0;

// Files to exclude from statistics (but still shown in commit tables)
const IGNORED_PATTERNS = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/,
  /(^|\/)(Cargo\.lock|Gemfile\.lock|poetry\.lock|composer\.lock|Pipfile\.lock|go\.sum)$/,
  /(^|\/)(dist|build|vendor|third_party|coverage|\.next|\.nuxt)\//,
  /\.min\.(js|css)$/,
  /\.(map|bundle\.js|chunk\.js)$/,
];

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Gets the repository name from the root folder path.
 */
function getRepoName(repoPath) {
  try {
    const topLevel = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd: repoPath,
      stdio: 'pipe'
    }).trim();
    return path.basename(topLevel);
  } catch (e) {
    // Fallback to original repo
    let originalRepo = path.basename(path.resolve(repoPath));
    console.warn(`⚠️  Could not resolve repo root via git (${e.code || 'error'}); falling back to folder name "${originalRepo}".`);
    return originalRepo;
  }
}

/**
 * Formats a number with thousands separator (English style: 45,200).
 */
function formatNumber(n) {
  return (n ?? 0).toLocaleString('en-US');
}

/**
 * Formats byte size into human-readable units (B, KB, MB).
 */
function formatBytes(bytes) {
  if (bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Formats a count with singular or plural noun:
 * pluralize(1, 'commit') -> '1 commit'
 * pluralize(5, 'commit') -> '5 commits'
 */
function pluralize(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Escapes the pipe character for Markdown tables.
 */
function escapePipe(str) {
  return str.replace(/((?:^|[^\\])(?:\\\\)*)\|/g, '$1\\|');
}

/**
 * Escapes HTML special characters to prevent markup breaking / XSS.
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parses a 'YYYY-MM-DD' string into a UTC Date object.
 * Using UTC avoids timezone/DST issues during arithmetic.
 */
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Returns today's local calendar date normalized to UTC midnight
 * for consistent day-diff arithmetic without DST shifts.
 */
function getTodayLocalDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Calculates the difference in full days between two Date objects.
 */
function diffDays(dateA, dateB) {
  let result = Math.round((dateB - dateA) / MS_PER_DAY);
  if (isNaN(result)) return 0;
  return result;
}

/**
 * Checks if a file matches any of the IGNORED_PATTERNS.
 */
function isIgnoredFile(filename) {
  return IGNORED_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Extracts the lowercase file extension, or 'no-ext' for extensionless files
 * and single-dot dotfiles (e.g. '.gitignore' -> 'no-ext', '.env.local' -> 'local').
 */
function getExtension(filename) {
  const base = filename.split(/[/\\]/).pop() || filename;
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex === -1 || (dotIndex === 0 && base.indexOf('.', 1) === -1)) {
    return 'no-ext';
  }
  // .env.local -> 'local', .gitignore -> 'no-ext'
  const ext = base.slice(dotIndex + 1).toLowerCase();
  return ext || 'no-ext';
}

/**
 * Converts JS getUTCDay() (0=Sun..6=Sat) to Mon-first index (0=Mon..6=Sun).
 */
function toMondayFirstIndex(jsDay) {
  return (jsDay + 6) % 7;
}

/**
 * Renders an ASCII histogram bar: `████████░░`
 */
function renderBar(value, maxValue, width = HISTOGRAM_WIDTH) {
  if (maxValue === 0) return '░'.repeat(width);
  const filled = Math.min(width, Math.max(0, Math.round((value / maxValue) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Prints CLI help message.
 */
function printHelp() {
  console.log(`
📊 Git Repository Statistics & Changelog Generator (repo-stats)

repo-stats is a npm link to "node git-repo-stats.js"

Usage:
  repo-stats [path] [options]

Arguments:
  path                 Path to the git repository (default: current directory)

Options:
  --html               Generate HTML dashboard (repo-stats.html) [default]
  --md                 Generate Markdown report (repo-stats.md)
  --since=YYYY-MM-DD   Filter commits starting from this date
  --until=YYYY-MM-DD   Filter commits up to this date
  --out=DIR            Custom output directory for generated reports
  --open               Open generated HTML dashboard in default browser
  -h, --help           Show this help message and exit

Examples:
  repo-stats
  repo-stats --md --html
  repo-stats --since=2026-01-01 --until=2026-12-31
  repo-stats C:\\Projects\\my-app --out=reports
`);
}

/**
 * Normalizes Git rename paths for statistics.
 * Converts "src/{old.js => new.js}" or "{src => lib}/index.js" to "src/new.js" or "lib/index.js".
 * Leaves simple paths untouched.
 */
function normalizeGitPath(filename) {
  if (!filename.includes(' => ')) return filename;

  // Case 1: With braces (directory or partial name change)
  // Matches: prefix + {old + " => " + new} + suffix
  // Example: "src/{a.js => b.js}" -> "src/" + "b.js" + "" = "src/b.js"
  const braceMatch = filename.match(/^(.*)\{(.*)\s*=>\s*(.*)\}(.*)$/);
  if (braceMatch) {
    const prefix = braceMatch[1];
    const newName = braceMatch[3];
    const suffix = braceMatch[4];
    return (prefix + newName + suffix).replace(/\/+/g, '/').replace(/^\//, '');
  }

  const parts = filename.split(' => ');

  // Case 2: multiple renames — always take the last segment
  if (parts.length > 2) return parts[parts.length - 1];

  // Case 3: single " => " — heuristic: treat as rename only if LHS
  // looks like a path (contains '.' or '/'). Otherwise it's likely a
  // literal filename containing " => ".
  if (parts.length === 2) {
    if (parts[0].includes('.') || parts[0].includes('/')) {
      return parts[1];
    }
    return filename;
  }

  return filename;
}

/**
 * Opens a file in the system default browser.
 */
function openInBrowser(filePath) {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath];

  const child = execFile(command, args);
  child.on('error', (err) => {
    console.warn(`⚠️  Could not open browser: ${err.message}`);
  });
}

/**
 * Formats current local date and time with UTC offset:
 * e.g. "2026-11-19 17:10:22 (UTC+3)"
 */
function formatGeneratedAt(date = new Date()) {
  const localStr = date.toLocaleString('sv-SE');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  const tzStr = mins === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(mins).padStart(2, '0')}`;

  return `${localStr} (${tzStr})`;
}

let activeStepStart = null;

function formatTimestamp() {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8); // HH:MM:SS
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${time}.${ms}`;
}

/**
 * Prints an instant informational log line without step duration.
 */
function logStep(message) {
  if (activeStepStart !== null) {
    endStep();
  }
  console.log(`[${formatTimestamp()}]\t${message}`);
}

/**
 * Starts a timed step, printing its label immediately so the user sees
 * what is currently running before the step completes.
 */
function startStep(message) {
  if (activeStepStart !== null) {
    endStep();
  }
  activeStepStart = Date.now();
  const line = `[${formatTimestamp()}]\t${message}`;
  if (process.stdout.isTTY) {
    process.stdout.write(`${line} `);
  } else {
    console.log(line);
  }
}

/**
 * Finishes the active timed step and prints its elapsed duration.
 */
function endStep(extraSuffix = '') {
  if (activeStepStart === null) return;
  const elapsed = Date.now() - activeStepStart;
  activeStepStart = null;
  const suffix = extraSuffix ? `${extraSuffix} (took ${elapsed}ms)` : `(took ${elapsed}ms)`;

  if (process.stdout.isTTY) {
    process.stdout.write(`${suffix}\n`);
  } else {
    console.log(`[${formatTimestamp()}]\t${suffix}`);
  }
}

module.exports = {
  MAX_FILES_PER_COMMIT,
  MAX_BUFFER,
  TOP_FILES_COUNT,
  TOP_EXTENSIONS_COUNT,
  HISTOGRAM_WIDTH,
  IGNORED_PATTERNS,
  WEEKDAY_NAMES,
  MONTH_NAMES,
  OPEN_DAYS_COUNT,
  getRepoName,
  formatNumber,
  formatBytes,
  escapePipe,
  escapeHtml,
  parseDate,
  getTodayLocalDate,
  isIgnoredFile,
  getExtension,
  toMondayFirstIndex,
  renderBar,
  printHelp,
  normalizeGitPath,
  pluralize,
  diffDays,
  openInBrowser,
  formatGeneratedAt,
  logStep,
  startStep,
  endStep
};
