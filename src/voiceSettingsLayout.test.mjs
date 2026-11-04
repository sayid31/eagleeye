import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { wireKeySetupTabs } from './keySetupTabs.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./theme/voiceSettings.css', import.meta.url), 'utf8');

// Regression: the voice form once sat beside the key rows in one scroller and
// overlapped them. Each tab now has its own pane.
test('key rows and voice settings live in separate tab panes of the POWER UP dialog', () => {
  const keys = html.match(/data-key-setup-pane="keys"[\s\S]*?\n    <\/div>/)?.[0] || '';
  const voice = html.match(/data-key-setup-pane="voice"[\s\S]*?\n    <\/div>/)?.[0] || '';
  assert.match(keys, /data-key-setup-rows/);
  assert.match(keys, /data-key-setup-apply/);
  assert.doesNotMatch(keys, /data-voice-settings/);
  assert.match(voice, /data-voice-settings/);
  assert.doesNotMatch(voice, /data-key-setup-rows/);
  assert.match(html, /data-key-setup-tabs hidden/);
});

test('voice pane scrolls on its own and hidden panes are not displayed', () => {
  assert.match(css, /\.key-setup-pane-voice\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.key-setup-pane\[hidden\]\s*\{\s*display:\s*none/);
});

function fakeRoot() {
  const mk = (attrs) => {
    const listeners = {};
    return {
      attrs, hidden: attrs.hidden || false, tabIndex: 0, dataset: attrs.dataset, focused: false,
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      addEventListener(type, fn) { listeners[type] = fn; }, fire(type, event) { listeners[type](event); },
      focus() { this.focused = true; },
    };
  };
  const strip = mk({ hidden: true, dataset: {} });
  const tabKeys = mk({ 'aria-selected': 'true', dataset: { keySetupTab: 'keys' } });
  const tabVoice = mk({ 'aria-selected': 'false', dataset: { keySetupTab: 'voice' } });
  const paneKeys = mk({ dataset: { keySetupPane: 'keys' } });
  const paneVoice = mk({ hidden: true, dataset: { keySetupPane: 'voice' } });
  const root = {
    querySelector: () => strip,
    querySelectorAll: (sel) => (sel.includes('tab]') ? [tabKeys, tabVoice] : [paneKeys, paneVoice]),
  };
  return { root, strip, tabKeys, tabVoice, paneKeys, paneVoice };
}

test('tabs stay hidden until enabled, then switch panes by click and arrow key', () => {
  const f = fakeRoot();
  const tabs = wireKeySetupTabs(f.root);
  assert.equal(f.strip.hidden, true);
  tabs.enable();
  assert.equal(f.strip.hidden, false);

  f.strip.fire('click', { target: { closest: () => f.tabVoice } });
  assert.equal(f.paneVoice.hidden, false);
  assert.equal(f.paneKeys.hidden, true);
  assert.equal(f.tabVoice.getAttribute('aria-selected'), 'true');
  assert.equal(f.tabKeys.getAttribute('aria-selected'), 'false');

  f.strip.fire('keydown', { key: 'ArrowRight' });
  assert.equal(f.paneKeys.hidden, false);
  assert.equal(f.tabKeys.focused, true);
});
