import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceBackendCoordinator, isAnthropicKeyConfigured } from './voiceBackendSwitch.js';

/** Minimal fake DOM button — only what the coordinator touches. */
function fakeButton() {
  const listeners = new Map();
  return {
    hidden: false,
    textContent: '',
    dataset: {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    setAttribute(name, value) { this[name] = value; },
    click() { listeners.get('click')?.(); },
  };
}

function fakeController(name) {
  const calls = [];
  return {
    name,
    status: 'idle',
    runner: `runner-${name}`,
    buttonHandler: () => calls.push('legacy-click'),
    isActive() { return this.status !== 'idle'; },
    start(opts) { calls.push(['start', opts]); this.status = 'listening'; },
    stop() { calls.push('stop'); this.status = 'idle'; },
    setStatus(status, detail) { calls.push(['setStatus', status, detail]); },
    setMicrophoneEnabled(enabled) { calls.push(['setMicrophoneEnabled', enabled]); },
    setVoiceSpeaker(speaker) { calls.push(['setVoiceSpeaker', speaker]); },
    getDiagnostics() { return { status: this.status, name }; },
    syncCostUi() { calls.push('syncCostUi'); },
    isSupported() { return true; },
    _calls: calls,
  };
}

function jsonResponse(body, { ok = true } = {}) {
  return { ok, json: async () => body };
}

test('starts delegating to the OpenAI controller by default', () => {
  const openaiController = fakeController('openai');
  const claudeController = fakeController('claude');
  const ui = { button: fakeButton(), backendButton: fakeButton() };
  const coordinator = createVoiceBackendCoordinator({ openaiController, claudeController, ui });

  assert.equal(coordinator._activeBackend(), 'openai');
  assert.equal(coordinator.runner, 'runner-openai');
  coordinator.start({ pushToTalk: false });
  assert.deepEqual(openaiController._calls, [['start', { pushToTalk: false }]]);
  assert.deepEqual(claudeController._calls, []);
});

test('the mic button click is rebound off the legacy handler onto the active backend', () => {
  const openaiController = fakeController('openai');
  const claudeController = fakeController('claude');
  const button = fakeButton();
  const ui = { button, backendButton: fakeButton() };
  createVoiceBackendCoordinator({ openaiController, claudeController, ui });

  button.click(); // starts (idle -> listening)
  assert.deepEqual(openaiController._calls, [['start', { pushToTalk: false }]]);
  button.click(); // stops (listening -> idle)
  assert.deepEqual(openaiController._calls, [['start', { pushToTalk: false }], 'stop']);
  assert.deepEqual(openaiController._calls.filter((c) => c === 'legacy-click'), []);
});

test('clicking the backend pill stops the outgoing backend and switches delegation', () => {
  const openaiController = fakeController('openai');
  const claudeController = fakeController('claude');
  const button = fakeButton();
  const backendButton = fakeButton();
  const ui = { button, backendButton };
  const coordinator = createVoiceBackendCoordinator({ openaiController, claudeController, ui });

  openaiController.status = 'listening'; // mid-session when the user switches
  backendButton.click();

  assert.equal(coordinator._activeBackend(), 'claude');
  assert.deepEqual(openaiController._calls, ['stop']);
  assert.equal(backendButton.textContent, 'CLAUDE');
  assert.equal(backendButton['aria-pressed'], 'true');
  assert.deepEqual(claudeController._calls, ['syncCostUi']);

  coordinator.start();
  assert.deepEqual(claudeController._calls, ['syncCostUi', ['start', undefined]]);
  assert.deepEqual(openaiController._calls, ['stop']); // no further openai calls

  backendButton.click();
  assert.equal(coordinator._activeBackend(), 'openai');
  assert.equal(backendButton.textContent, 'GPT');
  assert.equal(backendButton['aria-pressed'], 'false');
});

test('coordinator getters/forwarders always reflect whichever backend is currently active', () => {
  const openaiController = fakeController('openai');
  const claudeController = fakeController('claude');
  const ui = { button: fakeButton(), backendButton: fakeButton() };
  const coordinator = createVoiceBackendCoordinator({ openaiController, claudeController, ui });

  coordinator.setStatus('listening', 'hi');
  coordinator.setMicrophoneEnabled(true);
  coordinator.setVoiceSpeaker('ai');
  assert.deepEqual(openaiController._calls, [['setStatus', 'listening', 'hi'], ['setMicrophoneEnabled', true], ['setVoiceSpeaker', 'ai']]);
  assert.equal(coordinator.status, openaiController.status);
  assert.deepEqual(coordinator.getDiagnostics(), { status: openaiController.status, name: 'openai' });

  coordinator._setActiveBackend(claudeController);
  coordinator.setStatus('thinking');
  assert.deepEqual(claudeController._calls.filter((c) => Array.isArray(c) && c[0] === 'setStatus'), [['setStatus', 'thinking', undefined]]);
  assert.equal(coordinator.status, claudeController.status);
  // runner always stays the shared OpenAI-built runner regardless of active backend.
  assert.equal(coordinator.runner, 'runner-openai');
});

test('the backend pill is revealed only when ANTHROPIC_API_KEY is configured and the browser supports Web Speech', async () => {
  const openaiController = fakeController('openai');
  const claudeController = fakeController('claude');
  claudeController.isSupported = () => true;
  const backendButton = fakeButton();
  backendButton.hidden = true;
  const ui = { button: fakeButton(), backendButton };
  const fetchImpl = async () => jsonResponse({ keys: [{ id: 'anthropic', set: true }] });

  createVoiceBackendCoordinator({ openaiController, claudeController, ui, fetchImpl });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(backendButton.hidden, false);
});

test('the backend pill stays hidden when the key is unset, even if this browser supports Web Speech', async () => {
  const openaiController = fakeController('openai');
  const claudeController = fakeController('claude');
  const backendButton = fakeButton();
  backendButton.hidden = true;
  const ui = { button: fakeButton(), backendButton };
  const fetchImpl = async () => jsonResponse({ keys: [{ id: 'anthropic', set: false }] });

  createVoiceBackendCoordinator({ openaiController, claudeController, ui, fetchImpl });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(backendButton.hidden, true);
});

test('the backend pill stays hidden when the browser lacks Web Speech support, even with the key set', async () => {
  const openaiController = fakeController('openai');
  const claudeController = fakeController('claude');
  claudeController.isSupported = () => false;
  const backendButton = fakeButton();
  backendButton.hidden = true;
  const ui = { button: fakeButton(), backendButton };
  const fetchImpl = async () => jsonResponse({ keys: [{ id: 'anthropic', set: true }] });

  createVoiceBackendCoordinator({ openaiController, claudeController, ui, fetchImpl });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(backendButton.hidden, true);
});

test('isAnthropicKeyConfigured tolerates a failing or malformed status endpoint without throwing', async () => {
  assert.equal(await isAnthropicKeyConfigured(async () => { throw new Error('network down'); }), false);
  assert.equal(await isAnthropicKeyConfigured(async () => jsonResponse({}, { ok: false })), false);
  assert.equal(await isAnthropicKeyConfigured(async () => jsonResponse({ keys: [] })), false);
  assert.equal(await isAnthropicKeyConfigured(async () => jsonResponse({ keys: [{ id: 'openai', set: true }] })), false);
});
