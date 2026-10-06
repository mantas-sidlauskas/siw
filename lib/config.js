'use strict';
const fs = require('fs');
const path = require('path');

const VALID_TYPES = new Set(['numeric', 'windTrend', 'windSpeedTrend', 'windDirectionTrend', 'maneuverScore']);
// Types that scan a trailing window of history rather than just the current
// value, and so need a configurable windowMinutes.
const HISTORY_WINDOW_TYPES = new Set(['windTrend', 'windSpeedTrend', 'windDirectionTrend', 'maneuverScore']);
const VALID_FORMATS = new Set(['png', 'jpeg']);
const VALID_CONVERSIONS = new Set(['mpsToKnots']);
const DEFAULT_FORMAT = 'png';
const MAX_DIMENSION = 4096;
const MIN_DECIMALS = 0;
const MAX_DECIMALS = 20;
const DEFAULT_DECIMALS = 1;
// Shared with index.js's router.param('id', ...) so the HTTP route can never
// reject an id that the config loader already accepted as valid.
const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

// Returns [{ title, components }, ...]. Supports both a multi-page config
// ("pages": [{ title, components }, ...]) and the older flat single-page
// config ("components": [...]), which is treated as one implicit page.
function loadPages(dataDirPath) {
  const configPath = path.join(dataDirPath, 'components.json');
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [{ title: '', components: [] }];
    throw new Error(`Failed to read components.json: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`components.json is not valid JSON: ${err.message}`);
  }

  let rawPages;
  if (parsed && Array.isArray(parsed.pages)) {
    rawPages = parsed.pages;
  } else if (parsed && Array.isArray(parsed.components)) {
    rawPages = [{ components: parsed.components }];
  } else {
    throw new Error('components.json must contain a "components" array or a "pages" array');
  }

  return rawPages.map((page, pageIndex) => {
    const title = typeof page.title === 'string' ? page.title : '';
    const rawComponents = Array.isArray(page.components) ? page.components : [];
    const components = [];
    for (const entry of rawComponents) {
      const error = validateComponent(entry);
      if (error) {
        console.error(`[signalk-image-widgets] Skipping invalid component "${entry && entry.id}" on page ${pageIndex}: ${error}`);
        continue;
      }
      components.push(normalizeComponent(entry));
    }
    return { title, components };
  });
}

function loadComponents(dataDirPath) {
  return loadPages(dataDirPath).flatMap((page) => page.components);
}

function validateComponent(entry) {
  if (!entry || typeof entry !== 'object') return 'not an object';
  if (!entry.id || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
    return 'missing/invalid "id" (must match /^[A-Za-z0-9._-]+$/)';
  }
  if (!VALID_TYPES.has(entry.type)) {
    return `invalid "type" (must be one of ${[...VALID_TYPES].join(', ')})`;
  }
  if (!Number.isFinite(entry.width) || entry.width <= 0 || entry.width > MAX_DIMENSION) {
    return `invalid "width" (must be a positive number no greater than ${MAX_DIMENSION})`;
  }
  if (!Number.isFinite(entry.height) || entry.height <= 0 || entry.height > MAX_DIMENSION) {
    return `invalid "height" (must be a positive number no greater than ${MAX_DIMENSION})`;
  }
  if (entry.type === 'numeric' && (!entry.path || typeof entry.path !== 'string')) {
    return 'numeric component missing "path"';
  }
  if (entry.type === 'numeric' && entry.conversion !== undefined && !VALID_CONVERSIONS.has(entry.conversion)) {
    return `invalid "conversion" (must be one of ${[...VALID_CONVERSIONS].join(', ')})`;
  }
  return null;
}

function normalizeComponent(entry) {
  const format = VALID_FORMATS.has(entry.format) ? entry.format : DEFAULT_FORMAT;
  const normalized = { ...entry, format, width: Math.round(entry.width), height: Math.round(entry.height) };
  if (entry.type === 'numeric') {
    const decimals = Number.isFinite(entry.decimals) ? Math.trunc(entry.decimals) : DEFAULT_DECIMALS;
    normalized.decimals = Math.min(MAX_DECIMALS, Math.max(MIN_DECIMALS, decimals));
    normalized.unit = typeof entry.unit === 'string' ? entry.unit : '';
    normalized.label = typeof entry.label === 'string' ? entry.label : '';
  }
  if (HISTORY_WINDOW_TYPES.has(entry.type)) {
    normalized.windowMinutes = Number.isFinite(entry.windowMinutes) && entry.windowMinutes > 0
      ? entry.windowMinutes
      : 30;
  }
  return normalized;
}

module.exports = { loadComponents, loadPages, VALID_TYPES, VALID_FORMATS, DEFAULT_FORMAT, ID_PATTERN };
