import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GevLiveController, LIVE_SESSION_URL } from './gevLiveSession.js';

// --- Browser fakes -------------------------------------------------------
function makeTrack(kind = 'audio') {
  return { kind, enabled: true, stopped: false, stop() { this.stopped = true; } };
}
function makeStream(tracks) {
  return {
    tracks,
    getTracks() { return this.tracks; },
    getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); },
  };
}
function makeMediaDevices(stream) {
  return { calls: 0, lastConstraints: null, async getUserMedia(c) { this.calls += 1; this.lastConstraints = c; return stream; } };
}
class FakeDataChannel {
  constructor(label) {
    this.label = label;
    this.readyState = 'connecting';
    this.sent = [];
    this._listeners = {};
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  _emit(type, ev = {}) { (this._listeners[type] || []).forEach((fn) => fn(ev)); }
  open() { this.readyState = 'open'; this._emit('open'); }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 'closed'; }
}
class FakeRTCPeerConnection {
  constructor() {
    this.iceGatheringState = 'complete';
    this.iceConnectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.tracks = [];
    this.channel = null;
    this.closed = false;
    this.ontrack = null;
    this.oniceconnectionstatechange = null;
    this._listeners = {};
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  addTrack(track) { this.tracks.push(track); }
  createDataChannel(label) { this.channel = new FakeDataChannel(label); return this.channel; }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- off' }; }
  async setLocalDescription(desc) { this.localDescription = { type: desc.type, sdp: desc.sdp }; }
  async setRemoteDescription(desc) { this.remoteDescription = desc; }
  close() { this.closed = true; }
}
function makeDocument() {
  const removed = [];
  const appended = [];
  const makeEl = () => ({ dataset: {}, style: {}, srcObject: null, autoplay: false, muted: false, remove() { removed.push(this); } });
  return {
    removed,
    appended,
    createElement() { return makeEl(); },
    querySelectorAll() { return []; },
    body: { appendChild(el) { appended.push(el); } },
  };
}
function makeFetch(answer = 'v=0\r\no=- ans') {
  const f = async () => ({ ok: true, status: 201, async text() { return answer; } });
  return f;
}

function makeController(over = {}) {
  const stream = makeStream([makeTrack('audio')]);
  const mediaDevices = over.mediaDevices || makeMediaDevices(stream);
  const documentRef = over.documentRef || makeDocument();
  let lastPc = null;
  const rtcPeerConnection = over.rtcPeerConnection || function () { lastPc = new FakeRTCPeerConnection(); return lastPc; };
  // A controllable clock + captured interval so the cost meter is deterministic
  // (and never leaves a real timer running across tests).
  const clock = { nowMs: 0, tick: null };
  const ctrl = new GevLiveController({
    runner: over.runner || (async () => ({ ok: true })),
    ui: over.ui || null,
    limits: over.limits,
    fetchImpl: over.fetchImpl || makeFetch(),
    mediaDevices,
    rtcPeerConnection,
    documentRef,
    nowFn: over.nowFn || (() => clock.nowMs),
    setIntervalFn: over.setIntervalFn || ((fn) => { clock.tick = fn; return 1; }),
    clearIntervalFn: over.clearIntervalFn || (() => { clock.tick = null; }),
  });
  return { ctrl, stream, mediaDevices, documentRef, clock, getPc: () => lastPc };
}

// --- Tests ---------------------------------------------------------------

test('start() negotiates a session and opens to listening', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, opts) => { fetchCalls.push({ url, opts }); return { ok: true, status: 201, async text() { return 'v=0\r\no=- ans'; } }; };
  const { ctrl, getPc } = makeController({ fetchImpl });
  await ctrl.start();
  const pc = getPc();
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, LIVE_SESSION_URL);
  assert.equal(fetchCalls[0].opts.headers['Content-Type'], 'application/sdp');
  assert.equal(pc.channel.label, 'oai-events');
  assert.equal(pc.remoteDescription.type, 'answer');
  assert.equal(ctrl.status, 'connecting', 'listening is reached on channel open, which the fake has not emitted yet');
  pc.channel.open();
  assert.equal(ctrl.status, 'listening');
  assert.ok(ctrl.isActive());
});

test('mic constraints preserve echoCancellation', async () => {
  const { ctrl, mediaDevices } = makeController();
  await ctrl.start();
  assert.equal(mediaDevices.lastConstraints.audio.echoCancellation, true);
  assert.equal(mediaDevices.lastConstraints.audio.noiseSuppression, true);
  assert.equal(mediaDevices.lastConstraints.audio.channelCount, 1);
});

test('a tool call on the channel is executed and answered', async () => {
  const runner = async (name, args) => ({ ok: true, echo: { name, args } });
  const { ctrl, getPc } = makeController({ runner });
  await ctrl.start();
  const dc = getPc().channel;
  dc.open();
  const msg = { type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'function_call', name: 'set_layer_visibility', call_id: 'c1', arguments: '{"layer":"ships"}' } } };
  await dc._listeners.message[0]({ data: JSON.stringify(msg) });
  const out = dc.sent.map((s) => JSON.parse(s));
  assert.equal(out[0].type, 'response.item.create');
  assert.equal(out[0].item.call_id, 'c1');
  assert.equal(out[1].type, 'response.create');
  assert.equal(ctrl.status, 'listening', 'returns to listening after the tool');
});

test('setMicrophoneEnabled gates the audio track', async () => {
  const { ctrl, stream } = makeController();
  await ctrl.start();
  ctrl.setMicrophoneEnabled(false);
  assert.equal(stream.getAudioTracks()[0].enabled, false);
  ctrl.setMicrophoneEnabled(true);
  assert.equal(stream.getAudioTracks()[0].enabled, true);
});

test('stop() tears down peer, channel, stream and returns to idle', async () => {
  const { ctrl, stream, getPc } = makeController();
  await ctrl.start();
  const pc = getPc();
  pc.channel.open();
  ctrl.stop();
  assert.equal(ctrl.status, 'idle');
  assert.equal(pc.closed, true);
  assert.equal(pc.channel.readyState, 'closed');
  assert.equal(stream.getAudioTracks()[0].stopped, true);
  assert.equal(ctrl.isActive(), false);
});

test('a failing SDP exchange surfaces as error status, not a thrown rejection', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, async text() { return 'tier not allowed'; } });
  const { ctrl, stream } = makeController({ fetchImpl });
  await ctrl.start();
  assert.equal(ctrl.status, 'error');
  assert.match(ctrl.lastError, /403/);
  assert.equal(stream.getAudioTracks()[0].stopped, true, 'mic released on failure');
});

test('a getUserMedia denial does not leave a dangling peer connection', async () => {
  const mediaDevices = { async getUserMedia() { throw new Error('NotAllowedError'); } };
  const { ctrl } = makeController({ mediaDevices });
  await ctrl.start();
  assert.equal(ctrl.status, 'error');
  assert.match(ctrl.lastError, /NotAllowedError/);
});

test('start() is a no-op while already active', async () => {
  const { ctrl, mediaDevices, getPc } = makeController();
  await ctrl.start();
  getPc().channel.open();
  await ctrl.start();
  assert.equal(mediaDevices.calls, 1, 'second start did not re-acquire the mic');
});

test('getDiagnostics reports backend and channel state', async () => {
  const { ctrl, getPc } = makeController();
  await ctrl.start();
  getPc().channel.open();
  const d = ctrl.getDiagnostics();
  assert.equal(d.backend, 'gpt-live-1');
  assert.equal(d.status, 'listening');
  assert.equal(d.channelOpen, true);
  assert.equal(d.ratePerMin, 0.05);
});

test('the per-minute cost meter starts on channel open and paints the readout', async () => {
  const costValue = { dataset: {} };
  const ui = { status: { }, detail: {}, root: { dataset: {} }, costValue };
  const { ctrl, getPc, clock } = makeController({ ui });
  await ctrl.start();
  getPc().channel.open();
  clock.nowMs = 120 * 1000; // 2 minutes
  clock.tick();
  assert.equal(costValue.textContent, '~$0.10');
  assert.equal(ctrl.getDiagnostics().costUsd, 0.1);
});

test('the hard spend cap ends the session through the normal stop path', async () => {
  const ui = { status: {}, detail: {}, root: { dataset: {} }, costValue: { dataset: {} } };
  const { ctrl, getPc, stream, clock } = makeController({ ui, limits: { warnUsd: 2, capUsd: 5 } });
  await ctrl.start();
  getPc().channel.open();
  clock.nowMs = 6000 * 1000; // $5.00 at $0.05/min
  clock.tick();
  assert.equal(ctrl.status, 'idle');
  assert.match(ui.detail.textContent, /cost cap/);
  assert.equal(stream.getAudioTracks()[0].stopped, true, 'mic released at the cap');
});

test('a server usage duration reconciles the meter', async () => {
  const { ctrl, getPc } = makeController();
  await ctrl.start();
  const dc = getPc().channel;
  dc.open();
  await dc._listeners.message[0]({ data: JSON.stringify({ type: 'session.usage.updated', usage: { seconds: 180 } }) });
  assert.equal(ctrl.usageSeconds, 180);
  assert.ok(Math.abs(ctrl.getDiagnostics().costUsd - 0.15) < 1e-9);
});
