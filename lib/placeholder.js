'use strict';
const { fitFontSize } = require('./canvas-text');

function drawPlaceholderText(ctx, width, height, message) {
  ctx.fillStyle = '#000000';
  const initialSize = Math.floor(height * 0.15);
  const fontSize = fitFontSize(ctx, message, width - 16, initialSize, (size) => `${size}px sans-serif`);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}

module.exports = { drawPlaceholderText };
