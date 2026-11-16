/**
 * How to run:
 * node git-history.js                    # current git repo
 * node git-history.js /path/to/repo      # other git repo
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
        let md = renderOverview(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts, groupedByDate);
        md += renderChangelog(groupedByDate);

        const mdPath = path.join(absoluteRepoPath, 'CHANGELOG.md');
        fs.writeFileSync(mdPath, md, 'utf-8');

        // === Generate HTML ===
        let htmlContent = renderOverviewHTML(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts);
        htmlContent += renderChangelogHTML(groupedByDate);
        const fullHTML = wrapInHTMLTemplate(htmlContent, `Repository Statistics: ${repoName}`);

        const htmlPath = path.join(absoluteRepoPath, 'CHANGELOG.html');
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
