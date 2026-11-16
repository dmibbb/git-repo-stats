const { execSync } = require('child_process');
const { MAX_BUFFER, isIgnoredFile, escapePipe } = require('./utils');

/**
 * Executes git log and returns raw output.
 */
function fetchRawGitLog(repoPath) {
  return execSync(
    'git log --no-merges --date=iso --pretty=format:"===COMMIT===%ad|||%s" --numstat',
    {
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER,
      cwd: repoPath
    }
  );
}

/**
 * Parses a single commit entry from the raw log.
 */
function parseCommitEntry(entry) {
  const lines = entry.trim().split('\n');
  const [dateRaw, ...subjectParts] = lines[0].split('|||');
  const date = dateRaw.split(' ')[0]; // YYYY-MM-DD
  const time = dateRaw.split(' ')[1] || ''; // HH:MM:SS +ZZZZ
  const subject = subjectParts.join('|||').trim();

  const files = [];
  const trackedFiles = [];
  const ignoredFiles = new Set();
  let insertions = 0;
  let deletions = 0;
  let binaryCount = 0;
  let textCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length === 3) {
      const [ins, del, file] = parts;

      files.push(file);

      if (isIgnoredFile(file)) {
        ignoredFiles.add(file);
        continue;
      }

      trackedFiles.push(file);

      if (ins === '-' && del === '-') {
        binaryCount++;
      } else {
        const insNum = parseInt(ins, 10);
        const delNum = parseInt(del, 10);

        if (!isNaN(insNum) && !isNaN(delNum)) {
          insertions += insNum;
          deletions += delNum;
          textCount++;
        }
      }
    }
  }

  const hasOnlyIgnored = files.length > 0 && trackedFiles.length === 0;

  return {
    date,
    time,
    subject,
    files,
    trackedFiles,
    ignoredFiles,
    insertions,
    deletions,
    binaryCount,
    textCount,
    hasOnlyIgnored,
  };
}

/**
 * Parses the raw git log into an array of commit objects.
 */
function parseRawLog(rawLog) {
  return rawLog
    .split('===COMMIT===')
    .filter(Boolean)
    .map(parseCommitEntry);
}

module.exports = {
  fetchRawGitLog,
  parseCommitEntry,
  parseRawLog
};
