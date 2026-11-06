import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUDGE_URL, LAYER_EMPTY_CHECK_MS, MIC_SILENT_WINDOW_MS, TOOL_SLOW_MS, createLiveVoiceLog, toolResultEvent, voiceStatusEvent } from './liveVoiceLog.js';

function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => { pending.set(++id, { fn, ms }); return id; },
    clearTimer: (i) => pending.delete(i),
    fire: (ms) => [...pending].filter(([, t]) => t.ms === ms).forEach(([i, t]) => { pending.delete(i); t.fn(); }),
    count: () => pending.size,
  };
}

test('voiceStatusEvent maps the session lifecycle', () => {
  assert.equal(voiceStatusEvent('connecting', 'listening').code, 'voice.session_started');
  assert.equal(voiceStatusEvent('connecting', 'error', 'GPT-Live SDP failed: HTTP 429').code, 'voice.session_failed');
  assert.equal(voiceStatusEvent('listening', 'error', 'Data channel closed').code, 'voice.session_dropped');
  assert.equal(voiceStatusEvent('executing', 'error').code, 'voice.session_dropped');
  assert.equal(voiceStatusEvent('listening', 'idle', 'Sesi berakhir — batas durasi 10 menit').code, 'voice.session_auto_closed');
  assert.equal(voiceStatusEvent('listening', 'idle', 'Session ended — cost cap ~$5.00').code, 'voice.session_auto_closed');
  assert.equal(voiceStatusEvent('listening', 'idle'), null, 'a user stop is not an event');
  assert.equal(voiceStatusEvent('listening', 'executing'), null);
});

test('toolResultEvent classifies failures; success logs nothing', () => {
  assert.equal(toolResultEvent('fly_to_location', { ok: true }), null);
  assert.equal(toolResultEvent('read_screen', { ok: false, error: 'capture failed' }).code, 'voice.read_screen_failed');
  assert.equal(toolResultEvent('set_layer_visibility', { ok: false, cancelled: true, error: 'Layer request was superseded by a newer voice turn' }).code, 'voice.tool_superseded');
  assert.equal(toolResultEvent('set_layer_visibility', { ok: false, error: 'Unknown data layer: boats' }).code, 'voice.tool_invalid_args');
  const failed = toolResultEvent('fly_to_location', { ok: false, error: 'Geocoder unavailable' });
  assert.deepEqual([failed.code, failed.level, failed.detail], ['voice.tool_failed', 'warn', { tool: 'fly_to_location' }]);
});

test('observer logs status and tool events and posts judged turns', async () => {
  const t = fakeTimers();
  const logged = [];
  const posts = [];
  const vl = createLiveVoiceLog({ log: (e) => logged.push(e), fetchImpl: async (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return { ok: true }; }, ...t });
  vl.observer.onStatus('connecting');
  vl.observer.onStatus('listening');
  vl.observer.onInput('terbang ke Surabaya');
  vl.observer.onTool('fly_to_location');
  vl.observer.onToolResult('fly_to_location', { ok: false, error: 'Geocoder unavailable' });
  vl.observer.onOutput('Sudah saya terbangkan.');
  vl.sessionEnded({ seconds: 42.4 });
  await Promise.resolve();
  assert.deepEqual(logged.map((e) => e.code), ['voice.session_started', 'voice.tool_failed', 'voice.session_ended']);
  assert.deepEqual(logged[2].detail, { seconds: 42 });
  assert.equal(posts[0].url, JUDGE_URL);
  assert.deepEqual(posts[0].body, { question: 'terbang ke Surabaya', answer: 'Sudah saya terbangkan.', failedTools: ['fly_to_location'] });
});

test('wrapRunner logs a slow tool and an empty layer, without changing the result', async () => {
  const t = fakeTimers();
  const logged = [];
  const vl = createLiveVoiceLog({ log: (e) => logged.push(e), ...t });
  let release;
  const slowRunner = vl.wrapRunner(() => new Promise((r) => { release = r; }));
  const pending = slowRunner('fly_to_location', {});
  t.fire(TOOL_SLOW_MS);
  release({ ok: true });
  assert.deepEqual(await pending, { ok: true });
  assert.deepEqual(logged.map((e) => e.code), ['voice.tool_slow']);

  const layerRunner = vl.wrapRunner(async () => ({ ok: true, layerId: 'firms' }), { getLayerCount: () => 0 });
  await layerRunner('set_layer_visibility', { layerId: 'firms', enabled: true });
  assert.equal(t.count(), 1, 'the slow timer was cleared; only the empty check is pending');
  t.fire(LAYER_EMPTY_CHECK_MS);
  assert.equal(logged[1].code, 'voice.layer_empty');
});

function fakeInterval() {
  let tick = null;
  return { setIntervalFn: (fn) => { tick = fn; return 1; }, clearIntervalFn: () => { tick = null; }, run: (n) => { for (let i = 0; i < n && tick; i += 1) tick(); }, active: () => tick !== null };
}

test('a mic that never moves in the first window is logged once; a moving mic or no meter is not', () => {
  for (const [levels, expected] of [[0.001, ['voice.mic_silent']], [0.3, []], [null, []]]) {
    const iv = fakeInterval();
    const logged = [];
    const vl = createLiveVoiceLog({ log: (e) => logged.push(e), readMicLevel: () => levels, ...iv });
    vl.observer.onStatus('connecting');
    vl.observer.onStatus('listening');
    iv.run(MIC_SILENT_WINDOW_MS / 1000 + 5);
    assert.deepEqual(logged.filter((e) => e.code !== 'voice.session_started').map((e) => e.code), expected, String(levels));
    assert.equal(iv.active(), false, 'the watch stops after its window');
  }
});
