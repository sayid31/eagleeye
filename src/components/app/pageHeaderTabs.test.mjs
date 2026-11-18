import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createJsxLoader } from '../../testing/jsxLoader.mjs';

const loader = await createJsxLoader();
after(() => loader.close());

const TABS = [{ id: 'a', label: 'Log Login', path: '/activity/login' }, { id: 'b', label: 'Audit', path: '/activity/audit' }];

async function renderTabbedPage() {
  const { PageHeader } = await loader.load('src/components/app/PageHeader.jsx');
  const { RouteTabs, RouteTabNav } = await loader.load('src/components/app/RouteTabs.jsx');
  const Page = () => h(PageHeader, { title: 'Aktivitas', description: 'Riwayat', tabs: h(RouteTabNav) });
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: ['/activity/audit'] }, h(Routes, null,
    h(Route, { path: 'activity', element: h(RouteTabs, { label: 'Aktivitas', tabs: TABS }) },
      h(Route, { path: 'audit', element: h(Page) })))));
}

test('the tab strip renders below the title and description, and marks the current tab', async () => {
  const html = await renderTabbedPage();
  const title = html.indexOf('<h1');
  const description = html.indexOf('Riwayat');
  const nav = html.indexOf('<nav aria-label="Aktivitas"');
  assert.ok(title > -1 && description > title && nav > description, 'order: h1, description, tabs');
  assert.equal([...html.matchAll(/<h1/g)].length, 1);
  assert.match(html, /<a aria-current="page"[^>]*href="\/activity\/audit"[^>]*>Audit<\/a>|href="\/activity\/audit"[^>]*aria-current="page"/);
  assert.doesNotMatch(html.slice(0, title), /<nav/, 'nothing tab-like above the h1');
});

test('PageHeader without tabs renders no tab slot, and RouteTabNav outside a tabbed route renders nothing', async () => {
  const { PageHeader } = await loader.load('src/components/app/PageHeader.jsx');
  const { RouteTabNav } = await loader.load('src/components/app/RouteTabs.jsx');
  const plain = renderToStaticMarkup(h(PageHeader, { title: 'Umum' }));
  assert.doesNotMatch(plain, /<nav|mt-4/);
  const orphan = renderToStaticMarkup(h(MemoryRouter, null, h(PageHeader, { title: 'Umum', tabs: h(RouteTabNav) })));
  assert.doesNotMatch(orphan, /<nav/);
});

test('every page of a RouteTabs route passes the tab strip to its PageHeader (no strip above the h1)', async () => {
  const { readFileSync } = await import('node:fs');
  const { TAB_ROUTE_PAGE_FILES } = await import('./tabRoutePages.mjs');
  for (const file of TAB_ROUTE_PAGE_FILES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(source, /<PageHeader[\s\S]*?tabs=\{<RouteTabNav \/>\}[\s\S]*?\/>\s*[\n<]/, file);
    assert.doesNotMatch(source, /<RefreshBar[^>]*tabs=/, `${file}: tabs belongs to PageHeader`);
  }
});
