'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadComponents, loadPages, loadPagesWithSkipped, validatePages } = require('../lib/config');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'siw-'));
}

function writeConfig(dir, obj) {
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify(obj));
}

test('returns empty array when components.json is missing', () => {
  assert.deepEqual(loadComponents(tmpDir()), []);
});

test('throws on malformed JSON', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'components.json'), '{not json');
  assert.throws(() => loadComponents(dir), /not valid JSON/);
});

test('throws when "components" is not an array', () => {
  const dir = tmpDir();
  writeConfig(dir, { components: 'nope' });
  assert.throws(() => loadComponents(dir), /must contain a "components" array/);
});

test('skips invalid entries but keeps valid ones', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [
      { id: 'bad', type: 'numeric', width: -10, height: 100, path: 'foo' },
      { id: 'good', type: 'numeric', width: 100, height: 100, path: 'foo.bar' },
    ],
  });
  const result = loadComponents(dir);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'good');
});

test('defaults unsupported format to png', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'g', type: 'numeric', width: 100, height: 100, path: 'foo.bar', format: 'bmp' }],
  });
  const result = loadComponents(dir);
  assert.equal(result[0].format, 'png');
});

test('accepts svg as a valid format', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'g', type: 'numeric', width: 100, height: 100, path: 'foo.bar', format: 'svg' }],
  });
  const result = loadComponents(dir);
  assert.equal(result[0].format, 'svg');
});

test('normalizes numeric defaults (unit, decimals, label)', () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'g', type: 'numeric', width: 100, height: 100, path: 'foo.bar' }] });
  const result = loadComponents(dir);
  assert.equal(result[0].decimals, 1);
  assert.equal(result[0].unit, '');
  assert.equal(result[0].label, '');
});

test('defaults windTrend windowMinutes to 30', () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'w', type: 'windTrend', width: 100, height: 100 }] });
  const result = loadComponents(dir);
  assert.equal(result[0].windowMinutes, 30);
});

test('accepts a valid "conversion" on a numeric component and keeps it on the normalized result', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [
      { id: 'sog', type: 'numeric', width: 100, height: 100, path: 'navigation.speedOverGround', conversion: 'mpsToKnots' },
    ],
  });
  const result = loadComponents(dir);
  assert.equal(result[0].conversion, 'mpsToKnots');
});

test('rejects a numeric component with an unknown "conversion"', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'sog', type: 'numeric', width: 100, height: 100, path: 'navigation.speedOverGround', conversion: 'bogus' }],
  });
  assert.deepEqual(loadComponents(dir), []);
});

test('normalizes a numeric component with no "conversion" to have none', () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'depth', type: 'numeric', width: 100, height: 100, path: 'foo.bar' }] });
  const result = loadComponents(dir);
  assert.equal(result[0].conversion, undefined);
});

for (const type of ['windSpeedTrend', 'windDirectionTrend', 'maneuverScore']) {
  test(`accepts "${type}" as a valid component type and defaults its windowMinutes to 30`, () => {
    const dir = tmpDir();
    writeConfig(dir, { components: [{ id: 'w', type, width: 100, height: 100 }] });
    const result = loadComponents(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0].windowMinutes, 30);
  });
}

test('rejects a numeric component with no path', () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'bad', type: 'numeric', width: 100, height: 100 }] });
  assert.deepEqual(loadComponents(dir), []);
});

test('rejects a component with width or height exceeding the maximum canvas size', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [
      { id: 'too-wide', type: 'numeric', width: 1e9, height: 100, path: 'foo.bar' },
      { id: 'too-tall', type: 'numeric', width: 100, height: 1e9, path: 'foo.bar' },
      { id: 'ok', type: 'numeric', width: 100, height: 100, path: 'foo.bar' },
    ],
  });
  const result = loadComponents(dir);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'ok');
});

test('rejects a component id containing characters the HTTP route would then reject', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [
      { id: 'bad id', type: 'numeric', width: 100, height: 100, path: 'foo.bar' },
      { id: 'ok-id_1.2', type: 'numeric', width: 100, height: 100, path: 'foo.bar' },
    ],
  });
  const result = loadComponents(dir);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'ok-id_1.2');
});

test('clamps numeric decimals to a safe range', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [
      { id: 'negative', type: 'numeric', width: 100, height: 100, path: 'foo.bar', decimals: -1 },
      { id: 'huge', type: 'numeric', width: 100, height: 100, path: 'foo.bar', decimals: 101 },
    ],
  });
  const result = loadComponents(dir);
  assert.equal(result.find((c) => c.id === 'negative').decimals, 0);
  assert.equal(result.find((c) => c.id === 'huge').decimals, 20);
});

test('loadPages wraps a flat "components" config as a single untitled page', () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'g', type: 'numeric', width: 100, height: 100, path: 'foo.bar' }] });
  const pages = loadPages(dir);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].title, '');
  assert.equal(pages[0].components.length, 1);
  assert.equal(pages[0].components[0].id, 'g');
});

test('loadPages reads a multi-page "pages" config, keeping each page\'s title and components separate', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    pages: [
      { title: 'Nav', components: [{ id: 'depth', type: 'numeric', width: 100, height: 100, path: 'foo.bar' }] },
      { title: 'Wind', components: [{ id: 'windtrend', type: 'windTrend', width: 100, height: 100 }] },
    ],
  });
  const pages = loadPages(dir);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].title, 'Nav');
  assert.deepEqual(pages[0].components.map((c) => c.id), ['depth']);
  assert.equal(pages[1].title, 'Wind');
  assert.deepEqual(pages[1].components.map((c) => c.id), ['windtrend']);
});

test('loadPages skips invalid components within a page without dropping the rest of that page', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    pages: [
      {
        title: 'Mixed',
        components: [
          { id: 'bad', type: 'numeric', width: -10, height: 100, path: 'foo' },
          { id: 'good', type: 'numeric', width: 100, height: 100, path: 'foo.bar' },
        ],
      },
    ],
  });
  const pages = loadPages(dir);
  assert.deepEqual(pages[0].components.map((c) => c.id), ['good']);
});

test('loadPages returns a single empty page when components.json is missing', () => {
  const pages = loadPages(tmpDir());
  assert.deepEqual(pages, [{ title: '', components: [] }]);
});

test('loadComponents flattens components across every page', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    pages: [
      { components: [{ id: 'depth', type: 'numeric', width: 100, height: 100, path: 'foo.bar' }] },
      { components: [{ id: 'windtrend', type: 'windTrend', width: 100, height: 100 }] },
    ],
  });
  assert.deepEqual(loadComponents(dir).map((c) => c.id), ['depth', 'windtrend']);
});

test('validatePages returns no errors for a valid multi-page config', () => {
  const pages = [
    { title: 'Nav', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }] },
    { title: 'Wind', components: [{ id: 'windtrend', type: 'windTrend', width: 300, height: 150 }] },
  ];
  assert.deepEqual(validatePages(pages), []);
});

test('validatePages returns no errors for an empty config (no pages, or a page with no components)', () => {
  assert.deepEqual(validatePages([]), []);
  assert.deepEqual(validatePages([{ title: 'Empty', components: [] }]), []);
});

test('validatePages reports the page and componentIndex of an invalid component', () => {
  const pages = [
    { title: 'Nav', components: [{ id: 'good', type: 'numeric', width: 100, height: 50, path: 'a.b' }] },
    { title: 'Bad', components: [{ id: 'bad', type: 'nope', width: 100, height: 50 }] },
  ];
  const errors = validatePages(pages);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].page, 1);
  assert.equal(errors[0].componentIndex, 0);
  assert.equal(errors[0].id, 'bad');
  assert.match(errors[0].message, /invalid "type"/);
});

test('validatePages reports a duplicate id used across two different pages', () => {
  const pages = [
    { title: 'A', components: [{ id: 'dup', type: 'numeric', width: 100, height: 50, path: 'a.b' }] },
    { title: 'B', components: [{ id: 'dup', type: 'numeric', width: 100, height: 50, path: 'c.d' }] },
  ];
  const errors = validatePages(pages);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].page, 1);
  assert.equal(errors[0].componentIndex, 0);
  assert.match(errors[0].message, /duplicate id/);
});

test('validatePages does not flag an id that only appears once', () => {
  const pages = [{ title: 'A', components: [{ id: 'solo', type: 'numeric', width: 100, height: 50, path: 'a.b' }] }];
  assert.deepEqual(validatePages(pages), []);
});

test('validatePages rejects a null page entry without throwing', () => {
  const errors = validatePages([null]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].page, 0);
  assert.equal(errors[0].componentIndex, null);
  assert.match(errors[0].message, /object/);
  assert.match(errors[0].message, /"components" array/);
});

test('validatePages rejects a string page entry without throwing', () => {
  const errors = validatePages(['x']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].page, 0);
  assert.equal(errors[0].componentIndex, null);
  assert.match(errors[0].message, /object/);
  assert.match(errors[0].message, /"components" array/);
});

test('validatePages rejects a page whose "components" is not an array, rather than silently coercing it to empty', () => {
  const errorsNull = validatePages([{ title: 'Bad', components: null }]);
  assert.equal(errorsNull.length, 1);
  assert.equal(errorsNull[0].page, 0);
  assert.equal(errorsNull[0].componentIndex, null);
  assert.match(errorsNull[0].message, /"components" must be an array/);

  const errorsString = validatePages([{ title: 'Bad', components: 'not an array' }]);
  assert.equal(errorsString.length, 1);
  assert.match(errorsString[0].message, /"components" must be an array/);
});

test('loadPagesWithSkipped exposes skipped invalid components per page while loadPages stays unchanged', () => {
  const dir = tmpDir();
  writeConfig(dir, {
    pages: [
      {
        title: 'Mixed',
        components: [
          { id: 'bad', type: 'nope', width: 100, height: 100 },
          { id: 'good', type: 'numeric', width: 100, height: 100, path: 'foo.bar' },
        ],
      },
    ],
  });
  const pages = loadPages(dir);
  assert.deepEqual(pages[0].components.map((c) => c.id), ['good']);

  const pagesWithSkipped = loadPagesWithSkipped(dir);
  assert.equal(pagesWithSkipped.length, 1);
  assert.deepEqual(pagesWithSkipped[0].components.map((c) => c.id), ['good']);
  assert.equal(pagesWithSkipped[0].skipped.length, 1);
  assert.equal(pagesWithSkipped[0].skipped[0].id, 'bad');
  assert.match(pagesWithSkipped[0].skipped[0].message, /invalid "type"/);
});
