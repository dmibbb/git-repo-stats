#!/usr/bin/env node

/**
 * ============================================================================
 * 📊 Git Repository Statistics & Changelog Generator
 * ============================================================================
 * Zero-dependency Node.js CLI utility that analyzes git commit history and
 * generates a comprehensive Markdown changelog (`CHANGELOG.md`) alongside a
 * styled, dark-mode-ready HTML dashboard (`repo-stats.html`).
 * 
 * Author: Димасик (dmibbb)
 * Version: 20261116
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

const { getRepoName, printHelp } = require('./utils');
const { fetchRawGitLog, parseRawLog } = require('./git');
const {
    groupCommitsByDate,
    calculateOverallStats,
    findTopFrequentFiles,
    findLargestCommit,
    calculateTechStack,
    calculateActivityByWeekday,
    calculateActivityByMonth
} = require('./stats');
const { renderOverview, renderChangelog } = require('./render-md');
const { renderOverviewHTML, renderChangelogHTML, wrapInHTMLTemplate } = require('./render-html');

/**
 * Parses CLI arguments (supports --flag=value format).
 * Returns { since, until, html, md, out }
 */
function parseArgs(argv) {
    const args = {
        since: null,
        until: null,
        html: false,
        md: false,
        out: null,
        help: false,
    };

    for (const arg of argv) {
        if (arg === '-h' || arg === '--help') {
            args.help = true;
            continue;
        }

        if (!arg.startsWith('--')) continue;
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
            default:
                console.warn(`⚠️ Unknown flag: --${key}`);
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
        const repoPathArg = process.argv.slice(2).find((a) => !a.startsWith('--')) || process.cwd();
        const absoluteRepoPath = path.resolve(repoPathArg);

        // === Validate repo path ===
        if (!fs.existsSync(absoluteRepoPath)) {
            console.error(`❌ Path does not exist: ${absoluteRepoPath}`);
            return;
        }

        const stat = fs.statSync(absoluteRepoPath);
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

        console.log(`📂 Processing repository: ${absoluteRepoPath}`);
        if (args.since || args.until) {
            const range = [args.since, args.until].filter(Boolean).join(' — ');
            console.log(`📅 Filtering by period: ${range}`);
        }

        const repoName = getRepoName(absoluteRepoPath);
        const rawLog = fetchRawGitLog(absoluteRepoPath, args.since, args.until);
        const commits = parseRawLog(rawLog);

        if (commits.length === 0) {
            console.log('⚠️ No commits found in this repository.');
            return;
        }

        const groupedByDate = groupCommitsByDate(commits);
        const stats = calculateOverallStats(groupedByDate);
        const topFiles = findTopFrequentFiles(groupedByDate);
        const largestCommit = findLargestCommit(groupedByDate);
        const techStack = calculateTechStack(groupedByDate);
        const weekdayCounts = calculateActivityByWeekday(groupedByDate);
        const monthCounts = calculateActivityByMonth(groupedByDate);

        // === Resolve output directory ===
        const outputDir = resolveOutputDir(args.out, absoluteRepoPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // === Generate Markdown ===
        if (mode.md) {
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
            console.log(`✅ Markdown saved: ${mdPath}`);
        }

        // === Generate HTML ===
        if (mode.html) {
            let htmlContent = renderOverviewHTML(
                repoName,
                stats,
                topFiles,
                largestCommit,
                techStack,
                weekdayCounts,
                monthCounts,
            );
            htmlContent += renderChangelogHTML(groupedByDate);
            const fullHTML = wrapInHTMLTemplate(htmlContent, `Repository Statistics: ${repoName}`);
            const htmlPath = path.join(outputDir, 'repo-stats.html');
            fs.writeFileSync(htmlPath, fullHTML, 'utf-8');
            console.log(`✅ HTML saved: ${htmlPath}`);
        }

        console.log('🎉 Done!');
    } catch (error) {
        console.error('❌ Error occurred while running git-history.js');
        console.error('Error type:', error.constructor.name);
        console.error('Message:', error.message);
        console.error('Stack trace:\n', error.stack);
    }
}

main();
