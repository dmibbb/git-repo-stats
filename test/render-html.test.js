const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    groupCommitsByDate,
    extractTagsList,
    calculateReleases,
    calculateOverallStats,
    findTopFrequentFiles,
    findChurnHotspotFiles,
    findLegacyFiles,
    findLargestCommit,
    findWidestCommit,
    calculateTechStack,
    calculateTechStackByLines,
    calculateFileLifecycle,
    calculateActivityByWeekday,
    calculateActivityByMonth,
    calculateActivityByTimeOfDay,
    calculateContributors,
} = require('../stats');
const {
    renderOverviewHTML,
    renderChangelogHTML,
    wrapInHTMLTemplate,
    renderFileLinkHTML,
    renderKPICard,
    renderHeader
} = require('../render-html');
const { makeCommit } = require('./stats.test')
const { version } = require('../package.json');

function buildSampleData(overrides = {}) {
    const groupedByDate = groupCommitsByDate([makeCommit(overrides)]);
    return {
        groupedByDate,
        tagsList: extractTagsList(groupedByDate),
        releases: calculateReleases(groupedByDate),
        stats: calculateOverallStats(groupedByDate),
        filesData: {
            frequent: findTopFrequentFiles(groupedByDate),
            hotspots: findChurnHotspotFiles(groupedByDate),
            legacy: findLegacyFiles(groupedByDate),
        },
        largestCommit: findLargestCommit(groupedByDate),
        widestCommit: findWidestCommit(groupedByDate),
        techStack: calculateTechStack(groupedByDate),
        techStackByLines: calculateTechStackByLines(groupedByDate),
        fileLifecycle: calculateFileLifecycle(groupedByDate),
        weekdayCounts: calculateActivityByWeekday(groupedByDate),
        monthCounts: calculateActivityByMonth(groupedByDate),
        timeOfDayStats: calculateActivityByTimeOfDay(groupedByDate),
        contributors: calculateContributors(groupedByDate),
    };
}

describe('render-html', () => {
    test('renders complete self-contained HTML dashboard without undefined or NaN', () => {
        const d = buildSampleData();
        const overview = renderOverviewHTML({
            repoName: 'demo-repo',
            stats: d.stats,
            filesData: d.filesData,
            largestCommit: d.largestCommit,
            widestCommit: d.widestCommit,
            techStack: d.techStack,
            fileLifecycle: d.fileLifecycle,
            weekdayCounts: d.weekdayCounts,
            monthCounts: d.monthCounts,
            groupedByDate: d.groupedByDate,
            timeOfDayStats: d.timeOfDayStats,
            techStackByLines: d.techStackByLines,
            contributors: d.contributors,
            releases: d.releases,
            generatedAt: '2026-11-21 12:00:00 (UTC+3)',
            args: {},
        });
        const changelog = renderChangelogHTML(d.groupedByDate, d.tagsList);
        const fullHtml = wrapInHTMLTemplate(overview + changelog, 'Repository Statistics: demo-repo', '2026-11-21 12:00:00 (UTC+3)');

        assert.match(fullHtml, /^<!DOCTYPE html>/);
        assert.match(fullHtml, /<\/html>$/);
        assert.ok(!fullHtml.includes('undefined'));
        assert.ok(!fullHtml.includes('NaN'));
        assert.ok(fullHtml.includes('Full history'));
    });

    test('escapes HTML/XSS payloads in commit subjects, authors, and tags', () => {
        const d = buildSampleData({
            author: 'Alice <script>alert("xss")</script>',
            subject: 'feat: <img src=x onerror=alert(1)>',
            files: ['src/my file.js', 'src/{old => new}.js'],
            trackedFiles: ['src/my file.js', 'src/new.js']
        });
        const html = renderOverviewHTML({
            repoName: 'repo<script>',
            stats: d.stats,
            filesData: d.filesData,
            largestCommit: d.largestCommit,
            widestCommit: d.widestCommit,
            techStack: d.techStack,
            fileLifecycle: d.fileLifecycle,
            weekdayCounts: d.weekdayCounts,
            monthCounts: d.monthCounts,
            groupedByDate: d.groupedByDate,
            timeOfDayStats: d.timeOfDayStats,
            techStackByLines: d.techStackByLines,
            contributors: d.contributors,
            releases: d.releases,
            generatedAt: '2026-11-21 12:00:00 (UTC+3)',
            args: { since: '2026-01-01' },
        }) + renderChangelogHTML(d.groupedByDate, d.tagsList);

        assert.ok(!html.includes('<script>alert("xss")</script>'));
        assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
        assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
        assert.ok(html.includes('href="src/my%20file.js"'));
        assert.ok(html.includes('<code>src/{old =&gt; <a href="src/new.js" class="file-link" target="_blank" rel="noopener noreferrer" title="Open file in new tab">new</a>}.js</code>'));
        assert.ok(html.includes('Filtered (since 2026-01-01)'));
    });

    test('renders churn timeline and heatmap sections', () => {
        const d = buildSampleData({ tags: ['v1.0.0'] });
        const html = renderOverviewHTML({
            repoName: 'demo',
            stats: d.stats,
            filesData: d.filesData,
            largestCommit: d.largestCommit,
            widestCommit: d.widestCommit,
            techStack: d.techStack,
            fileLifecycle: d.fileLifecycle,
            weekdayCounts: d.weekdayCounts,
            monthCounts: d.monthCounts,
            groupedByDate: d.groupedByDate,
            timeOfDayStats: d.timeOfDayStats,
            techStackByLines: d.techStackByLines,
            contributors: d.contributors,
            releases: d.releases,
            generatedAt: '2026-11-21',
            args: {},
        });
        assert.match(html, /<svg class="churn-svg"/);
        assert.match(html, /class="heatmap-dropdown"/);
        assert.match(html, /data-release-id="release-v1-0-0"|data-release-id="release-/);
        assert.match(html, /data-time="12:00:00"/);
        assert.match(html, /title="1 commit \(\+10 \/ -2\) on 2026-11-20 \(click to view\)"/);
    });

    test('handles null/empty data gracefully', () => {
        assert.doesNotThrow(() => {
            renderOverviewHTML({ repoName: 'empty-repo', generatedAt: '2026-11-21' });
        }, 'renderOverviewHTML should not throw on empty data');

        assert.doesNotThrow(() => {
            renderChangelogHTML({}, []);
        }, 'renderChangelogHTML should not throw on empty data');
    });

    test('includes accessibility attributes on search counter, heatmap cells, and timeline release pills', () => {
        const d = buildSampleData({ tags: ['v1.0.0'] });
        const html = renderOverviewHTML({ repoName: 'demo', ...d, generatedAt: '2026-11-21' })
            + renderChangelogHTML(d.groupedByDate, d.tagsList);

        assert.match(html, /class="search-counter" aria-live="polite"/);
        assert.match(html, /class="heatmap-cell [^"]*" data-date="2026-11-20" data-active="true" role="button" tabindex="0" aria-label="/);
        assert.match(html, /class="churn-release-pill-group" data-release-id="[^"]+" role="button" tabindex="0" aria-label="Jump to release v1\.0\.0"/);
        assert.match(html, /class="search-input" aria-label="Search commits, files, authors"/);
        assert.match(html, /class="card-tab active" role="tab" aria-selected="true"/);
        assert.match(html, /class="card-tab" role="tab" aria-selected="false"/);
    });

    test('renders scrollable list class for Legacy files tab', () => {
        const d = buildSampleData();
        const html = renderOverviewHTML({ repoName: 'demo', ...d, generatedAt: '2026-11-21' });
        assert.match(html, /class="details-list details-list--scrollable"/);
    });

    test('renders scrollable list class for Contributors card', () => {
        const d = buildSampleData();
        const html = renderOverviewHTML({ repoName: 'demo', ...d, generatedAt: '2026-11-23' });
        assert.match(html, /class="details-list contrib-list--scrollable"/);
    });

    test('adds normalized data-files attribute to commit rows for renamed file search', () => {
        const d = buildSampleData({
            files: ['src/{old => new}.js', 'src/a&b.js'],
            trackedFiles: ['src/new.js', 'src/a&b.js'],
        });
        const html = renderChangelogHTML(d.groupedByDate, d.tagsList);

        assert.ok(html.includes('data-files="src/new.js\nsrc/a&amp;b.js"'));

        const emptyCommitData = buildSampleData({ files: [], trackedFiles: [] });
        const emptyHtml = renderChangelogHTML(emptyCommitData.groupedByDate, []);
        assert.ok(!emptyHtml.includes('data-files='));
    });

    test('includes detailed commit count and percentage tooltip in Activity by time of day', () => {
        const d = buildSampleData({ date: '2026-11-23', time: '09:30:00' });
        const html = renderOverviewHTML({ repoName: 'demo', ...d, generatedAt: '2026-11-23' });
        assert.match(html, /title="Morning \(06:00–11:59\): 1 commit \(100%\)"/);
    });

    test('wraps long commit subjects in KPI cards with ellipsis class so the date stays visible', () => {
        const d = buildSampleData({
            date: '2026-11-23',
            subject: 'feat: ' + 'very long commit subject '.repeat(10),
        });
        const html = renderOverviewHTML({ repoName: 'demo', ...d, generatedAt: '2026-11-23' });
        assert.match(html, /<span class="kpi-sub-subject">feat: very long commit subject/);
        assert.match(html, /<span class="kpi-sub-date">on 2026-11-23<\/span>/);
    });
});

describe('renderFileLinkHTML', () => {
    test('renders regular file as link opening in a new tab', () => {
        const html = renderFileLinkHTML('src/index.js');
        assert.equal(html, '<a href="src/index.js" class="file-link" target="_blank" rel="noopener noreferrer" title="Open file in new tab">src/index.js</a>');
    });

    test('respects explicit isRename parameter', () => {
        const html = renderFileLinkHTML('src/index.js', true);
        assert.match(html, /<code>/);
    });

    test('renders renamed file with clickable link on new path', () => {
        const html = renderFileLinkHTML('src/{old => new}.js');
        assert.equal(html, '<code>src/{old =&gt; <a href="src/new.js" class="file-link" target="_blank" rel="noopener noreferrer" title="Open file in new tab">new</a>}.js</code>');

        const flatHtml = renderFileLinkHTML('old.js => new.js');
        assert.equal(flatHtml, '<code>old.js =&gt; <a href="new.js" class="file-link" target="_blank" rel="noopener noreferrer" title="Open file in new tab">new.js</a></code>');
    });
});

describe('renderKPICard', () => {
    test('adds data-date and data-commit attributes when provided', () => {
        const html = renderKPICard('🏆', 'Record', '5', 'on 2026-11-20', 'Click to jump', '2026-11-20', 'feat: add dashboard');
        assert.match(html, /data-date="2026-11-20"/);
        assert.match(html, /data-commit="feat: add dashboard"/);
        assert.match(html, /card--clickable/);
    });

    test('does not add clickable class when no targetDate', () => {
        const html = renderKPICard('📦', 'Total', '42', 'commits');
        assert.ok(!html.includes('card--clickable'));
    });
});

describe('renderHeader', () => {
    test('shows filtered badge when since/until provided', () => {
        const html = renderHeader('repo', { firstDate: '2026-01-01', lastDate: '2026-11-20', trueFirstDate: '2025-01-01', trueLastDate: '2026-11-20' }, '2026-11-21', { since: '2026-01-01' });
        assert.match(html, /Filtered/);
        assert.match(html, /Full repo/);
    });

    test('shows full history badge when no filters', () => {
        const html = renderHeader('repo', { firstDate: '2026-01-01', lastDate: '2026-11-20' }, '2026-11-21', {});
        assert.match(html, /Full history/);
        assert.ok(!html.includes('Filtered'));
    });
});

describe('wrapInHTMLTemplate', () => {
    test('includes CSS, client JS, and footer link with package version in output', () => {
        const html = wrapInHTMLTemplate('<p>Test</p>', 'Test Title', '2026-11-21');
        assert.match(html, /<!DOCTYPE html>/);
        assert.match(html, /<\/html>$/);
        assert.match(html, /<style>/);
        assert.match(html, /<script>/);
        assert.match(html, /Test Title/);
        assert.ok(html.includes(`Generated 2026-11-21 by <a href="https://github.com/dmibbb/git-repo-stats" target="_blank" rel="noopener noreferrer">Git Repository Statistics v${version}</a>`));
    });

    test('escapes title', () => {
        const html = wrapInHTMLTemplate('', '<script>alert(1)</script>', '2026-11-21');
        assert.ok(!html.includes('<script>alert(1)</script>'));
        assert.match(html, /&lt;script&gt;/);
    });
});

describe('Edge cases', () => {
    test('handles very long file names without breaking layout', () => {
        const commits = [
            makeCommit({
                files: ['src/very/long/path/to/file/with/many/directories/and/a/very/long/filename/that/might/cause/layout/issues.js'],
                fileDeltas: new Map([
                    ['src/very/long/path/to/file/with/many/directories/and/a/very/long/filename/that/might/cause/layout/issues.js', { ins: 10, del: 2, binary: false, status: 'M' }]
                ]),
                trackedFiles: ['src/very/long/path/to/file/with/many/directories/and/a/very/long/filename/that/might/cause/layout/issues.js']
            })
        ];
        const groupedByDate = groupCommitsByDate(commits);
        const html = renderChangelogHTML(groupedByDate, []);
        assert.ok(html.includes('very/long/path'));
    });

    test('handles special characters in tags', () => {
        const commits = [
            makeCommit({
                tags: ['v1.0.0-beta.1+build.123', 'release/2026.11.20']
            })
        ];
        const groupedByDate = groupCommitsByDate(commits);
        const tagsList = extractTagsList(groupedByDate);
        const html = renderChangelogHTML(groupedByDate, tagsList);
        assert.ok(html.includes('v1.0.0-beta.1+build.123'));
        assert.ok(html.includes('release/2026.11.20'));
    });
});

describe('render code timeline', () => {
    test('scales peak commit bar in churn timeline flush to the top boundary line', () => {
        const d = buildSampleData({ insertions: 1025, deletions: 0 });
        const html = renderOverviewHTML({ repoName: 'demo', ...d, generatedAt: '2026-11-23' });
        assert.match(html, /<rect x="[^"]+" y="28\.00" width="8\.00" height="94\.00" rx="1" class="churn-bar-ins"/);
    });
});

describe('renderChangelogHTML', () => {
    test('formats day summary metadata without duplicating unique files count', () => {
        const singleFileData = buildSampleData({
            date: '2026-11-23',
            author: 'DB',
            tags: ['v1.0.0'],
            trackedFiles: ['src/app.js'],
            insertions: 10,
            deletions: 2,
        });
        const singleHtml = renderChangelogHTML(singleFileData.groupedByDate, singleFileData.tagsList);

        assert.ok(singleHtml.includes('<strong>1 commit</strong>'));
        assert.ok(singleHtml.includes('<strong>1</strong> unique file</span>'));
        assert.ok(!singleHtml.includes('1 1 unique file'));
        assert.ok(singleHtml.includes('<span class="summary-authors">DB</span>'));

        const multiFileCommits = [
            makeCommit({
                date: '2026-11-23',
                author: 'DB',
                trackedFiles: ['src/a.js', 'src/b.js'],
                insertions: 400,
                deletions: 200,
            }),
            makeCommit({
                date: '2026-11-23',
                author: 'Alice',
                trackedFiles: ['src/b.js', 'src/c.js'],
                insertions: 240,
                deletions: 112,
            }),
        ];
        const multiGrouped = groupCommitsByDate(multiFileCommits);
        const multiHtml = renderChangelogHTML(multiGrouped, []);

        assert.ok(multiHtml.includes('<strong>2 commits</strong>'));
        assert.ok(multiHtml.includes('<strong>3</strong> unique files</span>'));
        assert.ok(!multiHtml.includes('3 3 unique files'));
        assert.ok(multiHtml.includes('<span class="summary-authors">DB · Alice</span>'));
    });
});