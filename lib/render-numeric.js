'use strict';
const { createCanvas } = require('canvas');
const { drawPlaceholderText } = require('./placeholder');

function renderNumeric(component, value) {
  const { width, height, format, label, unit, decimals } = component;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';

  if (label) {
    ctx.font = `${Math.floor(height * 0.12)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, width * 0.05, height * 0.05);
  }

  if (value === null || value === undefined || !Number.isFinite(value)) {
    drawPlaceholderText(ctx, width, height, '--');
  } else {
    const text = unit ? `${value.toFixed(decimals)} ${unit}` : value.toFixed(decimals);
    ctx.font = `bold ${Math.floor(height * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2 + height * 0.05);
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return { buffer: canvas.toBuffer(mime), contentType: mime };
}

module.exports = { renderNumeric };
