import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultVoiceSettings } from './voice/voiceSettingsCore.mjs';
import { mountVoiceSettings } from './voiceSettingsPanel.js';

// Minimal DOM: enough for the panel's createElement/append/listener usage.
function fakeDoc() {
  const made = [];
  const doc = {
    createElement(tag) {
      const listeners = {};
      const node = {
        tag, children: [], attrs: {}, dataset: {}, value: '', checked: false,
        append(...c) { this.children.push(...c); },
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(type, fn) { listeners[type] = fn; },
        click() { return listeners.click?.(); },
        remove() { this.removed = true; },
      };
      made.push(node);
      return node;
    },
  };
  return { doc, made };
}

function setup({ putStatus = 200 } = {}) {
  const { doc, made } = fakeDoc();
  const host = { children: [], append(...c) { this.children.push(...c); }, set textContent(_) { this.children = []; } };
  const calls = [];
  let stored = defaultVoiceSettings();
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    if (init.method === 'PUT') {
      if (putStatus !== 200) return { ok: false, status: putStatus, json: async () => ({ error: 'ditolak' }) };
      stored = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ settings: stored }) };
    }
    return { ok: true, status: 200, json: async () => ({ settings: stored }) };
  };
  const byTag = (tag, n) => made.filter((m) => m.tag === tag)[n];
  return { doc, host, calls, fetchImpl, byTag, made, get stored() { return stored; } };
}

test('checking the topic switch, adding topics and saving PUTs topics.enabled=true', async () => {
  const t = setup();
  await mountVoiceSettings({ host: t.host, documentRef: t.doc, fetchImpl: t.fetchImpl });
  const checkboxes = t.made.filter((m) => m.tag === 'input' && m.type === 'checkbox');
  const [, topicsOn] = checkboxes; // [0]=voice enabled, [1]=topic switch
  const textareas = t.made.filter((m) => m.tag === 'textarea');
  const save = t.made.find((m) => m.tag === 'button');
  topicsOn.checked = true;
  textareas[1].value = 'penerbangan\nkapal';
  await save.click();
  const put = t.calls.find((c) => c.method === 'PUT');
  assert.ok(put, 'a PUT was sent');
  assert.deepEqual(JSON.parse(put.body).topics, { enabled: true, allowed: ['penerbangan', 'kapal'], refusal: '' });
  assert.equal(t.stored.topics.enabled, true);
});

test('switch on with no topics sends nothing and explains why', async () => {
  const t = setup();
  await mountVoiceSettings({ host: t.host, documentRef: t.doc, fetchImpl: t.fetchImpl });
  const topicsOn = t.made.filter((m) => m.tag === 'input' && m.type === 'checkbox')[1];
  const status = t.made.find((m) => m.tag === 'p' && m.className === 'key-setup-note');
  topicsOn.checked = true;
  await t.made.find((m) => m.tag === 'button').click();
  assert.equal(t.calls.some((c) => c.method === 'PUT'), false);
  assert.match(status.textContent, /minimal satu topik/);
});

test('the panel shows MATI for a fresh install and AKTIF after a successful save', async () => {
  const t = setup();
  await mountVoiceSettings({ host: t.host, documentRef: t.doc, fetchImpl: t.fetchImpl });
  const state = t.made.find((m) => m.className === 'voice-settings-state');
  assert.match(state.textContent, /MATI/);
  assert.equal(state.dataset.active, 'false');
  t.made.filter((m) => m.tag === 'input' && m.type === 'checkbox')[1].checked = true;
  t.made.filter((m) => m.tag === 'textarea')[1].value = 'kapal';
  await t.made.find((m) => m.tag === 'button').click();
  assert.match(state.textContent, /AKTIF \(1 topik\)/);
  assert.equal(state.dataset.active, 'true');
});

test('a rejected save keeps the panel honest: topics stay MATI and the server error is shown', async () => {
  const t = setup({ putStatus: 422 });
  await mountVoiceSettings({ host: t.host, documentRef: t.doc, fetchImpl: t.fetchImpl });
  const state = t.made.find((m) => m.className === 'voice-settings-state');
  t.made.filter((m) => m.tag === 'input' && m.type === 'checkbox')[1].checked = true;
  t.made.filter((m) => m.tag === 'textarea')[1].value = 'kapal';
  await t.made.find((m) => m.tag === 'button').click();
  assert.match(state.textContent, /MATI/);
  assert.match(t.made.find((m) => m.className === 'key-setup-note').textContent, /ditolak/);
});
