/**
 * Default configuration and settings.
 * CLI flags (e.g. --md, --out=DIR, --open) always override values in `defaults`.
 */
module.exports = {
    // Default CLI modes and behavior when no corresponding flags are passed
    defaults: {
        // Generate the interactive HTML dashboard by default
        // (automatically disabled if --md or --changelog is passed without --html)
        html: true,

        // Generate the full Markdown report by default (CLI: --md)
        md: false,

        // Generate the standalone release notes changelog by default (CLI: --changelog)
        changelog: false,

        // Automatically open the generated HTML dashboard in the default browser (CLI: --open)
        open: false,

        // Default output directory:
        // - null: root directory of the analyzed repository
        // - string (e.g. 'reports' or '/tmp/stats'): custom output folder (CLI: --out=DIR)
        out: null,
    },

    // Output filenames saved inside the target output directory
    files: {
        // Interactive HTML analytics dashboard filename
        htmlFile: 'repo-stats.html',

        // Comprehensive Markdown report filename
        mdFile: 'repo-stats.md',

        // Standalone release-grouped changelog filename
        changelogFile: 'repo-stats-changelog.md',
    },

    // Aggregation limits, UI thresholds, and memory caps
    limits: {
        // Number of items shown in "Frequent" and "Hotspots" file rankings ("Files" widget)
        topFilesCount: 5,

        // Number of oldest untouched files shown in the "Legacy" files ranking ("Files" widget)
        legacyFilesCount: 25,

        // Number of top file extensions shown by files and by lines ("Tech stack" widget)
        topExtensionsCount: 5,

        // Max files listed per commit row before collapsing the rest ("Changelog Details" section)
        maxFilesPerCommit: 10,

        // Number of most recent day sections expanded by default in HTML "Changelog Details" (0 = all collapsed)
        openDaysCount: 0,

        // Character width of ASCII progress bars in the Markdown report
        histogramWidth: 25,

        // Max stdout buffer size (in MB) for `git log` output
        // Can also be overridden per run via the REPO_STATS_MAX_BUFFER env var (in bytes)
        defaultMaxBufferMb: 200,
    },

    // Regular expressions matching normalized repository-relative paths to exclude
    // from statistics (churn, file rankings, tech stack, unique file counts).
    // Ignored files still remain visible in commit tables marked as (ignored) / *.
    ignoredPatterns: [
        // JavaScript / Node.js lockfiles
        /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/,

        // Other language & package manager lockfiles (Rust, Ruby, Python, PHP, Go)
        /(^|\/)(Cargo\.lock|Gemfile\.lock|poetry\.lock|composer\.lock|Pipfile\.lock|go\.sum)$/,

        // Generated build outputs, vendored dependencies, and coverage reports
        /(^|\/)(dist|build|vendor|third_party|coverage|\.next|\.nuxt)\//,

        // Minified stylesheets and scripts
        /\.min\.(js|css)$/,

        // Source maps and bundled/chunked JS assets
        /\.(map|bundle\.js|chunk\.js)$/,

        // Generated git-repo-stats reports (mainly needed for this repo only)
        /(^|\/)(repo-stats\.html|repo-stats\.md|repo-stats-changelog\.md)$/,
    ],
};
