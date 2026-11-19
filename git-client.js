const { execFileSync } = require('child_process');
const { MAX_BUFFER, isIgnoredFile, normalizeGitPath } = require('./utils');

/**
 * Executes git log and returns raw output.
 * Supports optional --since and --until filters.
 */
function fetchRawGitLog(repoPath, since, until) {
  const args = [
    '-c',
    'core.quotepath=false',
    'log',
    '--no-merges',
    '--date=iso',
    '--pretty=format:===COMMIT===%ad|||%an|||%D|||%s',
    '--raw',
    '--numstat',
  ];

  if (since) args.push(`--since=${since}`);
  if (until) args.push(`--until=${until}`);

  return execFileSync('git', args, {
    encoding: 'utf-8',
    maxBuffer: MAX_BUFFER,
    cwd: repoPath,
  });
}

/**
 * Parses a single commit entry from the raw log.
 */
function parseCommitEntry(entry) {
  const lines = entry.trim().split('\n');
  const [dateRaw, authorRaw, refsRaw, ...subjectParts] = lines[0].split('|||');
  const date = dateRaw.split(' ')[0]; // YYYY-MM-DD
  const time = dateRaw.split(' ')[1] || ''; // HH:MM:SS +ZZZZ
  const author = (authorRaw || 'Unknown').trim();
  const subject = subjectParts.join('|||').trim();

  const tags = [];
  if (refsRaw) {
    refsRaw.split(',').forEach(ref => {
      const trimmed = ref.trim();
      if (trimmed.startsWith('tag: ')) {
        tags.push(trimmed.slice(5).trim());
      }
    });
  }

  const files = [];
  const fileDeltas = new Map();
  const fileStatuses = new Map(); // normalizedPath -> 'A' | 'M' | 'D' | 'R'
  const trackedFiles = [];
  const ignoredFiles = new Set();
  const fileStats = {
    added: { txt: 0, bin: 0 },
    modified: { txt: 0, bin: 0 },
    deleted: { txt: 0, bin: 0 },
    renamed: { txt: 0, bin: 0 },
  };

  let insertions = 0;
  let deletions = 0;
  let binaryCount = 0;
  let textCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Parse --raw lines (start with ':')
    // Format: :100644 100644 hash1 hash2 A\tpath/to/file
    // Or rename: :100644 100644 hash1 hash2 R100\told/path\tnew/path
    if (line.startsWith(':')) {
      const tabParts = line.split('\t');
      const meta = tabParts[0].split(' ');
      const rawStatus = meta[meta.length - 1]; // e.g., 'A', 'M', 'D', 'R100'
      const statusChar = rawStatus[0]; // Normalize 'R100' -> 'R'
      const targetPath = tabParts[tabParts.length - 1];
      fileStatuses.set(targetPath, statusChar);
      continue;
    }

    // 2. Parse --numstat lines
    const parts = line.split('\t');
    if (parts.length === 3) {
      const [ins, del, file] = parts;
      const normalizedFile = normalizeGitPath(file);
      const status = fileStatuses.get(normalizedFile) || 'M';

      files.push(file);

      if (ins === '-' && del === '-') {
        fileDeltas.set(file, { ins: null, del: null, binary: true, status });
      } else {
        fileDeltas.set(file, {
          ins: parseInt(ins, 10),
          del: parseInt(del, 10),
          binary: false,
          status,
        });
      }

      if (isIgnoredFile(normalizedFile)) {
        ignoredFiles.add(file);
        continue;
      }

      trackedFiles.push(normalizedFile);

      const isBinary = ins === '-' && del === '-';
      const bucket = status === 'A'
        ? fileStats.added
        : status === 'D'
          ? fileStats.deleted
          : status === 'R'
            ? fileStats.renamed
            : fileStats.modified;

      if (isBinary) {
        binaryCount++;
        bucket.bin++;
      } else {
        const insNum = parseInt(ins, 10);
        const delNum = parseInt(del, 10);

        if (!isNaN(insNum) && !isNaN(delNum)) {
          insertions += insNum;
          deletions += delNum;
          textCount++;
          bucket.txt++;
        }
      }
    }
  }

  const hasOnlyIgnored = files.length > 0 && trackedFiles.length === 0;

  return {
    date,
    time,
    author,
    subject,
    files,
    fileDeltas,
    trackedFiles,
    ignoredFiles,
    insertions,
    deletions,
    binaryCount,
    textCount,
    fileStats,
    tags,
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

/**
 * Fetches the first and last commit dates (YYYY-MM-DD) across the entire repository,
 * ignoring any --since or --until filters.
 */
function fetchRepoDateBounds(repoPath) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--no-merges', '--date=short', '--pretty=format:%ad'],
      { encoding: 'utf-8', maxBuffer: MAX_BUFFER, cwd: repoPath }
    ).trim();

    if (!out) return null;
    const dates = out.split('\n');
    return {
      lastDate: dates[0].trim(),
      firstDate: dates[dates.length - 1].trim(),
    };
  } catch {
    return null;
  }
}

module.exports = {
  fetchRawGitLog,
  parseCommitEntry,
  parseRawLog,
  fetchRepoDateBounds
};
