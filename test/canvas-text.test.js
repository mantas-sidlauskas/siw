'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { fitFontSize } = require('../lib/canvas-text');

function font(size) {
  return `bold ${size}px sans-serif`;
}

test('fitFontSize shrinks until the text fits within maxWidth', () => {
  const ctx = createCanvas(10, 10).getContext('2d');
  const size = fitFontSize(ctx, '12.3 kt', 100, 300, font);
  ctx.font = font(size);
  assert.ok(ctx.measureText('12.3 kt').width <= 100);
  assert.ok(size < 300);
});

test('fitFontSize keeps the initial size when the text already fits', () => {
  const ctx = createCanvas(10, 10).getContext('2d');
  const size = fitFontSize(ctx, '5', 500, 40, font);
  assert.equal(size, 40);
});

test('fitFontSize never returns less than 1', () => {
  const ctx = createCanvas(10, 10).getContext('2d');
  const size = fitFontSize(ctx, 'a very long string that will never fit', 5, 300, font);
  assert.ok(size >= 1);
});
