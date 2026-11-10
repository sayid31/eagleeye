import test from 'node:test';
import assert from 'node:assert/strict';
import { mountStylePicker } from './stylePickerMount.js';
import { RAIL_STYLE_SLOT_ID } from './shellMarkup.js';

/** Minimal DOM node: enough tree operations for moving one element. */
function node(id) {
  return {
    id,
    parentNode: null,
    children: [],
    attributes: new Map(),
    get nextSibling() {
      const siblings = this.parentNode?.children || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    },
    append(child) { this.insertBefore(child, null); },
    insertBefore(child, before) {
      if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, child);
      child.parentNode = this;
    },
    querySelector(selector) { return this.children.find((child) => `#${child.id}` === selector) || null; },
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
  };
}

function withDocument(nodes, run) {
  const saved = globalThis.document;
  globalThis.document = { getElementById: (id) => nodes.find((entry) => entry.id === id) || null };
  try {
    run();
  } finally {
    globalThis.document = saved;
  }
}

test('the style picker moves from the dock into the rail slot and back to its old place', () => {
  const dock = node('command-dock');
  const picker = node('control-panel');
  const mic = node('gev-voice-control');
  const toggle = node('control-panel-toggle');
  const slot = node(RAIL_STYLE_SLOT_ID);
  picker.append(toggle);
  dock.append(picker);
  dock.append(mic);

  withDocument([dock, picker, mic, slot], () => {
    const restore = mountStylePicker();
    assert.equal(picker.parentNode, slot, 'the picker now lives in the rail');
    assert.deepEqual(dock.children.map((child) => child.id), ['gev-voice-control'], 'only the mic stays in the dock');
    assert.equal(toggle.getAttribute('title'), 'Gaya visual', 'the rail button gets a tooltip like its neighbours');

    restore();
    assert.deepEqual(dock.children.map((child) => child.id), ['control-panel', 'gev-voice-control']);
    assert.equal(toggle.getAttribute('title'), null);
  });
});

test('a page without the picker or the rail slot is left alone', () => {
  const dock = node('command-dock');
  const picker = node('control-panel');
  dock.append(picker);
  withDocument([dock, picker], () => {
    const restore = mountStylePicker();
    assert.equal(picker.parentNode, dock);
    restore();
    assert.equal(picker.parentNode, dock);
  });
});

test('voice, which mounts after the shell, never pulls the picker back out of the rail', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const voiceUi = readFileSync(new URL('../voice/gevLiveVoiceControlUi.js', import.meta.url), 'utf8');
  assert.ok(main.indexOf('initShell(') < main.indexOf('initGevLiveVoice('), 'the shell mounts first');
  assert.match(voiceUi, /if \(controlPanel\?\.parentNode === commandDock\) commandDock\.appendChild\(controlPanel\);/);
  assert.doesNotMatch(voiceUi, /if \(controlPanel\) commandDock\.appendChild\(controlPanel\)/);
});
