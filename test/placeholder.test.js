'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { drawPlaceholderText } = require('../lib/placeholder');

test('shrinks a long placeholder message to fit the canvas width instead of overflowing it', () => {
  const width = 720;
  const height = 860;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const message = 'No maneuver detected';

  drawPlaceholderText(ctx, width, height, message);

  // The font drawPlaceholderText actually used is whatever it left set on the
  // context - measure the message with it and confirm it fits on-canvas.
  const measuredWidth = ctx.measureText(message).width;
  assert.ok(measuredWidth <= width - 16, `expected "${message}" to fit within ${width}px, measured ${measuredWidth}px`);
});

test('does not shrink a short message that already fits', () => {
  const width = 300;
  const height = 150;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  drawPlaceholderText(ctx, width, height, '--');

  const fontSizeMatch = ctx.font.match(/(\d+)px/);
  assert.equal(Number(fontSizeMatch[1]), Math.floor(height * 0.15));
});
