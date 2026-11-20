/**
 * Extension aliases to normalize related file types to a canonical icon key.
 */
const EXT_ALIASES = {
    mjs: 'js',
    cjs: 'js',
    jsx: 'js',
    tsx: 'ts',
    mts: 'ts',
    cts: 'ts',
    htm: 'html',
    scss: 'css',
    sass: 'css',
    less: 'css',
    yml: 'yaml',
    markdown: 'md',
    mdx: 'md',
    kt: 'kotlin',
    kts: 'kotlin',
    shell: 'sh',
    bash: 'sh',
    zsh: 'sh',
    fish: 'sh',
    ps1: 'sh',
    bat: 'sh',
    cmd: 'sh',
    svg: 'xml',
    xaml: 'xml',
    plist: 'xml',
    csproj: 'xml',
    jsonl: 'json',
    jsonc: 'json',
    h: 'c',
    hpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
};

/**
 * Compact inline SVG icons (16x16 viewBox, rendered at 14x14) for common languages.
 */
const LANG_SVGS = {
    js: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#f1e05a"/><text x="8" y="12" text-anchor="middle" font-size="8.5" font-weight="800" font-family="sans-serif" fill="#1f2328">JS</text></svg>`,
    ts: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#3178c6"/><text x="8" y="12" text-anchor="middle" font-size="8.5" font-weight="800" font-family="sans-serif" fill="#ffffff">TS</text></svg>`,
    html: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1.5h12l-1.1 11.4L8 14.5l-4.9-1.6L2 1.5z" fill="#e34c26"/><path d="M8 2.8v10.3l3.8-1.2.8-9.1H8z" fill="#f06529"/></svg>`,
    css: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1.5h12l-1.1 11.4L8 14.5l-4.9-1.6L2 1.5z" fill="#264de4"/><path d="M8 2.8v10.3l3.8-1.2.8-9.1H8z" fill="#2965f1"/></svg>`,
    json: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#cbcb41"/><text x="8" y="11.5" text-anchor="middle" font-size="8.5" font-weight="800" font-family="monospace" fill="#1f2328">{}</text></svg>`,
    xml: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#0060ac"/><text x="8" y="11.5" text-anchor="middle" font-size="8" font-weight="800" font-family="monospace" fill="#ffffff">&lt;/&gt;</text></svg>`,
    md: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="0.5" y="2.5" width="15" height="11" rx="2" fill="none" stroke="#519aba" stroke-width="1.4"/><path d="M3 10.5v-5l2 2.5 2-2.5v5M11.5 5.5v3.5M10 8l1.5 2 1.5-2" fill="none" stroke="#519aba" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    py: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.9 1.5C5.5 1.5 5.7 2.6 5.7 2.6v1.2h2.3v.4H4.7S3 4 3 6.5s1.5 2.4 1.5 2.4h.9V7.7s-.1-1.5 1.5-1.5h2.4s1.4 0 1.4-1.3V2.8s.2-1.3-2.8-1.3z" fill="#3776ab"/><path d="M8.1 14.5c2.4 0 2.2-1.1 2.2-1.1v-1.2H8v-.4h3.3s1.7.2 1.7-2.3-1.5-2.4-1.5-2.4h-.9v1.2s.1 1.5-1.5 1.5H6.7s-1.4 0-1.4 1.3v2.1s-.2 1.3 2.8 1.3z" fill="#ffd343"/></svg>`,
    go: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#00add8"/><text x="8" y="11.5" text-anchor="middle" font-size="8" font-weight="800" font-family="sans-serif" fill="#ffffff">GO</text></svg>`,
    rs: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#dea584"/><text x="8" y="11.5" text-anchor="middle" font-size="8" font-weight="800" font-family="sans-serif" fill="#1f2328">RS</text></svg>`,
    vue: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2.5h2.6L8 9.2l3.9-6.7h2.6L8 13.8 1.5 2.5z" fill="#41b883"/><path d="M4.1 2.5h2.3L8 5.3l1.6-2.8h2.3L8 9.2 4.1 2.5z" fill="#35495e"/></svg>`,
    yaml: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#cb171e"/><text x="8" y="11.5" text-anchor="middle" font-size="7.5" font-weight="800" font-family="sans-serif" fill="#ffffff">YML</text></svg>`,
    sh: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#4eaa25"/><text x="8" y="11.5" text-anchor="middle" font-size="8.5" font-weight="800" font-family="monospace" fill="#ffffff">&gt;_</text></svg>`,
    sql: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="4" rx="5.5" ry="2" fill="#e38c00"/><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" fill="none" stroke="#e38c00" stroke-width="1.4"/></svg>`,
    java: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#b07219"/><text x="8" y="11.5" text-anchor="middle" font-size="8.5" font-weight="800" font-family="sans-serif" fill="#ffffff">JV</text></svg>`,
    kotlin: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12L8 8l6 6H2V2z" fill="#7f52ff"/></svg>`,
    cs: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#68217a"/><text x="8" y="11.5" text-anchor="middle" font-size="8.5" font-weight="800" font-family="sans-serif" fill="#ffffff">C#</text></svg>`,
    c: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#555555"/><text x="8" y="11.8" text-anchor="middle" font-size="9" font-weight="800" font-family="sans-serif" fill="#ffffff">C</text></svg>`,
    cpp: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#f34b7d"/><text x="8" y="11.5" text-anchor="middle" font-size="7.5" font-weight="800" font-family="sans-serif" fill="#ffffff">C++</text></svg>`,
    php: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#4f5d95"/><text x="8" y="11.5" text-anchor="middle" font-size="7.2" font-weight="800" font-family="sans-serif" fill="#ffffff">PHP</text></svg>`,
    rb: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5h7l3 3.5L8 14 1.5 6l3-3.5z" fill="#cc342d"/></svg>`,
    default: `<svg class="lang-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9v-13z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.5 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
};

/**
 * Returns an inline SVG icon string for the given file extension.
 */
function getLanguageIcon(ext) {
    if (typeof ext !== 'string' || !ext) return LANG_SVGS.default;
    const normalized = ext.toLowerCase().replace(/^\./, '');
    const key = Object.hasOwn(EXT_ALIASES, normalized) ? EXT_ALIASES[normalized] : normalized;
    return Object.hasOwn(LANG_SVGS, key) ? LANG_SVGS[key] : LANG_SVGS.default;
}

module.exports = {
    getLanguageIcon,
    EXT_ALIASES,
    LANG_SVGS,
};
