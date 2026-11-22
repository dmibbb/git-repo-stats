const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    groupCommitsByDate,
    calculateOverallStats,
    findTopFrequentFiles,
    findLargestCommit,
    findWidestCommit,
    calculateTechStack,
    calculateTechStackByLines,
    calculateFileLifecycle,
    calculateActivityByWeekday,
    calculateActivityByMonth,
    calculateActivityByTimeOfDay,
    calculateContributors,
    calculateReleases,
    findChurnHotspotFiles,
    findLegacyFiles
} = require('../stats');
const {
    renderOverview,
    renderReleases,
    renderChangelog,
    renderChangelogFile,
    renderFooter,
} = require('../render-md');
const { version } = require('../package.json');
const { makeCommit } = require('./stats.test');

describe('render-md', () => {
    test('renders full Markdown overview and changelog without NaN or undefined', () => {
        const commits = [
            makeCommit({
                date: '2026-11-20',
                author: 'Alice',
                subject: 'feat: add `renderBar` | pipe test',
                files: ['src/my file.js', 'src/{old => new}.js'],
                fileDeltas: new Map([
                    ['src/my file.js', { ins: 20, del: 2, binary: false, status: 'A' }],
                    ['src/{old => new}.js', { ins: 5, del: 1, binary: false, status: 'R' }],
                ]),
                trackedFiles: ['src/my file.js', 'src/new.js'],
                insertions: 25,
                deletions: 3,
                tags: ['v1.0.0'],
            }),
            makeCommit({
                date: '2026-12-01',
                author: 'Bob',
                subject: 'fix: minor tweak',
                insertions: 2,
                deletions: 1,
            }),
        ];

        const groupedByDate = groupCommitsByDate(commits);
        const stats = calculateOverallStats(groupedByDate);
        const md = renderOverview(
            'demo-repo',
            stats,
            findTopFrequentFiles(groupedByDate),
            findLargestCommit(groupedByDate),
            calculateTechStack(groupedByDate),
            calculateActivityByWeekday(groupedByDate),
            calculateActivityByMonth(groupedByDate),
            {
                widestCommit: findWidestCommit(groupedByDate),
                contributors: calculateContributors(groupedByDate),
                timeOfDayStats: calculateActivityByTimeOfDay(groupedByDate),
                techStackByLines: calculateTechStackByLines(groupedByDate),
                fileLifecycle: calculateFileLifecycle(groupedByDate),
                hotspotFiles: findChurnHotspotFiles(groupedByDate),
                legacyFiles: findLegacyFiles(groupedByDate),
                args: { since: '2026-01-01' },
            }
        ) + renderReleases(calculateReleases(groupedByDate)) + renderChangelog(groupedByDate);

        assert.ok(!md.includes('undefined'));
        assert.ok(!md.includes('NaN'));
        assert.ok(md.includes('Unique files:'));
        assert.ok(md.includes('Full repo:'));
        assert.ok(md.includes('Activity by time of day'));
        assert.ok(md.includes('Churn hotspots'));
        assert.ok(md.includes('Legacy files'));
        assert.ok(md.includes('Tech stack (by lines changed)'));
        assert.ok(md.includes('File lifecycle'));
        assert.ok(md.includes('Period (Filtered)'));
        assert.ok(md.includes('Widest commit'));
        assert.ok(md.includes('Contributors'));
        assert.ok(md.includes('Releases & Tags'));
        assert.ok(md.includes('feat: add `renderBar` \\| pipe test'));
        assert.ok(md.includes('[src/my file.js](src/my%20file.js) (+20/-2) _(added)_'));
        assert.ok(md.includes('`src/{old => new}.js` (+5/-1) _(renamed)_'));
        assert.ok(md.includes('<summary><strong>2026-11-20</strong>'));
    });

    test('renders empty changelog gracefully', () => {
        const md = renderChangelog({});
        assert.match(md, /## 📝 Changelog Details/);
        assert.ok(!md.includes('undefined'));
    });

    test('renders Markdown footer with timestamp and version link', () => {
        const footer = renderFooter('2026-11-23 01:30:00 (UTC+3)');
        assert.ok(footer.includes(`_Generated 2026-11-23 01:30:00 (UTC+3) by [Git Repository Statistics v${version}](https://github.com/dmibbb/git-repo-stats)_`));
    });
});

describe('render-changelog', () => {
    test('renders standalone repo-stats-changelog.md with release dates, separators, and footer', () => {
        const commits = [
            makeCommit({ date: '2026-11-22', subject: 'wip: upcoming change', tags: [] }),
            makeCommit({ date: '2026-11-20', subject: 'feat: release v1.0.2', tags: ['v1.0.2'] }),
            makeCommit({ date: '2026-11-18', subject: 'fix: bug in v1.0.2', tags: [] }),
            makeCommit({ date: '2026-11-10', subject: 'feat: initial v1.0.0', tags: ['v1.0.0'] }),
        ];
        const releases = calculateReleases(groupCommitsByDate(commits));
        const out = renderChangelogFile(releases, '2026-11-23 02:15:00 (UTC+3)');
        assert.ok(out.includes('## Unreleased\n\nChanges:\n\n- wip: upcoming change\n\n---\n\n## v1.0.2\n\n**Released on 2026/11/20**\n\nChanges:\n\n- feat: release v1.0.2\n- fix: bug in v1.0.2\n\n---\n\n## v1.0.0\n\n**Released on 2026/11/10**'));
        assert.ok(!out.endsWith('---\n'));
        assert.ok(out.includes(`_Generated 2026-11-23 02:15:00 (UTC+3) by [Git Repository Statistics v${version}]`));
    });
});
