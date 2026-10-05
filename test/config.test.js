'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadComponents } = require('../lib/config');

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
