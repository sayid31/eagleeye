// scripts/qa-ui/baseline.mjs
/**
 * Visual regression against stored PNG baselines (scripts/qa-ui/baselines/<theme>-<viewport>/<role>-<page>.png),
 * compared with pixelmatch. Structure only in phase 0: no baselines are committed yet (07 §9), so a missing baseline is
 * reported as "none", never as a failure. `--update-baseline` (re)writes them on purpose.
 */
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { REPO_ROOT } from './server.mjs';

export const BASELINE_DIR = path.join(REPO_ROOT, 'scripts/qa-ui/baselines');
/** Share of pixels that may differ before a page counts as changed (plan 05 §5: 0.1 %). */
export const DIFF_RATIO_LIMIT = 0.001;
const PIXEL_THRESHOLD = 0.1;

/** @returns {string} Baseline path for one matrix cell. */
export function baselinePath({ theme, viewport, role, pageId }, dir = BASELINE_DIR) {
  return path.join(dir, `${theme}-${viewport}`, `${role}-${pageId}.png`);
}

/**
 * @param {Buffer} actual PNG bytes of the new screenshot.
 * @param {string} file Baseline path.
 * @param {{diffOut?: string}} [options] Where to write the diff image when the page changed.
 * @returns {{status: 'none' | 'same' | 'changed' | 'resized', ratio: number}}
 */
export function compareToBaseline(actual, file, { diffOut } = {}) {
  if (!fs.existsSync(file)) return { status: 'none', ratio: 0 };
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(fs.readFileSync(file));
  if (a.width !== b.width || a.height !== b.height) return { status: 'resized', ratio: 1 };
  const diff = new PNG({ width: a.width, height: a.height });
  const different = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: PIXEL_THRESHOLD });
  const ratio = different / (a.width * a.height);
  if (ratio > DIFF_RATIO_LIMIT && diffOut) {
    fs.mkdirSync(path.dirname(diffOut), { recursive: true });
    fs.writeFileSync(diffOut, PNG.sync.write(diff));
  }
  return { status: ratio > DIFF_RATIO_LIMIT ? 'changed' : 'same', ratio };
}

/** Write (replace) a baseline. */
export function writeBaseline(actual, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, actual);
}
