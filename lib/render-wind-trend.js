'use strict';
const { createCanvas } = require('canvas');
const { drawPlaceholderText } = require('./placeholder');
const { radiansToDegrees, mpsToKnots } = require('./units');

function renderWindTrend(component, historyResponse) {
  const { width, height, format } = component;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';

  if (!historyResponse || !Array.isArray(historyResponse.data) || historyResponse.data.length === 0) {
    drawPlaceholderText(ctx, width, height, 'No history data');
  } else {
    drawTrend(ctx, width, height, historyResponse.data);
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return { buffer: canvas.toBuffer(mime), contentType: mime };
}

function drawTrend(ctx, width, height, rows) {
  const topTop = 0;
  const topBottom = height * 0.45;
  const bottomTop = height * 0.55;
  const bottomBottom = height;

  drawLine(ctx, rows, 1, topTop, topBottom, width);
  drawLine(ctx, rows, 2, bottomTop, bottomBottom, width);

  ctx.font = `${Math.floor(height * 0.08)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(new Date(rows[0][0]).toLocaleTimeString(), 4, 2);
  ctx.textAlign = 'right';
  ctx.fillText(new Date(rows[rows.length - 1][0]).toLocaleTimeString(), width - 4, 2);

  const lastDirectionRadians = findLastFinite(rows, 1);
  const lastSpeedMps = findLastFinite(rows, 2);
  const lastDirectionDegrees = lastDirectionRadians === null ? null : radiansToDegrees(lastDirectionRadians);
  const lastSpeedKnots = lastSpeedMps === null ? null : mpsToKnots(lastSpeedMps);
  ctx.font = `bold ${Math.floor(height * 0.1)}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(lastDirectionDegrees === null ? '--' : `${lastDirectionDegrees.toFixed(0)}°`, width - 4, topBottom * 0.3);
  ctx.fillText(lastSpeedKnots === null ? '--' : `${lastSpeedKnots.toFixed(1)}kt`, width - 4, bottomTop + (bottomBottom - bottomTop) * 0.3);
}

function findLastFinite(rows, columnIndex) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (Number.isFinite(rows[i][columnIndex])) return rows[i][columnIndex];
  }
  return null;
}

function drawLine(ctx, rows, columnIndex, top, bottom, width) {
  const values = rows.map((r) => r[columnIndex]).filter(Number.isFinite);
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  ctx.beginPath();
  let started = false;
  rows.forEach((row, i) => {
    const value = row[columnIndex];
    if (!Number.isFinite(value)) return;
    const x = (i / (rows.length - 1)) * width;
    const y = bottom - ((value - min) / range) * (bottom - top);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000000';
  ctx.stroke();
}

module.exports = { renderWindTrend };
