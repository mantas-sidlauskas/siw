'use strict';

function drawPlaceholderText(ctx, width, height, message) {
  ctx.fillStyle = '#000000';
  ctx.font = `${Math.floor(height * 0.15)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}

module.exports = { drawPlaceholderText };
