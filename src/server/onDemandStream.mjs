/**
 * onDemandStream.mjs — viewer sessions for CCTV hosts that only run a camera's
 * HLS stream while someone is watching (Gresik: the public page calls
 * POST <control>/start, then POST <control>/heartbeat every 20 s, then
 * POST <control>/stop; the playlist 404s until the first start finishes).
 *
 * A source opts in with `onDemand: {controlUrl}` (same origin as its `url`).
 * The proxy keeps one server-side viewer per camera: it starts it on the first
 * browser request, keeps it alive while browsers keep fetching the playlist or
 * segments, and stops it once nobody has asked for a while. No credential is
 * used; the endpoints are the ones the host's own anonymous page calls.
 *
 * The host's start reply can carry the camera's RTSP credentials in its error
 * text. That text is never copied into an error, a log line or a browser
 * response here: callers only ever see a fixed generic message.
 *
 * Node-only (imported by cctvProxy.mjs), never bundled for the browser.
 */

import { randomUUID } from 'node:crypto';

/** Interval the host's own player uses for heartbeats. */
export const ON_DEMAND_HEARTBEAT_MS = 20 * 1000;
/** Stop the upstream viewer after this long without a browser request. */
export const ON_DEMAND_IDLE_MS = 60 * 1000;
const START_TIMEOUT_MS = 25 * 1000;
const CONTROL_TIMEOUT_MS = 10 * 1000;
/** The host writes the first playlist a few seconds after `start` answers. */
export const ON_DEMAND_PLAYLIST_ATTEMPTS = 10;
export const ON_DEMAND_PLAYLIST_DELAY_MS = 1000;

/** Generic, credential-free message for any failed start. */
export const ON_DEMAND_START_FAILED_MESSAGE = 'Camera offline at source (stream could not be started)';

/**
 * Validate a catalog `onDemand` object against the stream URL. `controlUrl`
 * must be http(s) on the same origin as the stream so a catalog entry can
 * never make the proxy call another host.
 * @param {unknown} raw
 * @param {string} sourceUrl
 * @returns {{controlUrl: string}|undefined}
 */
export function normalizeOnDemand(raw, sourceUrl) {
  if (!raw || typeof raw !== 'object') return undefined;
  try {
    const control = new URL(String(raw.controlUrl || ''));
    if (!/^https?:$/.test(control.protocol)) return undefined;
    if (control.origin !== new URL(sourceUrl).origin) return undefined;
    if (control.search || control.hash || control.username || control.password) return undefined;
    return { controlUrl: control.href.replace(/\/$/, '') };
  } catch {
    return undefined;
  }
}

/** Error whose message is always the fixed generic one. */
export class OnDemandStartError extends Error {
  constructor() {
    super(ON_DEMAND_START_FAILED_MESSAGE);
    this.name = 'OnDemandStartError';
  }
}

/**
 * Per-camera viewer-session manager with coalesced starts.
 * @param {object} options
 * @param {string} options.userAgent
 * @param {typeof fetch} [options.fetchFn]
 * @param {() => number} [options.now]
 * @param {() => string} [options.randomId]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {number} [options.heartbeatMs]
 * @param {number} [options.idleMs]
 */
export function createOnDemandStreamManager({
  userAgent,
  fetchFn = fetch,
  now = Date.now,
  randomId = randomUUID,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  heartbeatMs = ON_DEMAND_HEARTBEAT_MS,
  idleMs = ON_DEMAND_IDLE_MS,
} = {}) {
  /** @type {Map<string, {controlUrl: string, viewerId: string, lastTouch: number, timer: ReturnType<typeof setInterval>}>} */
  const sessions = new Map();
  /** @type {Map<string, Promise<void>>} */
  const starting = new Map();

  const call = (session, action, timeoutMs, extra = '') => fetchFn(
    `${session.controlUrl}/${action}?viewer_id=${encodeURIComponent(session.viewerId)}${extra}`,
    { method: 'POST', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) },
  );

  function drop(cameraId, { stop }) {
    const session = sessions.get(cameraId);
    if (!session) return;
    clearInterval(session.timer);
    sessions.delete(cameraId);
    if (stop) call(session, 'stop', CONTROL_TIMEOUT_MS).then((res) => res.body?.cancel?.(), () => {});
  }

  async function tick(cameraId) {
    const session = sessions.get(cameraId);
    if (!session) return;
    if (now() - session.lastTouch > idleMs) {
      drop(cameraId, { stop: true });
      return;
    }
    try {
      const res = await call(session, 'heartbeat', CONTROL_TIMEOUT_MS);
      await res.body?.cancel?.();
      // The host forgot this viewer: the next browser request must start a new one.
      if (!res.ok && sessions.get(cameraId) === session) drop(cameraId, { stop: false });
    } catch {
      // A missed heartbeat is retried on the next tick; the host expires the viewer on its own.
    }
  }

  async function start(cameraId, onDemand) {
    const session = {
      controlUrl: onDemand.controlUrl,
      viewerId: `eev-${randomId()}`,
      lastTouch: now(),
      timer: null,
    };
    let body = null;
    try {
      const res = await call(session, 'start', START_TIMEOUT_MS, '&context=public&quality=auto');
      body = await res.json().catch(() => null);
      if (!res.ok) body = null;
    } catch {
      body = null;
    }
    // `body.message` is deliberately never read: failed starts quote RTSP credentials.
    if (!body || body.ok !== true) throw new OnDemandStartError();
    session.lastTouch = now();
    session.timer = setInterval(() => { tick(cameraId); }, heartbeatMs);
    session.timer.unref?.();
    sessions.set(cameraId, session);
  }

  /**
   * Make sure a viewer is running for this camera and mark it as in use.
   * @param {string} cameraId
   * @param {{controlUrl: string}} onDemand
   * @throws {OnDemandStartError} When the host refuses or fails to start the stream.
   */
  async function ensure(cameraId, onDemand) {
    const existing = sessions.get(cameraId);
    if (existing) {
      existing.lastTouch = now();
      return;
    }
    if (!starting.has(cameraId)) {
      starting.set(cameraId, start(cameraId, onDemand).finally(() => starting.delete(cameraId)));
    }
    await starting.get(cameraId);
  }

  /** Mark the camera's viewer as in use (segment / sub-playlist requests). */
  function touch(cameraId) {
    const session = sessions.get(cameraId);
    if (session) session.lastTouch = now();
  }

  /**
   * Run `fetchOnce` until the playlist exists: the host answers 404 until its
   * first segments are written. When it never appears the viewer is dropped so
   * the next request starts a fresh one.
   * @param {string} cameraId
   * @param {() => Promise<Response>} fetchOnce
   * @returns {Promise<Response>}
   */
  async function fetchWhenReady(cameraId, fetchOnce) {
    let res = await fetchOnce();
    for (let attempt = 1; res.status === 404 && attempt < ON_DEMAND_PLAYLIST_ATTEMPTS; attempt += 1) {
      await res.body?.cancel?.();
      await sleep(ON_DEMAND_PLAYLIST_DELAY_MS);
      res = await fetchOnce();
    }
    if (res.status === 404) drop(cameraId, { stop: true });
    return res;
  }

  /** Stop every viewer (server shutdown). */
  function stopAll() {
    for (const cameraId of [...sessions.keys()]) drop(cameraId, { stop: true });
  }

  return { ensure, touch, fetchWhenReady, stopAll, activeCount: () => sessions.size };
}
