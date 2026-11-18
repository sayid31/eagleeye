import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAbsolute, formatCountdown, formatRelative, formatUptime, nextUtcMidnight } from './timeView.js';

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

test('formatRelative: just now, minutes, hours, days, then the date; a dash without a time', () => {
  assert.equal(formatRelative(NOW - 10_000, NOW), 'just now');
  assert.equal(formatRelative(NOW - 5 * 60_000, NOW), '5 min ago');
  assert.equal(formatRelative(NOW - 3 * 3_600_000, NOW), '3 h ago');
  assert.equal(formatRelative(NOW - 3 * 86_400_000, NOW), '3 d ago');
  assert.match(formatRelative(NOW - 90 * 86_400_000, NOW), /\d{2}/);
  assert.doesNotMatch(formatRelative(NOW - 90 * 86_400_000, NOW), /ago/);
  assert.equal(formatRelative(null, NOW), '—');
  assert.equal(formatRelative(NOW + 5_000, NOW), 'just now', 'a clock skewed into the future is not "negative"');
});

test('formatAbsolute: day + month + time, the year only when it is not the current one; a dash for junk', () => {
  const same = formatAbsolute(NOW, { now: NOW, locale: 'en-GB' });
  assert.match(same, /18 Nov/);
  assert.doesNotMatch(same, /2026/);
  assert.match(formatAbsolute(Date.UTC(2025, 5, 1, 12), { now: NOW, locale: 'en-GB' }), /2025/);
  assert.equal(formatAbsolute(Number.NaN), '—');
  assert.equal(formatAbsolute(undefined), '—');
});

test('formatUptime', () => {
  assert.equal(formatUptime(45), '45 dtk');
  assert.equal(formatUptime(600), '10 mnt');
  assert.equal(formatUptime(3900), '1 j 05 mnt');
  assert.equal(formatUptime(190_000), '2 d 4 h');
  assert.equal(formatUptime(-5), '0 dtk');
});

test('nextUtcMidnight + formatCountdown: when the TomTom day resets', () => {
  assert.equal(nextUtcMidnight('2026-11-18'), Date.UTC(2026, 10, 19));
  assert.equal(nextUtcMidnight('2026-12-31'), Date.UTC(2027, 0, 1));
  assert.ok(Number.isNaN(nextUtcMidnight('nope')));
  assert.equal(formatCountdown(nextUtcMidnight('2026-11-18'), NOW), '12 j 00 mnt');
  assert.equal(formatCountdown(NOW - 1000, NOW), '0 dtk');
  assert.equal(formatCountdown(Number.NaN, NOW), '0 dtk');
});
