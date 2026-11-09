import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIC_CONSTRAINTS, postSdpOffer, readAnswerSdp, stopStream, waitForIceComplete } from './gevLiveRtc.js';

const reply = (ok, status, body) => ({ ok, status, text: async () => body });

test('mic constraints keep echo cancellation on (no self-trigger loop)', () => {
  assert.equal(MIC_CONSTRAINTS.echoCancellation, true);
});

test('stopStream stops every track and tolerates a throwing or missing stream', () => {
  const stopped = [];
  stopStream({ getTracks: () => [{ stop: () => stopped.push(1) }, { stop: () => { throw new Error('gone'); } }] });
  assert.equal(stopped.length, 1);
  assert.doesNotThrow(() => stopStream(null));
});

test('waitForIceComplete resolves at once when complete, on the event, or after the cap', async () => {
  await waitForIceComplete({ iceGatheringState: 'complete' });
  const listeners = {};
  const pc = { iceGatheringState: 'gathering', addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: () => {} };
  const done = waitForIceComplete(pc, 10_000);
  pc.iceGatheringState = 'complete';
  listeners.icegatheringstatechange();
  await done;
  await waitForIceComplete({ iceGatheringState: 'new', addEventListener() {}, removeEventListener() {} }, 5);
});

test('postSdpOffer posts application/sdp to the route', async () => {
  let call;
  await postSdpOffer(async (url, init) => { call = { url, init }; return reply(true, 200, ''); }, '/api/live/session', 'v=0');
  assert.deepEqual(call, { url: '/api/live/session', init: { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0' } });
});

test('readAnswerSdp accepts raw SDP and the three JSON shapes, and throws with status + body on failure', async () => {
  assert.equal(await readAnswerSdp(reply(true, 201, 'v=0\r\no=- ans')), 'v=0\r\no=- ans');
  assert.equal(await readAnswerSdp(reply(true, 200, JSON.stringify({ sdp: 'a' }))), 'a');
  assert.equal(await readAnswerSdp(reply(true, 200, JSON.stringify({ answer: { sdp: 'b' } }))), 'b');
  assert.equal(await readAnswerSdp(reply(true, 200, JSON.stringify({ transport: { sdp: 'c' } }))), 'c');
  await assert.rejects(readAnswerSdp(reply(false, 429, '{"error":"voice_daily_limit"}')), /GPT-Live SDP failed: HTTP 429 - \{"error":"voice_daily_limit"\}/);
});
