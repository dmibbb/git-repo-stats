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
        const overview = renderOverviewHTML(
            'demo-repo',
            d.stats,
            d.filesData,
            d.largestCommit,
            d.widestCommit,
            d.techStack,
            d.fileLifecycle,
            d.weekdayCounts,
            d.monthCounts,
            d.groupedByDate,
            d.timeOfDayStats,
            d.techStackByLines,
            d.contributors,
            d.releases,
            '2026-11-21 12:00:00 (UTC+3)',
            {}
        );
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
        const html = renderOverviewHTML(
            'repo<script>',
            d.stats,
            d.filesData,
            d.largestCommit,
            d.widestCommit,
            d.techStack,
            d.fileLifecycle,
            d.weekdayCounts,
            d.monthCounts,
            d.groupedByDate,
            d.timeOfDayStats,
            d.techStackByLines,
            d.contributors,
            d.releases,
            '2026-11-21 12:00:00 (UTC+3)',
            { since: '2026-01-01' }
        ) + renderChangelogHTML(d.groupedByDate, d.tagsList);

        assert.ok(!html.includes('<script>alert("xss")</script>'));
        assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
        assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
        assert.ok(html.includes('href="src/my%20file.js"'));
        assert.ok(html.includes('<code>src/{old =&gt; <a href="src/new.js" class="file-link">new</a>}.js</code>'));
        assert.ok(html.includes('Filtered (since 2026-01-01)'));
    });

    test('renders churn timeline and heatmap sections', () => {
        const d = buildSampleData({ tags: ['v1.0.0'] });
        const html = renderOverviewHTML(
            'demo', d.stats, d.filesData, d.largestCommit, d.widestCommit,
            d.techStack, d.fileLifecycle, d.weekdayCounts, d.monthCounts,
            d.groupedByDate, d.timeOfDayStats, d.techStackByLines, d.contributors,
            d.releases, '2026-11-21', {}
        );
        assert.match(html, /<svg class="churn-svg"/);
        assert.match(html, /class="heatmap-select"/);
        assert.match(html, /data-release-id="release-v1-0-0"|data-release-id="release-/);
        assert.match(html, /data-time="12:00:00"/);
    });

    test('handles null/empty data gracefully', () => {
        const empty = { /* ... */ };
        assert.doesNotThrow(() => {
            renderOverviewHTML(
                'empty-repo', empty, { frequent: [], hotspots: [], legacy: [] },
                null, null, [], { all: { total: 0 } }, {}, [], {},
                null, [], [], [], '2026-11-21', {}
            );
        }, 'renderOverviewHTML should not throw on empty data');

        assert.doesNotThrow(() => {
            renderChangelogHTML({}, []);
        }, 'renderChangelogHTML should not throw on empty data');
    });

    test('includes accessibility attributes on search counter, heatmap cells, and timeline release pills', () => {
        const d = buildSampleData({ tags: ['v1.0.0'] });
        const html = renderOverviewHTML(
            'demo', d.stats, d.filesData, d.largestCommit, d.widestCommit,
            d.techStack, d.fileLifecycle, d.weekdayCounts, d.monthCounts,
            d.groupedByDate, d.timeOfDayStats, d.techStackByLines, d.contributors,
            d.releases, '2026-11-21', {}
        ) + renderChangelogHTML(d.groupedByDate, d.tagsList);

        assert.match(html, /class="search-counter" aria-live="polite"/);
        assert.match(html, /class="heatmap-cell [^"]*" data-date="2026-11-20" data-active="true" role="button" tabindex="0" aria-label="/);
        assert.match(html, /class="churn-release-pill-group" data-release-id="[^"]+" role="button" tabindex="0" aria-label="Jump to release v1\.0\.0"/);
    });
});

describe('renderFileLinkHTML', () => {
    test('renders regular file as link', () => {
        const html = renderFileLinkHTML('src/index.js');
        assert.match(html, /<a href="src\/index\.js"/);
    });

    test('respects explicit isRename parameter', () => {
        const html = renderFileLinkHTML('src/index.js', true);
        assert.match(html, /<code>/);
    });

    test('renders renamed file with clickable link on new path', () => {
        const html = renderFileLinkHTML('src/{old => new}.js');
        assert.equal(html, '<code>src/{old =&gt; <a href="src/new.js" class="file-link">new</a>}.js</code>');

        const flatHtml = renderFileLinkHTML('old.js => new.js');
        assert.equal(flatHtml, '<code>old.js =&gt; <a href="new.js" class="file-link">new.js</a></code>');
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
    test('includes CSS and client JS in output', () => {
        const html = wrapInHTMLTemplate('<p>Test</p>', 'Test Title', '2026-11-21');
        assert.match(html, /<!DOCTYPE html>/);
        assert.match(html, /<\/html>$/);
        assert.match(html, /<style>/);
        assert.match(html, /<script>/);
        assert.match(html, /Test Title/);
        assert.match(html, /Generated: 2026-11-21/);
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
