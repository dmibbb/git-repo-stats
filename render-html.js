const fs = require('fs');
const path = require('path');
const { MAX_FILES_PER_COMMIT, formatNumber, escapeHtml, WEEKDAY_NAMES, MONTH_NAMES } = require('./utils');

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
 * Renders an HTML link to a file.
 */
function renderFileLinkHTML(filename) {
    if (filename.includes(' => ')) {
        return `<code>${escapeHtml(filename)}</code>`;
    }

    const encoded = encodeURI(filename);
    return `<a href="${encoded}" class="file-link">${escapeHtml(filename)}</a>`;
}

/**
 * Wraps content in an HTML document.
 */
function wrapInHTMLTemplate(content, title, generatedAt) {
    const css = loadCSS();
    const searchScript = `
<script>
(function() {
    const searchInput = document.querySelector('.search-input');
    if (!searchInput) return;

    const rows = document.querySelectorAll('.commit-row');
    const days = document.querySelectorAll('.changelog-day');
    const counter = document.querySelector('.search-counter');

    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        let visibleCount = 0;

        // Filter rows
        rows.forEach(row => {
            const match = !query || row.textContent.toLowerCase().includes(query);
            row.classList.toggle('hidden', !match);
            if (match) visibleCount++;
        });

        // Hide days with no visible rows
        days.forEach(day => {
            const hasVisible = day.querySelector('.commit-row:not(.hidden)');
            day.classList.toggle('hidden', !hasVisible && query);
        });

        // Update counter
        if (counter) {
            if (query) {
                counter.textContent = visibleCount + ' result' + (visibleCount !== 1 ? 's' : '');
            } else {
                counter.textContent = '';
            }
        }
    });
})();
</script>`;

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
<div class="dashboard-container">
${content}
<footer class="dashboard-footer">
  Generated: ${generatedAt} · Repository Statistics
</footer>
</div>
${searchScript}
</body>
</html>`;
}

/**
 * Renders the "Changed files" cell.
 */
function renderFilesCellHTML(files, ignoredFiles, fileDeltas) {
    if (files.length === 0) return '<em>no changes</em>';

    const renderFile = (f) => {
        const link = renderFileLinkHTML(f);
        const delta = fileDeltas?.get(f);
        let deltaHtml = '';
        if (delta) {
            if (delta.binary) {
                deltaHtml = ' <span class="file-delta">(binary)</span>';
            } else {
                deltaHtml = ` <span class="file-delta">(<span class="file-ins">+${formatNumber(delta.ins)}</span>/<span class="file-del">-${formatNumber(delta.del)}</span>)</span>`;
            }
        }
        const ignored = ignoredFiles.has(f) ? '*' : '';
        return `${link}${deltaHtml}${ignored}`;
    };

    if (files.length <= MAX_FILES_PER_COMMIT) {
        return files.map(renderFile).join('<br>');
    }

    const visible = files.slice(0, MAX_FILES_PER_COMMIT);
    const hidden = files.slice(MAX_FILES_PER_COMMIT);
    const summarySuffix = hidden.some((f) => ignoredFiles.has(f)) ? '*' : '';

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
        deltaStr = `<span class="positive">+${commit.insertions}</span> / <span class="negative">-${commit.deletions}</span>`;
    }

    if (!commit.hasOnlyIgnored && (commit.binaryCount > 0 || commit.textCount > 0)) {
        deltaStr += `<br><br><span style="font-size: 0.8em">${commit.textCount} text files`;
        if (commit.binaryCount > 0) {
            deltaStr += `<br>${commit.binaryCount} binary files`;
        }
        deltaStr += `</span>`;
    }
    return deltaStr;
}

/**
 * Renders one day section as a table.
 */
function renderDaySectionHTML(date, dayData) {
    const fmt = formatNumber;
    const commitsCount = dayData.commits.length;
    const uniqueFilesCount = dayData.uniqueFiles.size;

    let html = `<div class="changelog-day">`;
    html += `<h3>${date}: ${commitsCount} commits (+${fmt(dayData.totalInsertions)} / -${fmt(dayData.totalDeletions)}) in ${uniqueFilesCount} unique files</h3>\n`;
    html += '<table class="changelog-table">\n<thead><tr><th>Commit</th><th>Changed files</th><th>Delta</th></tr></thead>\n<tbody>\n';

    dayData.commits.forEach((commit) => {
        const timeHtml = commit.time ? `<span class="commit-time">Committed: ${commit.time.slice(0, 8)}</span>` : '';
        html += `<tr class="commit-row"><td><div class="commit-subject">${escapeHtml(commit.subject)}</div>${timeHtml}</td><td>${renderFilesCellHTML(commit.files, commit.ignoredFiles, commit.fileDeltas)}</td><td class="delta-cell">${renderDeltaCellHTML(commit)}</td></tr>\n`;
    });

    html += '</tbody>\n</table>\n</div>\n';
    return html;
}

/**
 * Renders a single KPI card.
 */
function renderKPICard(icon, title, value, sub) {
    return `<div class="card">
    <div class="card-header">
      <span class="card-title">${icon} ${title}</span>
      <span class="card-icon">${icon}</span>
    </div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </div>`;
}

/**
 * Renders the dashboard header.
 */
function renderHeader(repoName, stats) {
    return `<div class="dashboard-header">
    <h1>👨‍💻 Repository Statistics: ${escapeHtml(repoName)}</h1>
    <div class="header-meta">📅 ${stats.firstDate} — ${stats.lastDate}</div>
  </div>`;
}

/**
 * Renders the volume banner.
 */
function renderVolumeBanner(stats, fmt) {
    const netSign = stats.netChange >= 0 ? '+' : '';

    return `<div class="volume-banner">
    <div class="volume-item">
      <div class="label">📏 Volume of changes</div>
      <div class="value positive">+${fmt(stats.totalInsertions)}</div>
    </div>
    <div class="volume-item">
      <div class="label">Deletions</div>
      <div class="value negative">-${fmt(stats.totalDeletions)}</div>
    </div>
    <div class="volume-item">
      <div class="label">Net change</div>
      <div class="value ${stats.netChange >= 0 ? 'positive' : 'negative'}">${netSign}${fmt(stats.netChange)}</div>
    </div>
    <div class="volume-item">
      <div class="label">📦 Total commits</div>
      <div class="value neutral">${fmt(stats.totalCommits)}</div>
    </div>
    <div class="volume-item">
      <div class="label">📅 Active days</div>
      <div class="value neutral">${stats.activeDays} <span style="font-size:0.7em;color:var(--fg-muted)">/ ${stats.totalCalendarDays} (${stats.activityPercent}%)</span></div>
    </div>
  </div>`;
}

/**
 * Renders weekday histogram as CSS bars.
 */
function renderWeekdayHistogramHTML(weekdayCounts) {
    const total = Object.values(weekdayCounts).reduce((s, c) => s + c, 0);
    if (total === 0) return '';

    const maxCount = Math.max(...Object.values(weekdayCounts));
    let html = `<div class="card"><div class="card-header"><span class="card-title">Activity by day of week</span></div><ul class="histogram-list">\n`;
    for (const day of WEEKDAY_NAMES) {
        const count = weekdayCounts[day] || 0;
        const percent = ((count / total) * 100).toFixed(0);
        const barWidth = maxCount > 0 ? ((count / maxCount) * 100).toFixed(1) : 0;
        const isPeak = count === maxCount && maxCount > 0;

        html += `<li class="bar-row${isPeak ? ' bar-row--peak' : ''}">
      <span class="bar-label">${day}</span>
      <div class="bar-container"><div class="bar" style="width: ${barWidth}%"></div></div>
      <span class="bar-value">${percent}% (${count})</span>
    </li>\n`;
    }
    html += `</ul></div>`;
    return html;
}

/**
 * Renders month histogram as CSS bars.
 */
function renderMonthHistogramHTML(monthCounts) {
    if (!monthCounts || monthCounts.length === 0) return '';

    const maxCount = Math.max(...monthCounts.map((m) => m[1]));

    let html = `<div class="card"><div class="card-header"><span class="card-title">Activity by month</span></div><ul class="histogram-list">\n`;
    for (const [month, count] of monthCounts) {
        const barWidth = maxCount > 0 ? ((count / maxCount) * 100).toFixed(1) : 0;
        const isPeak = count === maxCount && maxCount > 0;
        html += `<li class="bar-row${isPeak ? ' bar-row--peak' : ''}">
      <span class="bar-label">${month}</span>
      <div class="bar-container"><div class="bar" style="width: ${barWidth}%"></div></div>
      <span class="bar-value">${count}</span>
    </li>\n`;
    }
    html += `</ul></div>`;

    return html;
}

/**
 * Renders the most frequent files card.
 */
function renderTopFilesCard(topFiles) {
    if (!topFiles || topFiles.length === 0) return '';

    let html = `<div class="card"><div class="card-header"><span class="card-title">📂 Most frequent changed files</span></div><ul class="details-list">\n`;
    topFiles.forEach((f) => {
        html += `<li><span class="file-name">${escapeHtml(f.file)}</span><span class="count">${f.count} commits</span></li>\n`;
    });
    html += `</ul></div>`;

    return html;
}

/**
 * Renders the tech stack card.
 */
function renderTechStackCard(stack) {
    if (!stack || stack.length === 0) return '';

    let html = `<div class="card"><div class="card-header"><span class="card-title">🧰 Tech stack (by commits)</span></div>\n`;
    stack.forEach((item) => {
        const extDisplay = item.ext === 'no-ext' ? '<no-ext>' : `.${item.ext}`;
        html += `<div class="tech-bar-row">
      <span class="tech-ext">${escapeHtml(extDisplay)}</span>
      <div class="tech-bar-container"><div class="tech-bar" style="width: ${item.percent}%"></div></div>
      <span class="tech-percent">${item.percent}%</span>
    </div>\n`;
    });
    html += `</div>`;

    return html;
}

/**
 * Renders contribution heatmap for the last year (GitHub-style).
 * Range: from Monday 52 weeks ago to today, aligned by weeks (Mon-first).
 */
function renderHeatmapHTML(groupedByDate) {
    if (!groupedByDate || Object.keys(groupedByDate).length === 0) return '';

    // --- 1. Getting the range: Mon - 52 Weeks till today ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364); // ~52 weeks ago

    // СShift back to Mon (getDay(): 0=Sun, 1=Mon, ..., 6=Sat)
    const daysToMonday = (startDate.getDay() + 6) % 7;
    startDate.setDate(startDate.getDate() - daysToMonday);

    // --- 2. Generate days array ---
    const formatDateLocal = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const days = [];
    const cursor = new Date(startDate);
    while (cursor <= today) {
        const dateStr = formatDateLocal(cursor);
        const commitsCount = groupedByDate[dateStr]?.commits.length || 0;
        days.push({ date: new Date(cursor), dateStr, commitsCount });
        cursor.setDate(cursor.getDate() + 1);
    }

    // Group by weeks (columns)
    const weeks = [];
    let currentWeek = [];
    days.forEach((day) => {
        currentWeek.push(day);
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });
    if (currentWeek.length > 0) weeks.push(currentWeek);

    // --- 4. Determine month labels for each week ---
    const monthLabels = weeks.map(week => MONTH_NAMES[week[0].date.getMonth()]);

    // --- 5. Helper for cells ---
    const getLevel = (count) => {
        if (count === 0) return '';
        if (count <= 2) return 'l1';
        if (count <= 5) return 'l2';
        if (count <= 10) return 'l3';
        return 'l4';
    };

    const numWeeks = weeks.length;
    const gridCols = `40px repeat(${numWeeks}, 1fr)`;

    // --- 6. Render ---
    let html = '<div class="card"><div class="card-header"><span class="card-title">🗓️ Contribution Heatmap (last year)</span></div>\n';
    html += '<div class="heatmap-container">\n';
    html += '<div class="heatmap-grid-wrapper">\n';

    // Month labels row
    html += `<div class="heatmap-months" style="grid-template-columns: ${gridCols}">\n`;
    html += '<div class="heatmap-day-labels-spacer"></div>\n';
    weeks.forEach((week, i) => {
        const showLabel = i === 0 || monthLabels[i] !== monthLabels[i - 1];
        html += `<div class="heatmap-month-label">${showLabel ? monthLabels[i] : ''}</div>\n`;
    });
    html += '</div>\n';

    // Grid with day labels
    html += `<div class="heatmap-grid" style="grid-template-columns: ${gridCols}; grid-template-rows: repeat(7, 1fr)">\n`;

    // Day labels (Mon, Wed, Fri)
    const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
    dayLabels.forEach((label, i) => {
        html += `<div class="heatmap-day-label" style="grid-row: ${i + 1}">${label}</div>\n`;
    });

    // Cells
    weeks.forEach((week, weekIndex) => {
        week.forEach((day, dayIndex) => {
            const level = getLevel(day.commitsCount);
            const title = day.commitsCount === 0
                ? `No commits on ${day.dateStr}`
                : `${day.commitsCount} commit${day.commitsCount === 1 ? '' : 's'} on ${day.dateStr}`;
            html += `<div class="heatmap-cell ${level}" style="grid-column: ${weekIndex + 2}; grid-row: ${dayIndex + 1}" title="${title}"></div>\n`;
        });
    });

    html += '</div>\n'; // heatmap-grid

    // Legend
    html += '<div class="heatmap-legend">\n';
    html += '<span>Less</span>\n';
    html += '<div class="swatch" style="background: var(--bg-soft)"></div>\n';
    html += '<div class="swatch" style="background: color-mix(in srgb, var(--added) 30%, var(--bg-soft))"></div>\n';
    html += '<div class="swatch" style="background: color-mix(in srgb, var(--added) 55%, var(--bg-soft))"></div>\n';
    html += '<div class="swatch" style="background: color-mix(in srgb, var(--added) 80%, var(--bg-soft))"></div>\n';
    html += '<div class="swatch" style="background: var(--added)"></div>\n';
    html += '<span>More</span>\n';
    html += '</div>\n';

    html += '</div>\n'; // heatmap-grid-wrapper
    html += '</div>\n'; // heatmap-container
    html += '</div>\n'; // card

    return html;
}

/**
 * Renders search bar for changelog (visual only, no functionality).
 */
function renderSearchBarHTML() {
    let html = '<div class="search-bar">\n';
    html += '<input type="text" class="search-input" placeholder="🔍 Search commits, files, authors...">\n';
    html += '<span class="search-counter"></span>\n';
    html += '</div>\n';
    return html;
}

/**
 * Renders the full dashboard overview.
 */
function renderOverviewHTML(repoName, stats, topFiles, largestCommit, techStack, weekdayCounts, monthCounts, groupedByDate) {
    const fmt = formatNumber;
    let html = '';

    // Header
    html += renderHeader(repoName, stats);

    // Volume Banner
    html += renderVolumeBanner(stats, fmt);

    // Row 1: Main KPIs
    html += `<div class="grid grid-4">`;
    html += renderKPICard('📦', 'Total commits', fmt(stats.totalCommits), `avg ${stats.avgCommitsPerActiveDay} / active day`);
    html += renderKPICard('📐', 'Avg per commit', `+${stats.avgPerCommitIns} / -${stats.avgPerCommitDel}`, `${stats.avgFilesPerCommit} files per commit`);
    html += renderKPICard('🏆', 'Record by commits', `${stats.recordCommitsCount}`, `on ${stats.recordCommitsDate}`);
    html += renderKPICard('🔨', 'Record by churn', `<span class="positive">+${fmt(stats.recordCodeIns)}</span> / <span class="negative">-${fmt(stats.recordCodeDel)}</span>`, `on ${stats.recordCodeDate}`);
    html += `</div>`;

    // Row 2: Secondary metrics
    html += `<div class="grid grid-4">`;
    html += renderKPICard('📈', 'Avg per active day', `+${fmt(stats.avgPerActiveDayIns)} / -${fmt(stats.avgPerActiveDayDel)}`, 'lines per day');
    html += renderKPICard('📅', 'Active days', `${stats.activeDays} / ${stats.totalCalendarDays}`, `${stats.activityPercent}% activity · Period: ${stats.firstDate} — ${stats.lastDate}`);
    html += renderKPICard('📊', 'Activity by month', `${monthCounts.length} months`, monthCounts.map(m => `${m[0].split('-')[1]}: ${m[1]}`).join(' · '));
    html += renderKPICard('💪', 'Largest commit', `<span class="positive">+${fmt(largestCommit?.insertions || 0)}</span> / <span class="negative">-${fmt(largestCommit?.deletions || 0)}</span>`, largestCommit ? `${escapeHtml(largestCommit.subject)}<br>${largestCommit.date}` : '');
    html += `</div>`;

    // Row 3: Streaks & Age
    html += `<div class="grid grid-4">`;
    html += renderKPICard('🔥', 'Max streak', `${stats.maxStreakLength} days`, `${stats.maxStreakStart} — ${stats.maxStreakEnd}`);
    html += renderKPICard('😴', 'Longest gap', `${stats.longestGapLength} days`, `${stats.longestGapStart} — ${stats.longestGapEnd}`);
    html += renderKPICard('🎂', 'Repo age', `${stats.repoAge} days`, `since ${stats.firstDate}`);
    html += renderKPICard('🕐', 'Activity by time of day', '<em style="font-size:0.9rem">Coming soon</em>', '');
    html += `</div>`;

    // Activity Patterns
    html += `<div class="section-title">📊 Activity Patterns</div>`;
    html += `<div class="grid grid-2">`;
    html += renderWeekdayHistogramHTML(weekdayCounts);
    html += renderMonthHistogramHTML(monthCounts);
    html += `</div>`;

    // Heatmap-365
    html += renderHeatmapHTML(groupedByDate);

    // Details
    html += `<div class="grid grid-2">`;
    html += renderTopFilesCard(topFiles);
    html += renderTechStackCard(techStack);
    html += `</div>`;

    return html;
}

/**
 * Renders the full changelog section.
 */
function renderChangelogHTML(groupedByDate) {
    let html = '<div class="section-title">📝 Changelog Details</div>\n';
    html += renderSearchBarHTML();

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
    sortedDates.forEach((date) => {
        html += renderDaySectionHTML(date, groupedByDate[date]);
    });

    return html;
}

module.exports = {
    renderOverviewHTML,
    renderChangelogHTML,
    wrapInHTMLTemplate,
};
