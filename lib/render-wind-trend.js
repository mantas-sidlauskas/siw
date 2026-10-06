'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { drawPlaceholderText } = require('./placeholder');
const { radiansToDegrees, mpsToKnots } = require('./units');
const { unwrapDegrees, centeredRange, movingAverage, computePanelLayout } = require('./wind-trend-math');
const { fitFontSize } = require('./canvas-text');
const { drawHeaderBoxes } = require('./value-box');

// Matches KIP's wind-trends chart: time runs vertically (now at the top),
// value runs horizontally. The combined chart puts a speed panel and a
// direction panel side by side; the split-out charts render just one panel,
// full width. Each panel's trend line is red below its own center value,
// green above it.
const BELOW_CENTER_COLOR = '#b00020';
const ABOVE_CENTER_COLOR = '#00701a';
const RAW_LINE_COLOR = 'rgba(0, 0, 0, 0.3)';
// Kindle's e-ink contrast makes mid-grays hard to read, so every label/line
// that carries actual information is plain black - only the watermark (which
// is meant to recede) and the panel divider (a background separator with no
// information of its own) stay gray.
const CENTER_LINE_COLOR = '#000000';
const TICK_LABEL_COLOR = '#000000';
const DIVIDER_COLOR = '#cccccc';
const WATERMARK_COLOR = 'rgba(0, 0, 0, 0.18)';

function renderWindTrend(component, historyResponse, extra) {
  return renderPanels(component, historyResponse, ['speed', 'direction'], extra);
}

function renderWindSpeedTrend(component, historyResponse, extra) {
  return renderPanels(component, historyResponse, ['speed'], extra);
}

function renderWindDirectionTrend(component, historyResponse, extra) {
  return renderPanels(component, historyResponse, ['direction'], extra);
}

function renderPanels(component, historyResponse, which, extra = {}) {
  const { width, height, format } = component;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';

  if (!historyResponse || !Array.isArray(historyResponse.data) || historyResponse.data.length === 0) {
    drawPlaceholderText(ctx, width, height, 'No history data');
  } else {
    drawTrend(ctx, width, height, historyResponse.data, which, extra.speedOverGround);
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return { buffer: canvas.toBuffer(mime), contentType: mime };
}

function drawTrend(ctx, width, height, rows, which, speedOverGround) {
  const layout = computePanelLayout(width, height, which);
  const speedKt = rows.map((r) => (Number.isFinite(r[2]) ? mpsToKnots(r[2]) : null));
  const directionDeg = rows.map((r) => (Number.isFinite(r[1]) ? radiansToDegrees(r[1]) : null));
  const unwrappedDir = unwrapDegrees(directionDeg);

  const panelData = {
    speed: { values: speedKt, range: centeredRange(speedKt, { minSpan: 10, padRatio: 0.25 }), label: 'TWS', formatTick: (v) => v.toFixed(0), formatValue: () => formatSpeedParts(findLastFinite(rows, 2)) },
    direction: { values: unwrappedDir, range: centeredRange(unwrappedDir, { minSpan: 30, padRatio: 0.1 }), label: 'TWD', formatTick: (v) => `${normalizeDeg(v).toFixed(0)}°`, formatValue: () => formatDirectionParts(findLastFinite(rows, 1)) },
  };

  for (const panel of layout.panels) {
    const data = panelData[panel.key];
    drawWatermark(ctx, panel.x, panel.width, height, data.label);
  }

  // The header row has no time-axis column to share, unlike the chart below
  // it, so its boxes span the full canvas width rather than stopping at
  // layout.chartWidth (which would leave the time column's width unused).
  const headerPanelWidth = width / which.length;
  layout.panels.forEach((panel, i) => {
    const data = panelData[panel.key];
    const boxes = [];
    if (i === 0) boxes.push({ caption: 'SOG', value: formatSpeedOverGroundParts(speedOverGround) });
    boxes.push({ caption: data.label, value: data.formatValue() });
    drawHeaderBoxes(ctx, i * headerPanelWidth, 0, headerPanelWidth, layout.headerHeight, boxes);
  });

  if (layout.panels.length > 1) {
    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headerPanelWidth, 2);
    ctx.lineTo(headerPanelWidth, layout.headerHeight - 2);
    ctx.moveTo(layout.panels[1].x, layout.headerHeight);
    ctx.lineTo(layout.panels[1].x, layout.chartBottom);
    ctx.stroke();
  }

  if (rows.length >= 2) {
    const totalMinutes = Math.round((new Date(rows[rows.length - 1][0]) - new Date(rows[0][0])) / 60000);
    drawTimeLabel(ctx, width - 2, layout.chartTop, 'now', layout.tickFontPx, 'top');
    drawTimeLabel(ctx, width - 2, (layout.chartTop + layout.chartBottom) / 2, `-${Math.round(totalMinutes / 2)}m`, layout.tickFontPx, 'middle');
    drawTimeLabel(ctx, width - 2, layout.chartBottom, `-${totalMinutes}m`, layout.tickFontPx, 'bottom');
  }

  for (const panel of layout.panels) {
    const data = panelData[panel.key];
    if (!data.range) continue;
    drawPanel(ctx, rows, data.values, data.range, panel.x, panel.width, layout.chartTop, layout.chartBottom, layout.tickFontPx, data.formatTick, layout);
  }
}

function drawWatermark(ctx, xOffset, panelWidth, canvasHeight, label) {
  const fontBuilder = (size) => `bold ${size}px sans-serif`;
  const fontSize = fitFontSize(ctx, label, panelWidth * 0.85, canvasHeight, fontBuilder);

  ctx.fillStyle = WATERMARK_COLOR;
  ctx.font = fontBuilder(fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, xOffset + panelWidth / 2, canvasHeight / 2);
}

function drawTimeLabel(ctx, x, y, text, fontPx, baseline) {
  ctx.font = `${fontPx}px sans-serif`;
  ctx.fillStyle = TICK_LABEL_COLOR;
  ctx.textAlign = 'right';
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function drawPanel(ctx, rows, values, range, xOffset, panelWidth, top, bottom, tickFontPx, formatTick, layout) {
  const xFor = (v) => xOffset + ((v - range.min) / (range.max - range.min)) * panelWidth;

  ctx.font = `${tickFontPx}px sans-serif`;
  ctx.fillStyle = TICK_LABEL_COLOR;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(formatTick(range.min), xOffset + 2, top - 2);
  ctx.textAlign = 'right';
  ctx.fillText(formatTick(range.max), xOffset + panelWidth - 2, top - 2);
  ctx.font = `bold ${tickFontPx}px sans-serif`;
  ctx.fillStyle = CENTER_LINE_COLOR;
  ctx.textAlign = 'center';
  ctx.fillText(formatTick(range.center), xFor(range.center), top - 2);

  ctx.strokeStyle = CENTER_LINE_COLOR;
  ctx.lineWidth = layout.centerLineWidth;
  ctx.beginPath();
  ctx.moveTo(xFor(range.center), top);
  ctx.lineTo(xFor(range.center), bottom);
  ctx.stroke();

  if (rows.length < 2) return;

  const yFor = (i) => top + ((rows.length - 1 - i) / (rows.length - 1)) * (bottom - top);

  ctx.strokeStyle = RAW_LINE_COLOR;
  ctx.lineWidth = layout.rawLineWidth;
  ctx.beginPath();
  let started = false;
  values.forEach((value, i) => {
    if (!Number.isFinite(value)) {
      started = false;
      return;
    }
    const x = xFor(value);
    const y = yFor(i);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  const smoothed = movingAverage(values, trendWindowSize(values));
  ctx.lineWidth = layout.trendLineWidth;
  for (let i = 0; i < smoothed.length - 1; i++) {
    const a = smoothed[i];
    const b = smoothed[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const midpoint = (a + b) / 2;
    ctx.strokeStyle = midpoint < range.center ? BELOW_CENTER_COLOR : ABOVE_CENTER_COLOR;
    ctx.beginPath();
    ctx.moveTo(xFor(a), yFor(i));
    ctx.lineTo(xFor(b), yFor(i + 1));
    ctx.stroke();
  }
}

function trendWindowSize(values) {
  const finiteCount = values.filter(Number.isFinite).length;
  return Math.max(3, Math.round(finiteCount / 8));
}

function normalizeDeg(v) {
  return ((v % 360) + 360) % 360;
}

function formatSpeedParts(mps) {
  return mps === null ? { main: '--', unit: '' } : { main: mpsToKnots(mps).toFixed(1), unit: 'kt' };
}

function formatDirectionParts(radians) {
  return radians === null ? { main: '--', unit: '' } : { main: normalizeDeg(radiansToDegrees(radians)).toFixed(0), unit: '°' };
}

function formatSpeedOverGroundParts(mps) {
  return Number.isFinite(mps) ? { main: mpsToKnots(mps).toFixed(1), unit: 'kt' } : { main: '--', unit: '' };
}

function findLastFinite(rows, columnIndex) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (Number.isFinite(rows[i][columnIndex])) return rows[i][columnIndex];
  }
  return null;
}

module.exports = { renderWindTrend, renderWindSpeedTrend, renderWindDirectionTrend };
