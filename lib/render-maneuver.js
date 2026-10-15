'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { createSvgContext } = require('./svg-context');
const { drawPlaceholderText } = require('./placeholder');
const { drawHeaderBoxes } = require('./value-box');
const { detectLatestManeuver } = require('./maneuver-detect');
const { FONT_STACK } = require('./fonts');

function drawManeuverScore(ctx, width, height, historyResponse) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';

  if (!historyResponse || !Array.isArray(historyResponse.data) || historyResponse.data.length === 0) {
    drawPlaceholderText(ctx, width, height, 'No history data');
  } else {
    const maneuver = detectLatestManeuver(historyResponse.data);
    if (!maneuver) {
      drawPlaceholderText(ctx, width, height, 'No maneuver detected');
    } else {
      drawManeuver(ctx, width, height, maneuver);
    }
  }
}

function renderManeuverScore(component, historyResponse) {
  const { width, height, format } = component;

  if (format === 'svg') {
    const { ctx, toSvgString } = createSvgContext(width, height);
    drawManeuverScore(ctx, width, height, historyResponse);
    return { buffer: Buffer.from(toSvgString()), contentType: 'image/svg+xml' };
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawManeuverScore(ctx, width, height, historyResponse);
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return { buffer: canvas.toBuffer(mime), contentType: mime };
}

function drawManeuver(ctx, width, height, maneuver) {
  const typeLabel = maneuver.type === 'tack' ? 'TACK' : 'JIBE';
  const headerHeight = Math.round(height * 0.3);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(headerHeight * 0.55)}px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(typeLabel, width / 2, headerHeight * 0.45);

  ctx.font = `${Math.max(10, Math.round(headerHeight * 0.16))}px ${FONT_STACK}`;
  ctx.fillText(agoLabel(maneuver.timestamp), width / 2, headerHeight * 0.8);

  const boxes = [
    { caption: 'DIP', value: formatPercentParts(maneuver.dipPercent) },
    { caption: 'RECOVERY', value: formatSecondsParts(maneuver.recoverySeconds) },
  ];
  drawHeaderBoxes(ctx, 0, headerHeight, width, height - headerHeight, boxes);
}

function agoLabel(timestampIso) {
  const elapsedMs = Date.now() - new Date(timestampIso).getTime();
  if (elapsedMs < 60_000) return `${Math.max(0, Math.round(elapsedMs / 1000))}s ago`;
  return `${Math.round(elapsedMs / 60_000)}m ago`;
}

function formatPercentParts(dipPercent) {
  return dipPercent === null ? { main: '--', unit: '' } : { main: String(dipPercent), unit: '%' };
}

function formatSecondsParts(recoverySeconds) {
  return recoverySeconds === null ? { main: '--', unit: '' } : { main: String(recoverySeconds), unit: 's' };
}

module.exports = { renderManeuverScore };
