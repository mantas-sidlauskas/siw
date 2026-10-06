'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { drawPlaceholderText } = require('./placeholder');
const { applyConversion } = require('./units');
const { fitFontSize } = require('./canvas-text');

function renderNumeric(component, value) {
  const { width, height, format, label, unit, decimals, conversion } = component;
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

  const displayValue = Number.isFinite(value) ? applyConversion(value, conversion) : value;

  if (displayValue === null || displayValue === undefined || !Number.isFinite(displayValue)) {
    drawPlaceholderText(ctx, width, height, '--');
  } else {
    const text = unit ? `${displayValue.toFixed(decimals)} ${unit}` : displayValue.toFixed(decimals);
    const fontBuilder = (size) => `bold ${size}px sans-serif`;
    const fontSize = fitFontSize(ctx, text, width * 0.9, Math.floor(height * 0.35), fontBuilder);
    ctx.font = fontBuilder(fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2 + height * 0.05);
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return { buffer: canvas.toBuffer(mime), contentType: mime };
}

module.exports = { renderNumeric };
