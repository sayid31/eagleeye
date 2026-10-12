import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import {
  createLiveUpstreamAbort,
  FLV_CONTENT_TYPE,
  LIVE_STREAM_HEADER_TIMEOUT_MS,
  pipeLiveStream,
} from './liveStreamProxy.mjs';

test('the upstream fetch is aborted when the browser connection closes', () => {
  const res = new EventEmitter();
  const abort = createLiveUpstreamAbort(res, { headerTimeoutMs: 60_000 });
  assert.equal(abort.signal.aborted, false);
  res.emit('close');
  assert.equal(abort.signal.aborted, true);
  assert.equal(abort.clientGone(), true);
  assert.equal(abort.timedOut(), false);
});

test('a source that never answers is aborted after the header timeout and flagged timed out', async () => {
  const res = new EventEmitter();
  const abort = createLiveUpstreamAbort(res, { headerTimeoutMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(abort.signal.aborted, true);
  assert.equal(abort.timedOut(), true);
  assert.equal(abort.clientGone(), false);
});

test('receiving headers cancels the timeout, so a healthy long-lived stream is never cut', async () => {
  const res = new EventEmitter();
  const abort = createLiveUpstreamAbort(res, { headerTimeoutMs: 20 });
  abort.headersReceived();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(abort.signal.aborted, false);
  res.emit('close');
});

test('the default header timeout is longer than a slow-but-working source and shorter than a probe of a dead one', () => {
  assert.ok(LIVE_STREAM_HEADER_TIMEOUT_MS > 8_000);
  assert.ok(LIVE_STREAM_HEADER_TIMEOUT_MS < 25_000);
});

function fakeRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  res.head = null;
  res.writeHead = (status, headers) => { res.head = { status, headers }; };
  return { res, chunks };
}

test('pipeLiveStream sets the FLV content type even though the upstream sent none, and forwards the bytes', async () => {
  const { res, chunks } = fakeRes();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0x46, 0x4c, 0x56, 0x01]));
      controller.close();
    },
  });
  pipeLiveStream(res, { body });
  await new Promise((resolve) => res.on('finish', resolve));
  assert.equal(res.head.status, 200);
  assert.equal(res.head.headers['Content-Type'], FLV_CONTENT_TYPE);
  assert.equal(res.head.headers['Cache-Control'], 'no-store');
  assert.equal(Buffer.concat(chunks).toString('latin1'), 'FLV\x01');
});

test('pipeLiveStream cancels the upstream read when the browser closes mid-stream', async () => {
  const { res } = fakeRes();
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1])); return new Promise((r) => setTimeout(r, 5)); },
    cancel() { cancelled = true; },
  });
  pipeLiveStream(res, { body });
  await new Promise((resolve) => setTimeout(resolve, 20));
  res.destroy();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(cancelled, true);
});

test('pipeLiveStream ends the response when the upstream has no body', () => {
  const { res } = fakeRes();
  pipeLiveStream(res, { body: null });
  assert.equal(res.writableEnded, true);
});
