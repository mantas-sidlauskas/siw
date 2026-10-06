'use strict';
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');

// Every renderer draws text under this family name instead of a bare generic
// "sans-serif". A plain "sans-serif" depends on the host having *any* system
// font installed at all - true of our own dev container (which happens to
// have fonts-dejavu), but not of every signalk-server Docker image, where
// fillText then silently draws nothing (lines/borders still work, since
// those don't need a font). Bundling DejaVu Sans and registering it
// ourselves makes text rendering work the same regardless of the host.
const FONT_FAMILY = 'SIWSans';

GlobalFonts.registerFromPath(path.join(__dirname, '..', 'fonts', 'DejaVuSans.ttf'), FONT_FAMILY);
GlobalFonts.registerFromPath(path.join(__dirname, '..', 'fonts', 'DejaVuSans-Bold.ttf'), FONT_FAMILY);

// ", sans-serif" stays as a fallback in case registration ever fails for some
// reason - no worse off than before bundling our own font.
const FONT_STACK = `${FONT_FAMILY}, sans-serif`;

module.exports = { FONT_FAMILY, FONT_STACK };
