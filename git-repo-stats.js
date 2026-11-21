#!/usr/bin/env node

/**
 * ============================================================================
 * 👨‍💻 Git Repository Statistics & Changelog Generator
 * ============================================================================
 * Zero-runtime-dependency Node.js CLI utility that analyzes git commit history
 * and generates a self-contained HTML analytics dashboard (`repo-stats.html`)
 * and/or a collapsible Markdown report (`repo-stats.md`).
 *
 * Features:
 * - Repository overview (age, active days, current/max streaks, gaps, records)
 * - Code churn metrics (+insertions / -deletions), SVG timeline (Linear / Log)
 * - Releases & Tags grouping with release notes and one-click copy
 * - Time-of-day, weekday, and monthly activity histograms
 * - Frequent files, churn hotspots, legacy files, file lifecycle & tech stack
 * - Smart filtering of lock files, build artifacts, and minified assets
 * - Daily grouped commit tables with live search and clickable file links
 *
 * Usage:
 *   node git-repo-stats.js                    # Analyze current dir (HTML only by default)
 *   node git-repo-stats.js --md               # Markdown only
 *   node git-repo-stats.js --html --md        # Both formats
 *   node git-repo-stats.js --since=2026-01-01 --until=2026-11-17
 *   node git-repo-stats.js --out=reports      # Save to ./reports/
 *   node git-repo-stats.js --open             # Open generated HTML in default browser
 *   node git-repo-stats.js /path/to/repo      # Analyze a specific git repository
 *
 * Outputs (saved in repo root, or --out=DIR if provided):
 *   - repo-stats.html
 *   - repo-stats.md
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const {
    getRepoName,
    printHelp,
    openInBrowser,
    logStep,
    formatNumber,
    formatBytes,
    formatGeneratedAt
} = require('./utils');
const {
    fetchRawGitLog,
    parseRawLog,
    fetchRepoDateBounds,
    isGitRepository
} = require('./git-client');
const {
    groupCommitsByDate,
    extractTagsList,
    calculateReleases,
    calculateOverallStats,
    findTopFrequentFiles,
    findLargestCommit,
    calculateTechStack,
    calculateActivityByWeekday,
    calculateActivityByMonth,
    calculateActivityByTimeOfDay,
    calculateTechStackByLines,
    calculateContributors,
    findWidestCommit,
    findChurnHotspotFiles,
    findLegacyFiles,
    calculateFileLifecycle
} = require('./stats');
const {
    renderOverview,
    renderReleases,
    renderChangelog
} = require('./render-md');
const {
    renderOverviewHTML,
    renderChangelogHTML,
    wrapInHTMLTemplate
} = require('./render-html');

const VALUE_FLAGS = new Set(['since', 'until', 'out']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (s) => {
    if (!DATE_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const OUTPUT_FILE_MARKDOWN = 'repo-stats.md';
const OUTPUT_FILE_HTML = 'repo-stats.html';

/**
 * Parses CLI arguments (supports --flag=value, --flag value, and positional repo path).
 * Returns { since, until, html, md, out, help, repoPath, open }
 */
function parseArgs(argv) {
    const args = {
        since: null,
        until: null,
        html: false,
        md: false,
        out: null,
        help: false,
        open: false,
        repoPath: null,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '-h' || arg === '--help') {
            args.help = true;
            continue;
        }

        if (arg.startsWith('--')) {
            const eqIdx = arg.indexOf('=');
            const key = eqIdx === -1 ? arg.slice(2) : arg.slice(2, eqIdx);
            let value = eqIdx === -1 ? null : (arg.slice(eqIdx + 1) || null);

            if (eqIdx === -1 && VALUE_FLAGS.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                value = argv[++i];
            }

            switch (key) {
                case 'since':
                    if (!value) {
                        console.warn('⚠️  Ignoring --since: no value provided (expected --since=YYYY-MM-DD).');
                    } else if (!isValidDate(value)) {
                        console.warn(`⚠️  Ignoring --since="${value}": only valid YYYY-MM-DD dates are supported.`);
                    } else {
                        args.since = value;
                    }
                    break;
                case 'until':
                    if (!value) {
                        console.warn('⚠️  Ignoring --until: no value provided (expected --until=YYYY-MM-DD).');
                    } else if (!isValidDate(value)) {
                        console.warn(`⚠️  Ignoring --until="${value}": only valid YYYY-MM-DD dates are supported.`);
                    } else {
                        args.until = value;
                    }
                    break;
                case 'html':
                    if (value === 'false') {
                        console.warn('⚠️  --html=false is not supported; use --md alone to generate Markdown only.');
                    }
                    args.html = true;
                    break;
                case 'md':
                    args.md = true;
                    break;
                case 'out':
                    if (!value) {
                        console.warn('⚠️  Ignoring --out: no directory path provided.');
                    } else {
                        args.out = value;
                    }
                    break;
                case 'open':
                    args.open = true;
                    break;
                default:
                    console.warn(`⚠️  Unknown flag: --${key}`);
            }
            continue;
        }

        if (arg.startsWith('-')) {
            console.warn(`⚠️  Unknown short flag: ${arg}`);
            continue;
        }

        if (!args.repoPath) {
            args.repoPath = arg;
        } else {
            console.warn(`⚠️  Ignoring extra positional argument: ${arg}`);
        }
    }

    if (args.since && args.until && args.since > args.until) {
        console.warn(`⚠️  --since (${args.since}) is later than --until (${args.until}); result may be empty.`);
    }

    return args;
}

/**
 * Determines what to generate based on flags.
 * Default (no flags) → HTML only.
 */
function getGenerationMode(args) {
    return {
        html: args.html || (!args.html && !args.md),
        md: args.md,
    };
}

/**
 * Resolves output directory.
 * - If --out is absolute → use as is
 * - If --out is relative → resolve from cwd, not against the analyzed repo
 * - If no --out → use repo root
 */
function resolveOutputDir(outArg, repoPath) {
    if (!outArg) return repoPath;
    return path.isAbsolute(outArg) ? outArg : path.resolve(process.cwd(), outArg);
}

function validateRepoPath(repoPath) {
    const absoluteRepoPath = path.resolve(repoPath || process.cwd());

    let stat;
    try {
        stat = fs.statSync(absoluteRepoPath);
    } catch {
        console.error(`❌ Path does not exist: ${absoluteRepoPath}`);
        process.exitCode = 1;
        return null;
    }

    if (!stat.isDirectory()) {
        console.error(`❌ Path is not a directory: ${absoluteRepoPath}`);
        process.exitCode = 1;
        return null;
    }

    if (!isGitRepository(absoluteRepoPath)) {
        console.error(`❌ Not a git repository: ${absoluteRepoPath}`);
        process.exitCode = 1;
        return null;
    }

    return absoluteRepoPath;
}

function fetchAndParseCommits(repoPath, args) {
    if (args.since || args.until) {
        const range = [args.since, args.until].filter(Boolean).join(' — ');
        logStep(`📅 Filtering by period: ${range}`);
    }

    logStep('⏳ Fetching git log history...');
    const rawLog = fetchRawGitLog(repoPath, args.since, args.until);

    logStep('⚙️  Parsing commits and file stats...');
    const commits = parseRawLog(rawLog);
    logStep(`🔍 Parsed ${formatNumber(commits.length)} commits from git log`);

    return commits;
}

function collectStatistics(commits, repoPath) {
    const repoBounds = fetchRepoDateBounds(repoPath);
    const groupedByDate = groupCommitsByDate(commits);

    return {
        groupedByDate,
        tagsList: extractTagsList(groupedByDate),
        releases: calculateReleases(groupedByDate),
        stats: calculateOverallStats(groupedByDate, repoBounds),
        topFiles: findTopFrequentFiles(groupedByDate),
        hotspotFiles: findChurnHotspotFiles(groupedByDate),
        legacyFiles: findLegacyFiles(groupedByDate),
        largestCommit: findLargestCommit(groupedByDate),
        widestCommit: findWidestCommit(groupedByDate),
        techStack: calculateTechStack(groupedByDate),
        techStackByLines: calculateTechStackByLines(groupedByDate),
        fileLifecycle: calculateFileLifecycle(groupedByDate),
        contributors: calculateContributors(groupedByDate),
        weekdayCounts: calculateActivityByWeekday(groupedByDate),
        monthCounts: calculateActivityByMonth(groupedByDate),
        timeOfDayStats: calculateActivityByTimeOfDay(groupedByDate),
    };
}

function generateOutputs(args, repoPath, data, repoName) {
    const mode = getGenerationMode(args);
    const outputDir = resolveOutputDir(args.out, repoPath);

    if (fs.existsSync(outputDir)) {
        if (!fs.statSync(outputDir).isDirectory()) {
            throw new Error(`⛔ Output path exists and is not a directory: ${outputDir}`);
        }
    } else {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    if (mode.md) generateMarkdown(outputDir, data, args, repoName);
    if (mode.html) generateHtml(outputDir, data, args, repoName);
}

function generateMarkdown(outputDir, data, args, repoName) {
    logStep('📝 Rendering Markdown report...');
    const {
        stats, topFiles, hotspotFiles, legacyFiles,
        largestCommit, widestCommit,
        techStack, techStackByLines, fileLifecycle,
        contributors, timeOfDayStats,
        weekdayCounts, monthCounts, groupedByDate
    } = data;

    let md = renderOverview(
        repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts,
        { widestCommit, contributors, timeOfDayStats, techStackByLines, fileLifecycle, hotspotFiles, legacyFiles, args }
    );
    md += renderReleases(data.releases);
    md += renderChangelog(groupedByDate);

    const mdPath = path.join(outputDir, OUTPUT_FILE_MARKDOWN);
    fs.writeFileSync(mdPath, md, 'utf-8');
    logStep(`✅ Markdown saved: ${mdPath} (${formatBytes(Buffer.byteLength(md, 'utf-8'))})`);
}

function generateHtml(outputDir, data, args, repoName) {
    logStep('🎨 Rendering HTML dashboard...');
    const generatedAt = formatGeneratedAt();
    const { stats, groupedByDate, tagsList, releases, topFiles, hotspotFiles, legacyFiles,
        largestCommit, widestCommit, techStack, techStackByLines, fileLifecycle,
        weekdayCounts, monthCounts, timeOfDayStats, contributors } = data;
    const filesData = { frequent: topFiles, hotspots: hotspotFiles, legacy: legacyFiles };

    let htmlContent = renderOverviewHTML(
        repoName, stats, filesData, largestCommit, widestCommit,
        techStack, fileLifecycle, weekdayCounts, monthCounts, groupedByDate,
        timeOfDayStats, techStackByLines, contributors, releases, generatedAt, args
    );
    htmlContent += renderChangelogHTML(groupedByDate, tagsList);

    const fullHTML = wrapInHTMLTemplate(htmlContent, `Repository Statistics: ${repoName}`, generatedAt);
    const htmlPath = path.join(outputDir, OUTPUT_FILE_HTML);
    fs.writeFileSync(htmlPath, fullHTML, 'utf-8');
    logStep(`✅ HTML saved: ${htmlPath} (${formatBytes(Buffer.byteLength(fullHTML, 'utf-8'))})`);

    if (args.open) {
        openInBrowser(htmlPath);
        logStep('🌐 Opened in default browser');
    }
}

function main() {
    try {
        const startTime = Date.now();

        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            printHelp();
            return;
        }

        const absoluteRepoPath = validateRepoPath(args.repoPath);
        if (!absoluteRepoPath) return;
        logStep(`📂 Processing repository: ${absoluteRepoPath}`);

        const repoName = getRepoName(absoluteRepoPath);
        const commits = fetchAndParseCommits(absoluteRepoPath, args);
        if (commits.length === 0) {
            logStep('⚠️ No commits found in this repository.');
            return;
        }

        const stats = collectStatistics(commits, absoluteRepoPath);
        logStep('📊 Calculated repository statistics');

        generateOutputs(args, absoluteRepoPath, stats, repoName);

        const totalTime = Date.now() - startTime;
        logStep(`🎉 Done in ${totalTime}ms!`);
    } catch (error) {
        process.exitCode = 1;
        console.error('❌ Error occurred while running git-repo-stats.js');
        console.error('Error type:', error.constructor.name);
        console.error('Message:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    main,
    parseArgs,
    getGenerationMode,
    resolveOutputDir,
    validateRepoPath,
    fetchAndParseCommits,
    collectStatistics,
    generateOutputs
};
