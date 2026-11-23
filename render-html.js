const fs = require('fs');
const path = require('path');
const {
    MAX_FILES_PER_COMMIT,
    OPEN_DAYS_COUNT,
    TOP_FILES_COUNT,
    TOP_EXTENSIONS_COUNT,
    LEGACY_FILES_COUNT,
    WEEKDAY_NAMES,
    MONTH_NAMES,
    formatNumber,
    escapeHtml,
    pluralize,
    getExtension,
    parseDate,
    getTodayLocalDate,
    toMondayFirstIndex,
    normalizeGitPath
} = require('./utils');
const { getLanguageIcon } = require('./lang-icons');
const { version, homepage } = require('./package.json');

const REPO_URL = (homepage || 'https://github.com/dmibbb/git-repo-stats').replace(/#readme$/, '');

// Churn widget hardcoded values
const SVG_HEIGHT = 244;
const Y_AXIS_WIDTH = 56;
const PAD_LEFT = 10;
const PAD_RIGHT = 18;
const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const SLOT_WIDTH = 12;
const BAR_WIDTH = 8;
const PLOT_WIDTH_MIN = 120;
const TICK_MIN_SPACING = 95;
const TICK_LAST_MIN_SPACING = 75;
const TICK_TEXT_RESERVE = 70;
const TICK_WIDTH_BUDGET = 145;
const TICK_COUNT_MAX = 12;
const TICK_COUNT_MIN = 2;

/**
 * Reads CSS file from repo-stats.css.
 * Throws an error if the stylesheet asset cannot be read.
 */
function loadCSS() {
    const cssPath = path.join(__dirname, 'repo-stats.css');
    try {
        return fs.readFileSync(cssPath, 'utf-8');
    } catch (err) {
        throw new Error(`Failed to load required stylesheet: ${cssPath}`, { cause: err });
    }
}

/**
 * Reads client-side JS file from repo-stats-client.js.
 * Throws an error if the client script asset cannot be read.
 */
function loadClientJS() {
    const jsPath = path.join(__dirname, 'repo-stats-client.js');
    try {
        return fs.readFileSync(jsPath, 'utf-8');
    } catch (err) {
        throw new Error(`Failed to load required client script: ${jsPath}`, { cause: err });
    }
}

/**
 * Renders an HTML link to a file.
 * For renamed files (`old => new` or `prefix{old => new}suffix`), keeps the old part as text
 * and renders the new destination segment as a clickable link pointing to the normalized new path.
 */
function renderFileLinkHTML(filename, isRename = filename.includes(' => ')) {
    const buildHref = (targetPath) => targetPath.split('/').map(encodeURIComponent).join('/');

    if (isRename && filename.includes(' => ')) {
        const newFullPath = normalizeGitPath(filename);
        const href = buildHref(newFullPath);

        const braceMatch = filename.match(/^(.*)\{(.*?)\s*=>\s*(.*)\}(.*)$/);
        if (braceMatch) {
            const [, prefix, oldPart, newPart, suffix] = braceMatch;
            const linkLabel = newPart || newFullPath;
            return `<code>${escapeHtml(prefix)}{${escapeHtml(oldPart)} =&gt; <a href="${href}" class="file-link">${escapeHtml(linkLabel)}</a>}${escapeHtml(suffix)}</code>`;
        }

        const arrowIdx = filename.lastIndexOf(' => ');
        if (arrowIdx !== -1) {
            const oldPart = filename.slice(0, arrowIdx);
            const newPart = filename.slice(arrowIdx + 4);
            return `<code>${escapeHtml(oldPart)} =&gt; <a href="${href}" class="file-link">${escapeHtml(newPart)}</a></code>`;
        }

        return `<code>${escapeHtml(filename)}</code>`;
    }

    if (isRename) {
        return `<code>${escapeHtml(filename)}</code>`;
    }

    const encoded = buildHref(filename);
    return `<a href="${encoded}" class="file-link">${escapeHtml(filename)}</a>`;
}

/**
 * Wraps content in an HTML document.
 */
function wrapInHTMLTemplate(content, title, generatedAt) {
    const css = loadCSS().replace(/<\/style>/gi, '<\\/style>');
    const clientJS = loadClientJS().replace(/<\/script>/gi, '<\\/script>');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<script>
  (function() {
    try {
      var t = localStorage.getItem('repo-stats-theme');
      if (t === 'light' || t === 'dark') document.documentElement.classList.add('theme-' + t);
    } catch {
      console.warn('localStorage: Could not get value for repo-stats-theme');
    }
  })();
</script>
<style>
${css}
</style>
</head>
<body>
<nav class="sticky-toc" aria-label="Table of contents">
  <a href="#" class="toc-title" title="Back to top">Navigation</a>
  <ul class="toc-list">
    <li><a href="#sec-tech" class="toc-link" data-target="sec-tech">🗃️ Files & Tech Stack</a></li>
    <li><a href="#sec-records" class="toc-link" data-target="sec-records">🏆 Records</a></li>
    <li><a href="#sec-contribution" class="toc-link" data-target="sec-contribution">👥 Contribution</a></li>
    <li><a href="#sec-patterns" class="toc-link" data-target="sec-patterns">📅 Activity Patterns</a></li>
    <li><a href="#sec-timeline" class="toc-link" data-target="sec-timeline">📉 Code Timeline</a></li>
    <li><a href="#sec-releases" class="toc-link" data-target="sec-releases">🏷️ Releases & Tags</a></li>
    <li><a href="#sec-changelog" class="toc-link" data-target="sec-changelog">📝 Changelog Details</a></li>
  </ul>
</nav>
<div class="dashboard-container">
${content}
<footer class="dashboard-footer">
  Generated ${generatedAt} by <a href="${escapeHtml(REPO_URL)}" target="_blank" rel="noopener noreferrer">Git Repository Statistics v${escapeHtml(version)}</a>
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
        const delta = fileDeltas?.get(f);
        const link = renderFileLinkHTML(f, delta ? delta.status === 'R' : f.includes(' => '));
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
    const weekday = WEEKDAY_NAMES[toMondayFirstIndex(parseDate(date).getUTCDay())];

    const dayTags = [];
    dayData.commits.forEach(c => {
        if (c.tags && c.tags.length > 0) dayTags.push(...c.tags);
    });
    const dayTagsHtml = dayTags.length > 0
        ? dayTags.map(t => `<span class="tag-badge">🏷️ ${escapeHtml(t)}</span>`).join(' ')
        : '';

    const authorsSummary = formatAuthorsSummary(dayData.commits);
    const authorsHtml = authorsSummary
        ? `<span class="meta-sep">|</span>\n          <span class="summary-authors">${authorsSummary}</span>`
        : '';

    let html = `<details id="day-${date}" class="changelog-day"${openAttr}>\n`;
    html += `<summary class="day-summary">
      <div class="day-summary-content">
        <div class="day-summary-date">${date} <span class="day-weekday">(${weekday})</span> ${dayTagsHtml}</div>
         <div class="day-summary-meta">
          <span><strong>${pluralize(commitsCount, 'commit')}</strong></span>
          <span class="meta-sep">|</span>
          <span><strong class="positive">+${fmt(dayData.totalInsertions)}</strong> / <strong class="negative">-${fmt(dayData.totalDeletions)}</strong></span>
          <span class="meta-sep">|</span>
          <span><strong>${fmt(uniqueFilesCount)}</strong> ${pluralize(uniqueFilesCount, 'unique file')}</span>
          ${authorsHtml}
        </div>
      </div>
    </summary>\n`;
    html += '<table class="changelog-table">\n<thead><tr><th>Commit</th><th>Changed Files</th><th>Delta</th></tr></thead>\n<tbody>\n';

    dayData.commits.forEach((commit, index) => {
        const hasTags = commit.tags && commit.tags.length > 0;
        const rowClass = hasTags ? 'commit-row commit-row--tagged' : 'commit-row';
        const timeHtml = commit.time ? `<span class="commit-time">Committed: ${commit.time.slice(0, 8)}</span>` : '';
        const authorHtml = commit.author ? `<span class="commit-author">Author: ${escapeHtml(commit.author)}</span>` : '';
        const tagsHtml = hasTags
            ? `<div class="commit-tags">${commit.tags.map(t => `<span class="tag-badge">🏷️ ${escapeHtml(t)}</span>`).join(' ')}</div>`
            : '';
        const filesAttr = commit.trackedFiles && commit.trackedFiles.length > 0
            ? ` data-files="${escapeHtml(commit.trackedFiles.join('\n'))}"`
            : '';

        html += `<tr id="commit-${date}-${index}" class="${rowClass}"${filesAttr}><td><div class="commit-subject">${escapeHtml(commit.subject)}</div>${timeHtml}${authorHtml}${tagsHtml}</td><td>${renderFilesCellHTML(commit.files, commit.ignoredFiles, commit.fileDeltas)}</td><td class="delta-cell">${renderDeltaCellHTML(commit)}</td></tr>\n`;
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

    return `<div class="card card--kpi${clickableClass}"${dateAttr}${commitAttr}${titleAttr}>
    <div class="card-header">
      <span class="card-title">${title}</span>
      <span class="card-icon">${icon}</span>
    </div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </div>`;
}

/**
 * Renders the centered hero dashboard header with full vs filtered period badges.
 */
function renderHeader(repoName, stats, generatedAt, args = {}) {
    const isFiltered = Boolean(args.since || args.until);
    let periodHtml;

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
    const peakFooter = timeOfDayStats.peakHour
        ? `<div class="card-sub-footer" title="Most active hour">⏰ Peak hour: <strong>${timeOfDayStats.peakHour.range}</strong> (${pluralize(timeOfDayStats.peakHour.count, 'commit')})</div>`
        : '';

    let html = `<div class="card"><div class="card-header"><span class="card-title">Activity by time of day</span><span class="card-icon">🕐</span></div><ul class="histogram-list">\n`;
    for (const period of timeOfDayStats.periods) {
        const barWidth = maxCount > 0 ? ((period.count / maxCount) * 100).toFixed(1) : 0;
        const isPeak = period.count === maxCount && maxCount > 0;

        html += `<li class="bar-row${isPeak ? ' bar-row--peak' : ''}" title="${period.range}">
      <span class="bar-label bar-label--wide">${period.icon} ${period.label}</span>
      <div class="bar-container"><div class="bar" style="width: ${barWidth}%"></div></div>
      <span class="bar-value">${period.percent}% (${period.count})</span>
    </li>\n`;
    }
    html += `</ul>${peakFooter}</div>`;

    return html;
}

/**
 * Renders weekday histogram as CSS bars.
 */
function renderWeekdayHistogramHTML(weekdayCounts) {
    const total = Object.values(weekdayCounts).reduce((s, c) => s + c, 0);
    if (total === 0) return '';

    const maxCount = Math.max(...Object.values(weekdayCounts));
    let html = `<div class="card"><div class="card-header"><span class="card-title">Activity by day of week</span><span class="card-icon">📅</span></div><ul class="histogram-list">\n`;
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

    let html = `<div class="card"><div class="card-header"><span class="card-title">Activity by month</span><span class="card-icon">🗓️</span></div><ul class="${listClass}">\n`;
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

    const renderList = (items, formatter, extraClass = '') => {
        if (!items || items.length === 0) {
            return '<div style="color: var(--fg-muted); font-size: 0.85rem; padding: 0.5rem 0;">No data</div>';
        }
        const listClass = extraClass ? `details-list ${extraClass}` : 'details-list';
        return `<ul class="${listClass}">\n${items.map(formatter).join('\n')}\n</ul>`;
    };

    const renderFileBadge = (file) => {
        const baseName = file.split('/').pop();
        const ext = getExtension(baseName);
        const iconHtml = getLanguageIcon(ext === 'no-ext' ? '' : ext);
        const safeFull = escapeHtml(file);
        const safeBase = escapeHtml(baseName);

        return `<span class="file-name file-name--clickable" data-filter-file="${safeFull}" title="${safeFull} (click to filter)">${iconHtml}<span class="file-name-text">${safeBase}</span></span>`;
    };

    const frequentHtml = renderList(
        frequent,
        (f) => `<li>${renderFileBadge(f.file)}<span class="count" title="Modified in ${pluralize(f.count, 'commit')}">${pluralize(f.count, 'commit')}</span></li>`
    );

    const hotspotsHtml = renderList(
        hotspots,
        (f) => `<li>${renderFileBadge(f.file)}<span class="count" title="Total lines changed (insertions + deletions): ${formatNumber(f.churn)}">${pluralize(f.churn, 'line')}</span></li>`
    );

    const legacyHtml = renderList(
        legacy,
        (f) => `<li>${renderFileBadge(f.file)}<span class="count" title="Last modified on ${f.lastDate} (${pluralize(f.daysAgo, 'day')} ago)">${pluralize(f.daysAgo, 'day')} ago</span></li>`,
        'details-list--scrollable'
    );

    return `<div class="card" data-tab-card>
    <div class="card-header">
      <span class="card-title">📂 Files</span>
      <div class="card-tabs" role="tablist">
        <button type="button" class="card-tab active" role="tab" aria-selected="true" data-tab="frequent" title="Top ${TOP_FILES_COUNT} most frequently changed files">🔄 Frequent</button>
        <button type="button" class="card-tab" role="tab" aria-selected="false" data-tab="hotspots" title="Top ${TOP_FILES_COUNT} files with highest total lines changed">🚀 Hotspots</button>
        <button type="button" class="card-tab" role="tab" aria-selected="false" data-tab="legacy" title="Top ${LEGACY_FILES_COUNT} files untouched for the longest time">🕰️ Legacy</button>
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
        const iconHtml = getLanguageIcon(isNoExt ? '' : item.ext);
        const detailTitle = item.churn !== undefined
            ? `${pluralize(item.churn, 'line')} changed`
            : `${pluralize(item.count, 'file touch')}`;

        const badgeContent = `${iconHtml}<span>${escapeHtml(extDisplay)}</span>`;
        const extAttr = isNoExt
            ? ''
            : ` class="tech-ext tech-ext--clickable" data-filter-file="${escapeHtml(extDisplay)}" title="Filter changelog by ${escapeHtml(extDisplay)}"`;
        const extSpan = isNoExt
            ? `<span class="tech-ext">${badgeContent}</span>`
            : `<span${extAttr}>${badgeContent}</span>`;

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
        <button type="button" class="card-tab active" role="tab" aria-selected="true" data-tab="by-files" title="Top ${TOP_EXTENSIONS_COUNT} extensions by number of file touches">📄 By Files</button>
        <button type="button" class="card-tab" role="tab" aria-selected="false" data-tab="by-lines" title="Top ${TOP_EXTENSIONS_COUNT} extensions by lines changed (insertions + deletions)">📏 By Lines</button>
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
        { key: 'renamed', icon: '↪️', label: 'Renamed', query: 'Renamed:', barClass: 'lifecycle-bar--renamed' },
        { key: 'deleted', icon: '🗑️', label: 'Deleted', query: 'Deleted:', barClass: 'lifecycle-bar--deleted' },
    ];

    const renderPanel = (bucket) => {
        if (!bucket || bucket.total === 0) {
            return '<div style="color: var(--fg-muted); font-size: 0.85rem; padding: 0.5rem 0;">No operations</div>';
        }

        return `<ul class="histogram-list">\n${rowsConfig.map(r => {
            const count = bucket[r.key] || 0;
            const exactPercent = bucket.total > 0 ? ((count / bucket.total) * 100).toFixed(1) : '0';
            const percent = Math.round(Number(exactPercent));
            const isClickable = count > 0;
            const clickAttrs = isClickable
                ? ` class="bar-row bar-row--clickable" data-filter-file="${r.query}" title="Filter changelog by ${r.label.toLowerCase()} files"`
                : ` class="bar-row"`;

            return `<li${clickAttrs}>
          <span class="bar-label bar-label--wide">${r.icon} ${r.label}</span>
          <div class="bar-container"><div class="bar ${r.barClass}" style="width: ${exactPercent}%"></div></div>
          <span class="bar-value">${percent}% (${formatNumber(count)})</span>
        </li>`;
        }).join('\n')}\n</ul>`;
    };

    return `<div class="card" data-tab-card>
    <div class="card-header">
      <span class="card-title">♻️ File lifecycle</span>
      <div class="card-tabs" role="tablist">
        <button type="button" class="card-tab active" role="tab" aria-selected="true" data-tab="all" title="All tracked file operations">📦 All</button>
        <button type="button" class="card-tab" role="tab" aria-selected="false" data-tab="text" title="Text file operations only">📝 Text</button>
        <button type="button" class="card-tab" role="tab" aria-selected="false" data-tab="binary" title="Binary file operations only">🖼️ Binary</button>
      </div>
    </div>
    <div class="tab-panel active" data-panel="all">${renderPanel(lifecycle.all)}</div>
    <div class="tab-panel" data-panel="text">${renderPanel(lifecycle.text)}</div>
    <div class="tab-panel" data-panel="binary">${renderPanel(lifecycle.binary)}</div>
  </div>`;
}

/**
 * Builds a single GitHub-style heatmap grid panel for the given [startDate, endDate] range (in UTC).
 */
function buildHeatmapViewHTML(groupedByDate, startDate, endDate, viewKey, isActive) {
    const cursor = new Date(startDate);
    const daysToMonday = (cursor.getUTCDay() + 6) % 7;
    cursor.setUTCDate(cursor.getUTCDate() - daysToMonday);

    const formatDateUTC = (d) => {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const days = [];
    while (cursor <= endDate) {
        const dateStr = formatDateUTC(cursor);
        const commitsCount = groupedByDate[dateStr]?.commits.length || 0;
        const inRange = cursor >= startDate && cursor <= endDate;
        days.push({ date: new Date(cursor), dateStr, commitsCount, inRange });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

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

    // Pick a representative day inside the target range for accurate month labels
    const monthLabels = weeks.map(week => {
        const validDay = week.find(d => d.inRange) || week[0];
        return MONTH_NAMES[validDay.date.getUTCMonth()];
    });

    const getLevel = (count) => {
        if (count === 0) return '';
        if (count <= 2) return 'l1';
        if (count <= 5) return 'l2';
        if (count <= 10) return 'l3';
        return 'l4';
    };

    const numWeeks = weeks.length;
    const gridCols = `40px repeat(${numWeeks}, 1fr)`;
    const activeClass = isActive ? ' active' : '';

    let html = `<div class="heatmap-view${activeClass}" data-heatmap-view="${viewKey}">\n`;
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
    const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
    dayLabels.forEach((label, i) => {
        html += `<div class="heatmap-day-label" style="grid-row: ${i + 1}">${label}</div>\n`;
    });

    // Cells
    weeks.forEach((week, weekIndex) => {
        week.forEach((day, dayIndex) => {
            if (!day.inRange) {
                html += `<div class="heatmap-cell heatmap-cell--outside" style="grid-column: ${weekIndex + 2}; grid-row: ${dayIndex + 1}"></div>\n`;
                return;
            }

            const level = getLevel(day.commitsCount);
            const hasCommits = day.commitsCount > 0;
            const title = !hasCommits
                ? `No commits on ${day.dateStr}`
                : `${pluralize(day.commitsCount, 'commit')} on ${day.dateStr} (click to view)`;
            const activeAttrs = hasCommits
                ? ` data-date="${day.dateStr}" data-active="true" role="button" tabindex="0" aria-label="${title}"`
                : '';
            html += `<div class="heatmap-cell ${level}"${activeAttrs} style="grid-column: ${weekIndex + 2}; grid-row: ${dayIndex + 1}" title="${title}"></div>\n`;
        });
    });

    html += '</div>\n'; // heatmap-grid
    html += '</div>\n'; // heatmap-grid-wrapper
    html += '</div>\n'; // heatmap-view

    return html;
}

/**
 * Renders contribution heatmap with a period selector badge (Last 365 days + active years).
 */
function renderHeatmapHTML(groupedByDate) {
    if (!groupedByDate || Object.keys(groupedByDate).length === 0) return '';

    const today = getTodayLocalDate();
    const start365 = new Date(today);
    start365.setUTCDate(start365.getUTCDate() - 364);

    // Collect distinct years that have commits (newest first)
    const years = Array.from(
        new Set(Object.keys(groupedByDate).map(d => d.slice(0, 4)))
    ).sort((a, b) => b.localeCompare(a));

    const optionsHtml = [
        `<option value="last-365" selected>Last 365 days</option>`,
        ...years.map(y => `<option value="${y}">${y}</option>`)
    ].join('\n');

    let viewsHtml = buildHeatmapViewHTML(groupedByDate, start365, today, 'last-365', true);
    for (const yearStr of years) {
        const y = parseInt(yearStr, 10);
        const yearStart = new Date(Date.UTC(y, 0, 1));
        const yearEnd = new Date(Date.UTC(y, 11, 31));
        viewsHtml += buildHeatmapViewHTML(groupedByDate, yearStart, yearEnd, yearStr, false);
    }

    let html = `<div class="card" data-heatmap-card>
    <div class="card-header">
      <span class="card-title">🧩 Contribution Heatmap</span>
      <select class="heatmap-select" aria-label="Select heatmap period">
        ${optionsHtml}
      </select>
    </div>
    <div class="heatmap-container">
      ${viewsHtml}
      <div class="heatmap-legend">
        <span>Less</span>
        <div class="swatch" style="background: var(--bg-soft)"></div>
        <div class="swatch" style="background: color-mix(in srgb, var(--added) 30%, var(--bg-soft))"></div>
        <div class="swatch" style="background: color-mix(in srgb, var(--added) 55%, var(--bg-soft))"></div>
        <div class="swatch" style="background: color-mix(in srgb, var(--added) 80%, var(--bg-soft))"></div>
        <div class="swatch" style="background: var(--added)"></div>
        <span>More</span>
      </div>
    </div>
  </div>`;

    return html;
}

/**
 * Builds the fixed Y-axis SVG column, full-width background grid, and left-aligned scrollable timeline SVG.
 */
function buildChurnTimelineHTML(commits, maxVal, scaleMode) {
    const count = commits.length;
    const plotHeight = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;
    const halfHeight = plotHeight / 2;
    const zeroY = PAD_TOP + halfHeight;
    const bottomAxisY = SVG_HEIGHT - PAD_BOTTOM;
    const plotWidth = Math.max(PLOT_WIDTH_MIN, count * SLOT_WIDTH);
    const svgWidth = PAD_LEFT + plotWidth + PAD_RIGHT;

    const scaleFn = (v) => {
        if (v <= 0 || maxVal <= 0) return 0;
        if (scaleMode === 'log') {
            return (Math.log10(v + 1) / Math.log10(maxVal + 1)) * (halfHeight - 4);
        }
        return (v / maxVal) * (halfHeight - 4);
    };

    const topTickLabel = `+${formatNumber(maxVal)}`;
    const bottomTickLabel = `-${formatNumber(maxVal)}`;
    const midVal = scaleMode === 'log'
        ? Math.round(Math.pow(10, Math.log10(maxVal + 1) / 2) - 1)
        : Math.round(maxVal / 2);
    const midTopLabel = midVal > 0 ? `+${formatNumber(midVal)}` : '';
    const midBottomLabel = midVal > 0 ? `-${formatNumber(midVal)}` : '';

    const topMidY = PAD_TOP + halfHeight / 2;
    const botMidY = zeroY + halfHeight / 2;

    // 1. Fixed Y-axis SVG (pinned on the left)
    let yAxisSvg = `<svg class="churn-yaxis-svg" viewBox="0 0 ${Y_AXIS_WIDTH} ${SVG_HEIGHT}" width="${Y_AXIS_WIDTH}" height="${SVG_HEIGHT}" aria-hidden="true">\n`;
    yAxisSvg += `<text x="${Y_AXIS_WIDTH - 6}" y="${PAD_TOP + 4}" class="churn-axis-label churn-axis-label--pos">${topTickLabel}</text>\n`;
    if (midTopLabel) {
        yAxisSvg += `<text x="${Y_AXIS_WIDTH - 6}" y="${topMidY + 3}" class="churn-axis-label">${midTopLabel}</text>\n`;
    }
    yAxisSvg += `<text x="${Y_AXIS_WIDTH - 6}" y="${zeroY + 3}" class="churn-axis-label">0</text>\n`;
    if (midBottomLabel) {
        yAxisSvg += `<text x="${Y_AXIS_WIDTH - 6}" y="${botMidY + 3}" class="churn-axis-label">${midBottomLabel}</text>\n`;
    }
    yAxisSvg += `<text x="${Y_AXIS_WIDTH - 6}" y="${bottomAxisY}" class="churn-axis-label churn-axis-label--neg">${bottomTickLabel}</text>\n`;
    yAxisSvg += `</svg>`;

    // 2. Full-width background grid lines stretching to the right card border
    let bgGridSvg = `<svg class="churn-bg-grid" aria-hidden="true">\n`;
    bgGridSvg += `<line x1="0" y1="${PAD_TOP}" x2="100%" y2="${PAD_TOP}" class="churn-grid-line" />\n`;
    bgGridSvg += `<line x1="0" y1="${topMidY}" x2="100%" y2="${topMidY}" class="churn-grid-line churn-grid-line--dashed" />\n`;
    bgGridSvg += `<line x1="0" y1="${botMidY}" x2="100%" y2="${botMidY}" class="churn-grid-line churn-grid-line--dashed" />\n`;
    bgGridSvg += `<line x1="0" y1="${bottomAxisY}" x2="100%" y2="${bottomAxisY}" class="churn-grid-line" />\n`;
    bgGridSvg += `<line x1="0" y1="${zeroY}" x2="100%" y2="${zeroY}" class="churn-zero-line" />\n`;
    bgGridSvg += `</svg>`;

    // 3. Left-aligned scrollable plot SVG
    let svg = `<svg class="churn-svg" viewBox="0 0 ${svgWidth} ${SVG_HEIGHT}" width="${svgWidth}" height="${SVG_HEIGHT}" role="img" aria-label="Code churn timeline (${scaleMode} scale)">\n`;

    // X-axis evenly spaced date ticks (deduplicated)
    const targetTicks = Math.max(TICK_COUNT_MIN, Math.min(TICK_COUNT_MAX, Math.floor(plotWidth / TICK_WIDTH_BUDGET) + 1));
    const tickIndices = new Set([0, count - 1]);
    if (count > 2 && targetTicks > 2) {
        for (let t = 1; t < targetTicks - 1; t++) {
            const idx = Math.round((t * (count - 1)) / (targetTicks - 1));
            tickIndices.add(idx);
        }
    }

    const sortedTicks = Array.from(tickIndices).sort((a, b) => a - b);
    let lastTickX = -Infinity;
    let lastShownDate = '';
    const rightLimitX = svgWidth - PAD_RIGHT - TICK_TEXT_RESERVE;

    sortedTicks.forEach((idx) => {
        const isFirst = idx === 0;
        const isLast = idx === count - 1;
        const cx = PAD_LEFT + idx * SLOT_WIDTH + SLOT_WIDTH / 2;
        const tickDate = commits[idx].date;

        if (!isFirst && !isLast) {
            if (tickDate === lastShownDate || cx - lastTickX < TICK_MIN_SPACING || cx > rightLimitX) return;
        }
        if (isLast && count > 1 && cx - lastTickX < TICK_LAST_MIN_SPACING) return;

        const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
        const textX = isFirst ? PAD_LEFT : isLast ? svgWidth - PAD_RIGHT : cx;

        svg += `<line x1="${cx.toFixed(2)}" y1="${bottomAxisY}" x2="${cx.toFixed(2)}" y2="${bottomAxisY + 4}" class="churn-tick-mark" />\n`;
        svg += `<text x="${textX.toFixed(2)}" y="${SVG_HEIGHT - 7}" class="churn-x-label" text-anchor="${anchor}">${tickDate}</text>\n`;
        lastTickX = cx;
        lastShownDate = tickDate;
    });

    // Release tag vertical markers with pill badges (rightmost/newest tags overlap older tags)
    const tagMarkers = [];
    commits.forEach((c, idx) => {
        if (!c.tags || c.tags.length === 0) return;
        const rawText = c.tags.join(', ');
        const pillWidth = rawText.length * 6 + 26;
        const rawCx = PAD_LEFT + idx * SLOT_WIDTH + SLOT_WIDTH / 2;
        const pillX = Math.max(2, Math.min(svgWidth - pillWidth - 2, rawCx - pillWidth / 2));
        const releaseId = `release-${c.tags[0].trim().replace(/[^a-zA-Z0-9_-]/g, '-')}-${c.date}`;

        tagMarkers.push({
            cx: rawCx,
            pillX,
            pillWidth,
            releaseId,
            tagText: escapeHtml(rawText),
        });
    });

    tagMarkers.forEach((marker) => {
        svg += `<line x1="${marker.cx.toFixed(2)}" y1="${PAD_TOP - 2}" x2="${marker.cx.toFixed(2)}" y2="${bottomAxisY}" class="churn-release-line" />\n`;

        const pillY = 4;
        const pillH = 18;
        const textCenterX = marker.pillX + marker.pillWidth / 2;
        svg += `<g class="churn-release-pill-group" data-release-id="${marker.releaseId}" role="button" tabindex="0" aria-label="Jump to release ${marker.tagText}" style="cursor: pointer;">\n`;
        svg += `  <title>Jump to release ${marker.tagText}</title>\n`;
        svg += `  <rect x="${marker.pillX.toFixed(1)}" y="${pillY}" width="${marker.pillWidth.toFixed(1)}" height="${pillH}" rx="9" class="churn-release-pill-bg" />\n`;
        svg += `  <text x="${textCenterX.toFixed(1)}" y="${pillY + 12.5}" class="churn-release-label" text-anchor="middle">🏷️ ${marker.tagText}</text>\n`;
        svg += `</g>\n`;
    })

    // Commit bars
    commits.forEach((c, idx) => {
        const slotX = PAD_LEFT + idx * SLOT_WIDTH;
        const barX = slotX + (SLOT_WIDTH - BAR_WIDTH) / 2;
        const insH = scaleFn(c.insertions);
        const delH = scaleFn(c.deletions);
        const hasBinary = c.binaryCount > 0;

        const safeSubj = escapeHtml(c.subject);
        const safeAuthor = escapeHtml(c.author);
        const binAttr = hasBinary ? ` data-bin="${c.binaryCount}"` : '';
        const tagAttr = c.tags && c.tags.length > 0 ? ` data-tags="${escapeHtml(c.tags.join(', '))}"` : '';
        const timeAttr = c.time ? ` data-time="${escapeHtml(c.time)}"` : '';

        svg += `<g class="churn-bar-group" data-date="${c.date}"${timeAttr} data-row-id="${c.rowId}" data-subject="${safeSubj}" data-author="${safeAuthor}" data-ins="${c.insertions}" data-del="${c.deletions}"${binAttr}${tagAttr}>\n`;
        svg += `  <rect x="${slotX.toFixed(2)}" y="${PAD_TOP}" width="${SLOT_WIDTH.toFixed(2)}" height="${plotHeight}" class="churn-hit-area" />\n`;

        if (insH > 0) {
            const h = Math.max(1.5, insH);
            svg += `  <rect x="${barX.toFixed(2)}" y="${(zeroY - h).toFixed(2)}" width="${BAR_WIDTH.toFixed(2)}" height="${h.toFixed(2)}" rx="1" class="churn-bar-ins" />\n`;
        }
        if (delH > 0) {
            const h = Math.max(1.5, delH);
            svg += `  <rect x="${barX.toFixed(2)}" y="${zeroY.toFixed(2)}" width="${BAR_WIDTH.toFixed(2)}" height="${h.toFixed(2)}" rx="1" class="churn-bar-del" />\n`;
        }
        if (hasBinary) {
            const cx = slotX + SLOT_WIDTH / 2;
            svg += `  <circle cx="${cx.toFixed(2)}" cy="${zeroY.toFixed(2)}" r="3" class="churn-bar-bin" />\n`;
        }
        svg += `</g>\n`;
    });

    svg += `</svg>`;

    return `<div class="churn-chart-layout" style="--churn-yaxis-width: ${Y_AXIS_WIDTH}px; --churn-height: ${SVG_HEIGHT}px;">
      ${yAxisSvg}
      ${bgGridSvg}
      <div class="churn-scroll-wrapper">${svg}</div>
    </div>`;
}

/**
 * Renders the per-commit code churn timeline (diverging bar chart with Linear | Log scale toggle).
 */
function renderChurnTimelineHTML(groupedByDate) {
    if (!groupedByDate || Object.keys(groupedByDate).length === 0) return '';

    // Collect commits in chronological order (oldest -> newest, preserving intra-day order)
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => a.localeCompare(b));
    const chronologicalCommits = [];

    for (const date of sortedDates) {
        const dayCommits = groupedByDate[date].commits;
        // Within a day, git log is newest-first; reverse so timeline flows chronologically left-to-right
        for (let i = dayCommits.length - 1; i >= 0; i--) {
            const c = dayCommits[i];
            chronologicalCommits.push({
                date,
                time: c.time ? c.time.slice(0, 8) : '',
                rowId: `commit-${date}-${i}`,
                subject: c.subject,
                author: c.author,
                insertions: c.insertions || 0,
                deletions: c.deletions || 0,
                binaryCount: c.binaryCount || 0,
                tags: c.tags || [],
            });
        }
    }

    if (chronologicalCommits.length === 0) return '';

    let maxVal = 0;
    for (const c of chronologicalCommits) {
        if (c.insertions > maxVal) maxVal = c.insertions;
        if (c.deletions > maxVal) maxVal = c.deletions;
    }

    const linearChart = buildChurnTimelineHTML(chronologicalCommits, maxVal, 'linear');
    const logChart = buildChurnTimelineHTML(chronologicalCommits, maxVal, 'log');

    return `<div id="sec-timeline" class="section-title">📉 Code Timeline</div>
    <div class="card" data-tab-card style="margin-bottom: 1.5rem;">
      <div class="card-header">
        <span class="card-title">👨‍💻 Per-commit insertions & deletions (${formatNumber(chronologicalCommits.length)} commits)</span>
        <div class="churn-controls">
          <div class="churn-legend">
            <span class="churn-legend-item"><i class="churn-dot churn-dot--ins"></i> Insertions</span>
            <span class="churn-legend-item"><i class="churn-dot churn-dot--del"></i> Deletions</span>
            <span class="churn-legend-item"><i class="churn-dot churn-dot--bin"></i> Binaries</span>
          </div>
          <div class="card-tabs" role="tablist">
            <button type="button" class="card-tab active" role="tab" aria-selected="true" data-tab="linear" title="Linear vertical scale">📏 Linear</button>
            <button type="button" class="card-tab" role="tab" aria-selected="false" data-tab="log" title="Logarithmic scale (easier to see small commits next to huge ones)">📐 Log</button>
          </div>
        </div>
      </div>
      <div class="tab-panel active" data-panel="linear">${linearChart}</div>
      <div class="tab-panel" data-panel="log">${logChart}</div>
    </div>`;
}

/**
 * Renders the contributors breakdown card.
 */
function renderContributorsCard(contributors) {
    if (!contributors || contributors.length === 0) return '';

    const fmt = formatNumber;
    let html = `<div class="card"><div class="card-header"><span class="card-title">Contributors</span><span class="card-icon">👫</span></div><ul class="details-list" style="display:block">\n`;
    contributors.forEach((c) => {
        const safeName = escapeHtml(c.name);
        const filterQuery = escapeHtml(`Author: ${c.name}`);
        html += `<li class="contrib-item contrib-item--clickable" data-filter-file="${filterQuery}" title="Filter changelog by ${safeName}">
          <div class="contrib-top">
            <span class="contrib-name">${safeName}</span>
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
    html += '<input type="text" class="search-input" aria-label="Search commits, files, authors" placeholder="🔍 Search commits, files, authors...">\n';
    html += '<button type="button" class="search-clear" aria-label="Clear search" title="Clear (Esc)">✕</button>\n';
    html += '</div>\n';
    html += '<span class="search-counter" aria-live="polite"></span>\n';
    html += '<button class="btn btn-collapse" data-action="collapse-all">📔 Collapse All</button>\n';
    html += '<button class="btn btn-expand" data-action="expand-all">📖 Expand All</button>\n';
    html += '</div>\n';
    return html;
}

/**
 * Renders the full dashboard overview.
 */
function renderOverviewHTML(repoName, stats, filesData, largestCommit, widestCommit, techStack, fileLifecycle, weekdayCounts, monthCounts, groupedByDate, timeOfDayStats, techStackByLines, contributors, releases, generatedAt, args) {
    const fmt = formatNumber;
    let html = '';

    // 1. Header & Subheader
    html += renderHeader(repoName, stats, generatedAt, args);

    // 2. Volume Banner
    html += renderVolumeBanner(stats, fmt);

    // 3. Section: Files & Tech Stack (3 columns)
    html += `<div id="sec-tech" class="section-title">🗃️ Files & Tech Stack</div>`;
    html += `<div class="grid grid-3">`;
    html += renderFilesCard(filesData);
    html += renderTabbedTechStackCard(techStack, techStackByLines);
    html += renderFileLifecycleCard(fileLifecycle);
    html += `</div>`;

    // 4. Section: Records (1 row x 4 cards, clickable where date exists)
    html += `<div id="sec-records" class="section-title">🏆 Records</div>`;
    html += `<div class="grid grid-4">`;
    html += renderKPICard(
        '🥇',
        'Record by commits',
        pluralize(stats.recordCommitsCount, 'commit'),
        `on ${stats.recordCommitsDate}`,
        `Click to jump to ${stats.recordCommitsDate}`,
        stats.recordCommitsDate
    );
    html += renderKPICard(
        '💥',
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
        largestCommit ? `${escapeHtml(largestCommit.subject)}<br>on ${largestCommit.date}` : '',
        largestCommit ? `${largestCommit.subject} (${largestCommit.date}) — click to filter & view` : '',
        largestCommit ? largestCommit.date : '',
        largestCommit ? largestCommit.subject : ''
    );
    html += renderKPICard(
        '🚚',
        'Widest commit',
        widestCommit ? pluralize(widestCommit.filesCount, 'file') : 'N/A',
        widestCommit ? `${escapeHtml(widestCommit.subject)}<br>on ${widestCommit.date}` : '',
        widestCommit ? `${widestCommit.subject} (${widestCommit.date}) — click to filter & view` : '',
        widestCommit ? widestCommit.date : '',
        widestCommit ? widestCommit.subject : ''
    );
    html += `</div>`;

    // 5. Section: Contribution (80% Heatmap + 20% Contributors)
    html += `<div id="sec-contribution" class="section-title">👥 Contribution</div>`;
    html += `<div class="grid grid-heatmap-contrib">`;
    html += renderHeatmapHTML(groupedByDate);
    html += renderContributorsCard(contributors);
    html += `</div>`;

    // 6. Section: Activity Patterns (4 KPI cards + 3 Histograms)
    html += `<div id="sec-patterns" class="section-title">📅 Activity Patterns</div>`;
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
        '📆',
        'Active days',
        `${stats.activeDays} / ${stats.totalCalendarDays}`,
        activeDaysSub
    );
    html += renderKPICard(
        '⚡',
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

    // 8. Section: Releases & Tags
    html += renderReleasesHTML(releases);

    return html;
}

/**
 * Formats unique commit authors joined by ' · ' (truncating if > 4 authors).
 */
function formatAuthorsSummary(commits) {
    if (!commits || commits.length === 0) return '';

    const uniqueAuthors = [];
    const seen = new Set();

    for (const c of commits) {
        const author = (c.author || '').trim();
        if (author && !seen.has(author)) {
            seen.add(author);
            uniqueAuthors.push(author);
        }
    }

    if (uniqueAuthors.length === 0) return '';

    const MAX_VISIBLE = 4;
    if (uniqueAuthors.length <= MAX_VISIBLE) {
        return uniqueAuthors.map(escapeHtml).join(' · ');
    }

    const visible = uniqueAuthors.slice(0, MAX_VISIBLE).map(escapeHtml).join(' · ');
    const restCount = uniqueAuthors.length - MAX_VISIBLE;
    return `${visible} · +${restCount} more`;
}

/**
 * Renders the collapsible Releases & Tags section (Release Notes).
 */
function renderReleasesHTML(releases) {
    if (!releases || releases.length === 0) return '';

    const fmt = formatNumber;
    let html = '<div id="sec-releases" class="section-title">🏷️ Releases & Tags</div>\n';

    releases.forEach((rel) => {
        const badgeHtml = rel.isUnreleased
            ? `<span class="release-title">🚧 Unreleased</span>`
            : `<span class="release-title">🏷️ ${escapeHtml(rel.name)}</span>`;

        const rangeStr = rel.firstDate && rel.lastDate && rel.firstDate !== rel.lastDate
            ? `${rel.firstDate} — ${rel.lastDate}`
            : (rel.lastDate || rel.date || '');
        const dateHtml = rangeStr ? `<span class="day-weekday">(${rangeStr})</span>` : '';

        // Take the first tag by ID (rel.name may contain a few comma-separated tags)
        const primaryTag = rel.isUnreleased ? 'unreleased' : rel.name.split(',')[0].trim();
        const relDate = rel.date || 'nodate';
        const releaseId = `release-${primaryTag.replace(/[^a-zA-Z0-9_-]/g, '-')}-${relDate}`;

        const authorsSummary = formatAuthorsSummary(rel.commits);
        const authorsHtml = authorsSummary
            ? `<span class="meta-sep">|</span>\n              <span class="summary-authors">${authorsSummary}</span>`
            : '';

        const rowsHtml = rel.commits.map(c => {
            const timePart = c.time ? ` ${c.time.slice(0, 8)}` : '';
            return `<li class="release-commit-item">
              <span class="release-commit-bullet">•</span>
              <span class="release-commit-subject" data-date="${c.date}" data-row-id="${c.rowId}" title="Jump to commit in Changelog Details (${c.date}${timePart} by ${escapeHtml(c.author)})">${escapeHtml(c.subject)}</span>
            </li>`;
        }).join('\n');

        html += `<details id="${releaseId}" class="changelog-day release-card">\n`;
        html += `<summary class="day-summary release-summary">
          <div class="day-summary-content">
            <div class="day-summary-date">${badgeHtml} ${dateHtml}</div>
            <div class="day-summary-meta">
              <span><strong>${pluralize(rel.commits.length, 'commit')}</strong></span>
              <span class="meta-sep">|</span>
              <span><strong class="positive">+${fmt(rel.insertions)}</strong> / <strong class="negative">-${fmt(rel.deletions)}</strong></span>
              <span class="meta-sep">|</span>
              <span><strong>${fmt(rel.uniqueFilesCount)}</strong> ${rel.uniqueFilesCount === 1 ? 'unique file' : 'unique files'}</span>
              ${authorsHtml}
            </div>
          </div>
          <button type="button" class="btn release-copy-btn" title="Copy release notes to clipboard">📋 Copy</button>
        </summary>\n`;
        html += `<div class="release-body"><ul class="release-commits-list">\n${rowsHtml}\n</ul></div>\n`;
        html += `</details>\n`;
    });

    return html;
}

/**
 * Renders a collapsible ribbon of all git tags above the search bar.
 * When collapsed, shows only the first row of tags; clicking expands all.
 */
function renderTagsBarHTML(tagsList) {
    if (!tagsList || tagsList.length === 0) return '';

    const pillsHtml = tagsList.map(item => {
        const safeTag = escapeHtml(item.tag);
        const safeSubj = escapeHtml(item.subject);
        return `<button type="button" class="tag-pill" data-date="${item.date}" data-row-id="${item.rowId}" title="${safeTag} (${item.date}) — ${safeSubj}">🏷️ ${safeTag}</button>`;
    }).join('\n');

    return `<details class="tags-bar">
      <summary class="tags-summary" title="Click to expand/collapse all releases">
        <span class="tags-bar-label">Releases (${formatNumber(tagsList.length)}):</span>
        <div class="tags-pills">${pillsHtml}</div>
      </summary>
    </details>\n`;
}

/**
 * Renders the full changelog section.
 */
function renderChangelogHTML(groupedByDate, tagsList = []) {
    let html = '<div id="sec-changelog" class="section-title">📝 Changelog Details</div>\n';
    html += renderTagsBarHTML(tagsList);
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
    renderFileLinkHTML,
    renderKPICard,
    renderHeader
};
