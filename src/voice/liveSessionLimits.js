// src/voice/liveSessionLimits.js
/**
 * Session-length, idle and daily-minutes guard for one GPT-Live session.
 *
 * The owner's limits (AI Configuration → General) are read from
 * `/api/voice/config`; this guard closes the session in the browser when one
 * is reached. The daily cap is additionally enforced server-side when a new
 * session is created (`dailyLimitRefusal`), so a client that skips this guard
 * still cannot start a session once the day's minutes are gone.
 *
 * "Idle" means no conversation activity: no user speech, no assistant speech
 * and no tool call. Usage events alone do not count as activity.
 *
 * Clock and timers are injected (defaulting to real globals) for tests; the
 * default interval is unref'd so a forgotten guard never keeps Node alive.
 *
 * @module voice/liveSessionLimits
 */

/** Spoken-UI reasons shown on the mic detail line when a limit closes a session. */
export const SESSION_LIMIT_MESSAGES = Object.freeze({
  session: (minutes) => `Sesi berakhir — batas durasi ${minutes} menit`,
  daily: () => 'Sesi berakhir — menit suara harian habis',
  idle: (seconds) => `Sesi berakhir — tidak ada percakapan ${seconds} detik`,
});

const TICK_MS = 1000;
const positive = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Which limit ends the session first, from the owner's settings and the
 * seconds left today. Pure.
 * @param {{sessionMinutes?: number, idleSeconds?: number, remainingSeconds?: number | null}} [limits]
 * @returns {{maxSeconds: number, maxReason: 'session' | 'daily' | null, idleSeconds: number, sessionMinutes: number}}
 */
export function resolveSessionLimits({ sessionMinutes, idleSeconds, remainingSeconds } = {}) {
  const sessionSeconds = positive(sessionMinutes) * 60;
  const daily = typeof remainingSeconds === 'number' && Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : null;
  let maxSeconds = sessionSeconds || Infinity;
  let maxReason = sessionSeconds ? 'session' : null;
  if (daily !== null && daily < maxSeconds) {
    maxSeconds = daily;
    maxReason = 'daily';
  }
  return { maxSeconds, maxReason, idleSeconds: positive(idleSeconds), sessionMinutes: positive(sessionMinutes) };
}

/**
 * @param {object} [params]
 * @param {(reason: {kind: 'session'|'daily'|'idle', message: string}) => void} [params.onLimit] Fires once per session.
 * @param {() => number} [params.now]
 * @param {(fn: Function, ms: number) => any} [params.setIntervalFn]
 * @param {(id: any) => void} [params.clearIntervalFn]
 */
export function createSessionLimitGuard({ onLimit, now = () => Date.now(), setIntervalFn, clearIntervalFn } = {}) {
  const si = setIntervalFn || ((fn, ms) => { const id = setInterval(fn, ms); id?.unref?.(); return id; });
  const ci = clearIntervalFn || ((id) => clearInterval(id));
  let configured = resolveSessionLimits();
  // Limits of the RUNNING session, snapshotted at start() so a mid-session
  // configure() cannot shorten or lengthen a session already under way.
  let active = configured;
  let running = false;
  let timer = null;
  let startMs = 0;
  let lastActivityMs = 0;
  let fired = false;

  const fire = (kind) => {
    if (fired) return;
    fired = true;
    const message = kind === 'idle'
      ? SESSION_LIMIT_MESSAGES.idle(active.idleSeconds)
      : SESSION_LIMIT_MESSAGES[kind](active.sessionMinutes);
    onLimit?.({ kind, message });
  };

  const check = () => {
    const t = now();
    if ((t - startMs) / 1000 >= active.maxSeconds) return fire(active.maxReason);
    if (active.idleSeconds && (t - lastActivityMs) / 1000 >= active.idleSeconds) fire('idle');
  };

  return {
    /** Apply new limits; takes effect at the next `start()`. */
    configure(next) { configured = resolveSessionLimits(next); },
    limits: () => configured,
    isRunning: () => running,
    start() {
      running = true;
      fired = false;
      active = configured;
      startMs = now();
      lastActivityMs = startMs;
      // No limit configured: nothing to watch, but the session still counts as running.
      if (active.maxSeconds !== Infinity || active.idleSeconds) timer = si(check, TICK_MS);
    },
    /** Conversation activity (speech either way, or a tool call) resets the idle clock. */
    touch() { lastActivityMs = now(); },
    /** @returns {boolean} whether a session was running. */
    stop() {
      if (!running) return false;
      running = false;
      if (timer !== null) { ci(timer); timer = null; }
      return true;
    },
  };
}
