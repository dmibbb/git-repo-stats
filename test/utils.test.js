const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    formatNumber,
    formatBytes,
    pluralize,
    escapePipe,
    escapeHtml,
    parseDate,
    diffDays,
    isIgnoredFile,
    getExtension,
    toMondayFirstIndex,
    renderBar,
    normalizeGitPath,
    formatGeneratedAt,
} = require('../utils');

describe('Formatting helpers', () => {
    test('formatNumber formats thousands with commas', () => {
        assert.equal(formatNumber(0), '0');
        assert.equal(formatNumber(999), '999');
        assert.equal(formatNumber(45200), '45,200');
        assert.equal(formatNumber(null), '0');
    });

    test('formatBytes formats B, KB, and MB', () => {
        assert.equal(formatBytes(512), '512 B');
        assert.equal(formatBytes(2048), '2.0 KB');
        assert.equal(formatBytes(1500000), '1.43 MB');
        assert.equal(formatBytes(1024 * 1024 * 2.5), '2.50 MB');
        assert.equal(formatBytes(-1), '0 B');
    });

    test('pluralize handles singular, plural, and custom plural', () => {
        assert.equal(pluralize(1, 'commit'), '1 commit');
        assert.equal(pluralize(0, 'commit'), '0 commits');
        assert.equal(pluralize(1500, 'line'), '1,500 lines');
        assert.equal(pluralize(2, 'entry', 'entries'), '2 entries');
    });

    test('escapePipe escapes unescaped pipes without double-escaping', () => {
        assert.equal(escapePipe('a | b'), 'a \\| b');
        assert.equal(escapePipe('a \\| b'), 'a \\| b');
        assert.equal(escapePipe('a | b \\| c'), 'a \\| b \\| c');
        assert.equal(escapePipe('a \\\\| b'), 'a \\\\\\| b');
    });

    test('escapeHtml escapes HTML special characters', () => {
        assert.equal(
            escapeHtml(`<script>alert("x" & 'y')</script>`),
            '&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;'
        );
    });

    test('escapeHtml escapes null and undefined', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    test('renderBar renders ASCII bars proportionally', () => {
        assert.equal(renderBar(0, 10, 5), '░░░░░');
        assert.equal(renderBar(5, 10, 10), '█████░░░░░');
        assert.equal(renderBar(10, 10, 5), '█████');
        assert.equal(renderBar(0, 0, 4), '░░░░');
        assert.equal(renderBar(10, 5, 4), '████');
    });
});

describe('Date & Calendar helpers', () => {
    test('parseDate creates UTC midnight Date', () => {
        const d = parseDate('2026-11-20');
        assert.equal(d.getUTCFullYear(), 2026);
        assert.equal(d.getUTCMonth(), 10);
        assert.equal(d.getUTCDate(), 20);
        assert.equal(d.getUTCHours(), 0);
    });

    test('diffDays calculates exact day differences', () => {
        const d1 = parseDate('2026-11-16');
        const d2 = parseDate('2026-11-20');
        assert.equal(diffDays(d1, d2), 4);
        assert.equal(diffDays(d2, d1), -4);
        assert.equal(diffDays(d1, d1), 0);
    });

    test('parseDate Invalid inputs', () => {
        assert.equal(parseDate('2026-13-01').getUTCFullYear(), 2027);
        assert.ok(isNaN(parseDate('2026-11').getTime()));
    });

    test('toMondayFirstIndex converts JS Sunday-first day to Monday-first', () => {
        assert.equal(toMondayFirstIndex(1), 0); // Mon -> 0
        assert.equal(toMondayFirstIndex(3), 2); // Wed -> 2
        assert.equal(toMondayFirstIndex(0), 6); // Sun -> 6
    });

    test('formatGeneratedAt formats date with UTC offset', () => {
        const sample = new Date('2026-11-20T12:30:45Z');
        const formatted = formatGeneratedAt(sample);
        assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d+(?::\d{2})?\)$/);
    });
});

describe('File path & Extension helpers', () => {
    test('isIgnoredFile detects lockfiles, build dirs, and minified assets', () => {
        assert.equal(isIgnoredFile('package-lock.json'), true);
        assert.equal(isIgnoredFile('packages/ui/package-lock.json'), true);
        assert.equal(isIgnoredFile('yarn.lock'), true);
        assert.equal(isIgnoredFile('apps/web/pnpm-lock.yaml'), true);
        assert.equal(isIgnoredFile('dist/bundle.js'), true);
        assert.equal(isIgnoredFile('app.min.js'), true);
        assert.equal(isIgnoredFile('src/build/app.css'), true);
        assert.equal(isIgnoredFile('vendor/jquery.min.js'), true);
        assert.equal(isIgnoredFile('styles/main.min.css'), true);

        assert.equal(isIgnoredFile('src/utils.js'), false);
        assert.equal(isIgnoredFile('package.json'), false);
    });

    test('getExtension extracts lowercase extensions and handles dotfiles/no-ext', () => {
        assert.equal(getExtension('index.JS'), 'js');
        assert.equal(getExtension('src/styles/app.module.css'), 'css');
        assert.equal(getExtension('C:\\Projects\\my.app\\stats.js'), 'js');
        assert.equal(getExtension('C:\\Projects\\my.app\\Makefile'), 'no-ext');
        assert.equal(getExtension('Makefile'), 'no-ext');
        assert.equal(getExtension('.gitignore'), 'no-ext');
        assert.equal(getExtension('.env.local'), 'local');
        assert.equal(getExtension('file.test.js'), 'js');
        assert.equal(getExtension('file.'), 'no-ext');
    });

    test('normalizeGitPath handles simple, braced, and empty-segment renames', () => {
        assert.equal(normalizeGitPath('src/index.js'), 'src/index.js');
        assert.equal(normalizeGitPath('old.js => new.js'), 'new.js');
        assert.equal(normalizeGitPath('src/{old => new}.js'), 'src/new.js');
        assert.equal(normalizeGitPath('{src => lib}/utils.js'), 'lib/utils.js');
        assert.equal(normalizeGitPath('src/{ => legacy}/old.js'), 'src/legacy/old.js');
        assert.equal(normalizeGitPath('src/{legacy => }/old.js'), 'src/old.js');
        assert.equal(normalizeGitPath('{legacy => }/old.js'), 'old.js');
        assert.equal(normalizeGitPath('my => notes.txt'), 'my => notes.txt');
        assert.equal(normalizeGitPath('a => b => c'), 'c');
    });
});
