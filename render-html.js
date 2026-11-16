const { escapePipe, MAX_FILES_PER_COMMIT, formatNumber, renderBar, WEEKDAY_NAMES } = require('./utils');

/**
 * Renders an HTML link to a file: <a href="path">name</a>
 */
function renderFileLinkHTML(filename) {
    const encoded = encodeURI(filename);
    return `<a href="${encoded}">${filename}</a>`;
}

/**
 * Wraps content in a minimal HTML template (no styles yet).
 */
function wrapInHTMLTemplate(content, title) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body>
${content}
</body>
</html>`;
}

/**
 * HTML version of renderFilesCell.
 */
function renderFilesCellHTML(files, ignoredFiles) {
    if (files.length === 0) return '<em>no changes</em>';

    const renderFile = (f) => {
        const link = renderFileLinkHTML(f);
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
    result += `<br><details><summary><em>Show ${hidden.length} more files${summarySuffix}</em></summary><br><br>`;
    result += hidden.map(renderFile).join('<br>');
    result += `</details>`;

    return result;
}

/**
 * HTML version of renderDeltaCell.
 */
function renderDeltaCellHTML(commit) {
    let deltaStr;

    if (commit.hasOnlyIgnored) {
        deltaStr = '<em>ignored files only</em>';
    } else if (commit.insertions === 0 && commit.deletions === 0 && commit.binaryCount > 0) {
        deltaStr = '<em>binaries only</em>';
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
 * HTML version of renderDaySection.
 */
function renderDaySectionHTML(date, dayData) {
    const fmt = formatNumber;
    const commitsCount = dayData.commits.length;
    const uniqueFilesCount = dayData.uniqueFiles.size;

    let html = `<h3>${date}: ${commitsCount} commits (+${fmt(dayData.totalInsertions)} / -${fmt(dayData.totalDeletions)}) in ${uniqueFilesCount} unique files</h3>\n`;
    html += '<table>\n';
    html += '<thead><tr><th>Commit</th><th>Changed files</th><th>Delta</th></tr></thead>\n';
    html += '<tbody>\n';

    dayData.commits.forEach(commit => {
        html += `<tr><td>${commit.subject}</td><td>${renderFilesCellHTML(commit.files, commit.ignoredFiles)}</td><td>${renderDeltaCellHTML(commit)}</td></tr>\n`;
    });

    html += '</tbody>\n</table>\n';
    return html;
}

/**
 * HTML version of renderMaxStreakLine.
 */
function renderMaxStreakLineHTML(stats) {
    const { maxStreakLength, maxStreakStart, maxStreakEnd } = stats;
    if (maxStreakLength === 0) return '';

    const dateRange = maxStreakStart === maxStreakEnd
        ? maxStreakStart
        : `${maxStreakStart} — ${maxStreakEnd}`;

    return `<li>🔥 <strong>Max streak:</strong> <strong>${maxStreakLength}</strong> consecutive active day(s) (${dateRange})</li>\n`;
}

/**
 * HTML version of renderLargestCommitLine.
 */
function renderLargestCommitLineHTML(largest, fmt) {
    if (!largest) return '';
    return `<li>💪 <strong>Largest commit:</strong> ${largest.date} — <code>${largest.subject}</code> (<strong>+${fmt(largest.insertions)} / -${fmt(largest.deletions)}</strong> lines)</li>\n`;
}

/**
 * HTML version of renderTechStackLine.
 */
function renderTechStackLineHTML(stack) {
    if (!stack || stack.length === 0) return '';

    let html = `<li>🧰 <strong>Tech stack (by commits):</strong>
  <ul>\n`;
    stack.forEach(item => {
        const extDisplay = item.ext === 'no-ext' ? '&lt;no-ext&gt;' : `.${item.ext}`;
        html += `    <li><code>${extDisplay}</code> — <strong>${item.percent}%</strong> (${item.count} file-touches)</li>\n`;
    });
    html += `  </ul>
</li>\n`;
    return html;
}

/**
 * HTML version of renderWeekdayHistogram.
 */
function renderWeekdayHistogramHTML(weekdayCounts) {
    const total = Object.values(weekdayCounts).reduce((s, c) => s + c, 0);
    if (total === 0) return '';

    const maxCount = Math.max(...Object.values(weekdayCounts));

    let html = `<li>📊 <strong>Activity by day of week:</strong>
  <ul>\n`;
    for (const day of WEEKDAY_NAMES) {
        const count = weekdayCounts[day] || 0;
        const percent = ((count / total) * 100).toFixed(0);
        const bar = renderBar(count, maxCount);

        if (count === maxCount && maxCount > 0) {
            html += `    <li><strong>${day}: <code>${bar}</code> ${percent}% (${count})</strong> 😩</li>\n`;
        } else {
            html += `    <li>${day}: <code>${bar}</code> ${percent}% (${count})</li>\n`;
        }
    }
    html += `  </ul>
</li>\n`;
    return html;
}

/**
 * HTML version of renderOverview.
 */
function renderOverviewHTML(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts) {
    const fmt = formatNumber;
    const netSign = stats.netChange >= 0 ? '+' : '';

    let html = `<h1>👨‍💻 Repository Statistics: ${repoName}</h1>\n`;
    html += '<h2>📊 Overview</h2>\n';
    html += '<ul>\n';
    html += `<li>📅 <strong>Period:</strong> ${stats.firstDate} — ${stats.lastDate} (active days: <strong>${stats.activeDays}</strong> out of ${stats.totalCalendarDays} — ${stats.activityPercent}%)</li>\n`;
    html += `<li>📦 <strong>Total commits:</strong> ${fmt(stats.totalCommits)} (avg <strong>${stats.avgCommitsPerActiveDay}</strong> commits per active day)</li>\n`;
    html += `<li>📏 <strong>Volume of changes:</strong> +${fmt(stats.totalInsertions)} / -${fmt(stats.totalDeletions)} lines (net change: <strong>${netSign}${fmt(stats.netChange)}</strong> lines)</li>\n`;
    html += `<li>📐 <strong>Average per commit:</strong> +${stats.avgPerCommitIns} / -${stats.avgPerCommitDel} lines | <strong>${stats.avgFilesPerCommit}</strong> files</li>\n`;
    html += `<li>📈 <strong>Average per active day:</strong> +${fmt(stats.avgPerActiveDayIns)} / -${fmt(stats.avgPerActiveDayDel)} lines</li>\n`;
    html += `<li>🏆 <strong>Record by commits:</strong> ${stats.recordCommitsDate} (<strong>${stats.recordCommitsCount}</strong> commits)</li>\n`;
    html += `<li>🔨 <strong>Record by code churn:</strong> ${stats.recordCodeDate} (<strong>+${fmt(stats.recordCodeIns)} / -${fmt(stats.recordCodeDel)}</strong> lines)</li>\n`;
    html += renderMaxStreakLineHTML(stats);
    html += renderLargestCommitLineHTML(largestCommit, fmt);
    html += renderWeekdayHistogramHTML(weekdayCounts);

    if (topFiles.length > 0) {
        html += `<li>📂 <strong>Most frequent changed files:</strong>
  <ul>\n`;
        topFiles.forEach(f => {
            html += `    <li><code>${f.file}</code> (changed in <strong>${f.count}</strong> commits)</li>\n`;
        });
        html += `  </ul>
</li>\n`;
    }

    html += renderTechStackLineHTML(techStack);
    html += '</ul>\n';
    return html;
}

/**
 * HTML version of renderChangelog.
 */
function renderChangelogHTML(groupedByDate) {
    let html = '<h2>Changelog Details</h2>\n';
    html += '<blockquote>* — file is excluded from statistics (lock files, dist, minified, etc.)</blockquote>\n';

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
    sortedDates.forEach(date => {
        html += renderDaySectionHTML(date, groupedByDate[date]);
    });
    return html;
}

module.exports = {
    renderOverviewHTML,
    renderChangelogHTML,
    wrapInHTMLTemplate
};