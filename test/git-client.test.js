const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
    COMMIT_SEP,
    FIELD_SEP,
    fetchRawGitLog,
    parseCommitEntry,
    parseRawLog,
    fetchRepoDateBounds
} = require('../git-client');

describe('parseCommitEntry', () => {
    test('parses standard commit with metadata, tags, and text file changes', () => {
        const entry = [
            `2026-11-20 14:35:10 +0300${FIELD_SEP}dmibbb${FIELD_SEP}HEAD -> main, tag: v1.0.0, tag: release-1${FIELD_SEP}feat: add dashboard ||| with pipes`,
            ':100644 100644 abc1111 def2222 A\tsrc/index.js',
            ':100644 100644 abc3333 def4444 M\tREADME.md',
            '42\t0\tsrc/index.js',
            '10\t3\tREADME.md',
        ].join('\n');

        const commit = parseCommitEntry(entry);

        assert.equal(commit.date, '2026-11-20');
        assert.equal(commit.time, '14:35:10');
        assert.equal(commit.author, 'dmibbb');
        assert.equal(commit.subject, 'feat: add dashboard ||| with pipes');
        assert.deepEqual(commit.tags, ['v1.0.0', 'release-1']);

        assert.equal(commit.insertions, 52);
        assert.equal(commit.deletions, 3);
        assert.equal(commit.textCount, 2);
        assert.equal(commit.binaryCount, 0);
        assert.equal(commit.hasOnlyIgnored, false);

        assert.deepEqual(commit.trackedFiles, ['src/index.js', 'README.md']);
        assert.deepEqual(commit.fileStats.added, { txt: 1, bin: 0 });
        assert.deepEqual(commit.fileStats.modified, { txt: 1, bin: 0 });
        assert.deepEqual(commit.fileDeltas.get('src/index.js'), {
            ins: 42,
            del: 0,
            binary: false,
            status: 'A',
        });
    });

    test('handles renames (R100), copies (C100), deletions (D), and binary files', () => {
        const entry = [
            `2026-11-19 09:00:00 +0000${FIELD_SEP}Alice${FIELD_SEP}${FIELD_SEP}refactor: reorganize assets`,
            ':100644 100644 111 222 R100\tsrc/{old.js => new.js}',
            ':100644 100644 333 444 C100\tsrc/template.js\tsrc/copy.js',
            ':100644 000000 555 000 D\tsrc/obsolete.js',
            ':000000 100644 000 666 A\tassets/logo.png',
            '5\t2\tsrc/{old.js => new.js}',
            '20\t0\tsrc/copy.js',
            '0\t15\tsrc/obsolete.js',
            '-\t-\tassets/logo.png',
        ].join('\n');

        const commit = parseCommitEntry(entry);

        assert.equal(commit.author, 'Alice');
        assert.equal(commit.subject, 'refactor: reorganize assets');

        assert.equal(commit.insertions, 25);
        assert.equal(commit.deletions, 17);
        assert.equal(commit.textCount, 3);
        assert.equal(commit.binaryCount, 1);

        assert.deepEqual(commit.fileStats.renamed, { txt: 1, bin: 0 });
        assert.deepEqual(commit.fileStats.added, { txt: 1, bin: 1 });
        assert.deepEqual(commit.fileStats.deleted, { txt: 1, bin: 0 });
        assert.deepEqual(commit.fileDeltas.get('assets/logo.png'), {
            ins: null,
            del: null,
            binary: true,
            status: 'A',
        });
    });

    test('normalizes rename paths with braces in --raw and --numstat', () => {
        const entry = [
            `2026-11-20 10:00:00 +0000${FIELD_SEP}Dev${FIELD_SEP}${FIELD_SEP}refactor: move file`,
            ':100644 100644 abc def R100\tsrc/{old => new}/file.js',
            '3\t1\tsrc/{old => new}/file.js',
        ].join('\n');

        const commit = parseCommitEntry(entry);

        assert.equal(commit.fileStats.renamed.txt, 1);
        assert.equal(commit.fileStats.modified.txt, 0);

        const delta = commit.fileDeltas.get('src/{old => new}/file.js');
        assert.equal(delta.status, 'R');
    });

    test('handles real --raw rename format (two tabs)', () => {
        const entry = [
            `2026-11-20 10:00:00 +0000${FIELD_SEP}Dev${FIELD_SEP}${FIELD_SEP}refactor: move`,
            ':100644 100644 abc def R100\tsrc/old/file.js\tsrc/new/file.js',
            '3\t1\tsrc/{old => new}/file.js',
        ].join('\n');

        const commit = parseCommitEntry(entry);
        assert.equal(commit.fileStats.renamed.txt, 1);
        const delta = commit.fileDeltas.get('src/{old => new}/file.js');
        assert.equal(delta.status, 'R');
    });

    test('separates ignored files and sets hasOnlyIgnored when no tracked files remain', () => {
        const entry = [
            `2026-11-18 18:10:00 +0300${FIELD_SEP}Bob${FIELD_SEP}${FIELD_SEP}chore: update lockfile`,
            ':100644 100644 111 222 M\tpackage-lock.json',
            ':100644 100644 333 444 M\tdist/bundle.min.js',
            '500\t300\tpackage-lock.json',
            '120\t90\tdist/bundle.min.js',
        ].join('\n');

        const commit = parseCommitEntry(entry);

        assert.equal(commit.insertions, 0);
        assert.equal(commit.deletions, 0);
        assert.equal(commit.textCount, 0);
        assert.equal(commit.trackedFiles.length, 0);
        assert.equal(commit.ignoredFiles.size, 2);
        assert.equal(commit.hasOnlyIgnored, true);
    });

    test('handles empty commits (--allow-empty) and missing author gracefully', () => {
        const entry = `2026-11-17 12:00:00 +0000${FIELD_SEP}${FIELD_SEP}${FIELD_SEP}chore: trigger CI`;
        const commit = parseCommitEntry(entry);

        assert.equal(commit.author, 'Unknown');
        assert.equal(commit.subject, 'chore: trigger CI');
        assert.equal(commit.files.length, 0);
        assert.equal(commit.hasOnlyIgnored, false);
    });

    test('returns null on blank input', () => {
        assert.equal(parseCommitEntry('   \r\n  '), null);
        assert.equal(parseCommitEntry(''), null);
    });

    test('preserves very long commit subjects (>1000 chars)', () => {
        const longSubject = 'feat: ' + 'a'.repeat(1200);
        const entry = [
            `2026-11-20 14:35:10 +0300${FIELD_SEP}dmibbb${FIELD_SEP}${FIELD_SEP}${longSubject}`,
            ':100644 100644 abc1111 def2222 M\tsrc/index.js',
            '1\t1\tsrc/index.js',
        ].join('\n');

        const commit = parseCommitEntry(entry);
        assert.equal(commit.subject.length, 1206);
        assert.equal(commit.subject, longSubject);
    });

    test('handles emojis, Cyrillic, and UTF-8 surrogate pairs in subject and author', () => {
        const author = 'Димасик 👨‍💻 𝔘𝔫𝔦𝔠𝔬𝔡𝔢';
        const subject = 'feat(ui): 🚀 добавил поддержку 👨‍👩‍👧‍👦 и 𝌆 символов';
        const entry = [
            `2026-11-20 14:35:10 +0300${FIELD_SEP}${author}${FIELD_SEP}tag: v1.0.0-🎉${FIELD_SEP}${subject}`,
            ':100644 100644 abc1111 def2222 A\tsrc/папка/файл-🚀.js',
            '5\t0\tsrc/папка/файл-🚀.js',
        ].join('\n');

        const commit = parseCommitEntry(entry);
        assert.equal(commit.author, author);
        assert.equal(commit.subject, subject);
        assert.deepEqual(commit.tags, ['v1.0.0-🎉']);
        assert.deepEqual(commit.trackedFiles, ['src/папка/файл-🚀.js']);
    });

    test('preserves git tags containing commas without spaces', () => {
        const entry = [
            `2026-11-20 14:35:10 +0300${FIELD_SEP}dmibbb${FIELD_SEP}HEAD -> main, tag: v1.0,rc1, tag: v1.0.0${FIELD_SEP}chore: tag test`,
            ':100644 100644 abc1111 def2222 M\tsrc/index.js',
            '1\t1\tsrc/index.js',
        ].join('\n');

        const commit = parseCommitEntry(entry);
        assert.deepEqual(commit.tags, ['v1.0,rc1', 'v1.0.0']);
    });
});

describe('parseRawLog', () => {
    test('splits multiple commits and ignores leading/trailing whitespace and CRLF', () => {
        const raw = [
            '\r\n',
            `${COMMIT_SEP}2026-11-20 10:00:00 +0300${FIELD_SEP}Dev1${FIELD_SEP}${FIELD_SEP}second commit\r\n`,
            ':100644 100644 111 222 M\tapp.js\r\n',
            '3\t1\tapp.js\r\n',
            `${COMMIT_SEP}2026-11-19 10:00:00 +0300${FIELD_SEP}Dev2${FIELD_SEP}${FIELD_SEP}first commit\r\n`,
            ':000000 100644 000 111 A\tapp.js\r\n',
            '10\t0\tapp.js\r\n',
        ].join('');

        const commits = parseRawLog(raw);

        assert.equal(commits.length, 2);
        assert.equal(commits[0].subject, 'second commit');
        assert.equal(commits[1].subject, 'first commit');
    });

    test('returns empty array for empty log', () => {
        assert.deepEqual(parseRawLog(''), []);
        assert.deepEqual(parseRawLog('   \n  '), []);
    });
});

describe('fetchRepoDateBounds', () => {
    test('returns chronological firstDate and lastDate even when commit timestamps are out of order', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-bounds-'));
        const git = (args, envExtra = {}) =>
            execFileSync('git', args, {
                cwd: tmpDir,
                stdio: 'pipe',
                env: {
                    ...process.env,
                    GIT_AUTHOR_NAME: 'Test',
                    GIT_AUTHOR_EMAIL: 'test@example.com',
                    GIT_COMMITTER_NAME: 'Test',
                    GIT_COMMITTER_EMAIL: 'test@example.com',
                    ...envExtra,
                },
            });

        try {
            git(['init']);
            fs.writeFileSync(path.join(tmpDir, 'a.txt'), '1');
            git(['add', '.']);
            git(['commit', '-m', 'newer date first'], {
                GIT_AUTHOR_DATE: '2026-11-20T12:00:00Z',
                GIT_COMMITTER_DATE: '2026-11-20T12:00:00Z',
            });

            fs.writeFileSync(path.join(tmpDir, 'a.txt'), '2');
            git(['add', '.']);
            git(['commit', '-m', 'older date second'], {
                GIT_AUTHOR_DATE: '2026-01-15T12:00:00Z',
                GIT_COMMITTER_DATE: '2026-01-15T12:00:00Z',
            });

            const bounds = fetchRepoDateBounds(tmpDir);
            assert.deepEqual(bounds, {
                firstDate: '2026-01-15',
                lastDate: '2026-11-20',
            });
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('returns null for a non-git directory or empty repository', () => {
        const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-empty-'));
        try {
            assert.equal(fetchRepoDateBounds(emptyDir), null);
            execFileSync('git', ['init'], { cwd: emptyDir, stdio: 'pipe' });
            assert.equal(fetchRepoDateBounds(emptyDir), null);
        } finally {
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });
});

describe('fetchRawGitLog', () => {
    test('excludes merge commits (--no-merges) and preserves UTF-8 paths and emojis', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-merges-'));
        const git = (args) =>
            execFileSync('git', args, {
                cwd: tmpDir,
                stdio: 'pipe',
                env: {
                    ...process.env,
                    GIT_AUTHOR_NAME: 'Димасик 🚀',
                    GIT_AUTHOR_EMAIL: 'test@example.com',
                    GIT_COMMITTER_NAME: 'Димасик 🚀',
                    GIT_COMMITTER_EMAIL: 'test@example.com',
                },
            });

        try {
            git(['init', '-b', 'main']);
            fs.writeFileSync(path.join(tmpDir, 'base.js'), 'const a = 1;\n');
            git(['add', '.']);
            git(['commit', '-m', 'feat: base commit']);

            git(['checkout', '-b', 'feature']);
            fs.writeFileSync(path.join(tmpDir, 'фича-🔥.js'), 'const b = 2;\n');
            git(['add', '.']);
            git(['commit', '-m', 'feat: feature commit 👨‍👩‍👧‍👦']);

            git(['checkout', 'main']);
            git(['merge', '--no-ff', 'feature', '-m', "Merge branch 'feature'"]);

            const raw = fetchRawGitLog(tmpDir);
            const commits = parseRawLog(raw);
            const featureCommit = commits.find(c => c.subject.startsWith('feat: feature commit'));

            assert.equal(commits.length, 2);
            assert.ok(!commits.some(c => c.subject.startsWith('Merge branch')));
            assert.ok(featureCommit, 'feature commit should be present');
            assert.equal(featureCommit.subject, 'feat: feature commit 👨‍👩‍👧‍👦');
            assert.equal(featureCommit.author, 'Димасик 🚀');
            assert.deepEqual(featureCommit.trackedFiles, ['фича-🔥.js']);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('returns empty string for an initialized repository with no commits yet', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-unborn-'));
        try {
            execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'pipe' });
            assert.equal(fetchRawGitLog(tmpDir), '');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
