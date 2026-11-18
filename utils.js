const path = require('path');
const { execSync, execFile } = require('child_process');

// === Configuration ===
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_FILES_PER_COMMIT = 10;
const MAX_BUFFER = 1024 * 1024 * 50; // 50MB
const TOP_FILES_COUNT = 3;
const TOP_EXTENSIONS_COUNT = 5;
const HISTOGRAM_WIDTH = 25;
const OPEN_DAYS_COUNT = 7;

// Files to exclude from statistics (but still shown in commit tables)
const IGNORED_PATTERNS = [
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.min\.js$/,
  /\.min\.css$/,
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
      cwd: repoPath
    }).trim();
    return path.basename(topLevel);
  } catch (e) {
    return 'Unknown Repo';
  }
}

/**
 * Formats a number with thousands separator (English style: 45,200).
 */
function formatNumber(n) {
  return n.toLocaleString('en-US');
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
  return str.replace(/\|/g, '\\|');
}

/**
 * Escapes HTML special characters to prevent markup breaking / XSS.
 */
function escapeHtml(str) {
  return String(str)
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
 * Calculates the difference in full days between two Date objects.
 */
function diffDays(dateA, dateB) {
  return Math.round((dateB - dateA) / MS_PER_DAY);
}

/**
 * Checks if a file matches any of the IGNORED_PATTERNS.
 */
function isIgnoredFile(filename) {
  return IGNORED_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Extracts the lowercase file extension, or 'no-ext' for extensionless files.
 */
function getExtension(filename) {
  const base = filename.split('/').pop();
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0) return 'no-ext';
  return base.slice(dotIndex + 1).toLowerCase();
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
  const filled = Math.round((value / maxValue) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Prints CLI help message and exits.
 */
function printHelp() {
  console.log(`
📊 Git Repository Statistics & Changelog Generator (repo-stats)

repo-stats is a npm link to "node git-history.js"

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
    return prefix + newName + suffix;
  }

  // Case 2: Without braces (simple rename). E.g., "old.js => new.js"
  const parts = filename.split(' => ');
  return parts[1];
}

/**
 * Opens a file in the system default browser.
 */
function openInBrowser(filePath) {
  const platform = process.platform;
  if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', filePath]);
  } else if (platform === 'darwin') {
    execFile('open', [filePath]);
  } else {
    execFile('xdg-open', [filePath]);
  }
}

let lastStepTime = Date.now();

/**
 * Logs a message prefixed with current local time [HH:MM:SS] and elapsed step time.
 */
function logStep(message) {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8); // HH:MM:SS
  const elapsed = Date.now() - lastStepTime;
  lastStepTime = Date.now();
  const deltaStr = elapsed > 0 ? `${elapsed}ms` : '0ms';
  console.log(`[${time}]\t${message} (took ${deltaStr})`);
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
  escapePipe,
  escapeHtml,
  parseDate,
  isIgnoredFile,
  getExtension,
  toMondayFirstIndex,
  renderBar,
  printHelp,
  normalizeGitPath,
  pluralize,
  diffDays,
  openInBrowser,
  logStep
};
