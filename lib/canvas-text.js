'use strict';

// Shrinks a font size (built by `fontBuilder(size)`, e.g. size => `bold ${size}px sans-serif`)
// until `text` measures within `maxWidth` on `ctx`, starting from `initialSize`.
// Font-size-from-height scaling (as every renderer here does) has no idea how
// wide the canvas actually is, so a big configured height with a narrower
// width can overflow the text off the edges; this keeps it on-canvas instead.
function fitFontSize(ctx, text, maxWidth, initialSize, fontBuilder) {
  let size = initialSize;
  ctx.font = fontBuilder(size);
  while (size > 1 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = fontBuilder(size);
  }
  return size;
}

module.exports = { fitFontSize };
