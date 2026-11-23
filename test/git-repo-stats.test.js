const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, getGenerationMode, resolveOutputDir, validateRepoPath, collectStatistics, main } = require('../git-repo-stats');
const { execFileSync } = require('node:child_process');
const { makeCommit } = require('./stats.test');

describe('parseArgs', () => {
    test('returns default options when argv is empty', () => {
        assert.deepEqual(parseArgs([]), {
            since: null,
            until: null,
            html: false,
            md: false,
            changelog: false,
            out: null,
            help: false,
            open: false,
            repoPath: null,
        });
    });

    test('parses --flag=value and --flag value formats', () => {
        const args1 = parseArgs(['--since=2026-01-01', '--until=2026-11-20', '--out=reports', '--md', '--open', './my-repo']);
        assert.equal(args1.since, '2026-01-01');
        assert.equal(args1.until, '2026-11-20');
        assert.equal(args1.out, 'reports');
        assert.equal(args1.md, true);
        assert.equal(args1.html, false);
        assert.equal(args1.open, true);
        assert.equal(args1.repoPath, './my-repo');

        const args2 = parseArgs(['--since', '2026-02-01', '--out', 'dist-stats', '-h']);
        assert.equal(args2.since, '2026-02-01');
        assert.equal(args2.out, 'dist-stats');
        assert.equal(args2.help, true);
    });

    test('rejects invalid calendar dates like Feb 30 or malformed strings', () => {
        const originalWarn = console.warn;
        console.warn = () => { };
        try {
            const args = parseArgs(['--since=2026-02-30', '--until=2026-13-01']);
            assert.equal(args.since, null);
            assert.equal(args.until, null);
        } finally {
            console.warn = originalWarn;
        }
    });

    test('warns when --since is later than --until', () => {
        const originalWarn = console.warn;
        const warnings = [];
        console.warn = (msg) => warnings.push(msg);

        try {
            parseArgs(['--since=2026-12-31', '--until=2026-01-01']);
        } finally {
            console.warn = originalWarn;
        }

        assert.ok(warnings.some(w => w.includes('--since') && w.includes('later than --until')));
    });

    test('warns on missing values and unknown flags', () => {
        const originalWarn = console.warn;
        const warnings = [];
        console.warn = (msg) => warnings.push(msg);
        try {
            const args = parseArgs([
                '--since',           // no value
                '--out',             // no value
                '--bogus',           // unknown long
                '-z',                // unknown short
                'repo1',
                'repo2',             // extra positional
            ]);
            assert.equal(args.since, null);
            assert.equal(args.out, null);
            assert.equal(args.repoPath, 'repo1');
            assert.ok(warnings.some(w => w.includes('no value provided')));
            assert.ok(warnings.some(w => w.includes('Unknown flag: --bogus')));
            assert.ok(warnings.some(w => w.includes('Unknown short flag: -z')));
            assert.ok(warnings.some(w => w.includes('extra positional')));
        } finally {
            console.warn = originalWarn;
        }
    });

    test('supports --flag value where value is a valid date', () => {
        const args = parseArgs(['--since', '2026-01-01']);
        assert.equal(args.since, '2026-01-01');
    });

    test('does not consume next arg if it starts with "-"', () => {
        const originalWarn = console.warn;
        console.warn = () => { };
        try {
            const args = parseArgs(['--out', '--md']);
            assert.equal(args.out, null);
            assert.equal(args.md, true);
        } finally {
            console.warn = originalWarn;
        }
    });

    test('warns on --html=false', () => {
        const originalWarn = console.warn;
        const warnings = [];
        console.warn = (msg) => warnings.push(msg);
        try {
            parseArgs(['--html=false']);
            assert.ok(warnings.some(w => w.includes('--html=false')));
        } finally {
            console.warn = originalWarn;
        }
    });
});

describe('getGenerationMode', () => {
    test('defaults to HTML only when no format flags are passed', () => {
        assert.deepEqual(getGenerationMode({ html: false, md: false, changelog: false }), { html: true, md: false, changelog: false });
    });

    test('respects explicit --md, --html, --changelog, and combined flags', () => {
        assert.deepEqual(getGenerationMode({ html: false, md: true, changelog: false }), { html: false, md: true, changelog: false });
        assert.deepEqual(getGenerationMode({ html: false, md: false, changelog: true }), { html: false, md: false, changelog: true });
        assert.deepEqual(getGenerationMode({ html: true, md: true, changelog: true }), { html: true, md: true, changelog: true });
    });
});

describe('resolveOutputDir', () => {
    test('resolves repoPath, relative --out, and absolute --out paths', () => {
        const repoPath = path.resolve('/projects/demo');
        assert.equal(resolveOutputDir(null, repoPath), repoPath);
        assert.equal(resolveOutputDir('reports', repoPath), path.resolve(process.cwd(), 'reports'));

        const absOut = path.resolve('/tmp/custom-out');
        assert.equal(resolveOutputDir(absOut, repoPath), absOut);
    });
});

describe('validateRepoPath', () => {
    test('returns null and sets exitCode = 1 for non-existent or non-git directories', () => {
        const originalError = console.error;
        console.error = () => { };
        const prevExitCode = process.exitCode;
        process.exitCode = undefined;

        try {
            const missing = validateRepoPath(path.join(os.tmpdir(), 'non-existent-repo-' + Date.now()));
            assert.equal(missing, null);
            assert.equal(process.exitCode, 1);

            process.exitCode = undefined;
            const notGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
            try {
                const notGit = validateRepoPath(notGitDir);
                assert.equal(notGit, null);
                assert.equal(process.exitCode, 1);
            } finally {
                fs.rmSync(notGitDir, { recursive: true, force: true });
            }
        } finally {
            console.error = originalError;
            process.exitCode = prevExitCode;
        }
    });
});


describe('main() end-to-end integration', () => {
    test('generates both HTML and Markdown reports for a real git repository', () => {
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-repo-'));
        const outDir = path.join(tmpRepo, 'reports');
        const git = (args) =>
            execFileSync('git', args, {
                cwd: tmpRepo,
                stdio: 'pipe',
                env: {
                    ...process.env,
                    GIT_AUTHOR_NAME: 'Dmibbb',
                    GIT_AUTHOR_EMAIL: 'dmibbb@example.com',
                    GIT_COMMITTER_NAME: 'Dmibbb',
                    GIT_COMMITTER_EMAIL: 'dmibbb@example.com',
                },
            });

        const origArgv = process.argv;
        const origLog = console.log;
        const origWrite = process.stdout.write;
        console.log = () => { };
        process.stdout.write = () => true;

        try {
            git(['init']);
            fs.writeFileSync(path.join(tmpRepo, 'index.js'), 'console.log("hello");\n');
            git(['add', '.']);
            git(['commit', '-m', 'feat: initial commit']);
            git(['tag', 'v1.0.0']);

            process.argv = ['node', 'git-repo-stats.js', tmpRepo, '--html', '--md', `--out=${outDir}`];
            main();

            const htmlPath = path.join(outDir, 'repo-stats.html');
            const mdPath = path.join(outDir, 'repo-stats.md');
            assert.ok(fs.existsSync(htmlPath), 'repo-stats.html should be generated');
            assert.ok(fs.existsSync(mdPath), 'repo-stats.md should be generated');

            const html = fs.readFileSync(htmlPath, 'utf-8');
            const md = fs.readFileSync(mdPath, 'utf-8');
            assert.ok(html.includes('feat: initial commit'));
            assert.ok(md.includes('feat: initial commit'));
            assert.ok(md.includes('v1.0.0'));
        } finally {
            process.argv = origArgv;
            console.log = origLog;
            process.stdout.write = origWrite;
            fs.rmSync(tmpRepo, { recursive: true, force: true });
        }
    });
});

describe('collectStatistics', () => {
    test('skips git bounds lookup when no date filters are active', () => {
        const commits = [makeCommit({ date: '2026-11-20' })];
        // Passing a non-existent repoPath proves fetchRepoDateBounds is not invoked without filters
        const result = collectStatistics(commits, '/non-existent-path-for-test', {});
        assert.equal(result.stats.trueFirstDate, '2026-11-20');
        assert.equal(result.stats.trueLastDate, '2026-11-20');
    });
})
