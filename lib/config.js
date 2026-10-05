'use strict';
const fs = require('fs');
const path = require('path');

const VALID_TYPES = new Set(['numeric', 'windTrend']);
const VALID_FORMATS = new Set(['png', 'jpeg']);
const DEFAULT_FORMAT = 'png';

function loadComponents(dataDirPath) {
  const configPath = path.join(dataDirPath, 'components.json');
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`Failed to read components.json: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`components.json is not valid JSON: ${err.message}`);
  }

  if (!parsed || !Array.isArray(parsed.components)) {
    throw new Error('components.json must contain a "components" array');
  }

  const valid = [];
  for (const entry of parsed.components) {
    const error = validateComponent(entry);
    if (error) {
      console.error(`[signalk-image-widgets] Skipping invalid component "${entry && entry.id}": ${error}`);
      continue;
    }
    valid.push(normalizeComponent(entry));
  }
  return valid;
}

function validateComponent(entry) {
  if (!entry || typeof entry !== 'object') return 'not an object';
  if (!entry.id || typeof entry.id !== 'string') return 'missing/invalid "id"';
  if (!VALID_TYPES.has(entry.type)) {
    return `invalid "type" (must be one of ${[...VALID_TYPES].join(', ')})`;
  }
  if (!Number.isFinite(entry.width) || entry.width <= 0) return 'invalid "width" (must be a positive number)';
  if (!Number.isFinite(entry.height) || entry.height <= 0) return 'invalid "height" (must be a positive number)';
  if (entry.type === 'numeric' && (!entry.path || typeof entry.path !== 'string')) {
    return 'numeric component missing "path"';
  }
  return null;
}

function normalizeComponent(entry) {
  const format = VALID_FORMATS.has(entry.format) ? entry.format : DEFAULT_FORMAT;
  const normalized = { ...entry, format };
  if (entry.type === 'numeric') {
    normalized.decimals = Number.isFinite(entry.decimals) ? entry.decimals : 1;
    normalized.unit = typeof entry.unit === 'string' ? entry.unit : '';
    normalized.label = typeof entry.label === 'string' ? entry.label : '';
  }
  if (entry.type === 'windTrend') {
    normalized.windowMinutes = Number.isFinite(entry.windowMinutes) && entry.windowMinutes > 0
      ? entry.windowMinutes
      : 30;
  }
  return normalized;
}

module.exports = { loadComponents, VALID_TYPES, VALID_FORMATS, DEFAULT_FORMAT };
