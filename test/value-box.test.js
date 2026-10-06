'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { drawHeaderBoxes } = require('../lib/value-box');

test('does not throw laying out boxes with a long caption word in a wide-but-short box', () => {
  const canvas = createCanvas(480, 320);
  const ctx = canvas.getContext('2d');
  assert.doesNotThrow(() => {
    drawHeaderBoxes(ctx, 0, 96, 480, 224, [
      { caption: 'RECOVERY', value: { main: '45', unit: 's' } },
      { caption: 'DIP', value: { main: '51', unit: '%' } },
    ]);
  });
});

