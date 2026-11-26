const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { getLanguageIcon, EXT_ALIASES, LANG_SVGS } = require('../lang-icons');

describe('getLanguageIcon', () => {
  const defaultIcon = LANG_SVGS.default;

  test('returns valid, unique SVG icons for all direct language keys', () => {
    const directKeys = Object.keys(LANG_SVGS).filter((k) => k !== 'default');
    const seen = new Map();

    for (const ext of directKeys) {
      const icon = getLanguageIcon(ext);
      assert.match(icon, /^<svg[^>]*aria-hidden="true"/);
      assert.match(icon, /<\/svg>$/);
      assert.ok(!icon.includes('undefined'));
      assert.ok(!icon.includes('[object'));
      assert.ok(!icon.includes('NaN'));
      assert.notEqual(icon, defaultIcon);
      assert.ok(!seen.has(icon), `icon for "${ext}" duplicates "${seen.get(icon)}"`);
      seen.set(icon, ext);
    }
  });

  test('resolves all configured aliases to their canonical language icons', () => {
    for (const [alias, canonical] of Object.entries(EXT_ALIASES)) {
      assert.notEqual(alias, canonical, `alias "${alias}" must not map to itself`);
      assert.ok(
        Object.hasOwn(LANG_SVGS, canonical),
        `alias "${alias}" points to missing icon "${canonical}"`,
      );
      assert.equal(
        getLanguageIcon(alias),
        getLanguageIcon(canonical),
        `alias "${alias}" should resolve to "${canonical}"`,
      );
    }
  });

  test('no alias-alias points', () => {
    for (const [alias, canonical] of Object.entries(EXT_ALIASES)) {
      assert.ok(
        !Object.hasOwn(EXT_ALIASES, canonical),
        `alias "${alias}" points to another alias "${canonical}" — resolve chain manually`,
      );
    }
  });

  test('normalizes case and leading dots including combined inputs', () => {
    assert.equal(getLanguageIcon('JS'), getLanguageIcon('js'));
    assert.equal(getLanguageIcon('.tsx'), getLanguageIcon('ts'));
    assert.equal(getLanguageIcon('.JSX'), getLanguageIcon('js'));
  });

  test('falls back safely to default icon on unknown, empty, or prototype keys', () => {
    assert.match(defaultIcon, /^<svg[^>]*aria-hidden="true"/);
    assert.match(defaultIcon, /<\/svg>$/);
    assert.equal(getLanguageIcon('no-ext'), defaultIcon);
    assert.equal(getLanguageIcon('unknown_ext'), defaultIcon);
    assert.equal(getLanguageIcon(''), defaultIcon);
    assert.equal(getLanguageIcon(null), defaultIcon);
    assert.equal(getLanguageIcon(undefined), defaultIcon);
    assert.equal(getLanguageIcon(123), defaultIcon);
    assert.equal(getLanguageIcon('constructor'), defaultIcon);
    assert.equal(getLanguageIcon('toString'), defaultIcon);
  });
});
