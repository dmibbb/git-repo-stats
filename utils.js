const path = require('path');
const { execSync } = require('child_process');

// === Configuration ===
const MAX_FILES_PER_COMMIT = 10;
const MAX_BUFFER = 1024 * 1024 * 50; // 50MB
const TOP_FILES_COUNT = 3;
const TOP_EXTENSIONS_COUNT = 5;
const HISTOGRAM_WIDTH = 25;

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
  -h, --help           Show this help message and exit

Examples:
  repo-stats
  repo-stats --md --html
  repo-stats --since=2026-01-01 --until=2026-12-31
  repo-stats C:\\Projects\\my-app --out=reports
`);
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
  getRepoName,
  formatNumber,
  escapePipe,
  escapeHtml,
  parseDate,
  isIgnoredFile,
  getExtension,
  toMondayFirstIndex,
  renderBar,
  printHelp
};
