const {
    WEEKDAY_NAMES,
    MONTH_NAMES,
    TOP_FILES_COUNT,
    LEGACY_FILES_COUNT,
    TOP_EXTENSIONS_COUNT,
    parseDate,
    getTodayLocalDate,
    diffDays,
    toMondayFirstIndex,
    getExtension,
    normalizeGitPath,
    isIgnoredFile
} = require('./utils');

/**
 * Groups commits by date and calculates per-day aggregates.
 */
function groupCommitsByDate(commits) {
    const groupedByDate = {};

    commits.forEach(commit => {
        const { date } = commit;

        if (!groupedByDate[date]) {
            groupedByDate[date] = {
                commits: [],
                totalInsertions: 0,
                totalDeletions: 0,
                uniqueFiles: new Set()
            };
        }

        groupedByDate[date].commits.push({
            subject: commit.subject,
            time: commit.time,
            author: commit.author,
            files: commit.files,
            fileDeltas: commit.fileDeltas,
            trackedFiles: commit.trackedFiles,
            ignoredFiles: commit.ignoredFiles,
            insertions: commit.insertions,
            deletions: commit.deletions,
            binaryCount: commit.binaryCount,
            textCount: commit.textCount,
            fileStats: commit.fileStats,
            hasOnlyIgnored: commit.hasOnlyIgnored,
            tags: commit.tags || []
        });

        groupedByDate[date].totalInsertions += commit.insertions;
        groupedByDate[date].totalDeletions += commit.deletions;
        commit.trackedFiles.forEach(file => groupedByDate[date].uniqueFiles.add(file));
    });

    return groupedByDate;
}

/**
 * Extracts all git tags across commits in reverse chronological order (newest first).
 */
function extractTagsList(groupedByDate) {
    const tagsList = [];
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

    for (const date of sortedDates) {
        groupedByDate[date].commits.forEach((commit, index) => {
            if (commit.tags && commit.tags.length > 0) {
                for (const tag of commit.tags) {
                    tagsList.push({
                        tag,
                        date,
                        subject: commit.subject,
                        rowId: `commit-${date}-${index}`,
                    });
                }
            }
        });
    }

    return tagsList;
}

/**
 * Groups commits into release buckets separated by git tags (newest first).
 * Omits the initial Unreleased bucket if the latest commit is already tagged.
 */
function calculateReleases(groupedByDate) {
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
    const orderedCommits = [];

    for (const date of sortedDates) {
        groupedByDate[date].commits.forEach((commit, index) => {
            orderedCommits.push({
                ...commit,
                date,
                rowId: `commit-${date}-${index}`,
            });
        });
    }

    if (orderedCommits.length === 0) return [];

    const releases = [];
    let currentBucket = {
        name: 'Unreleased',
        isUnreleased: true,
        date: orderedCommits[0].date,
        commits: [],
        insertions: 0,
        deletions: 0,
        uniqueFiles: new Set(),
    };

    for (const commit of orderedCommits) {
        if (commit.tags && commit.tags.length > 0) {
            if (currentBucket.commits.length > 0) {
                const firstDate = currentBucket.commits[currentBucket.commits.length - 1].date;
                const lastDate = currentBucket.commits[0].date;
                releases.push({
                    ...currentBucket,
                    firstDate,
                    lastDate,
                    uniqueFilesCount: currentBucket.uniqueFiles.size,
                });
            }

            currentBucket = {
                name: commit.tags.join(', '),
                isUnreleased: false,
                date: commit.date,
                commits: [],
                insertions: 0,
                deletions: 0,
                uniqueFiles: new Set(),
            };
        }

        currentBucket.commits.push(commit);
        currentBucket.insertions += commit.insertions;
        currentBucket.deletions += commit.deletions;
        commit.trackedFiles.forEach(f => currentBucket.uniqueFiles.add(f));
    }

    if (currentBucket.commits.length > 0) {
        const firstDate = currentBucket.commits[currentBucket.commits.length - 1].date;
        const lastDate = currentBucket.commits[0].date;
        releases.push({
            ...currentBucket,
            firstDate,
            lastDate,
            uniqueFilesCount: currentBucket.uniqueFiles.size,
        });
    }

    return releases;
}

/**
 * Calculates the longest streak of consecutive active days.
 */
function calculateMaxStreak(dates) {
    if (dates.length === 0) return { length: 0, start: '', end: '' };

    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    let maxStreak = 1;
    let currentStreak = 1;
    let currentStart = sorted[0];

    let bestStart = sorted[0];
    let bestEnd = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const prev = parseDate(sorted[i - 1]);
        const curr = parseDate(sorted[i]);
        const diff = diffDays(prev, curr);

        if (diff === 1) {
            currentStreak++;
        } else {
            if (currentStreak > maxStreak) {
                maxStreak = currentStreak;
                bestStart = currentStart;
                bestEnd = sorted[i - 1];
            }
            currentStreak = 1;
            currentStart = sorted[i];
        }
    }

    if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        bestStart = currentStart;
        bestEnd = sorted[sorted.length - 1];
    }

    return { length: maxStreak, start: bestStart, end: bestEnd };
}

/**
 * Calculates the current active streak of consecutive days ending today or yesterday (local calendar date).
 */
function calculateCurrentStreak(dates) {
    if (dates.length === 0) return 0;

    const dateSet = new Set(dates);
    const cursor = getTodayLocalDate();

    const formatUTC = (d) => {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // If no commits today (in local calendar date), check from yesterday
    if (!dateSet.has(formatUTC(cursor))) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        if (!dateSet.has(formatUTC(cursor))) {
            return 0;
        }
    }

    let streak = 0;
    while (dateSet.has(formatUTC(cursor))) {
        streak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    return streak;
}

/**
 * Calculates the longest gap between active days.
 */
function calculateLongestGap(dates) {
    if (dates.length < 2) return { length: 0, start: '', end: '' };

    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    let maxGap = 0;
    let bestStart = '';
    let bestEnd = '';

    for (let i = 1; i < sorted.length; i++) {
        const prev = parseDate(sorted[i - 1]);
        const curr = parseDate(sorted[i]);
        const gapDays = diffDays(prev, curr) - 1;

        if (gapDays > maxGap) {
            maxGap = gapDays;
            bestStart = sorted[i - 1];
            bestEnd = sorted[i];
        }
    }

    return { length: maxGap, start: bestStart, end: bestEnd };
}

/**
 * Counts commits per weekday (Mon..Sun).
 */
function calculateActivityByWeekday(groupedByDate) {
    const counts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };

    for (const dateStr of Object.keys(groupedByDate)) {
        const commitsCount = groupedByDate[dateStr].commits.length;
        const jsDay = parseDate(dateStr).getUTCDay();
        const weekday = WEEKDAY_NAMES[toMondayFirstIndex(jsDay)];
        counts[weekday] += commitsCount;
    }

    return counts;
}

/**
 * Counts commits per month, returning all months chronologically as [['YYYY-MMM', count], ...].
 */
function calculateActivityByMonth(groupedByDate) {
    const monthCounts = new Map();

    for (const dateStr of Object.keys(groupedByDate)) {
        const [year, monthStr] = dateStr.split('-');
        const ymKey = `${year}-${monthStr}`; // e.g., '2026-11' (sorts chronologically!)
        const commitsCount = groupedByDate[dateStr].commits.length;
        monthCounts.set(ymKey, (monthCounts.get(ymKey) || 0) + commitsCount);
    }

    return Array.from(monthCounts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ymKey, count]) => {
            const [year, monthStr] = ymKey.split('-');
            const monthIndex = parseInt(monthStr, 10) - 1;
            return [`${year}-${MONTH_NAMES[monthIndex]}`, count];
        });
}

/**
 * Counts commits per time-of-day period:
 * Night (00:00–05:59), Morning (06:00–11:59), Day (12:00–17:59), Evening (18:00–23:59).
 */
function calculateActivityByTimeOfDay(groupedByDate) {
    const periods = [
        { key: 'night', label: 'Night', icon: '🌙', range: '00:00–05:59', count: 0 },
        { key: 'morning', label: 'Morning', icon: '🌅', range: '06:00–11:59', count: 0 },
        { key: 'day', label: 'Day', icon: '☀️', range: '12:00–17:59', count: 0 },
        { key: 'evening', label: 'Evening', icon: '🌆', range: '18:00–23:59', count: 0 }
    ];
    const hourCounts = new Array(24).fill(0);

    let total = 0;

    for (const data of Object.values(groupedByDate)) {
        for (const commit of data.commits) {
            if (!commit.time) continue;
            const hour = parseInt(commit.time.split(':')[0], 10);
            if (isNaN(hour) || hour < 0 || hour > 23) continue;

            total++;
            hourCounts[hour]++;
            if (hour < 6) periods[0].count++;
            else if (hour < 12) periods[1].count++;
            else if (hour < 18) periods[2].count++;
            else periods[3].count++;
        }
    }

    if (total === 0) return null;

    const withPercent = periods.map(p => ({
        ...p,
        percent: ((p.count / total) * 100).toFixed(0)
    }));

    const peak = [...withPercent].sort((a, b) => b.count - a.count)[0];

    let bestHour = 0;
    let bestHourCount = 0;
    hourCounts.forEach((count, h) => {
        if (count > bestHourCount) {
            bestHourCount = count;
            bestHour = h;
        }
    });

    const hh = String(bestHour).padStart(2, '0');
    const peakHour = {
        hour: bestHour,
        range: `${hh}:00–${hh}:59`,
        count: bestHourCount,
        percent: ((bestHourCount / total) * 100).toFixed(0)
    };

    return {
        periods: withPercent,
        peak,
        peakHour,
        total
    };
}

/**
 * Finds the commit with the highest total churn.
 */
function findLargestCommit(groupedByDate) {
    let largest = null;
    let maxChurn = 0;

    for (const [date, data] of Object.entries(groupedByDate)) {
        for (const commit of data.commits) {
            const churn = commit.insertions + commit.deletions;
            if (churn > maxChurn) {
                maxChurn = churn;
                largest = {
                    date,
                    subject: commit.subject,
                    insertions: commit.insertions,
                    deletions: commit.deletions
                };
            }
        }
    }

    return largest;
}

/**
 * Calculates overall repository statistics.
 */
function calculateOverallStats(groupedByDate, repoBounds = null) {
    const allDates = Object.keys(groupedByDate).sort((a, b) => a.localeCompare(b));
    if (allDates.length === 0) {
        return {
            firstDate: '',
            lastDate: '',
            totalCalendarDays: 0,
            activeDays: 0,
            activityPercent: '0',
            totalCommits: 0,
            totalInsertions: 0,
            totalDeletions: 0,
            netChange: 0,
            avgPerCommitIns: '0.0',
            avgPerCommitDel: '0.0',
            avgFilesPerCommit: '0.0',
            avgPerActiveDayIns: 0,
            avgPerActiveDayDel: 0,
            avgCommitsPerActiveDay: '0.0',
            recordCommitsDate: '',
            recordCommitsCount: 0,
            recordCodeDate: '',
            recordCodeIns: 0,
            recordCodeDel: 0,
            maxStreakLength: 0,
            maxStreakStart: '',
            maxStreakEnd: '',
            longestGapLength: 0,
            longestGapStart: '',
            longestGapEnd: '',
            currentStreak: 0,
            trueFirstDate: '',
            trueLastDate: '',
            repoAge: 0,
            totalUniqueFiles: 0,
        };
    }

    const firstDate = allDates[0];
    const lastDate = allDates[allDates.length - 1];

    const startDate = parseDate(firstDate);
    const endDate = parseDate(lastDate);
    const totalCalendarDays = diffDays(startDate, endDate) + 1;
    const activeDays = allDates.length;
    const activityPercent = totalCalendarDays
        ? ((activeDays / totalCalendarDays) * 100).toFixed(0)
        : '0';

    const trueFirstDate = repoBounds?.firstDate || firstDate;
    const trueLastDate = repoBounds?.lastDate || lastDate;
    const trueStartDate = parseDate(trueFirstDate);
    const todayLocal = getTodayLocalDate();
    const repoAge = Math.max(0, diffDays(trueStartDate, todayLocal));

    let totalCommits = 0;
    let totalInsertions = 0;
    let totalDeletions = 0;
    let totalFilesInCommits = 0;

    let recordCommitsDate = '';
    let recordCommitsCount = 0;

    let recordCodeDate = '';
    let recordCodeIns = 0;
    let recordCodeDel = 0;
    let recordCodeChurn = 0;

    const allUniqueFiles = new Set();

    for (const [date, data] of Object.entries(groupedByDate)) {
        const commitsCount = data.commits.length;
        totalCommits += commitsCount;
        totalInsertions += data.totalInsertions;
        totalDeletions += data.totalDeletions;

        for (const commit of data.commits) {
            totalFilesInCommits += commit.trackedFiles.length;
        }

        if (commitsCount > recordCommitsCount) {
            recordCommitsCount = commitsCount;
            recordCommitsDate = date;
        }

        const churn = data.totalInsertions + data.totalDeletions;
        if (churn > recordCodeChurn) {
            recordCodeChurn = churn;
            recordCodeIns = data.totalInsertions;
            recordCodeDel = data.totalDeletions;
            recordCodeDate = date;
        }

        for (const file of data.uniqueFiles) {
            allUniqueFiles.add(file);
        }
    }

    const netChange = totalInsertions - totalDeletions;
    const avgPerCommitIns = totalCommits ? (totalInsertions / totalCommits).toFixed(1) : '0.0';
    const avgPerCommitDel = totalCommits ? (totalDeletions / totalCommits).toFixed(1) : '0.0';
    const avgFilesPerCommit = totalCommits ? (totalFilesInCommits / totalCommits).toFixed(1) : '0.0';

    const avgPerActiveDayIns = activeDays ? Math.round(totalInsertions / activeDays) : 0;
    const avgPerActiveDayDel = activeDays ? Math.round(totalDeletions / activeDays) : 0;
    const avgCommitsPerActiveDay = activeDays ? (totalCommits / activeDays).toFixed(1) : '0.0';

    const maxStreakInfo = calculateMaxStreak(allDates);
    const currentStreak = calculateCurrentStreak(allDates);
    const longestGapInfo = calculateLongestGap(allDates);
    const totalUniqueFiles = allUniqueFiles.size;

    return {
        firstDate,
        lastDate,
        totalCalendarDays,
        activeDays,
        activityPercent,
        totalCommits,
        totalInsertions,
        totalDeletions,
        netChange,
        avgPerCommitIns,
        avgPerCommitDel,
        avgFilesPerCommit,
        avgPerActiveDayIns,
        avgPerActiveDayDel,
        avgCommitsPerActiveDay,
        recordCommitsDate,
        recordCommitsCount,
        recordCodeDate,
        recordCodeIns,
        recordCodeDel,
        maxStreakLength: maxStreakInfo.length,
        maxStreakStart: maxStreakInfo.start,
        maxStreakEnd: maxStreakInfo.end,
        longestGapLength: longestGapInfo.length,
        longestGapStart: longestGapInfo.start,
        longestGapEnd: longestGapInfo.end,
        currentStreak,
        trueFirstDate,
        trueLastDate,
        repoAge,
        totalUniqueFiles,
    };
}

/**
 * Calculates contributors breakdown (commits count, percent, and lines churn).
 */
function calculateContributors(groupedByDate) {
    const authorsMap = new Map();
    let totalCommits = 0;

    for (const data of Object.values(groupedByDate)) {
        for (const commit of data.commits) {
            const name = commit.author || 'Unknown';
            if (!authorsMap.has(name)) {
                authorsMap.set(name, { name, commits: 0, insertions: 0, deletions: 0 });
            }
            const entry = authorsMap.get(name);
            entry.commits++;
            entry.insertions += commit.insertions;
            entry.deletions += commit.deletions;
            totalCommits++;
        }
    }

    if (totalCommits === 0) return [];

    return Array.from(authorsMap.values())
        .map(a => ({
            ...a,
            percent: ((a.commits / totalCommits) * 100).toFixed(1)
        }))
        .sort((a, b) => b.commits - a.commits);
}

/**
 * Calculates tech stack distribution by volume of changed lines (insertions + deletions).
 */
function calculateTechStackByLines(groupedByDate) {
    const extChurn = new Map();
    let totalChurn = 0;

    for (const data of Object.values(groupedByDate)) {
        for (const commit of data.commits) {
            for (const [file, delta] of commit.fileDeltas.entries()) {
                if (delta.binary) continue;
                const normFile = normalizeGitPath(file);
                if (isIgnoredFile(normFile)) continue;

                const churn = (delta.ins || 0) + (delta.del || 0);
                if (churn === 0) continue;

                const ext = getExtension(normFile);
                extChurn.set(ext, (extChurn.get(ext) || 0) + churn);
                totalChurn += churn;
            }
        }
    }

    if (totalChurn === 0) return [];

    return Array.from(extChurn.entries())
        .map(([ext, churn]) => ({
            ext,
            churn,
            percent: ((churn / totalChurn) * 100).toFixed(1)
        }))
        .sort((a, b) => b.churn - a.churn)
        .slice(0, TOP_EXTENSIONS_COUNT);
}

/**
 * Finds the most frequently changed files.
 */
function findTopFrequentFiles(groupedByDate, topN = TOP_FILES_COUNT) {
    const fileCommitCount = new Map();

    for (const data of Object.values(groupedByDate)) {
        for (const commit of data.commits) {
            const uniqueInCommit = new Set(commit.trackedFiles);
            uniqueInCommit.forEach(file => {
                fileCommitCount.set(file, (fileCommitCount.get(file) || 0) + 1);
            });
        }
    }

    return Array.from(fileCommitCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([file, count]) => ({ file, count }));
}

/**
 * Finds top files by total code churn (insertions + deletions).
 */
function findChurnHotspotFiles(groupedByDate, topN = TOP_FILES_COUNT) {
    const fileChurnMap = new Map();

    for (const data of Object.values(groupedByDate)) {
        for (const commit of data.commits) {
            for (const [file, delta] of commit.fileDeltas.entries()) {
                if (delta.binary) continue;
                const normFile = normalizeGitPath(file);
                if (isIgnoredFile(normFile)) continue;

                const churn = (delta.ins || 0) + (delta.del || 0);
                if (churn === 0) continue;

                fileChurnMap.set(normFile, (fileChurnMap.get(normFile) || 0) + churn);
            }
        }
    }

    return Array.from(fileChurnMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([file, churn]) => ({ file, churn }));
}

/**
 * Extracts the old (pre-rename) path from a git rename notation.
 *
 * Git represents renames in `--numstat` output as either:
 *   - flat form:       'old.js => new.js'
 *   - braced form:     'src/{old => new}.js'  (Git's path compaction)
 *
 * Returns the expanded old path, or `null` if the input has no ' => '
 * (i.e., it's not a rename).
 *
 * Used by `findLegacyFiles` to remove the old path from the legacy map,
 * so renamed files don't linger as ghosts under their previous name.
 *
 * Examples:
 *   'old.js => new.js'         -> 'old.js'
 *   'src/{old => new}.js'      -> 'src/old.js'
 *   'a/b/{c => d}/e.js'        -> 'a/b/c/e.js'
 *   'src/index.js'             -> null
 */
function extractOldGitPath(rawPath) {
    if (!rawPath.includes(' => ')) return null;
    const expanded = rawPath.includes('{')
        ? rawPath.replace(/\{([^{}]*?)\s*=>\s*[^{}]*?\}/g, '$1')
        : rawPath.replace(/^(.+?)\s*=>\s*.+$/, '$1');
    return expanded.replace(/\/+/g, '/').replace(/^\//, '').trim();
}

/**
 * Finds top untouched/legacy files that have not been modified for the longest time.
 * Excludes files that were deleted in their latest commit.
 */
function findLegacyFiles(groupedByDate, topN = LEGACY_FILES_COUNT) {
    const fileLastSeen = new Map(); // normFile -> { date, deleted }
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => a.localeCompare(b));

    for (const date of sortedDates) {
        const commits = groupedByDate[date].commits;
        // Iterate chronological (oldest to newest within the day)
        for (let i = commits.length - 1; i >= 0; i--) {
            const commit = commits[i];
            for (const [file, delta] of commit.fileDeltas.entries()) {
                if (delta.binary) continue;
                const normFile = normalizeGitPath(file);
                if (isIgnoredFile(normFile)) continue;

                if (delta.status === 'R') {
                    const oldFile = extractOldGitPath(file);
                    if (oldFile) fileLastSeen.delete(oldFile);
                }

                fileLastSeen.set(normFile, {
                    date,
                    deleted: delta.status === 'D',
                });
            }
        }
    }

    const today = getTodayLocalDate();
    return Array.from(fileLastSeen.entries())
        .filter(([, info]) => !info.deleted)
        .map(([file, info]) => ({
            file,
            lastDate: info.date,
            daysAgo: Math.max(0, diffDays(parseDate(info.date), today)),
        }))
        .sort((a, b) => b.daysAgo - a.daysAgo || a.lastDate.localeCompare(b.lastDate))
        .slice(0, topN);
}

/**
 * Aggregates file lifecycle operations (added, modified, renamed, deleted)
 * across all commits, broken down by All, Text, and Binary files.
 */
function calculateFileLifecycle(groupedByDate) {
    const totals = {
        all: { added: 0, modified: 0, renamed: 0, deleted: 0, total: 0 },
        text: { added: 0, modified: 0, renamed: 0, deleted: 0, total: 0 },
        binary: { added: 0, modified: 0, renamed: 0, deleted: 0, total: 0 },
    };

    const ops = ['added', 'modified', 'renamed', 'deleted'];

    for (const data of Object.values(groupedByDate)) {
        for (const commit of data.commits) {
            if (!commit.fileStats) continue;

            for (const op of ops) {
                const txt = commit.fileStats[op]?.txt || 0;
                const bin = commit.fileStats[op]?.bin || 0;

                totals.text[op] += txt;
                totals.text.total += txt;

                totals.binary[op] += bin;
                totals.binary.total += bin;

                totals.all[op] += txt + bin;
                totals.all.total += txt + bin;
            }
        }
    }

    return totals;
}

/**
 * Calculates tech stack distribution by file extensions.
 */
function calculateTechStack(groupedByDate) {
    const extCount = new Map();
    let total = 0;

    for (const data of Object.values(groupedByDate)) {
        for (const commit of data.commits) {
            const uniqueInCommit = new Set(commit.trackedFiles);
            uniqueInCommit.forEach(file => {
                const ext = getExtension(file);
                extCount.set(ext, (extCount.get(ext) || 0) + 1);
                total++;
            });
        }
    }

    if (total === 0) return [];

    return Array.from(extCount.entries())
        .map(([ext, count]) => ({
            ext,
            count,
            percent: ((count / total) * 100).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_EXTENSIONS_COUNT);
}

/**
 * Finds the single commit that touched the highest number of tracked files.
 */
function findWidestCommit(groupedByDate) {
    let widest = null;
    let maxFiles = 0;

    for (const [date, data] of Object.entries(groupedByDate)) {
        for (const commit of data.commits) {
            const count = new Set(commit.trackedFiles).size;
            if (count > maxFiles) {
                maxFiles = count;
                widest = {
                    date,
                    subject: commit.subject,
                    filesCount: count
                };
            }
        }
    }

    return widest;
}

module.exports = {
    groupCommitsByDate,
    extractTagsList,
    calculateReleases,
    calculateMaxStreak,
    calculateCurrentStreak,
    calculateLongestGap,
    calculateActivityByWeekday,
    calculateActivityByMonth,
    findLargestCommit,
    calculateOverallStats,
    findTopFrequentFiles,
    calculateTechStack,
    calculateActivityByTimeOfDay,
    calculateContributors,
    calculateTechStackByLines,
    findWidestCommit,
    findChurnHotspotFiles,
    findLegacyFiles,
    calculateFileLifecycle
};
