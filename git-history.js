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
 *   node git-history.js                  # Analyze current working directory
 *   node git-history.js /path/to/repo    # Analyze a specific git repository
 *
 * Outputs (saved in target repository root):
 *   - CHANGELOG.md
 *   - repo-stats.html
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const { getRepoName } = require('./utils');
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

function main() {
    try {
        // === Getting repo and its data ===
        const repoPath = process.argv[2] || process.cwd();
        const absoluteRepoPath = path.resolve(repoPath);

        console.log(`📂 Processing repository: ${absoluteRepoPath}`);

        const repoName = getRepoName(absoluteRepoPath);
        const rawLog = fetchRawGitLog(absoluteRepoPath);
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

        // === Generate Markdown ===
        let md = renderOverview(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts);
        md += renderChangelog(groupedByDate);

        const mdPath = path.join(absoluteRepoPath, 'CHANGELOG.md');
        fs.writeFileSync(mdPath, md, 'utf-8');

        // === Generate HTML ===
        let htmlContent = renderOverviewHTML(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts);
        htmlContent += renderChangelogHTML(groupedByDate);
        const fullHTML = wrapInHTMLTemplate(htmlContent, `Repository Statistics: ${repoName}`);

        const htmlPath = path.join(absoluteRepoPath, 'repo-stats.html');
        fs.writeFileSync(htmlPath, fullHTML, 'utf-8');

        console.log('✅ Done! Data saved to:');
        console.log(`   - ${mdPath}`);
        console.log(`   - ${htmlPath}`);
    } catch (error) {
        console.error('❌ Error occurred while running git-history.js');
        console.error('Error type:', error.constructor.name);
        console.error('Message:', error.message);
        console.error('Stack trace:\n', error.stack);
    }
}

main();
