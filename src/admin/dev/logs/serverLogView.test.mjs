import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_SOURCES } from '../../log/serverLogCore.mjs';
import { ALL, EMPTY_FILTER, describeClient, describeContext, detailFacts, filterQuery, isFiltered, levelBadge, logRow, sourceLabel } from './serverLogView.js';
import { logQueryString } from './logsApi.js';

const NOW = 1_800_000_000_000;
const entry = { id: 'a', level: 'error', source: 'proxy', code: 'upstream.failed', message: 'boom', count: 12, firstAt: NOW - 7_200_000, lastAt: NOW - 120_000, detail: { status: 502 }, client: { browser: 'Chrome 141', version: '0.1.1' } };

test('every log source has an owner-facing label', () => {
  for (const source of LOG_SOURCES) assert.notEqual(sourceLabel(source), source, source);
});

test('filterQuery: the "all" sentinel and blank search become no filter; the query string drops them', () => {
  const query = filterQuery({ level: 'error', source: ALL, q: ' fly ' }, { limit: 20, offset: 40 });
  assert.deepEqual(query, { level: 'error', source: '', q: 'fly', limit: 20, offset: 40 });
  assert.equal(logQueryString(query), '?level=error&q=fly&limit=20&offset=40');
  assert.equal(logQueryString(filterQuery(EMPTY_FILTER, { limit: 20, offset: 0 })), '?limit=20');
  assert.equal(logQueryString({}), '');
});

test('isFiltered tells "no match" from "empty log"', () => {
  assert.equal(isFiltered(EMPTY_FILTER), false);
  assert.equal(isFiltered({ ...EMPTY_FILTER, level: 'warn' }), true);
  assert.equal(isFiltered({ ...EMPTY_FILTER, q: '  ' }), false);
  assert.equal(isFiltered({ ...EMPTY_FILTER, q: 'x' }), true);
});

test('levelBadge: icon + word per level, unknown reads as info', () => {
  assert.deepEqual(['error', 'warn', 'info'].map((l) => levelBadge(l).label), ['Error', 'Warning', 'Info']);
  assert.equal(levelBadge('error').tone, 'destructive');
  assert.equal(levelBadge('???').level, 'info');
});

test('logRow: relative + absolute time, repeat count, context', () => {
  const row = logRow(entry, NOW);
  assert.equal(row.time.relative, '2 min ago');
  assert.ok(row.time.absolute.length > 5);
  assert.equal(row.time.iso, new Date(entry.lastAt).toISOString());
  assert.equal(row.repeat, '12×');
  assert.equal(row.context, 'status=502');
  assert.equal(row.source, 'External services');
  assert.equal(logRow({ ...entry, count: 1 }, NOW).repeat, '');
});

test('describeContext / describeClient / detailFacts leave empty fields out', () => {
  assert.equal(describeContext({ detail: { tool: 'fly', seconds: 3 } }), 'tool=fly · seconds=3');
  assert.equal(describeContext({}), '');
  assert.equal(describeClient(entry), 'Chrome 141 · v0.1.1');
  assert.deepEqual(detailFacts({ ...entry, client: undefined }, NOW).map((f) => f.id), ['level', 'source', 'count', 'firstAt', 'lastAt']);
});
