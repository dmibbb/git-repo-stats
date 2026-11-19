const fs = require('fs');
const path = require('path');
const { MAX_FILES_PER_COMMIT, OPEN_DAYS_COUNT, formatNumber, escapeHtml, WEEKDAY_NAMES, MONTH_NAMES, pluralize } = require('./utils');

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
 * Reads client-side JS file from repo-stats-client.js.
 * Falls back to empty string if file not found.
 */
function loadClientJS() {
    try {
        const jsPath = path.join(__dirname, 'repo-stats-client.js');
        return fs.readFileSync(jsPath, 'utf-8');
    } catch (e) {
        console.warn('⚠️ Could not load repo-stats-client.js, using empty script.');
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
    const clientJS = loadClientJS();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<script>
  (function() {
    var t = localStorage.getItem('repo-stats-theme');
    if (t === 'light' || t === 'dark') document.documentElement.classList.add('theme-' + t);
  })();
</script>
<style>
${css}
</style>
</head>
<body>
<nav class="sticky-toc" aria-label="Table of contents">
  <div class="toc-title">Navigation</div>
  <ul class="toc-list">
    <li><a href="#sec-tech" class="toc-link" data-target="sec-tech">🗂️ Files & Stack</a></li>
    <li><a href="#sec-records" class="toc-link" data-target="sec-records">🏆 Records</a></li>
    <li><a href="#sec-contribution" class="toc-link" data-target="sec-contribution">👨‍👩‍👧‍👦 Contribution</a></li>
    <li><a href="#sec-patterns" class="toc-link" data-target="sec-patterns">📊 Patterns</a></li>
    <li><a href="#sec-timeline" class="toc-link" data-target="sec-timeline">📉 Timeline</a></li>
    <li><a href="#sec-changelog" class="toc-link" data-target="sec-changelog">📝 Changelog</a></li>
  </ul>
</nav>
<div class="dashboard-container">
${content}
<footer class="dashboard-footer">
  Generated: ${generatedAt} · Repository Statistics
</footer>
</div>
<button class="back-to-top" aria-label="Back to top" title="Back to top">↑</button>
<script>
${clientJS}
</script>
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
        let statusHtml = '';

        if (delta) {
            if (delta.binary) {
                deltaHtml = ' <span class="file-delta">(binary)</span>';
            } else {
                deltaHtml = ` <span class="file-delta">(<span class="file-ins">+${formatNumber(delta.ins)}</span>/<span class="file-del">-${formatNumber(delta.del)}</span>)</span>`;
            }

            if (delta.status === 'A') {
                statusHtml = ' <span class="file-status file-status--added">(added)</span>';
            } else if (delta.status === 'D') {
                statusHtml = ' <span class="file-status file-status--deleted">(deleted)</span>';
            } else if (delta.status === 'R') {
                statusHtml = ' <span class="file-status file-status--renamed">(renamed)</span>';
            }
        }

        const ignored = ignoredFiles.has(f) ? ' <span class="file-delta"><em>(ignored)</em></span>' : '';
        return `${link}${deltaHtml}${statusHtml}${ignored}`;
    };

    if (files.length <= MAX_FILES_PER_COMMIT) {
        return files.map(renderFile).join('<br>');
    }

    const visible = files.slice(0, MAX_FILES_PER_COMMIT);
    const hidden = files.slice(MAX_FILES_PER_COMMIT);
    const summarySuffix = hidden.some((f) => ignoredFiles.has(f)) ? ' (contains ignored)' : '';

    let result = visible.map(renderFile).join('<br>');
    result += `<details><summary><em>Show ${hidden.length} more files${summarySuffix}</em></summary>`;
    result += hidden.map(renderFile).join('<br>');
    result += `</details>`;

    return result;
}

/**
 * Formats file type counts for a status bucket:
 * { txt: 2, bin: 1 } -> '2 txt + 1 bin'
 * { txt: 0, bin: 3 } -> '3 bin'
 * { txt: 0, bin: 0 } -> ''
 */
function formatStatBreakdown(bucket) {
    if (!bucket) return '';
    const parts = [];
    if (bucket.txt > 0) parts.push(`${formatNumber(bucket.txt)} txt`);
    if (bucket.bin > 0) parts.push(`${formatNumber(bucket.bin)} bin`);
    return parts.join(' + ');
}

/**
 * Renders the "Delta" cell.
 */
function renderDeltaCellHTML(commit) {
    let deltaMain;

    if (commit.hasOnlyIgnored) {
        deltaMain = '<em>ignored files only</em>';
    } else if (commit.insertions === 0 && commit.deletions === 0 && commit.binaryCount > 0) {
        deltaMain = '<em>binaries only</em>';
    } else {
        deltaMain = `<span class="positive">+${formatNumber(commit.insertions)}</span> / <span class="negative">-${formatNumber(commit.deletions)}</span>`;
    }

    let html = `<div class="delta-main">${deltaMain}</div>`;

    if (!commit.hasOnlyIgnored && commit.fileStats) {
        const rows = [
            { label: 'Added', text: formatStatBreakdown(commit.fileStats.added) },
            { label: 'Modified', text: formatStatBreakdown(commit.fileStats.modified) },
            { label: 'Renamed', text: formatStatBreakdown(commit.fileStats.renamed) },
            { label: 'Deleted', text: formatStatBreakdown(commit.fileStats.deleted) },
        ].filter(r => r.text);

        if (rows.length > 0) {
            html += `<div class="delta-breakdown">${rows.map(r => `<strong>${r.label}:</strong> <em>${r.text}</em>`).join('<br>')}</div>`;
        }
    }

    return html;
}

/**
 * Renders one day section as a table.
 */
function renderDaySectionHTML(date, dayData, isOpen = true) {
    const fmt = formatNumber;
    const commitsCount = dayData.commits.length;
    const uniqueFilesCount = dayData.uniqueFiles.size;
    const openAttr = isOpen ? ' open' : '';

    let html = `<details id="day-${date}" class="changelog-day"${openAttr}>\n`;
    html += `<summary class="day-summary"><h3>${date}: ${pluralize(commitsCount, 'commit')} (+${fmt(dayData.totalInsertions)} / -${fmt(dayData.totalDeletions)}) in ${pluralize(uniqueFilesCount, 'unique file')}</h3></summary>\n`;
    html += '<table class="changelog-table">\n<thead><tr><th>Commit</th><th>Changed Files</th><th>Delta</th></tr></thead>\n<tbody>\n';

    dayData.commits.forEach((commit) => {
        const timeHtml = commit.time ? `<span class="commit-time">Committed: ${commit.time.slice(0, 8)}</span>` : '';
        const authorHtml = commit.author ? `<span class="commit-author">Author: ${escapeHtml(commit.author)}</span>` : '';
        html += `<tr class="commit-row"><td><div class="commit-subject">${escapeHtml(commit.subject)}</div>${timeHtml}${authorHtml}</td><td>${renderFilesCellHTML(commit.files, commit.ignoredFiles, commit.fileDeltas)}</td><td class="delta-cell">${renderDeltaCellHTML(commit)}</td></tr>\n`;
    });

    html += '</tbody>\n</table>\n</details>\n';
    return html;
}

/**
 * Renders a single KPI card.
 */
function renderKPICard(icon, title, value, sub, subTitle = '', targetDate = '', targetCommit = '') {
    const titleAttr = subTitle ? ` title="${escapeHtml(subTitle)}"` : '';
    const dateAttr = targetDate ? ` data-date="${escapeHtml(targetDate)}"` : '';
    const commitAttr = targetCommit ? ` data-commit="${escapeHtml(targetCommit)}"` : '';
    const clickableClass = targetDate ? ' card--clickable' : '';

    return `<div class="card${clickableClass}"${dateAttr}${commitAttr}>
    <div class="card-header">
      <span class="card-title">${title}</span>
      <span class="card-icon">${icon}</span>
    </div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub"${titleAttr}>${sub}</div>
  </div>`;
}

/**
 * Renders the centered hero dashboard header with full vs filtered period badges.
 */
function renderHeader(repoName, stats, generatedAt, args = {}) {
    const isFiltered = Boolean(args.since || args.until);
    let periodHtml = '';

    if (isFiltered) {
        const filterParts = [];
        if (args.since) filterParts.push(`since ${escapeHtml(args.since)}`);
        if (args.until) filterParts.push(`until ${escapeHtml(args.until)}`);
        const filterLabel = filterParts.join(', ');

        periodHtml = `
      <span class="period-badge period-badge--filtered" title="Active commits range: ${stats.firstDate} — ${stats.lastDate}">
        🟡 Filtered (${filterLabel}): <strong>${stats.firstDate} — ${stats.lastDate}</strong>
      </span>
      <span class="meta-sep">|</span>
      <span>📚 <strong>Full repo:</strong> ${stats.trueFirstDate} — ${stats.trueLastDate}</span>`;
    } else {
        periodHtml = `
      <span class="period-badge period-badge--full">
        🟢 Full history: <strong>${stats.firstDate} — ${stats.lastDate}</strong>
      </span>`;
    }

    return `<header class="dashboard-header">
    <button class="btn theme-toggle" aria-label="Toggle theme">🌓 Theme</button>
    <h1>${escapeHtml(repoName)}</h1>
    <div class="header-subtitle">
      ${periodHtml}
      <span class="meta-sep">|</span>
      <span>🧾 <strong>Generated:</strong> ${generatedAt}</span>
    </div>
  </header>`;
}

/**
 * Renders the top volume banner with 6 key repository metrics.
 */
function renderVolumeBanner(stats, fmt) {
    const netSign = stats.netChange >= 0 ? '+' : '';

    return `<div class="volume-banner">
    <div class="volume-item">
      <div class="label">📦 Total commits</div>
      <div class="value neutral">${fmt(stats.totalCommits)}</div>
    </div>
    <div class="volume-item">
      <div class="label">📈 Insertions</div>
      <div class="value positive">+${fmt(stats.totalInsertions)}</div>
    </div>
    <div class="volume-item">
      <div class="label">📉 Deletions</div>
      <div class="value negative">-${fmt(stats.totalDeletions)}</div>
    </div>
    <div class="volume-item">
      <div class="label">⚖️ Net change</div>
      <div class="value ${stats.netChange >= 0 ? 'positive' : 'negative'}">${netSign}${fmt(stats.netChange)}</div>
    </div>
    <div class="volume-item">
      <div class="label">📐 Avg per commit</div>
      <div class="value neutral"><span class="positive">+${stats.avgPerCommitIns}</span> / <span class="negative">-${stats.avgPerCommitDel}</span></div>
    </div>
    <div class="volume-item">
      <div class="label">🗂️ Unique files</div>
      <div class="value neutral">${fmt(stats.totalUniqueFiles)}</div>
    </div>
  </div>`;
}

/**
 * Renders time-of-day activity histogram as CSS bars.
 */
function renderTimeOfDayHistogramHTML(timeOfDayStats) {
    if (!timeOfDayStats || !timeOfDayStats.periods || timeOfDayStats.total === 0) return '';

    const maxCount = Math.max(...timeOfDayStats.periods.map(p => p.count));
    const peakBadge = timeOfDayStats.peakHour
        ? `<span class="card-badge" title="Most active hour">⏰ Peak: ${timeOfDayStats.peakHour.range} (${timeOfDayStats.peakHour.count})</span>`
        : '';

    let html = `<div class="card"><div class="card-header"><span class="card-title">Activity by time of day</span>${peakBadge}</div><ul class="histogram-list">\n`;
    for (const period of timeOfDayStats.periods) {
        const barWidth = maxCount > 0 ? ((period.count / maxCount) * 100).toFixed(1) : 0;
        const isPeak = period.count === maxCount && maxCount > 0;

        html += `<li class="bar-row${isPeak ? ' bar-row--peak' : ''}" title="${period.range}">
      <span class="bar-label bar-label--wide">${period.icon} ${period.label}</span>
      <div class="bar-container"><div class="bar" style="width: ${barWidth}%"></div></div>
      <span class="bar-value">${period.percent}% (${period.count})</span>
    </li>\n`;
    }
    html += `</ul></div>`;

    return html;
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
 * Renders month histogram as CSS bars (switches to 2 columns if > 6 months).
 */
function renderMonthHistogramHTML(monthCounts) {
    if (!monthCounts || monthCounts.length === 0) return '';

    const maxCount = Math.max(...monthCounts.map((m) => m[1]));
    const isTwoCol = monthCounts.length > 6;
    const listClass = isTwoCol ? 'histogram-list histogram-list--2col' : 'histogram-list';

    let html = `<div class="card"><div class="card-header"><span class="card-title">Activity by month</span></div><ul class="${listClass}">\n`;
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
 * Renders the tabbed Files card (Frequent | Hotspots | Legacy).
 */
function renderFilesCard(filesData) {
    const { frequent = [], hotspots = [], legacy = [] } = filesData || {};
    if (frequent.length === 0 && hotspots.length === 0 && legacy.length === 0) return '';

    const renderList = (items, formatter) => {
        if (!items || items.length === 0) {
            return '<div style="color: var(--fg-muted); font-size: 0.85rem; padding: 0.5rem 0;">No data</div>';
        }
        return `<ul class="details-list">\n${items.map(formatter).join('\n')}\n</ul>`;
    };

    const renderFileBadge = (file) => `<span class="file-name file-name--clickable" data-filter-file="${escapeHtml(file)}" title="Filter changelog by ${escapeHtml(file)}">${escapeHtml(file)}</span>`;

    const frequentHtml = renderList(
        frequent,
        (f) => `<li>${renderFileBadge(f.file)}<span class="count">${pluralize(f.count, 'commit')}</span></li>`
    );

    const hotspotsHtml = renderList(
        hotspots,
        (f) => `<li>${renderFileBadge(f.file)}<span class="count">${pluralize(f.churn, 'line')}</span></li>`
    );

    const legacyHtml = renderList(
        legacy,
        (f) => `<li>${renderFileBadge(f.file)}<span class="count" title="Last touched: ${f.lastDate}">${pluralize(f.daysAgo, 'day')} ago</span></li>`
    );

    return `<div class="card" data-tab-card>
    <div class="card-header">
      <span class="card-title">📂 Files</span>
      <div class="card-tabs" role="tablist">
        <button type="button" class="card-tab active" data-tab="frequent" title="Top 5 most frequently changed files">🔄 Frequent</button>
        <button type="button" class="card-tab" data-tab="hotspots" title="Top 5 files with highest total lines changed">🔥 Hotspots</button>
        <button type="button" class="card-tab" data-tab="legacy" title="Top 5 files untouched for the longest time">🕰️ Legacy</button>
      </div>
    </div>
    <div class="tab-panel active" data-panel="frequent">${frequentHtml}</div>
    <div class="tab-panel" data-panel="hotspots">${hotspotsHtml}</div>
    <div class="tab-panel" data-panel="legacy">${legacyHtml}</div>
  </div>`;
}

/**
 * Renders a single tech stack bar list.
 */
function renderTechStackListHTML(stack) {
    if (!stack || stack.length === 0) {
        return '<div style="color: var(--fg-muted); font-size: 0.85rem; padding: 0.5rem 0;">No data</div>';
    }

    return stack.map((item) => {
        const isNoExt = item.ext === 'no-ext';
        const extDisplay = isNoExt ? '<no-ext>' : `.${item.ext}`;
        const detailTitle = item.churn !== undefined
            ? `${pluralize(item.churn, 'line')} changed`
            : `${pluralize(item.count, 'file touch')}`;

        const extAttr = isNoExt
            ? ''
            : ` class="tech-ext tech-ext--clickable" data-filter-file="${escapeHtml(extDisplay)}" title="Filter changelog by ${escapeHtml(extDisplay)}"`;
        const extSpan = isNoExt
            ? `<span class="tech-ext">${escapeHtml(extDisplay)}</span>`
            : `<span${extAttr}>${escapeHtml(extDisplay)}</span>`;

        return `<div class="tech-bar-row" title="${detailTitle}">
      ${extSpan}
      <div class="tech-bar-container"><div class="tech-bar" style="width: ${item.percent}%"></div></div>
      <span class="tech-percent">${item.percent}%</span>
    </div>`;
    }).join('\n');
}

/**
 * Renders the combined Tech Stack card with tabs (By Files | By Lines).
 */
function renderTabbedTechStackCard(techStackByFiles, techStackByLines) {
    const hasFiles = techStackByFiles && techStackByFiles.length > 0;
    const hasLines = techStackByLines && techStackByLines.length > 0;
    if (!hasFiles && !hasLines) return '';

    return `<div class="card" data-tab-card>
    <div class="card-header">
      <span class="card-title">🧰 Tech stack</span>
      <div class="card-tabs" role="tablist">
        <button type="button" class="card-tab active" data-tab="by-files" title="Top 5 extensions by number of file touches">📄 By Files</button>
        <button type="button" class="card-tab" data-tab="by-lines" title="Top 5 extensions by lines changed (insertions + deletions)">📏 By Lines</button>
      </div>
    </div>
    <div class="tab-panel active" data-panel="by-files">${renderTechStackListHTML(techStackByFiles)}</div>
    <div class="tab-panel" data-panel="by-lines">${renderTechStackListHTML(techStackByLines)}</div>
  </div>`;
}

/**
 * Renders the File Lifecycle card with tabs (All | Text | Binary).
 */
function renderFileLifecycleCard(lifecycle) {
    if (!lifecycle || !lifecycle.all || lifecycle.all.total === 0) return '';

    const rowsConfig = [
        { key: 'added', icon: '➕', label: 'Added', query: 'Added:', barClass: 'lifecycle-bar--added' },
        { key: 'modified', icon: '✏️', label: 'Modified', query: 'Modified:', barClass: 'lifecycle-bar--modified' },
        { key: 'renamed', icon: '📛', label: 'Renamed', query: 'Renamed:', barClass: 'lifecycle-bar--renamed' },
        { key: 'deleted', icon: '🗑️', label: 'Deleted', query: 'Deleted:', barClass: 'lifecycle-bar--deleted' },
    ];

    const renderPanel = (bucket) => {
        if (!bucket || bucket.total === 0) {
            return '<div style="color: var(--fg-muted); font-size: 0.85rem; padding: 0.5rem 0;">No operations</div>';
        }

        const maxVal = Math.max(...rowsConfig.map(r => bucket[r.key] || 0));

        return `<ul class="histogram-list">\n${rowsConfig.map(r => {
            const count = bucket[r.key] || 0;
            const percent = ((count / bucket.total) * 100).toFixed(0);
            const barWidth = maxVal > 0 ? ((count / maxVal) * 100).toFixed(1) : 0;
            const isClickable = count > 0;
            const clickAttrs = isClickable
                ? ` class="bar-row bar-row--clickable" data-filter-file="${r.query}" title="Filter changelog by ${r.label.toLowerCase()} files"`
                : ` class="bar-row"`;

            return `<li${clickAttrs}>
          <span class="bar-label bar-label--wide">${r.icon} ${r.label}</span>
          <div class="bar-container"><div class="bar ${r.barClass}" style="width: ${barWidth}%"></div></div>
          <span class="bar-value">${percent}% (${formatNumber(count)})</span>
        </li>`;
        }).join('\n')}\n</ul>`;
    };

    return `<div class="card" data-tab-card>
    <div class="card-header">
      <span class="card-title">🔄 File lifecycle</span>
      <div class="card-tabs" role="tablist">
        <button type="button" class="card-tab active" data-tab="all" title="All tracked file operations">📦 All</button>
        <button type="button" class="card-tab" data-tab="text" title="Text file operations only">📄 Text</button>
        <button type="button" class="card-tab" data-tab="binary" title="Binary file operations only">🖼️ Binary</button>
      </div>
    </div>
    <div class="tab-panel active" data-panel="all">${renderPanel(lifecycle.all)}</div>
    <div class="tab-panel" data-panel="text">${renderPanel(lifecycle.text)}</div>
    <div class="tab-panel" data-panel="binary">${renderPanel(lifecycle.binary)}</div>
  </div>`;
}

/**
 * Renders contribution heatmap for the last year (GitHub-style).
 * Range: from Monday 52 weeks ago to today, aligned by weeks (Mon-first).
 */
function renderHeatmapHTML(groupedByDate) {
    if (!groupedByDate || Object.keys(groupedByDate).length === 0) return '';

    // --- 1. Getting the range: Mon - 52 Weeks till today (in UTC) ---
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - 364); // ~52 weeks ago

    // Shift back to Mon (getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat)
    const daysToMonday = (startDate.getUTCDay() + 6) % 7;
    startDate.setUTCDate(startDate.getUTCDate() - daysToMonday);

    // --- 2. Generate days array ---
    const formatDateUTC = (d) => {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const days = [];
    const cursor = new Date(startDate);
    while (cursor <= today) {
        const dateStr = formatDateUTC(cursor);
        const commitsCount = groupedByDate[dateStr]?.commits.length || 0;
        days.push({ date: new Date(cursor), dateStr, commitsCount });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // --- 3. Group by weeks (columns) ---
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
    const monthLabels = weeks.map(week => MONTH_NAMES[week[0].date.getUTCMonth()]);

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
            const isActive = day.commitsCount > 0;
            const title = !isActive
                ? `No commits on ${day.dateStr}`
                : `${pluralize(day.commitsCount, 'commit')} on ${day.dateStr} (click to view)`;
            const activeAttrs = isActive ? ` data-date="${day.dateStr}" data-active="true"` : '';
            html += `<div class="heatmap-cell ${level}"${activeAttrs} style="grid-column: ${weekIndex + 2}; grid-row: ${dayIndex + 1}" title="${title}"></div>\n`;
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
 * Renders the per-commit code churn timeline (diverging bar chart).
 * Currently renders a placeholder card; will be replaced with an SVG chart.
 */
function renderChurnTimelineHTML(groupedByDate) {
    if (!groupedByDate || Object.keys(groupedByDate).length === 0) return '';

    return `<div id="sec-timeline" class="section-title">📉 Code Churn Timeline</div>
    <div class="card card--placeholder" style="margin-bottom: 1.5rem;">
      <div class="card-header">
        <span class="card-title">Per-commit insertions & deletions</span>
        <span class="card-icon">🚧</span>
      </div>
      <div class="placeholder-body">
        <div class="placeholder-zero-line"></div>
        <span class="placeholder-text">Coming soon... (diverging +insertions / -deletions bar chart per commit)</span>
      </div>
    </div>`;
}

/**
 * Renders the contributors breakdown card.
 */
function renderContributorsCard(contributors) {
    if (!contributors || contributors.length === 0) return '';

    const fmt = formatNumber;
    let html = `<div class="card"><div class="card-header"><span class="card-title">👥 Contributors</span></div><ul class="details-list" style="display:block">\n`;
    contributors.forEach((c) => {
        html += `<li class="contrib-item">
          <div class="contrib-top">
            <span>${escapeHtml(c.name)}</span>
            <span class="count">${c.percent}%</span>
          </div>
          <div class="contrib-meta">
            <span>${pluralize(c.commits, 'commit')}</span>
            <span><span class="file-ins">+${fmt(c.insertions)}</span> / <span class="file-del">-${fmt(c.deletions)}</span></span>
          </div>
        </li>\n`;
    });
    html += `</ul></div>`;

    return html;
}

/**
 * Renders sticky search bar with clear button and collapse/expand controls.
 */
function renderSearchBarHTML() {
    let html = '<div class="search-bar">\n';
    html += '<div class="search-input-wrapper">\n';
    html += '<input type="text" class="search-input" placeholder="🔍 Search commits, files, authors...">\n';
    html += '<button type="button" class="search-clear" aria-label="Clear search" title="Clear (Esc)">✕</button>\n';
    html += '</div>\n';
    html += '<span class="search-counter"></span>\n';
    html += '<button class="btn btn-collapse" data-action="collapse-all">📂 Collapse All</button>\n';
    html += '<button class="btn btn-expand" data-action="expand-all">📖 Expand All</button>\n';
    html += '</div>\n';
    return html;
}

/**
 * Renders the full dashboard overview.
 */
function renderOverviewHTML(repoName, stats, filesData, largestCommit, widestCommit, techStack, fileLifecycle, weekdayCounts, monthCounts, groupedByDate, timeOfDayStats, techStackByLines, contributors, generatedAt, args) {
    const fmt = formatNumber;
    let html = '';

    // 1. Header & Subheader
    html += renderHeader(repoName, stats, generatedAt, args);

    // 2. Volume Banner
    html += renderVolumeBanner(stats, fmt);

    // 3. Section: Files & Tech Stack (3 columns)
    html += `<div id="sec-tech" class="section-title">🗂️ Files & Tech Stack</div>`;
    html += `<div class="grid grid-3">`;
    html += renderFilesCard(filesData);
    html += renderTabbedTechStackCard(techStack, techStackByLines);
    html += renderFileLifecycleCard(fileLifecycle);
    html += `</div>`;

    // 4. Section: Records (1 row x 4 cards, clickable where date exists)
    html += `<div id="sec-records" class="section-title">🏆 Records</div>`;
    html += `<div class="grid grid-4">`;
    html += renderKPICard(
        '🏆',
        'Record by commits',
        pluralize(stats.recordCommitsCount, 'commit'),
        `on ${stats.recordCommitsDate}`,
        `Click to jump to ${stats.recordCommitsDate}`,
        stats.recordCommitsDate
    );
    html += renderKPICard(
        '🔨',
        'Record by churn',
        `<span class="positive">+${fmt(stats.recordCodeIns)}</span> / <span class="negative">-${fmt(stats.recordCodeDel)}</span>`,
        `on ${stats.recordCodeDate}`,
        `Click to jump to ${stats.recordCodeDate}`,
        stats.recordCodeDate
    );
    html += renderKPICard(
        '💪',
        'Largest commit',
        `<span class="positive">+${fmt(largestCommit?.insertions || 0)}</span> / <span class="negative">-${fmt(largestCommit?.deletions || 0)}</span>`,
        largestCommit ? `${escapeHtml(largestCommit.subject)}<br>${largestCommit.date}` : '',
        largestCommit ? `${largestCommit.subject} (${largestCommit.date}) — click to filter & view` : '',
        largestCommit ? largestCommit.date : '',
        largestCommit ? largestCommit.subject : ''
    );
    html += renderKPICard(
        '🚚',
        'Widest commit',
        widestCommit ? pluralize(widestCommit.filesCount, 'file') : 'N/A',
        widestCommit ? `${escapeHtml(widestCommit.subject)}<br>${widestCommit.date}` : '',
        widestCommit ? `${widestCommit.subject} (${widestCommit.date}) — click to filter & view` : '',
        widestCommit ? widestCommit.date : '',
        widestCommit ? widestCommit.subject : ''
    );
    html += `</div>`;

    // 5. Section: Contribution (80% Heatmap + 20% Contributors)
    html += `<div id="sec-contribution" class="section-title">👨‍👩‍👧‍👦 Contribution</div>`;
    html += `<div class="grid grid-heatmap-contrib">`;
    html += renderHeatmapHTML(groupedByDate);
    html += renderContributorsCard(contributors);
    html += `</div>`;

    // 6. Section: Activity Patterns (4 KPI cards + 3 Histograms)
    html += `<div id="sec-patterns" class="section-title">📊 Activity Patterns</div>`;
    html += `<div class="grid grid-4">`;
    html += renderKPICard(
        '🎂',
        'Repo age',
        pluralize(stats.repoAge, 'day'),
        `since ${stats.trueFirstDate}`
    );
    const gapSub = stats.longestGapLength > 0
        ? `Longest gap: ${pluralize(stats.longestGapLength, 'day')} (${stats.longestGapStart} — ${stats.longestGapEnd})`
        : 'Longest gap: none';
    html += renderKPICard(
        '🔥',
        'Streaks & Gaps',
        `Max: ${stats.maxStreakLength}d <span class="meta-sep">|</span> Cur: ${stats.currentStreak}d`,
        gapSub
    );
    const isFiltered = Boolean(args?.since || args?.until);
    const activeDaysSub = `${stats.activityPercent}% of ${isFiltered ? 'filtered' : 'full'} period (${stats.firstDate} — ${stats.lastDate})`;
    html += renderKPICard(
        '📅',
        'Active days',
        `${stats.activeDays} / ${stats.totalCalendarDays}`,
        activeDaysSub
    );
    html += renderKPICard(
        '📈',
        'Avg per active day',
        `<span class="positive">+${fmt(stats.avgPerActiveDayIns)}</span> / <span class="negative">-${fmt(stats.avgPerActiveDayDel)}</span>`,
        `avg ${stats.avgCommitsPerActiveDay} commits / day`
    );
    html += `</div>`;

    html += `<div class="grid grid-3">`;
    html += renderTimeOfDayHistogramHTML(timeOfDayStats);
    html += renderWeekdayHistogramHTML(weekdayCounts);
    html += renderMonthHistogramHTML(monthCounts);
    html += `</div>`;

    // 7. Section: Code Churn Timeline (100% width)
    html += renderChurnTimelineHTML(groupedByDate);

    return html;
}

/**
 * Renders the full changelog section.
 */
function renderChangelogHTML(groupedByDate) {
    let html = '<div id="sec-changelog" class="section-title">📝 Changelog Details</div>\n';
    html += renderSearchBarHTML();

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
    sortedDates.forEach((date, index) => {
        html += renderDaySectionHTML(date, groupedByDate[date], index < OPEN_DAYS_COUNT);
    });

    return html;
}

module.exports = {
    renderOverviewHTML,
    renderChangelogHTML,
    wrapInHTMLTemplate,
};
