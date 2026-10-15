'use strict';
const { createCanvas } = require('@napi-rs/canvas');

// Implements the small subset of CanvasRenderingContext2D that every
// renderer in this plugin actually uses (see `grep -ohE '\bctx\.[a-zA-Z]+'
// lib/*.js`), emitting SVG elements instead of painting pixels. This lets
// render-numeric.js/render-wind-trend.js/render-maneuver.js share their
// exact drawing logic between PNG/JPEG and SVG output instead of
// maintaining two independent implementations that could drift apart.

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

// rgba(...) is split into a plain color plus a separate *-opacity attribute
// rather than passed through as-is: SVG1.1 presentation attributes don't
// accept CSS rgba() functions, and old WebKit (the target: Kindle browsers)
// support for CSS Color 4 functions in SVG attributes is inconsistent.
function splitColor(cssColor) {
  const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(cssColor);
  if (!m) return { color: cssColor, opacity: null };
  const [, r, g, b, a] = m;
  return { color: `rgb(${r}, ${g}, ${b})`, opacity: a };
}

function textAnchorFor(align) {
  if (align === 'center') return 'middle';
  if (align === 'right' || align === 'end') return 'end';
  return 'start';
}

// Converts a canvas textBaseline into a y-offset for a plain alphabetic-
// baseline <text> element, rather than relying on the SVG
// `dominant-baseline` attribute (inconsistent old-WebKit support). Ratios
// are a standard approximation of ascent/descent relative to font size -
// close enough for this plugin's font-fitting layouts, which already treat
// font sizes as approximate (see fitFontSize).
function baselineOffset(baseline, fontSizePx) {
  switch (baseline) {
    case 'top':
      return fontSizePx * 0.8;
    case 'middle':
      return fontSizePx * 0.35;
    case 'bottom':
      return fontSizePx * -0.15;
    default:
      return 0; // 'alphabetic'
  }
}

function fontSizeOf(fontStr) {
  const m = /(\d+(?:\.\d+)?)px/.exec(fontStr);
  return m ? Number(m[1]) : 10;
}

function createSvgContext(width, height) {
  // A real (unrendered) canvas context purely for font metrics, so SVG
  // layout decisions (fitFontSize et al.) use the same measurements as the
  // PNG/JPEG path. The font family embedded in that measurement is
  // irrelevant here - the client renders the actual text with its own font.
  const measureCtx = createCanvas(1, 1).getContext('2d');

  const elements = [];
  let subpaths = null;

  const state = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };

  const ctx = {
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v) {
      state.fillStyle = v;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(v) {
      state.strokeStyle = v;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(v) {
      state.lineWidth = v;
    },
    get font() {
      return state.font;
    },
    set font(v) {
      state.font = v;
      measureCtx.font = v;
    },
    get textAlign() {
      return state.textAlign;
    },
    set textAlign(v) {
      state.textAlign = v;
    },
    get textBaseline() {
      return state.textBaseline;
    },
    set textBaseline(v) {
      state.textBaseline = v;
    },

    measureText(text) {
      return measureCtx.measureText(text);
    },

    fillRect(x, y, w, h) {
      const { color, opacity } = splitColor(state.fillStyle);
      const opacityAttr = opacity === null ? '' : ` fill-opacity="${opacity}"`;
      elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"${opacityAttr}/>`);
    },

    strokeRect(x, y, w, h) {
      const { color, opacity } = splitColor(state.strokeStyle);
      const opacityAttr = opacity === null ? '' : ` stroke-opacity="${opacity}"`;
      elements.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${state.lineWidth}"${opacityAttr}/>`,
      );
    },

    fillText(text, x, y) {
      const size = fontSizeOf(state.font);
      const ty = y + baselineOffset(state.textBaseline, size);
      const weightAttr = /bold/.test(state.font) ? ' font-weight="bold"' : '';
      const { color, opacity } = splitColor(state.fillStyle);
      const opacityAttr = opacity === null ? '' : ` fill-opacity="${opacity}"`;
      elements.push(
        `<text x="${x}" y="${ty}" font-family="sans-serif" font-size="${size}"${weightAttr} text-anchor="${textAnchorFor(state.textAlign)}" fill="${color}"${opacityAttr}>${escapeXml(text)}</text>`,
      );
    },

    beginPath() {
      subpaths = [[]];
    },
    moveTo(x, y) {
      if (!subpaths) subpaths = [[]];
      if (subpaths[subpaths.length - 1].length > 0) subpaths.push([]);
      subpaths[subpaths.length - 1].push({ x, y });
    },
    lineTo(x, y) {
      if (!subpaths) subpaths = [[]];
      subpaths[subpaths.length - 1].push({ x, y });
    },
    stroke() {
      const segments = (subpaths || [])
        .filter((sp) => sp.length >= 2)
        .map((sp) => sp.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' '));
      if (segments.length > 0) {
        const { color, opacity } = splitColor(state.strokeStyle);
        const opacityAttr = opacity === null ? '' : ` stroke-opacity="${opacity}"`;
        elements.push(
          `<path d="${segments.join(' ')}" fill="none" stroke="${color}" stroke-width="${state.lineWidth}"${opacityAttr}/>`,
        );
      }
      subpaths = null;
    },
  };

  return {
    ctx,
    toSvgString() {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${elements.join('\n')}\n</svg>\n`;
    },
  };
}

module.exports = { createSvgContext };
