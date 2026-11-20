#!/usr/bin/env node

/**
 * ============================================================================
 * 📊 Git Repository Statistics & Changelog Generator
 * ============================================================================
 * Zero-dependency Node.js CLI utility that analyzes git commit history and
 * generates a comprehensive Markdown changelog (`repo-stats.md`) alongside a
 * styled, dark-mode-ready HTML dashboard (`repo-stats.html`).
 * 
 * Author: dmibbb
 * Version: 1.0.0
 *
 * Features:
 * - High-level repository overview (age, active days, streaks, gaps, records)
 * - Code churn metrics (+insertions / -deletions), tech stack & hotspots
 * - Weekday and monthly activity histograms (ASCII in MD, CSS bars in HTML)
 * - Smart filtering of lock files, build artifacts, and minified assets
 * - Daily grouped commit tables with clickable file links
 *
 * Usage:
 *   node git-history.js                    # Analyze current working directory
 *   node git-history.js                    # HTML only (default)
 *   node git-history.js --md               # Markdown only
 *   node git-history.js --html --md        # Both
 *   node git-history.js --since=2026-01-01 --until=2026-11-17
 *   node git-history.js --out=reports      # Save to ./reports/
 *   node git-history.js /path/to/repo      # Analyze a specific git repository
 *
 * Outputs (saved in target repository root):
 *   - repo-stats.md
 *   - repo-stats.html
 * ============================================================================
 */

const { execSync } = require('child_process');
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
    fetchRepoDateBounds
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
    renderChangelog
} = require('./render-md');
const { renderOverviewHTML,
    renderChangelogHTML,
    wrapInHTMLTemplate
} = require('./render-html');

/**
 * Parses CLI arguments (supports --flag=value format and positional repo path).
 * Returns { since, until, html, md, out, help, repoPath }
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

    for (const arg of argv) {
        if (arg === '-h' || arg === '--help') {
            args.help = true;
            continue;
        }

        if (arg.startsWith('--')) {
            const [key, ...valueParts] = arg.slice(2).split('=');
            const value = valueParts.join('=') || null;

            switch (key) {
                case 'since':
                    args.since = value;
                    break;
                case 'until':
                    args.until = value;
                    break;
                case 'html':
                    args.html = true;
                    break;
                case 'md':
                    args.md = true;
                    break;
                case 'out':
                    args.out = value;
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
        }
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
 * - If --out is relative → resolve from cwd
 * - If no --out → use repo root
 */
function resolveOutputDir(outArg, repoPath) {
    if (!outArg) return repoPath;
    return path.isAbsolute(outArg) ? outArg : path.resolve(process.cwd(), outArg);
}

function main() {
    try {
        // === Parse CLI args ===
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            printHelp();
            return;
        }

        const mode = getGenerationMode(args);
        const absoluteRepoPath = path.resolve(args.repoPath || process.cwd());

        // === Validate repo path ===
        let stat;
        try {
            stat = fs.statSync(absoluteRepoPath);
        } catch {
            console.error(`❌ Path does not exist: ${absoluteRepoPath}`);
            return;
        }

        if (!stat.isDirectory()) {
            console.error(`❌ Path is not a directory: ${absoluteRepoPath}`);
            return;
        }

        try {
            execSync('git rev-parse --is-inside-work-tree', {
                encoding: 'utf-8',
                cwd: absoluteRepoPath,
                stdio: 'pipe',
            });
        } catch {
            console.error(`❌ Not a git repository: ${absoluteRepoPath}`);
            return;
        }

        logStep(`📂 Processing repository: ${absoluteRepoPath}`);
        if (args.since || args.until) {
            const range = [args.since, args.until].filter(Boolean).join(' — ');
            logStep(`📅 Filtering by period: ${range}`);
        }

        const repoName = getRepoName(absoluteRepoPath);
        logStep('⏳ Fetching git log history...');
        const rawLog = fetchRawGitLog(absoluteRepoPath, args.since, args.until);

        logStep('⚙️  Parsing commits and file stats...');
        const commits = parseRawLog(rawLog);

        if (commits.length === 0) {
            logStep('⚠️ No commits found in this repository.');
            return;
        }

        logStep(`🔍 Parsed ${formatNumber(commits.length)} commits from git log`);

        const repoBounds = fetchRepoDateBounds(absoluteRepoPath);
        const groupedByDate = groupCommitsByDate(commits);
        const tagsList = extractTagsList(groupedByDate);
        const releases = calculateReleases(groupedByDate);
        const stats = calculateOverallStats(groupedByDate, repoBounds);
        const topFiles = findTopFrequentFiles(groupedByDate);
        const hotspotFiles = findChurnHotspotFiles(groupedByDate);
        const legacyFiles = findLegacyFiles(groupedByDate);
        const filesData = { frequent: topFiles, hotspots: hotspotFiles, legacy: legacyFiles };
        const largestCommit = findLargestCommit(groupedByDate);
        const widestCommit = findWidestCommit(groupedByDate);
        const techStack = calculateTechStack(groupedByDate);
        const techStackByLines = calculateTechStackByLines(groupedByDate);
        const fileLifecycle = calculateFileLifecycle(groupedByDate);
        const contributors = calculateContributors(groupedByDate);
        const weekdayCounts = calculateActivityByWeekday(groupedByDate);
        const monthCounts = calculateActivityByMonth(groupedByDate);
        const timeOfDayStats = calculateActivityByTimeOfDay(groupedByDate);

        logStep('📊 Calculated repository statistics');

        // === Resolve output directory ===
        const outputDir = resolveOutputDir(args.out, absoluteRepoPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // === Generate Markdown ===
        if (mode.md) {
            logStep('📝 Rendering Markdown report...');
            let md = renderOverview(
                repoName,
                stats,
                topFiles,
                largestCommit,
                techStack,
                weekdayCounts,
                monthCounts,
            );
            md += renderChangelog(groupedByDate);
            const mdPath = path.join(outputDir, 'repo-stats.md');
            fs.writeFileSync(mdPath, md, 'utf-8');
            const mdSize = formatBytes(Buffer.byteLength(md, 'utf-8'));
            logStep(`✅ Markdown saved: ${mdPath} (${mdSize})`);
        }

        // === Generate HTML ===
        if (mode.html) {
            logStep('🎨 Rendering HTML dashboard...');
            const generatedAt = formatGeneratedAt();
            let htmlContent = renderOverviewHTML(
                repoName,
                stats,
                filesData,
                largestCommit,
                widestCommit,
                techStack,
                fileLifecycle,
                weekdayCounts,
                monthCounts,
                groupedByDate,
                timeOfDayStats,
                techStackByLines,
                contributors,
                releases,
                generatedAt,
                args
            );
            htmlContent += renderChangelogHTML(groupedByDate, tagsList);
            const fullHTML = wrapInHTMLTemplate(htmlContent, `Repository Statistics: ${repoName}`, generatedAt);
            const htmlPath = path.join(outputDir, 'repo-stats.html');
            fs.writeFileSync(htmlPath, fullHTML, 'utf-8');
            const htmlSize = formatBytes(Buffer.byteLength(fullHTML, 'utf-8'));
            logStep(`✅ HTML saved: ${htmlPath} (${htmlSize})`);

            if (args.open) {
                openInBrowser(htmlPath);
                logStep('🌐 Opened in default browser');
            }
        }

        logStep('🎉 Done!');
    } catch (error) {
        console.error('❌ Error occurred while running git-history.js');
        console.error('Error type:', error.constructor.name);
        console.error('Message:', error.message);
        console.error('Stack trace:\n', error.stack);
    }
}

if (require.main === module) {
    main();
}
module.exports = { main, parseArgs, getGenerationMode, resolveOutputDir };
