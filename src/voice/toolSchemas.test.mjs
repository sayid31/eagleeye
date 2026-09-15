// src/voice/toolSchemas.test.mjs
// GEV_TOOL_SCHEMAS is the single source of truth both voice backends'
// wire-format tool lists derive from — a formatter bug here silently
// reshapes every tool call sent to either provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEV_TOOL_SCHEMAS, toAnthropicTools, toOpenAiRealtimeTools } from './toolSchemas.js';

test('GEV_TOOL_SCHEMAS is the authoritative 28-tool inventory, unwrapped', () => {
  assert.equal(GEV_TOOL_SCHEMAS.length, 28);
  const names = GEV_TOOL_SCHEMAS.map((schema) => schema.name);
  assert.equal(new Set(names).size, 28, 'tool names are unique');
  assert.ok(names.includes('fly_to_location'));
  assert.ok(names.includes('control_radio'));
  assert.ok(names.includes('analyst_query'));
  for (const schema of GEV_TOOL_SCHEMAS) {
    assert.ok(!('type' in schema), `${schema.name} must not carry a provider wrapper`);
    assert.ok(schema.description, `${schema.name} has no description`);
    assert.equal(schema.parameters?.type, 'object', `${schema.name} parameters must be an object schema`);
    assert.equal(
      schema.parameters?.additionalProperties,
      false,
      `${schema.name} does not close additionalProperties`,
    );
  }
});

test('toOpenAiRealtimeTools adds the type:function wrapper and nothing else', () => {
  const tools = toOpenAiRealtimeTools(GEV_TOOL_SCHEMAS);
  assert.equal(tools.length, GEV_TOOL_SCHEMAS.length);
  tools.forEach((tool, i) => {
    assert.equal(tool.type, 'function');
    assert.equal(tool.name, GEV_TOOL_SCHEMAS[i].name);
    assert.equal(tool.description, GEV_TOOL_SCHEMAS[i].description);
    assert.deepEqual(tool.parameters, GEV_TOOL_SCHEMAS[i].parameters);
    assert.equal(Object.keys(tool).length, 4, `${tool.name} must be exactly {type, name, description, parameters}`);
  });
});

test('toAnthropicTools renames parameters to input_schema and drops the OpenAI wrapper', () => {
  const tools = toAnthropicTools(GEV_TOOL_SCHEMAS);
  assert.equal(tools.length, GEV_TOOL_SCHEMAS.length);
  tools.forEach((tool, i) => {
    assert.equal(tool.type, undefined, `${tool.name} must not carry OpenAI's type wrapper`);
    assert.equal(tool.name, GEV_TOOL_SCHEMAS[i].name);
    assert.equal(tool.description, GEV_TOOL_SCHEMAS[i].description);
    assert.deepEqual(tool.input_schema, GEV_TOOL_SCHEMAS[i].parameters);
    assert.equal(Object.keys(tool).length, 3, `${tool.name} must be exactly {name, description, input_schema}`);
  });
});

test('both formatters are pure — they do not mutate the shared schema array', () => {
  const before = JSON.stringify(GEV_TOOL_SCHEMAS);
  toOpenAiRealtimeTools(GEV_TOOL_SCHEMAS);
  toAnthropicTools(GEV_TOOL_SCHEMAS);
  assert.equal(JSON.stringify(GEV_TOOL_SCHEMAS), before);
});
