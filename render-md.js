const {
    escapePipe,
    MAX_FILES_PER_COMMIT,
    formatNumber,
    pluralize,
    renderBar,
    WEEKDAY_NAMES,
} = require('./utils');

/**
 * Wraps text in inline Markdown code span, safely handling embedded backticks.
 */
function wrapInlineCode(str) {
    const s = String(str ?? '');
    if (!s.includes('`')) return `\`${s}\``;
    const maxRun = Math.max(...(s.match(/`+/g) || []).map(m => m.length));
    const fence = '`'.repeat(maxRun + 1);
    return `${fence} ${s} ${fence}`;
}

/**
 * Renders a Markdown link to a file: [name](url-encoded-path).
 */
function renderFileLink(filename, isRename = filename.includes(' => ')) {
    if (isRename) {
        return escapePipe(wrapInlineCode(filename));
    }

    const escaped = escapePipe(filename);
    const encoded = filename.split('/').map(encodeURIComponent).join('/');
    return `[${escaped}](${encoded})`;
}

/**
 * Renders the "Changed files" cell for a commit row.
 */
function renderFilesCell(files, ignoredFiles, fileDeltas) {
    if (files.length === 0) return '_no changes_';

    const renderFile = (f) => {
        const delta = fileDeltas?.get(f);
        const link = renderFileLink(f, delta ? delta.status === 'R' : f.includes(' => '));
        let deltaStr = '';
        let statusStr = '';

        if (delta) {
            if (delta.binary) {
                deltaStr = ' _(binary)_';
            } else {
                deltaStr = ` (+${formatNumber(delta.ins)}/-${formatNumber(delta.del)})`;
            }

            if (delta.status === 'A') statusStr = ' _(added)_';
            else if (delta.status === 'D') statusStr = ' _(deleted)_';
            else if (delta.status === 'R') statusStr = ' _(renamed)_';
        }

        const ignored = ignoredFiles.has(f) ? '*' : '';
        return `${link}${deltaStr}${statusStr}${ignored}`;
    };

    if (files.length <= MAX_FILES_PER_COMMIT) {
        return files.map(renderFile).join('<br>');
    }

    const visible = files.slice(0, MAX_FILES_PER_COMMIT);
    const hidden = files.slice(MAX_FILES_PER_COMMIT);
    const hiddenHasIgnored = hidden.some((f) => ignoredFiles.has(f));
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
        deltaStr = `+${formatNumber(commit.insertions)} / -${formatNumber(commit.deletions)}`;
    }

    if (!commit.hasOnlyIgnored && (commit.binaryCount > 0 || commit.textCount > 0)) {
        deltaStr += `<br><br>${pluralize(commit.textCount, 'text file')}`;
        if (commit.binaryCount > 0) {
            deltaStr += `<br>${pluralize(commit.binaryCount, 'binary file')}`;
        }
    }
    return deltaStr;
}

/**
 * Renders one day section as a collapsible <details> block (collapsed by default).
 */
function renderDaySection(date, dayData) {
    const fmt = formatNumber;
    const commitsCount = dayData.commits.length;
    const uniqueFilesCount = dayData.uniqueFiles.size;
    const summaryMeta = `${pluralize(commitsCount, 'commit')} | +${fmt(dayData.totalInsertions)} / -${fmt(dayData.totalDeletions)} | ${pluralize(uniqueFilesCount, 'unique file')}`;

    let md = `<details>\n`;
    md += `<summary><strong>${date}</strong> — ${summaryMeta}</summary>\n\n`;
    md += '| Commit | Changed Files | Delta |\n';
    md += '| :--- | :--- | :---: |\n';

    dayData.commits.forEach(commit => {
        const tagsSuffix = commit.tags && commit.tags.length > 0
            ? ` (${commit.tags.map(t => `🏷️ ${escapePipe(t)}`).join(', ')})`
            : '';
        md += `| ${escapePipe(commit.subject)}${tagsSuffix} | ${renderFilesCell(
            commit.files,
            commit.ignoredFiles,
            commit.fileDeltas
        )} | ${renderDeltaCell(commit)} |\n`;
    });

    md += '\n</details>\n\n';
    return md;
}

/**
 * Renders "Streaks" line (Max streak + Current streak).
 */
function renderStreaksLine(stats) {
    const { maxStreakLength, maxStreakStart, maxStreakEnd, currentStreak = 0 } = stats;
    if (maxStreakLength === 0 && currentStreak === 0) return '';

    const dateRange = maxStreakStart === maxStreakEnd
        ? maxStreakStart
        : `${maxStreakStart} — ${maxStreakEnd}`;

    const parts = [];
    if (maxStreakLength > 0) {
        parts.push(`Max: **${pluralize(maxStreakLength, 'day')}** (${dateRange})`);
    }
    parts.push(`Current: **${pluralize(currentStreak, 'day')}**`);

    return `* 🔥 **Streaks:** ${parts.join(' | ')}\n`;
}

/**
 * Renders "Longest gap" line.
 */
function renderLongestGapLine(stats) {
    const { longestGapLength, longestGapStart, longestGapEnd } = stats;
    if (longestGapLength === 0) return '';

    return `* 😴 **Longest gap:** **${pluralize(longestGapLength, 'day')}** (${longestGapStart} — ${longestGapEnd})\n`;
}

/**
 * Renders "Largest commit" line.
 */
function renderLargestCommitLine(largest, fmt) {
    if (!largest) return '';
    return `* 💪 **Largest commit:** ${largest.date} — ${escapePipe(wrapInlineCode(largest.subject))} (**+${fmt(largest.insertions)} / -${fmt(largest.deletions)}** lines)\n`;
}

/**
 * Renders "Widest commit" line.
 */
function renderWidestCommitLine(widest) {
    if (!widest) return '';
    return `* 🚚 **Widest commit:** ${widest.date} — ${escapePipe(wrapInlineCode(widest.subject))} (**${pluralize(widest.filesCount, 'file')}**)\n`;
}

/**
 * Renders top churn hotspot files block.
 */
function renderHotspotFilesLine(hotspots) {
    if (!hotspots || hotspots.length === 0) return '';

    let md = `* 🔥 **Churn hotspots (by lines changed):**\n`;
    hotspots.forEach(f => {
        md += `  - ${wrapInlineCode(f.file)} (**${pluralize(f.churn, 'line')}**)\n`;
    });
    return md;
}

/**
 * Renders legacy files block (untouched for the longest time).
 */
function renderLegacyFilesLine(legacy) {
    if (!legacy || legacy.length === 0) return '';

    let md = `* 🕰️ **Legacy files (longest untouched):**\n`;
    legacy.forEach(f => {
        md += `  - ${wrapInlineCode(f.file)} (**${pluralize(f.daysAgo, 'day')}** ago, last: ${f.lastDate})\n`;
    });
    return md;
}

/**
 * Renders tech stack block by volume of changed lines.
 */
function renderTechStackByLinesLine(stack) {
    if (!stack || stack.length === 0) return '';

    let md = `* 📏 **Tech stack (by lines changed):**\n`;
    stack.forEach(item => {
        const extDisplay = item.ext === 'no-ext' ? '<no-ext>' : `.${item.ext}`;
        md += `  - \`${extDisplay}\` — **${item.percent}%** (${pluralize(item.churn, 'line')})\n`;
    });
    return md;
}

/**
 * Renders file lifecycle operations breakdown (added, modified, renamed, deleted).
 */
function renderFileLifecycleLine(lifecycle, fmt) {
    if (!lifecycle || !lifecycle.all || lifecycle.all.total === 0) return '';

    const { all, text, binary } = lifecycle;
    const rows = [
        { icon: '➕', label: 'Added', key: 'added' },
        { icon: '✏️', label: 'Modified', key: 'modified' },
        { icon: '📛', label: 'Renamed', key: 'renamed' },
        { icon: '🗑️', label: 'Deleted', key: 'deleted' },
    ];

    let md = `* 🔄 **File lifecycle (${pluralize(all.total, 'operation')}):**\n`;
    for (const r of rows) {
        const totalOp = all[r.key] || 0;
        if (totalOp === 0) continue;
        const pct = ((totalOp / all.total) * 100).toFixed(0);
        const parts = [];
        if (text[r.key] > 0) parts.push(`${fmt(text[r.key])} txt`);
        if (binary[r.key] > 0) parts.push(`${fmt(binary[r.key])} bin`);
        const details = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
        md += `  - ${r.icon} **${r.label}:** ${fmt(totalOp)} (${pct}%${details})\n`;
    }
    return md;
}

/**
 * Renders ASCII histogram of commits per time-of-day period.
 */
function renderTimeOfDayHistogram(timeOfDayStats) {
    if (!timeOfDayStats || !timeOfDayStats.periods || timeOfDayStats.total === 0) return '';

    const maxCount = Math.max(...timeOfDayStats.periods.map(p => p.count));
    const peakNote = timeOfDayStats.peakHour
        ? ` (peak hour: ${timeOfDayStats.peakHour.range} — ${timeOfDayStats.peakHour.count})`
        : '';

    let md = `* ⏰ **Activity by time of day${peakNote}:**\n`;
    for (const period of timeOfDayStats.periods) {
        const bar = renderBar(period.count, maxCount);
        const line = `${period.icon} ${period.label} (${period.range}): \`${bar}\` ${period.percent}% (${period.count})`;
        if (period.count === maxCount && maxCount > 0) {
            md += `  - **${line}**\n`;
        } else {
            md += `  - ${line}\n`;
        }
    }
    return md;
}

/**
 * Renders tech stack block.
 */
function renderTechStackLine(stack) {
    if (!stack || stack.length === 0) return '';

    let md = `* 🧰 **Tech stack (by file touches):**\n`;
    stack.forEach(item => {
        const extDisplay = item.ext === 'no-ext' ? '<no-ext>' : `.${item.ext}`;
        md += `  - \`${extDisplay}\` — **${item.percent}%** (${pluralize(item.count, 'file touch', 'file touches')})\n`;
    });
    return md;
}

/**
 * Renders contributors block.
 */
function renderContributorsLine(contributors, fmt) {
    if (!contributors || contributors.length === 0) return '';

    let md = `* 👥 **Contributors:**\n`;
    contributors.forEach(c => {
        md += `  - **${c.name}** — **${c.percent}%** (${pluralize(c.commits, 'commit')}, +${fmt(c.insertions)} / -${fmt(c.deletions)})\n`;
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
function renderOverview(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts, extra = {}) {
    const fmt = formatNumber;
    const netSign = stats.netChange >= 0 ? '+' : '';
    const {
        widestCommit = null,
        contributors = [],
        timeOfDayStats = null,
        techStackByLines = [],
        fileLifecycle = null,
        hotspotFiles = [],
        legacyFiles = [],
        args = {},
    } = extra;
    const isFiltered = Boolean(args.since || args.until);
    const periodTag = isFiltered ? 'Filtered' : 'Full history';
    const fullRepoSuffix = isFiltered && stats.trueFirstDate
        ? ` | Full repo: ${stats.trueFirstDate} — ${stats.trueLastDate}`
        : '';

    let md = `# 👨‍💻 Repository Statistics: ${repoName}\n\n`;
    md += '## 📊 Overview\n\n';
    md += `* 🎂 **Repo age:** **${pluralize(stats.repoAge, 'day')}** (since ${stats.trueFirstDate || stats.firstDate})\n`;
    md += `* 📅 **Period (${periodTag}):** ${stats.firstDate} — ${stats.lastDate} (active days: **${stats.activeDays}** out of ${stats.totalCalendarDays} — ${stats.activityPercent}%${fullRepoSuffix})\n`;
    md += `* 📦 **Total commits:** ${fmt(stats.totalCommits)} (avg **${stats.avgCommitsPerActiveDay}** commits per active day)\n`;
    md += `* 📏 **Volume of changes:** +${fmt(stats.totalInsertions)} / -${fmt(stats.totalDeletions)} lines (net change: **${netSign}${fmt(stats.netChange)}** lines)\n`;
    md += `* 🗂️ **Unique files:** **${fmt(stats.totalUniqueFiles)}** tracked files\n`;
    md += `* 📐 **Average per commit:** +${stats.avgPerCommitIns} / -${stats.avgPerCommitDel} lines | **${stats.avgFilesPerCommit}** files\n`;
    md += `* 📈 **Average per active day:** +${fmt(stats.avgPerActiveDayIns)} / -${fmt(stats.avgPerActiveDayDel)} lines\n`;
    md += `* 🏆 **Record by commits:** ${stats.recordCommitsDate} (**${pluralize(stats.recordCommitsCount, 'commit')}**)\n`;
    md += `* 🔨 **Record by code churn:** ${stats.recordCodeDate} (**+${fmt(stats.recordCodeIns)} / -${fmt(stats.recordCodeDel)}** lines)\n`;
    md += renderStreaksLine(stats);
    md += renderLongestGapLine(stats);
    md += renderLargestCommitLine(largestCommit, fmt);
    md += renderWidestCommitLine(widestCommit);
    md += renderTimeOfDayHistogram(timeOfDayStats);
    md += renderWeekdayHistogram(weekdayCounts);
    md += renderMonthHistogram(monthCounts);

    if (topFiles.length > 0) {
        md += `* 📂 **Most frequent changed files:**\n`;
        topFiles.forEach(f => {
            md += `  - ${wrapInlineCode(f.file)} (changed in **${pluralize(f.count, 'commit')}**)\n`;
        });
    }

    md += renderHotspotFilesLine(hotspotFiles);
    md += renderLegacyFilesLine(legacyFiles);
    md += renderTechStackLine(techStack);
    md += renderTechStackByLinesLine(techStackByLines);
    md += renderFileLifecycleLine(fileLifecycle, fmt);
    md += renderContributorsLine(contributors, fmt);
    md += '\n';
    return md;
}

/**
 * Renders the Releases & Tags section (Release Notes).
 * Collapses all releases into <details> blocks by default.
 */
function renderReleases(releases) {
    if (!releases || releases.length === 0) return '';

    const fmt = formatNumber;
    let md = '## 🏷️ Releases & Tags\n\n';

    releases.forEach((rel) => {
        const title = rel.isUnreleased ? '🚧 Unreleased' : `🏷️ ${rel.name}`;
        const rangeStr = rel.firstDate && rel.lastDate && rel.firstDate !== rel.lastDate
            ? `${rel.firstDate} — ${rel.lastDate}`
            : (rel.lastDate || rel.date || '');
        const datePart = rangeStr ? ` (${rangeStr})` : '';
        const metaPart = `${pluralize(rel.commits.length, 'commit')} | +${fmt(rel.insertions)} / -${fmt(rel.deletions)} | ${pluralize(rel.uniqueFilesCount, 'unique file')}`;

        md += `<details>\n`;
        md += `<summary><strong>${title}</strong>${datePart} — ${metaPart}</summary>\n\n`;
        rel.commits.forEach(c => {
            md += `- ${c.subject}\n`;
        });
        md += '\n</details>\n\n';
    });

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
    renderReleases,
    renderChangelog,
};
