const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { COMMIT_SEP, parseCommitEntry, parseRawLog, FIELD_SEP } = require('../git-client');

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
