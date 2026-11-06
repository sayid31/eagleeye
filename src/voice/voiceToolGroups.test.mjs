import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEV_TOOL_SCHEMAS } from './toolSchemas.js';
import { READ_SCREEN_TOOL_NAME } from './gevLiveVision.js';
import {
  VOICE_TOOL_GROUPS, VOICE_TOOL_GROUP_IDS, defaultToolGroups, disabledToolGroups, filterToolsByGroups, toolGroupOf,
} from './voiceToolGroups.js';

const declared = [...GEV_TOOL_SCHEMAS.map((schema) => schema.name), READ_SCREEN_TOOL_NAME];

test('every declared voice tool belongs to exactly one group', () => {
  for (const name of declared) {
    const owners = VOICE_TOOL_GROUPS.filter((group) => group.tools.includes(name));
    assert.equal(owners.length, 1, `${name} must be in exactly one group`);
  }
});

test('groups list no tool that is not declared', () => {
  for (const group of VOICE_TOOL_GROUPS) {
    for (const name of group.tools) assert.ok(declared.includes(name), `${name} in ${group.id} is not a declared tool`);
  }
});

test('there are five groups and all are on by default', () => {
  assert.deepEqual(VOICE_TOOL_GROUP_IDS, ['readOnly', 'camera', 'display', 'media', 'annotate']);
  assert.deepEqual(Object.values(defaultToolGroups()), [true, true, true, true, true]);
});

test('toolGroupOf maps known tools and returns null for unknown ones', () => {
  assert.equal(toolGroupOf('clear_annotations'), 'annotate');
  assert.equal(toolGroupOf('read_screen'), 'readOnly');
  assert.equal(toolGroupOf('not_a_tool'), null);
});

test('filterToolsByGroups drops only the tools of switched-off groups', () => {
  const tools = declared.map((name) => ({ name }));
  assert.equal(filterToolsByGroups(tools, defaultToolGroups()).length, declared.length);
  const kept = filterToolsByGroups(tools, { ...defaultToolGroups(), media: false, annotate: false }).map((t) => t.name);
  assert.equal(kept.length, declared.length - 4);
  for (const name of ['control_cctv', 'control_radio', 'annotate_map', 'clear_annotations']) assert.ok(!kept.includes(name));
  assert.ok(kept.includes('fly_to_location'));
});

test('filterToolsByGroups keeps a tool with no group', () => {
  assert.deepEqual(filterToolsByGroups([{ name: 'future_tool' }], { readOnly: false }), [{ name: 'future_tool' }]);
});

test('disabledToolGroups lists switched-off groups in display order', () => {
  assert.deepEqual(disabledToolGroups({ annotate: false, camera: false, media: true }).map((g) => g.id), ['camera', 'annotate']);
  assert.deepEqual(disabledToolGroups(), []);
});
