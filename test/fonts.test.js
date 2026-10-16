'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GlobalFonts } = require('@napi-rs/canvas');
const { FONT_FAMILY, FONT_STACK } = require('../lib/fonts');

test('registers the bundled font under FONT_FAMILY, so rendering never depends on the host having a system font', () => {
  assert.ok(GlobalFonts.families.some((f) => f.family === FONT_FAMILY));
});

test('FONT_STACK falls back to a generic sans-serif if the bundled font is ever unavailable', () => {
  assert.ok(FONT_STACK.includes(FONT_FAMILY));
  assert.ok(FONT_STACK.includes('sans-serif'));
});
