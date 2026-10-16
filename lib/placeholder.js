'use strict';
const { fitFontSize } = require('./canvas-text');
const { FONT_STACK } = require('./fonts');

function drawPlaceholderText(ctx, width, height, message) {
  ctx.fillStyle = '#000000';
  const initialSize = Math.floor(height * 0.15);
  const fontSize = fitFontSize(ctx, message, width - 16, initialSize, (size) => `${size}px ${FONT_STACK}`);
  ctx.font = `${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}

module.exports = { drawPlaceholderText };
