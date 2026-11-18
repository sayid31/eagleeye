import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmState, typedMatches, MIN_REASON_LENGTH } from './confirmDialogView.js';
import { PAGE_SIZES, paginationView, tableState } from './dataTableView.js';
import { breadcrumbTrail, initialsFor, navItems, navTitleFor, pathMatches, resolveNav } from './navModel.js';
import { documentTitle } from './pageTitle.js';
import { splitActions } from './rowActionsView.js';
import { STATUSES, TONE_CLASSES, capabilityPresentation, statusPresentation } from './statusBadgeView.js';
import { copyToClipboard } from '../../lib/clipboard.js';
import { readSidebarOpen, writeSidebarOpen } from '../../lib/sidebarState.js';

const GROUPS = [
  { id: 'main', title: null, items: [{ id: 'home', label: 'Overview', path: '/' }] },
  { id: 'kill', title: null, items: [{ id: 'kill', label: 'Kill switch', path: '/kill-switches' }] },
  { id: 'server-log', title: 'Server Log', path: '/server-log', items: [
    { id: 'log', label: 'Server Log', path: '/server-log' },
    { id: 'audit', label: 'Audit Log', path: '/server-log/audit' },
  ] },
];

test('tableState: error wins, first load is a skeleton, a reload keeps the rows, zero rows is empty', () => {
  assert.deepEqual(tableState({ loading: true, error: new Error('x'), rowCount: 3 }), { state: 'error', refreshing: false });
  assert.deepEqual(tableState({ loading: true, rowCount: 0 }), { state: 'loading', refreshing: false });
  assert.deepEqual(tableState({ loading: true, rowCount: 4 }), { state: 'ready', refreshing: true });
  assert.deepEqual(tableState({ loading: false, rowCount: 0 }), { state: 'empty', refreshing: false });
  assert.deepEqual(tableState({ loading: false, rowCount: 4 }), { state: 'ready', refreshing: false });
});

test('paginationView: "x–y of z" line, neighbours, and hidden when it all fits the smallest page size', () => {
  const middle = paginationView({ total: 45, limit: 20, offset: 20 });
  assert.equal(middle.label, '21–40 of 45');
  assert.equal(middle.prevOffset, 0);
  assert.equal(middle.nextOffset, 40);
  assert.equal(middle.visible, true);
  const last = paginationView({ total: 45, limit: 20, offset: 40 });
  assert.equal(last.label, '41–45 of 45');
  assert.equal(last.nextOffset, null);
  assert.equal(paginationView({ total: 0, limit: 20, offset: 0 }).label, '0–0 of 0');
  assert.equal(paginationView({ total: 7, limit: 20, offset: 0 }).visible, false);
  assert.equal(paginationView({ total: 11, limit: 20, offset: 0 }).visible, true);
  assert.equal(paginationView({ total: 45, limit: 20, offset: 5 }).prevOffset, 0, 'never a negative offset');
  assert.equal(paginationView({ total: Number.NaN, limit: 20, offset: 0 }).total, 0);
});

test('confirmState: every guard must be satisfied and busy blocks', () => {
  const guards = { typeToConfirm: { value: 'a@b.test' }, reason: { minLength: 3 }, password: {} };
  assert.deepEqual(confirmState({ ...guards, values: {} }), { canConfirm: false, missing: ['typed', 'reason', 'password'] });
  assert.equal(confirmState({ ...guards, values: { typed: ' A@B.test ', reason: 'abc', password: 'x' } }).canConfirm, true);
  assert.equal(confirmState({ ...guards, values: { typed: 'a@b.test', reason: 'ab', password: 'x' } }).missing[0], 'reason');
  assert.equal(confirmState({ ...guards, values: { typed: 'a@b.test', reason: 'abc', password: 'x' }, busy: true }).canConfirm, false);
  assert.equal(confirmState({ values: {} }).canConfirm, true, 'no guards: always confirmable');
  assert.equal(confirmState({ reason: { required: false }, values: {} }).canConfirm, true, 'optional reason');
  assert.equal(MIN_REASON_LENGTH, 3);
  assert.equal(typedMatches('', ''), false, 'an empty subject never matches');
});

test('navModel: resolves the longest matching path, builds breadcrumbs and titles', () => {
  assert.equal(pathMatches('/', '/'), true);
  assert.equal(pathMatches('/users', '/'), false);
  assert.equal(pathMatches('/server-log/audit', '/server-log'), true);
  assert.equal(pathMatches('/server-logx', '/server-log'), false);
  assert.equal(navItems(GROUPS).length, 4);
  assert.equal(resolveNav(GROUPS, '/server-log/audit').item.id, 'audit', 'the longest path wins over the parent page');
  assert.equal(resolveNav(GROUPS, '/server-log').item.id, 'log');
  assert.equal(resolveNav(GROUPS, '/nope'), null);
  assert.deepEqual(breadcrumbTrail(GROUPS, '/'), [{ label: 'Overview' }]);
  assert.deepEqual(breadcrumbTrail(GROUPS, '/kill-switches'), [{ label: 'Kill switch' }]);
  assert.deepEqual(breadcrumbTrail(GROUPS, '/server-log'), [{ label: 'Server Log' }], 'a page named like its group is one crumb');
  assert.deepEqual(breadcrumbTrail(GROUPS, '/server-log/audit'), [{ label: 'Server Log' }, { label: 'Audit Log' }]);
  assert.deepEqual(breadcrumbTrail(GROUPS, '/nope'), []);
  assert.equal(navTitleFor(GROUPS, '/server-log/audit'), 'Audit Log');
  assert.equal(navTitleFor(GROUPS, '/'), 'Overview');
  assert.equal(navTitleFor(GROUPS, '/nope'), null);
});

test('initialsFor: name first, then the email local part, never empty', () => {
  assert.equal(initialsFor({ name: 'Budi Santoso', email: 'x@y.test' }), 'BS');
  assert.equal(initialsFor({ name: 'budi', email: 'x@y.test' }), 'BU');
  assert.equal(initialsFor({ name: '', email: 'ani.wijaya@y.test' }), 'AW');
  assert.equal(initialsFor({ email: 'dev@example.test' }), 'DE');
  assert.equal(initialsFor({}), '?');
  assert.equal(initialsFor(null), '?');
});

test('documentTitle follows "<page> · EagleEye View"', () => {
  assert.equal(documentTitle('Users'), 'User · EagleEye View');
  assert.equal(documentTitle('  '), 'EagleEye View');
  assert.equal(documentTitle(undefined), 'EagleEye View');
});

test('splitActions puts destructive actions last and drops hidden ones', () => {
  const noop = () => {};
  const { normal, destructive } = splitActions([
    { id: 'delete', label: 'Delete', onSelect: noop, destructive: true },
    { id: 'edit', label: 'Edit', onSelect: noop },
    { id: 'role', label: 'Edit role', onSelect: noop, hidden: true },
    { id: 'reset', label: 'Reset password', onSelect: noop },
  ]);
  assert.deepEqual(normal.map((a) => a.id), ['edit', 'reset']);
  assert.deepEqual(destructive.map((a) => a.id), ['delete']);
});

test('status presentation: every known status has tone, icon and a word; unknown is muted with a word', () => {
  for (const key of Object.keys(STATUSES)) {
    const view = statusPresentation(key);
    assert.ok(view.label.length > 0 && Object.hasOwn(TONE_CLASSES, view.tone) && view.icon, key);
  }
  assert.equal(statusPresentation('active').label, 'Active');
  assert.equal(statusPresentation('active', 'Online').label, 'Online');
  assert.equal(statusPresentation('toString').tone, 'muted');
});

test('health states share StatusBadge: icon + word each, unrecognised reads as unknown, label overrides only the word', () => {
  assert.deepEqual(['ok', 'warn', 'error'].map((s) => statusPresentation(s).tone), ['success', 'warning', 'destructive']);
  assert.deepEqual(['ok', 'warn', 'error', 'off', 'unknown'].map((s) => statusPresentation(s).icon), ['check', 'warning', 'x', 'minus', 'help']);
  assert.equal(statusPresentation('weird').status, 'unknown');
  assert.equal(statusPresentation('weird').label, 'No data');
  assert.equal(statusPresentation('ok', 'Ready').label, 'Ready');
  assert.equal(statusPresentation('ok', 'Ready').icon, statusPresentation('ok').icon);
});

test('capability chip: name always visible, on/off as an icon and screen-reader text (not a strike-through)', () => {
  assert.deepEqual(capabilityPresentation('Data layers', true), { tone: 'success', icon: 'check', label: 'Data layers', srText: 'aktif' });
  assert.deepEqual(capabilityPresentation('Voice & AI', false), { tone: 'muted', icon: 'minus', label: 'Voice & AI', srText: 'nonaktif' });
});

test('copyToClipboard: Clipboard API first, textarea fallback, false when neither works', async () => {
  const written = [];
  assert.equal(await copyToClipboard('rahasia', { navigator: { clipboard: { writeText: async (t) => { written.push(t); } } } }), true);
  assert.deepEqual(written, ['rahasia']);
  const nodes = [];
  const doc = {
    body: { appendChild: (n) => nodes.push(n), removeChild: (n) => nodes.splice(nodes.indexOf(n), 1) },
    createElement: () => ({ style: {}, setAttribute() {}, select() {} }),
    execCommand: (command) => command === 'copy',
  };
  assert.equal(await copyToClipboard('x', { navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } }, document: doc }), true);
  assert.equal(nodes.length, 0, 'the temporary textarea is removed');
  assert.equal(await copyToClipboard('x', { navigator: {}, document: { body: null } }), false);
});

test('sidebar state: expanded unless the visitor collapsed it; broken storage never throws', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readSidebarOpen(storage), true);
  assert.equal(writeSidebarOpen(false, storage), true);
  assert.equal(readSidebarOpen(storage), false);
  writeSidebarOpen(true, storage);
  assert.equal(readSidebarOpen(storage), true);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readSidebarOpen(broken), true);
  assert.equal(writeSidebarOpen(false, broken), false);
});
