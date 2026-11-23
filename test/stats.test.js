const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { getTodayLocalDate } = require('../utils');
const {
    groupCommitsByDate,
    extractTagsList,
    calculateReleases,
    calculateMaxStreak,
    calculateCurrentStreak,
    calculateLongestGap,
    calculateActivityByWeekday,
    calculateActivityByMonth,
    calculateActivityByTimeOfDay,
    findLargestCommit,
    findWidestCommit,
    calculateOverallStats,
    calculateContributors,
    calculateTechStack,
    calculateTechStackByLines,
    findTopFrequentFiles,
    findChurnHotspotFiles,
    findLegacyFiles,
    calculateFileLifecycle,
} = require('../stats');

function makeCommit(overrides = {}) {
    return {
        date: '2026-11-20',
        time: '12:00:00',
        author: 'dmibbb',
        subject: 'feat: sample commit',
        files: ['src/app.js'],
        fileDeltas: new Map([['src/app.js', { ins: 10, del: 2, binary: false, status: 'M' }]]),
        trackedFiles: ['src/app.js'],
        ignoredFiles: new Set(),
        insertions: 10,
        deletions: 2,
        binaryCount: 0,
        textCount: 1,
        fileStats: {
            added: { txt: 0, bin: 0 },
            modified: { txt: 1, bin: 0 },
            deleted: { txt: 0, bin: 0 },
            renamed: { txt: 0, bin: 0 },
        },
        tags: [],
        hasOnlyIgnored: false,
        ...overrides,
    };
}

describe('Grouping, Tags & Releases', () => {
    test('groupCommitsByDate aggregates insertions, deletions, and unique files per day', () => {
        const commits = [
            makeCommit({ date: '2026-11-20', insertions: 15, deletions: 5, trackedFiles: ['a.js', 'b.js'] }),
            makeCommit({ date: '2026-11-20', insertions: 10, deletions: 0, trackedFiles: ['b.js', 'c.js'] }),
            makeCommit({ date: '2026-11-19', insertions: 20, deletions: 1, trackedFiles: ['a.js'] }),
        ];

        const grouped = groupCommitsByDate(commits);
        assert.equal(Object.keys(grouped).length, 2);
        assert.equal(grouped['2026-11-20'].commits.length, 2);
        assert.equal(grouped['2026-11-20'].totalInsertions, 25);
        assert.equal(grouped['2026-11-20'].totalDeletions, 5);
        assert.deepEqual(Array.from(grouped['2026-11-20'].uniqueFiles).sort(), ['a.js', 'b.js', 'c.js']);
    });

    test('extractTagsList and calculateReleases split commits into Unreleased and tag buckets', () => {
        const commits = [
            makeCommit({ date: '2026-11-20', subject: 'wip feature', tags: [] }),
            makeCommit({ date: '2026-11-19', subject: 'release 1.1', tags: ['v1.1.0'] }),
            makeCommit({ date: '2026-11-18', subject: 'fix bug', tags: [] }),
            makeCommit({ date: '2026-11-15', subject: 'initial', tags: ['v1.0.0'] }),
        ];
        const grouped = groupCommitsByDate(commits);

        const tags = extractTagsList(grouped);
        assert.equal(tags.length, 2);
        assert.equal(tags[0].tag, 'v1.1.0');
        assert.equal(tags[1].tag, 'v1.0.0');

        const releases = calculateReleases(grouped);
        assert.equal(releases.length, 3);
        assert.equal(releases[0].name, 'Unreleased');
        assert.equal(releases[0].isUnreleased, true);
        assert.equal(releases[0].commits.length, 1);

        assert.equal(releases[1].name, 'v1.1.0');
        assert.equal(releases[1].isUnreleased, false);
        assert.equal(releases[1].commits.length, 2);
        assert.equal(releases[1].firstDate, '2026-11-18');
        assert.equal(releases[1].lastDate, '2026-11-19');

        assert.equal(releases[2].name, 'v1.0.0');
        assert.equal(releases[2].commits.length, 1);
    });

    test('calculateReleases omits Unreleased when latest commit is tagged', () => {
        const commits = [
            makeCommit({ date: '2026-11-20', tags: ['v2.0.0'] }),
            makeCommit({ date: '2026-11-19', tags: [] }),
        ];
        const releases = calculateReleases(groupCommitsByDate(commits));
        assert.equal(releases.length, 1);
        assert.equal(releases[0].name, 'v2.0.0');
        assert.equal(releases[0].isUnreleased, false);
    });

    test('findLegacyFiles respects custom topN limit', () => {
        const commits = Array.from({ length: 10 }, (_, idx) =>
            makeCommit({
                date: `2026-11-${String(idx + 1).padStart(2, '0')}`,
                fileDeltas: new Map([[`src/file-${idx}.js`, { ins: 5, del: 0, binary: false, status: 'A' }]]),
            })
        );
        const grouped = groupCommitsByDate(commits);
        assert.equal(findLegacyFiles(grouped).length, 10);
        assert.equal(findLegacyFiles(grouped, 8).length, 8);
    });
});

describe('Streaks & Gaps', () => {
    test('calculateMaxStreak finds longest consecutive day run', () => {
        assert.deepEqual(calculateMaxStreak([]), { length: 0, start: '', end: '' });
        assert.deepEqual(
            calculateMaxStreak(['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-06', '2026-11-07']),
            { length: 3, start: '2026-11-05', end: '2026-11-07' }
        );
    });

    test('calculateLongestGap finds largest gap between active days', () => {
        assert.deepEqual(calculateLongestGap(['2026-11-01']), { length: 0, start: '', end: '' });
        assert.deepEqual(
            calculateLongestGap(['2026-11-01', '2026-11-03', '2026-11-13']),
            { length: 9, start: '2026-11-03', end: '2026-11-13' }
        );
    });

    test('calculateCurrentStreak counts consecutive days ending today or yesterday', () => {
        const today = getTodayLocalDate();
        const fmt = (d) => d.toISOString().slice(0, 10);

        const d0 = fmt(today);
        const d1 = fmt(new Date(today.getTime() - 86400000));
        const d2 = fmt(new Date(today.getTime() - 2 * 86400000));
        const d5 = fmt(new Date(today.getTime() - 5 * 86400000));

        assert.equal(calculateCurrentStreak([d0, d1, d2]), 3);
        assert.equal(calculateCurrentStreak([d1, d2]), 2);
        assert.equal(calculateCurrentStreak([d5]), 0);
    });
});

describe('Activity & Records', () => {
    test('calculates weekday, monthly, and time-of-day distributions', () => {
        const commits = [
            makeCommit({ date: '2026-11-16', time: '03:15:00' }), // Mon, Night
            makeCommit({ date: '2026-11-16', time: '09:30:00' }), // Mon, Morning
            makeCommit({ date: '2026-11-20', time: '15:45:00' }), // Fri, Day
            makeCommit({ date: '2026-12-01', time: '21:10:00' }), // Tue, Evening
        ];
        const grouped = groupCommitsByDate(commits);

        const weekdays = calculateActivityByWeekday(grouped);
        assert.equal(weekdays.Mon, 2);
        assert.equal(weekdays.Fri, 1);
        assert.equal(weekdays.Tue, 1);

        const months = calculateActivityByMonth(grouped);
        assert.deepEqual(months, [
            ['2026-Nov', 3],
            ['2026-Dec', 1],
        ]);

        const tod = calculateActivityByTimeOfDay(grouped);
        assert.equal(tod.total, 4);
        assert.equal(tod.periods.find(p => p.key === 'night').count, 1);
        assert.equal(tod.periods.find(p => p.key === 'morning').count, 1);
        assert.equal(tod.periods.find(p => p.key === 'day').count, 1);
        assert.equal(tod.periods.find(p => p.key === 'evening').count, 1);
    });

    test('finds largest and widest commits and overall stats', () => {
        const commits = [
            makeCommit({
                date: '2026-11-10',
                subject: 'big refactor',
                insertions: 200,
                deletions: 100,
                trackedFiles: ['a.js', 'b.js', 'c.js'],
            }),
            makeCommit({
                date: '2026-11-12',
                subject: 'small fix',
                insertions: 5,
                deletions: 1,
                trackedFiles: ['a.js'],
            }),
        ];
        const grouped = groupCommitsByDate(commits);

        assert.equal(findLargestCommit(grouped).subject, 'big refactor');
        assert.equal(findWidestCommit(grouped).filesCount, 3);

        const overall = calculateOverallStats(grouped, { firstDate: '2026-01-01', lastDate: '2026-11-12' });
        assert.equal(overall.totalCommits, 2);
        assert.equal(overall.totalInsertions, 205);
        assert.equal(overall.totalDeletions, 101);
        assert.equal(overall.netChange, 104);
        assert.equal(overall.totalCalendarDays, 3);
        assert.equal(overall.activeDays, 2);
        assert.equal(overall.trueFirstDate, '2026-01-01');
        assert.equal(overall.trueLastDate, '2026-11-12');
        assert.equal(overall.totalUniqueFiles, 3);
        assert.equal(overall.avgPerCommitIns, '102.5');
        assert.equal(overall.avgPerCommitDel, '50.5');
        assert.equal(overall.avgFilesPerCommit, '2');
        assert.equal(overall.avgCommitsPerActiveDay, '1');
    });
});

describe('Files, Contributors, Tech Stack & Lifecycle', () => {
    test('calculates contributors, tech stack (files & lines), and file lifecycle', () => {
        const commits = [
            makeCommit({
                author: 'Alice',
                insertions: 50,
                deletions: 10,
                trackedFiles: ['src/index.js', 'styles/main.css'],
                fileDeltas: new Map([
                    ['src/index.js', { ins: 40, del: 5, binary: false, status: 'A' }],
                    ['styles/main.css', { ins: 10, del: 5, binary: false, status: 'M' }],
                ]),
                fileStats: {
                    added: { txt: 1, bin: 0 },
                    modified: { txt: 1, bin: 0 },
                    deleted: { txt: 0, bin: 0 },
                    renamed: { txt: 0, bin: 0 },
                },
            }),
            makeCommit({
                author: 'Bob',
                insertions: 20,
                deletions: 0,
                trackedFiles: ['src/index.js'],
                fileDeltas: new Map([
                    ['src/index.js', { ins: 20, del: 0, binary: false, status: 'M' }],
                    ['logo.png', { ins: null, del: null, binary: true, status: 'A' }],
                ]),
                fileStats: {
                    added: { txt: 0, bin: 1 },
                    modified: { txt: 1, bin: 0 },
                    deleted: { txt: 0, bin: 0 },
                    renamed: { txt: 0, bin: 0 },
                },
            }),
        ];
        const grouped = groupCommitsByDate(commits);

        const contributors = calculateContributors(grouped);
        assert.equal(contributors.length, 2);
        assert.equal(contributors[0].commits, 1);

        const stackFiles = calculateTechStack(grouped);
        assert.equal(stackFiles[0].ext, 'js');
        assert.equal(stackFiles[0].count, 2);

        const stackLines = calculateTechStackByLines(grouped);
        assert.equal(stackLines[0].ext, 'js');
        assert.equal(stackLines[0].churn, 65);

        const topFiles = findTopFrequentFiles(grouped);
        assert.equal(topFiles[0].file, 'src/index.js');
        assert.equal(topFiles[0].count, 2);

        const hotspots = findChurnHotspotFiles(grouped);
        assert.equal(hotspots[0].file, 'src/index.js');
        assert.equal(hotspots[0].churn, 65);

        const lifecycle = calculateFileLifecycle(grouped);
        assert.deepEqual(lifecycle.text, { added: 1, modified: 2, renamed: 0, deleted: 0, total: 3 });
        assert.deepEqual(lifecycle.binary, { added: 1, modified: 0, renamed: 0, deleted: 0, total: 1 });
        assert.deepEqual(lifecycle.all, { added: 2, modified: 2, renamed: 0, deleted: 0, total: 4 });
    });

    test('findLegacyFiles handles same-day deletion and renames cleanly', () => {
        // Newest commit first within the same date (as produced by git log)
        const commits = [
            makeCommit({
                date: '2026-11-10',
                subject: 'evening: delete temp and rename old->new',
                fileDeltas: new Map([
                    ['src/temp.js', { ins: 0, del: 10, binary: false, status: 'D' }],
                    ['src/{old => new}.js', { ins: 2, del: 1, binary: false, status: 'R' }],
                ]),
            }),
            makeCommit({
                date: '2026-11-10',
                subject: 'morning: create temp and old',
                fileDeltas: new Map([
                    ['src/temp.js', { ins: 10, del: 0, binary: false, status: 'A' }],
                    ['src/old.js', { ins: 20, del: 0, binary: false, status: 'A' }],
                ]),
            }),
        ];
        const legacy = findLegacyFiles(groupCommitsByDate(commits));
        const names = legacy.map(f => f.file);
        assert.ok(!names.includes('src/temp.js'), 'deleted file should not appear in legacy files');
        assert.ok(!names.includes('src/old.js'), 'old renamed path should not remain as ghost');
        assert.deepEqual(names, ['src/new.js']);
    });

    test('findLegacyFiles tracks re-added files and multiple chained renames', () => {
        const commits = [
            makeCommit({
                date: '2026-11-10',
                fileDeltas: new Map([
                    ['src/{v2 => v3}/file.js', { ins: 1, del: 0, binary: false, status: 'R' }],
                    ['src/reborn.js', { ins: 15, del: 0, binary: false, status: 'A' }],
                ]),
            }),
            makeCommit({
                date: '2026-11-05',
                fileDeltas: new Map([
                    ['src/{v1 => v2}/file.js', { ins: 1, del: 0, binary: false, status: 'R' }],
                    ['src/reborn.js', { ins: 0, del: 10, binary: false, status: 'D' }],
                ]),
            }),
            makeCommit({
                date: '2026-11-01',
                fileDeltas: new Map([
                    ['src/v1/file.js', { ins: 10, del: 0, binary: false, status: 'A' }],
                    ['src/reborn.js', { ins: 10, del: 0, binary: false, status: 'A' }],
                ]),
            }),
        ];

        const legacy = findLegacyFiles(groupCommitsByDate(commits));
        assert.deepEqual(
            legacy.map(f => ({ file: f.file, lastDate: f.lastDate })),
            [
                { file: 'src/reborn.js', lastDate: '2026-11-10' },
                { file: 'src/v3/file.js', lastDate: '2026-11-10' },
            ]
        );
    });

    test('findLegacyFiles excludes binary files', () => {
        const commits = [
            makeCommit({
                date: '2026-11-01',
                fileDeltas: new Map([
                    ['src/old.js', { ins: 10, del: 0, binary: false, status: 'A' }],
                    ['logo.png', { ins: null, del: null, binary: true, status: 'A' }],
                ]),
            }),
        ];
        const legacy = findLegacyFiles(groupCommitsByDate(commits));
        assert.deepEqual(legacy.map(f => f.file), ['src/old.js']);
    });
});

describe('Edge Cases & Empty Input', () => {
    test('calculateOverallStats returns zero stats for empty input', () => {
        const stats = calculateOverallStats({});
        assert.equal(stats.totalCommits, 0);
        assert.equal(stats.totalInsertions, 0);
        assert.equal(stats.totalDeletions, 0);
        assert.equal(stats.repoAge, 0);
        assert.equal(stats.activeDays, 0);
        assert.equal(stats.totalUniqueFiles, 0);
    });

    test('findLegacyFiles handles multiple renames correctly', () => {
        const commits = [
            makeCommit({
                date: '2026-11-10',
                subject: 'rename v2 to v3',
                fileDeltas: new Map([
                    ['src/{v2 => v3}/file.js', { ins: 1, del: 0, binary: false, status: 'R' }],
                ]),
            }),
            makeCommit({
                date: '2026-11-05',
                subject: 'rename v1 to v2',
                fileDeltas: new Map([
                    ['src/{v1 => v2}/file.js', { ins: 1, del: 0, binary: false, status: 'R' }],
                ]),
            }),
            makeCommit({
                date: '2026-11-01',
                subject: 'create v1',
                fileDeltas: new Map([
                    ['src/v1/file.js', { ins: 10, del: 0, binary: false, status: 'A' }],
                ]),
            }),
        ];

        const legacy = findLegacyFiles(groupCommitsByDate(commits));
        assert.equal(legacy.length, 1);
        assert.equal(legacy[0].file, 'src/v3/file.js');
        assert.equal(legacy[0].lastDate, '2026-11-10');
    });

    test('findLegacyFiles includes files that were deleted then re-added', () => {
        const commits = [
            makeCommit({
                date: '2026-11-10',
                subject: 're-add file',
                fileDeltas: new Map([
                    ['src/file.js', { ins: 5, del: 0, binary: false, status: 'A' }],
                ]),
            }),
            makeCommit({
                date: '2026-11-05',
                subject: 'delete file',
                fileDeltas: new Map([
                    ['src/file.js', { ins: 0, del: 10, binary: false, status: 'D' }],
                ]),
            }),
        ];

        const legacy = findLegacyFiles(groupCommitsByDate(commits));
        assert.equal(legacy.length, 1);
        assert.equal(legacy[0].file, 'src/file.js');
        assert.equal(legacy[0].lastDate, '2026-11-10');
    });

    test('calculateMaxStreak handles single date', () => {
        const result = calculateMaxStreak(['2026-11-20']);
        assert.deepEqual(result, { length: 1, start: '2026-11-20', end: '2026-11-20' });
    });

    test('calculateLongestGap handles two dates', () => {
        const result = calculateLongestGap(['2026-11-01', '2026-11-10']);
        assert.deepEqual(result, { length: 8, start: '2026-11-01', end: '2026-11-10' });
    });

    test('calculateActivityByMonth sorts chronologically across year boundary', () => {
        const commits = [
            makeCommit({ date: '2026-01-05' }),
            makeCommit({ date: '2025-12-20' }),
            makeCommit({ date: '2025-11-10' }),
        ];
        assert.deepEqual(calculateActivityByMonth(groupCommitsByDate(commits)), [
            ['2025-Nov', 1],
            ['2025-Dec', 1],
            ['2026-Jan', 1],
        ]);
    });

    test('all aggregators handle empty input', () => {
        const empty = {};
        assert.deepEqual(calculateReleases(empty), []);
        assert.deepEqual(extractTagsList(empty), []);
        assert.deepEqual(calculateContributors(empty), []);
        assert.deepEqual(calculateTechStack(empty), []);
        assert.deepEqual(calculateTechStackByLines(empty), []);
        assert.deepEqual(findTopFrequentFiles(empty), []);
        assert.deepEqual(findChurnHotspotFiles(empty), []);
        assert.deepEqual(findLegacyFiles(empty), []);
        assert.equal(findLargestCommit(empty), null);
        assert.equal(findWidestCommit(empty), null);
        assert.equal(calculateActivityByTimeOfDay(empty), null);
        assert.equal(calculateFileLifecycle(empty).all.total, 0);
    });
});

module.exports = {
    makeCommit
};
