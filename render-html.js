const fs = require('fs');
const path = require('path');
const { MAX_FILES_PER_COMMIT, formatNumber, escapeHtml, WEEKDAY_NAMES } = require('./utils');

/**
 * Reads CSS file from misc/repo-stats.css.
 * Falls back to empty string if file not found.
 */
function loadCSS() {
    try {
        const cssPath = path.join(__dirname, 'repo-stats.css');
        return fs.readFileSync(cssPath, 'utf-8');
    } catch (e) {
        console.warn('⚠️ Could not load repo-stats.css, using empty styles.');
        return '';
    }
}

/**
 * Renders an HTML link to a file: <a href="path">name</a>
 */
function renderFileLinkHTML(filename) {
    if (filename.includes(' => ')) {
        return `<code>${escapeHtml(filename)}</code>`;
    }

    const encoded = encodeURI(filename);
    return `<a href="${encoded}">${escapeHtml(filename)}</a>`;
}

/**
 * Wraps content in an HTML document with styles from repo-stats.css.
 */
function wrapInHTMLTemplate(content, title) {
    const css = loadCSS();
    const generatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body>
<p class="generated-at">Generated: ${generatedAt}</p>
${content}
</body>
</html>`;
}

/**
 * Renders the "Changed files" cell.
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
    const summarySuffix = hidden.some(f => ignoredFiles.has(f)) ? '*' : '';

    let result = visible.map(renderFile).join('<br>');
    result += `<details><summary><em>Show ${hidden.length} more files${summarySuffix}</em></summary>`;
    result += hidden.map(renderFile).join('<br>');
    result += `</details>`;

    return result;
}

/**
 * Renders the "Delta" cell.
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
 * Renders one day section.
 */
function renderDaySectionHTML(date, dayData) {
    const fmt = formatNumber;
    const commitsCount = dayData.commits.length;
    const uniqueFilesCount = dayData.uniqueFiles.size;

    let html = `<h3>${date}: ${commitsCount} commits (+${fmt(dayData.totalInsertions)} / -${fmt(dayData.totalDeletions)}) in ${uniqueFilesCount} unique files</h3>\n`;
    html += '<table>\n<thead><tr><th>Commit</th><th>Changed files</th><th>Delta</th></tr></thead>\n<tbody>\n';

    dayData.commits.forEach((commit) => {
        const timeHtml = commit.time ? `<br><span class="commit-time">Committed: ${commit.time} GMT +3</span>` : '';
        html += `<tr><td>${escapeHtml(commit.subject)}${timeHtml}</td><td>${renderFilesCellHTML(commit.files, commit.ignoredFiles)}</td><td>${renderDeltaCellHTML(commit)}</td></tr>\n`;
    });

    html += '</tbody>\n</table>\n';
    return html;
}

/**
 * Renders "Max streak" line.
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
 * Renders "Longest gap" line.
 */
function renderLongestGapLineHTML(stats) {
    const { longestGapLength, longestGapStart, longestGapEnd } = stats;
    if (longestGapLength === 0) return '';

    return `<li>😴 <strong>Longest gap:</strong> <strong>${longestGapLength}</strong> day(s) (${longestGapStart} — ${longestGapEnd})</li>\n`;
}

/**
 * Renders "Largest commit" line.
 */
function renderLargestCommitLineHTML(largest, fmt) {
    if (!largest) return '';
    return `<li>💪 <strong>Largest commit:</strong> ${largest.date} — <code>${escapeHtml(largest.subject)}</code> (<strong>+${fmt(largest.insertions)} / -${fmt(largest.deletions)}</strong> lines)</li>\n`;
}

/**
 * Renders tech stack block.
 */
function renderTechStackLineHTML(stack) {
    if (!stack || stack.length === 0) return '';

    let html = `<li>🧰 <strong>Tech stack (by commits):</strong>\n  <ul>\n`;
    stack.forEach(item => {
        const extDisplay = item.ext === 'no-ext' ? '<no-ext>' : `.${item.ext}`;
        html += `    <li><code>${escapeHtml(extDisplay)}</code> — <strong>${item.percent}%</strong> (${item.count} file-touches)</li>\n`;
    });
    html += `  </ul>\n</li>\n`;
    return html;
}

/**
 * Renders histogram of commits per weekday with CSS bars.
 */
function renderWeekdayHistogramHTML(weekdayCounts) {
    const total = Object.values(weekdayCounts).reduce((s, c) => s + c, 0);
    if (total === 0) return '';

    const maxCount = Math.max(...Object.values(weekdayCounts));

    let html = `<li>📊 <strong>Activity by day of week:</strong>\n  <ul class="histogram-list">\n`;
    for (const day of WEEKDAY_NAMES) {
        const count = weekdayCounts[day] || 0;
        const percent = ((count / total) * 100).toFixed(0);
        const barWidth = maxCount > 0 ? ((count / maxCount) * 100).toFixed(1) : 0;
        const isPeak = count === maxCount && maxCount > 0;

        html += `    <li class="bar-row${isPeak ? ' bar-row--peak' : ''}">\n`;
        html += `      <span class="bar-label">${day}</span>\n`;
        html += `      <div class="bar-container">\n`;
        html += `        <div class="bar" style="width: ${barWidth}%"></div>\n`;
        html += `      </div>\n`;
        html += `      <span class="bar-value">${percent}% (${count})</span>\n`;
        html += `    </li>\n`;
    }
    html += `  </ul>\n</li>\n`;
    return html;
}

/**
 * Renders histogram of commits per month with CSS bars.
 */
function renderMonthHistogramHTML(monthCounts) {
    if (!monthCounts || monthCounts.length === 0) return '';

    const maxCount = Math.max(...monthCounts.map((m) => m[1]));

    let html = `<li>📅 <strong>Activity by month:</strong>\n  <ul class="histogram-list">\n`;
    for (const [month, count] of monthCounts) {
        const barWidth = maxCount > 0 ? ((count / maxCount) * 100).toFixed(1) : 0;
        const isPeak = count === maxCount && maxCount > 0; // 🎯 Добавили проверку пика

        html += `    <li class="bar-row${isPeak ? ' bar-row--peak' : ''}">\n`; // 🎯 Добавили класс
        html += `      <span class="bar-label">${month}</span>\n`;
        html += `      <div class="bar-container">\n`;
        html += `        <div class="bar" style="width: ${barWidth}%"></div>\n`;
        html += `      </div>\n`;
        html += `      <span class="bar-value">${count}</span>\n`;
        html += `    </li>\n`;
    }
    html += `  </ul>\n</li>\n`;
    return html;
}

/**
 * Renders the overview statistics block.
 */
function renderOverviewHTML(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts) {
    const fmt = formatNumber;
    const netSign = stats.netChange >= 0 ? '+' : '';

    let html = `<h1>👨‍💻 Repository Statistics: ${escapeHtml(repoName)}</h1>\n`;
    html += '<h2>📊 Overview</h2>\n<ul>\n';
    html += `<li>🎂 <strong>Repo age:</strong> <strong>${stats.repoAge} days</strong> (since ${stats.firstDate})</li>\n`;
    html += `<li>📅 <strong>Period:</strong> ${stats.firstDate} — ${stats.lastDate} (active days: <strong>${stats.activeDays}</strong> out of ${stats.totalCalendarDays} — ${stats.activityPercent}%)</li>\n`;
    html += `<li>📦 <strong>Total commits:</strong> ${fmt(stats.totalCommits)} (avg <strong>${stats.avgCommitsPerActiveDay}</strong> commits per active day)</li>\n`;
    html += `<li>📏 <strong>Volume of changes:</strong> +${fmt(stats.totalInsertions)} / -${fmt(stats.totalDeletions)} lines (net change: <strong>${netSign}${fmt(stats.netChange)}</strong> lines)</li>\n`;
    html += `<li>📐 <strong>Average per commit:</strong> +${stats.avgPerCommitIns} / -${stats.avgPerCommitDel} lines | <strong>${stats.avgFilesPerCommit}</strong> files</li>\n`;
    html += `<li>📈 <strong>Average per active day:</strong> +${fmt(stats.avgPerActiveDayIns)} / -${fmt(stats.avgPerActiveDayDel)} lines</li>\n`;
    html += `<li>🏆 <strong>Record by commits:</strong> ${stats.recordCommitsDate} (<strong>${stats.recordCommitsCount}</strong> commits)</li>\n`;
    html += `<li>🔨 <strong>Record by code churn:</strong> ${stats.recordCodeDate} (<strong>+${fmt(stats.recordCodeIns)} / -${fmt(stats.recordCodeDel)}</strong> lines)</li>\n`;
    html += renderMaxStreakLineHTML(stats);
    html += renderLongestGapLineHTML(stats);
    html += renderLargestCommitLineHTML(largestCommit, fmt);
    html += renderWeekdayHistogramHTML(weekdayCounts);
    html += renderMonthHistogramHTML(monthCounts);

    if (topFiles.length > 0) {
        html += `<li>📂 <strong>Most frequent changed files:</strong>\n  <ul>\n`;
        topFiles.forEach(f => {
            html += `    <li><code>${escapeHtml(f.file)}</code> (changed in <strong>${f.count}</strong> commits)</li>\n`;
        });
        html += `  </ul>\n</li>\n`;
    }

    html += renderTechStackLineHTML(techStack);
    html += '</ul>\n';
    return html;
}

/**
 * Renders the full changelog section.
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
