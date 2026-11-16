const { escapePipe, MAX_FILES_PER_COMMIT, formatNumber, renderBar, WEEKDAY_NAMES } = require('./utils');

/**
 * Renders a Markdown link to a file: [name](url-encoded-path).
 */
function renderFileLink(filename) {
    const escaped = escapePipe(filename);
    const encoded = encodeURI(filename);
    return `[${escaped}](${encoded})`;
}

/**
 * Renders the "Changed files" cell for a commit row.
 */
function renderFilesCell(files, ignoredFiles) {
    if (files.length === 0) return '_no changes_';

    const renderFile = (f) => {
        const link = renderFileLink(f);
        return ignoredFiles.has(f) ? `${link}*` : link;
    };

    if (files.length <= MAX_FILES_PER_COMMIT) {
        return files.map(renderFile).join('<br>');
    }

    const visible = files.slice(0, MAX_FILES_PER_COMMIT);
    const hidden = files.slice(MAX_FILES_PER_COMMIT);

    const hiddenHasIgnored = hidden.some(f => ignoredFiles.has(f));
    const summarySuffix = hiddenHasIgnored ? '*' : '';

    let result = visible.map(renderFile).join('<br>');
    result += `<br><details><summary><i>Show ${hidden.length} more files${summarySuffix}</i></summary><br><br>`;
    result += hidden.map(renderFile).join('<br>');
    result += `</details>`;

    return result;
}

/**
 * Renders the "Delta" cell for a commit row.
 */
function renderDeltaCell(commit) {
    let deltaStr;

    if (commit.hasOnlyIgnored) {
        deltaStr = '_ignored files only_';
    } else if (commit.insertions === 0 && commit.deletions === 0 && commit.binaryCount > 0) {
        deltaStr = '_binaries only_';
    } else {
        deltaStr = `+${commit.insertions} / -${commit.deletions}`;
    }

    if (!commit.hasOnlyIgnored && (commit.binaryCount > 0 || commit.textCount > 0)) {
        deltaStr += `<br><br>TXT: ${commit.textCount}`;
        if (commit.binaryCount > 0) {
            deltaStr += `<br>Binary: ${commit.binaryCount}`;
        }
    }
    return deltaStr;
}

/**
 * Renders one day section (header + table of commits).
 */
function renderDaySection(date, dayData) {
    const fmt = formatNumber;
    const commitsCount = dayData.commits.length;
    const uniqueFilesCount = dayData.uniqueFiles.size;

    let md = `### ${date}: ${commitsCount} commits (+${fmt(dayData.totalInsertions)} / -${fmt(dayData.totalDeletions)}) in ${uniqueFilesCount} unique files\n\n`;
    md += '| Commit | Changed files | Delta |\n';
    md += '| :--- | :--- | :---: |\n';

    dayData.commits.forEach(commit => {
        md += `| ${escapePipe(commit.subject)} | ${renderFilesCell(commit.files, commit.ignoredFiles)} | ${renderDeltaCell(commit)} |\n`;
    });

    return md + '\n';
}

/**
 * Renders "Max streak" line.
 */
function renderMaxStreakLine(stats) {
    const { maxStreakLength, maxStreakStart, maxStreakEnd } = stats;
    if (maxStreakLength === 0) return '';

    const dateRange = maxStreakStart === maxStreakEnd
        ? maxStreakStart
        : `${maxStreakStart} — ${maxStreakEnd}`;

    return `* 🔥 **Max streak:** **${maxStreakLength}** consecutive active day(s) (${dateRange})\n`;
}

/**
 * Renders "Longest gap" line.
 */
function renderLongestGapLine(stats) {
    const { longestGapLength, longestGapStart, longestGapEnd } = stats;
    if (longestGapLength === 0) return '';

    return `* 😴 **Longest gap:** **${longestGapLength}** day(s) (${longestGapStart} — ${longestGapEnd})\n`;
}

/**
 * Renders "Largest commit" line.
 */
function renderLargestCommitLine(largest, fmt) {
    if (!largest) return '';
    return `* 💪 **Largest commit:** ${largest.date} — \`${escapePipe(largest.subject)}\` (**+${fmt(largest.insertions)} / -${fmt(largest.deletions)}** lines)\n`;
}

/**
 * Renders tech stack block.
 */
function renderTechStackLine(stack) {
    if (!stack || stack.length === 0) return '';

    let md = `* 🧰 **Tech stack (by commits):**\n`;
    stack.forEach(item => {
        const extDisplay = item.ext === 'no-ext' ? '<no-ext>' : `.${item.ext}`;
        md += `  - \`${extDisplay}\` — **${item.percent}%** (${item.count} file-touches)\n`;
    });
    return md;
}

/**
 * Renders ASCII histogram of commits per weekday.
 */
function renderWeekdayHistogram(weekdayCounts) {
    const total = Object.values(weekdayCounts).reduce((s, c) => s + c, 0);
    if (total === 0) return '';

    const maxCount = Math.max(...Object.values(weekdayCounts));

    let md = `* 📊 **Activity by day of week:**\n`;
    for (const day of WEEKDAY_NAMES) {
        const count = weekdayCounts[day] || 0;
        const percent = ((count / total) * 100).toFixed(0);
        const bar = renderBar(count, maxCount);

        if (count === maxCount && maxCount > 0) {
            md += `  - **${day}: \`${bar}\` ${percent}% (${count})** 😩\n`;
        } else {
            md += `  - **${day}**: \`${bar}\` ${percent}% (${count})\n`;
        }
    }
    return md;
}

/**
 * Renders ASCII histogram of commits per month.
 */
function renderMonthHistogram(monthCounts) {
    if (monthCounts.length === 0) return '';

    const maxCount = Math.max(...monthCounts.map(m => m[1]));

    let md = `* 📅 **Activity by month:**\n`;
    for (const [month, count] of monthCounts) {
        const bar = renderBar(count, maxCount);
        md += `  - ${month}: \`${bar}\` ${count}\n`;
    }
    return md;
}

/**
 * Renders the overview statistics block.
 */
function renderOverview(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts) {
    const fmt = formatNumber;
    const netSign = stats.netChange >= 0 ? '+' : '';

    let md = `# 👨‍💻 Repository Statistics: ${repoName}\n\n`;
    md += '## 📊 Overview\n\n';
    md += `* 🎂 **Repo age:** **${stats.repoAge} days** (since ${stats.firstDate})\n`;
    md += `* 📅 **Period:** ${stats.firstDate} — ${stats.lastDate} (active days: **${stats.activeDays}** out of ${stats.totalCalendarDays} — ${stats.activityPercent}%)\n`;
    md += `* 📦 **Total commits:** ${fmt(stats.totalCommits)} (avg **${stats.avgCommitsPerActiveDay}** commits per active day)\n`;
    md += `* 📏 **Volume of changes:** +${fmt(stats.totalInsertions)} / -${fmt(stats.totalDeletions)} lines (net change: **${netSign}${fmt(stats.netChange)}** lines)\n`;
    md += `* 📐 **Average per commit:** +${stats.avgPerCommitIns} / -${stats.avgPerCommitDel} lines | **${stats.avgFilesPerCommit}** files\n`;
    md += `* 📈 **Average per active day:** +${fmt(stats.avgPerActiveDayIns)} / -${fmt(stats.avgPerActiveDayDel)} lines\n`;
    md += `* 🏆 **Record by commits:** ${stats.recordCommitsDate} (**${stats.recordCommitsCount}** commits)\n`;
    md += `* 🔨 **Record by code churn:** ${stats.recordCodeDate} (**+${fmt(stats.recordCodeIns)} / -${fmt(stats.recordCodeDel)}** lines)\n`;
    md += renderMaxStreakLine(stats);
    md += renderLongestGapLine(stats);
    md += renderLargestCommitLine(largestCommit, fmt);
    md += renderWeekdayHistogram(weekdayCounts);
    md += renderMonthHistogram(monthCounts);

    if (topFiles.length > 0) {
        md += `* 📂 **Most frequent changed files:**\n`;
        topFiles.forEach(f => {
            md += `  - \`${f.file}\` (changed in **${f.count}** commits)\n`;
        });
    }

    md += renderTechStackLine(techStack);
    md += '\n';
    return md;
}

/**
 * Renders the full changelog section.
 */
function renderChangelog(groupedByDate) {
    let md = '## Changelog Details\n\n';
    md += '> \\* — file is excluded from statistics (lock files, dist, minified, etc.)\n\n';

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
    sortedDates.forEach(date => {
        md += renderDaySection(date, groupedByDate[date]);
    });
    return md;
}

module.exports = {
    renderOverview,
    renderChangelog
};
