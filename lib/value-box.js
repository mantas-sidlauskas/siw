'use strict';
const { fitFontSize } = require('./canvas-text');

// A small bordered box with a dominant value (big number + small unit
// suffix) and a tiny caption tag - matches a dedicated sailing instrument's
// layout, where the number fills almost the whole tile and the caption
// (what the number is) is just a corner tag, not a same-size label.
const BOX_BORDER_COLOR = '#000000';
const CAPTION_COLOR = '#000000';
const VALUE_FILL_RATIO = 0.74;
const CAPTION_FILL_RATIO = 0.4;
const UNIT_FONT_SCALE = 0.45;
const BOX_GAP = 4;

// Lays out 1+ of these boxes evenly across a row starting at (rowX, rowY).
function drawHeaderBoxes(ctx, rowX, rowY, rowWidth, rowHeight, boxes) {
  const boxWidth = (rowWidth - BOX_GAP * (boxes.length - 1)) / boxes.length;
  boxes.forEach((box, i) => {
    const boxX = rowX + i * (boxWidth + BOX_GAP);
    drawValueBox(ctx, boxX, rowY + 2, boxWidth, rowHeight - 4, box.caption, box.value);
  });
}

function drawValueBox(ctx, x, y, w, h, caption, value) {
  ctx.strokeStyle = BOX_BORDER_COLOR;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  const maxWidth = w - 12;
  const mainSize = fitValueWithUnit(ctx, value.main, value.unit, maxWidth, Math.round(h * VALUE_FILL_RATIO));
  const unitSize = value.unit ? Math.max(1, Math.round(mainSize * UNIT_FONT_SCALE)) : 0;

  ctx.font = `bold ${mainSize}px sans-serif`;
  const mainWidth = ctx.measureText(value.main).width;
  let unitWidth = 0;
  if (value.unit) {
    ctx.font = `bold ${unitSize}px sans-serif`;
    unitWidth = ctx.measureText(value.unit).width;
  }
  const startX = x + w / 2 - (mainWidth + unitWidth) / 2;
  // Nudged up from dead-center so the caption has clear room in the
  // bottom-right corner instead of crowding the number's descenders.
  const valueY = y + h * 0.42;

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${mainSize}px sans-serif`;
  ctx.fillText(value.main, startX, valueY);
  if (value.unit) {
    ctx.font = `bold ${unitSize}px sans-serif`;
    ctx.fillText(value.unit, startX + mainWidth, valueY);
  }

  // Height-based starting size, then shrunk to fit the box width too - a
  // short caption like "SOG" never needs this, but a longer one like
  // "RECOVERY" would otherwise overflow past the box edge into the number.
  const captionMaxSize = Math.max(7, Math.round(h * CAPTION_FILL_RATIO));
  const captionFontPx = fitFontSize(ctx, caption, w - 8, captionMaxSize, (size) => `${size}px sans-serif`);
  ctx.fillStyle = CAPTION_COLOR;
  ctx.font = `${captionFontPx}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(caption, x + w - 4, y + h - 2);
}

// Shrinks the main number's font size (the unit suffix always follows at
// UNIT_FONT_SCALE of it) until both together fit within maxWidth.
function fitValueWithUnit(ctx, mainText, unitText, maxWidth, initialSize) {
  let size = initialSize;
  while (size > 1) {
    ctx.font = `bold ${size}px sans-serif`;
    const mainW = ctx.measureText(mainText).width;
    let unitW = 0;
    if (unitText) {
      ctx.font = `bold ${Math.max(1, Math.round(size * UNIT_FONT_SCALE))}px sans-serif`;
      unitW = ctx.measureText(unitText).width;
    }
    if (mainW + unitW <= maxWidth) return size;
    size -= 1;
  }
  return size;
}

module.exports = { drawHeaderBoxes };
