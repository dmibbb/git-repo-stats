const { parseDate, toMondayFirstIndex, WEEKDAY_NAMES, MONTH_NAMES, TOP_FILES_COUNT, TOP_EXTENSIONS_COUNT, getExtension } = require('./utils');

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
            files: commit.files,
            trackedFiles: commit.trackedFiles,
            ignoredFiles: commit.ignoredFiles,
            insertions: commit.insertions,
            deletions: commit.deletions,
            binaryCount: commit.binaryCount,
            textCount: commit.textCount,
            hasOnlyIgnored: commit.hasOnlyIgnored
        });

        groupedByDate[date].totalInsertions += commit.insertions;
        groupedByDate[date].totalDeletions += commit.deletions;
        commit.trackedFiles.forEach(file => groupedByDate[date].uniqueFiles.add(file));
    });

    return groupedByDate;
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
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
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
 * Calculates the longest gap between active days.
 */
function calculateLongestGap(dates) {
    if (dates.length < 2) return { length: 0, start: '', end: '' };

    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    let maxGap = 0;
    let bestStart = sorted[0];
    let bestEnd = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const prev = parseDate(sorted[i - 1]);
        const curr = parseDate(sorted[i]);
        const gapDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

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
 * Counts commits per month (YYYY-MMM format), returns ALL months chronologically.
 */
function calculateActivityByMonth(groupedByDate) {
    const monthCounts = new Map();

    for (const dateStr of Object.keys(groupedByDate)) {
        const [year, monthStr] = dateStr.split('-');
        const monthIndex = parseInt(monthStr, 10) - 1;
        const monthLabel = `${year}-${MONTH_NAMES[monthIndex]}`;
        const commitsCount = groupedByDate[dateStr].commits.length;
        monthCounts.set(monthLabel, (monthCounts.get(monthLabel) || 0) + commitsCount);
    }

    return Array.from(monthCounts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));
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
function calculateOverallStats(groupedByDate) {
    const allDates = Object.keys(groupedByDate).sort((a, b) => a.localeCompare(b));
    const firstDate = allDates[0];
    const lastDate = allDates[allDates.length - 1];

    const startDate = parseDate(firstDate);
    const endDate = parseDate(lastDate);
    const totalCalendarDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const activeDays = allDates.length;
    const activityPercent = totalCalendarDays
        ? ((activeDays / totalCalendarDays) * 100).toFixed(0)
        : '0';

    const totalCommits = Object.values(groupedByDate).reduce((sum, d) => sum + d.commits.length, 0);
    const totalInsertions = Object.values(groupedByDate).reduce((sum, d) => sum + d.totalInsertions, 0);
    const totalDeletions = Object.values(groupedByDate).reduce((sum, d) => sum + d.totalDeletions, 0);
    const netChange = totalInsertions - totalDeletions;

    const avgPerCommitIns = totalCommits ? (totalInsertions / totalCommits).toFixed(1) : '0.0';
    const avgPerCommitDel = totalCommits ? (totalDeletions / totalCommits).toFixed(1) : '0.0';

    const totalFilesInCommits = Object.values(groupedByDate).reduce(
        (sum, d) => sum + d.commits.reduce((s, c) => s + c.trackedFiles.length, 0), 0
    );
    const avgFilesPerCommit = totalCommits ? (totalFilesInCommits / totalCommits).toFixed(1) : '0.0';

    const avgPerActiveDayIns = activeDays ? Math.round(totalInsertions / activeDays) : 0;
    const avgPerActiveDayDel = activeDays ? Math.round(totalDeletions / activeDays) : 0;
    const avgCommitsPerActiveDay = activeDays ? (totalCommits / activeDays).toFixed(1) : '0.0';

    let recordCommitsDate = '';
    let recordCommitsCount = 0;
    for (const [date, data] of Object.entries(groupedByDate)) {
        if (data.commits.length > recordCommitsCount) {
            recordCommitsCount = data.commits.length;
            recordCommitsDate = date;
        }
    }

    let recordCodeDate = '';
    let recordCodeIns = 0;
    let recordCodeDel = 0;
    let recordCodeChurn = 0;
    for (const [date, data] of Object.entries(groupedByDate)) {
        const churn = data.totalInsertions + data.totalDeletions;
        if (churn > recordCodeChurn) {
            recordCodeChurn = churn;
            recordCodeIns = data.totalInsertions;
            recordCodeDel = data.totalDeletions;
            recordCodeDate = date;
        }
    }

    const maxStreakInfo = calculateMaxStreak(allDates);
    const longestGapInfo = calculateLongestGap(allDates);

    return {
        firstDate, lastDate, totalCalendarDays, activeDays, activityPercent,
        totalCommits, totalInsertions, totalDeletions, netChange,
        avgPerCommitIns, avgPerCommitDel, avgFilesPerCommit,
        avgPerActiveDayIns, avgPerActiveDayDel, avgCommitsPerActiveDay,
        recordCommitsDate, recordCommitsCount,
        recordCodeDate, recordCodeIns, recordCodeDel,
        maxStreakLength: maxStreakInfo.length,
        maxStreakStart: maxStreakInfo.start,
        maxStreakEnd: maxStreakInfo.end,
        longestGapLength: longestGapInfo.length,
        longestGapStart: longestGapInfo.start,
        longestGapEnd: longestGapInfo.end,
        repoAge: totalCalendarDays
    };
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

module.exports = {
    groupCommitsByDate,
    calculateMaxStreak,
    calculateLongestGap,
    calculateActivityByWeekday,
    calculateActivityByMonth,
    findLargestCommit,
    calculateOverallStats,
    findTopFrequentFiles,
    calculateTechStack
};
