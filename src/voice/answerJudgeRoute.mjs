// src/voice/answerJudgeRoute.mjs
/**
 * POST /api/voice/judge — the mic posts one finished turn; the server answers
 * 202 at once and judges in the background (answerJudge.mjs), writing only
 * the verdict to the Server Log and the call's cost to the usage ledger.
 *
 * Config (env, names only): `GEV_VOICE_JUDGE=off` turns the model off (the
 * free secret-pattern check still runs);
 * `GEV_VOICE_JUDGE_DAILY_MAX` caps judge calls per local day (default 300);
 * `OPENAI_JUDGE_MODEL` overrides the model. Without OPENAI_API_KEY it judges
 * nothing.
 *
 * @module voice/answerJudgeRoute
 */

import { isSameOriginJson } from '../server/sameOrigin.mjs';
import { judgeCallsOn } from './voiceUsageCore.mjs';
import { JUDGE_MODEL_DEFAULT, judgeTurn, looksSecret, validateJudgeTurn, verdictLogEvent } from './answerJudge.mjs';

export const JUDGE_DAILY_MAX_DEFAULT = 300;
const MAX_BODY_BYTES = 8 * 1024;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** `GEV_VOICE_JUDGE_DAILY_MAX` → whole number ≥ 0; junk falls back to the default. */
export function judgeDailyMax(env) {
  const n = Number(env.GEV_VOICE_JUDGE_DAILY_MAX);
  return Number.isInteger(n) && n >= 0 ? n : JUDGE_DAILY_MAX_DEFAULT;
}

/**
 * Decide whether to call the model for this turn. Pure.
 * @returns {{judge: true} | {judge: false, reason: string, event?: object}}
 */
export function judgeGate(turn, { env, callsToday }) {
  // The secret pattern check costs nothing, so it runs even with the judge off.
  if (looksSecret(turn.answer)) {
    return { judge: false, reason: 'secret_like', event: { level: 'error', source: 'judge', code: 'judge.secret_like', message: 'A voice answer contained something that looks like a key, token or email' } };
  }
  if (String(env.GEV_VOICE_JUDGE ?? '').toLowerCase() === 'off') return { judge: false, reason: 'disabled' };
  if (!String(env.OPENAI_API_KEY ?? '').trim()) return { judge: false, reason: 'no_key' };
  const max = judgeDailyMax(env);
  if (callsToday >= max) {
    return { judge: false, reason: 'daily_cap', event: { level: 'warn', source: 'judge', code: 'judge.daily_cap', message: `Off-topic judge paused: ${max} calls already made today (GEV_VOICE_JUDGE_DAILY_MAX)` } };
  }
  return { judge: true };
}

/**
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {{read: Function, today: () => string, recordJudge: (usd: number) => void}} deps.usageStore
 * @param {(event: object) => void} deps.log Server Log producer.
 * @param {(req: any, maxBytes?: number) => Promise<string>} deps.readRequestBody
 * @param {() => object} [deps.env]
 * @param {typeof fetch} [deps.fetchFn]
 * @param {(req: any, res: any) => boolean} [deps.enforceRateLimit] Returns false when it already responded.
 * @returns {{pending: () => Promise<void>}} `pending()` resolves when background judging is idle (tests).
 */
export function installAnswerJudgeRoute(middlewares, {
  usageStore, log, readRequestBody, env = () => process.env, fetchFn = fetch, enforceRateLimit = () => true,
}) {
  let inflight = Promise.resolve();

  async function judgeInBackground(turn, e) {
    const result = await judgeTurn(turn, { apiKey: e.OPENAI_API_KEY, model: e.OPENAI_JUDGE_MODEL || JUDGE_MODEL_DEFAULT, fetchFn });
    try { usageStore.recordJudge(result.costUsd); } catch (error) { console.warn(`[judge] could not record cost: ${error?.message || error}`); }
    if (!result.verdict) {
      log({ level: 'warn', source: 'judge', code: 'judge.failed', message: `Off-topic judge could not rate a voice answer (${result.error})` });
      return;
    }
    const event = verdictLogEvent(result.verdict, turn.failedTools);
    if (event) log(event);
  }

  middlewares.use('/api/voice/judge', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!isSameOriginJson(req)) return sendJson(res, 403, { error: 'Origin tidak diizinkan' });
    if (!enforceRateLimit(req, res)) return undefined;
    let parsed;
    try {
      parsed = JSON.parse(await readRequestBody(req, MAX_BODY_BYTES));
    } catch {
      return sendJson(res, 400, { error: 'Body bukan JSON yang valid atau terlalu besar' });
    }
    const turn = validateJudgeTurn(parsed);
    if (!turn.ok) return sendJson(res, 422, { error: turn.error });
    const e = env();
    const gate = judgeGate(turn.value, { env: e, callsToday: judgeCallsOn(usageStore.read(), usageStore.today()) });
    if (!gate.judge) {
      if (gate.event) log(gate.event);
      return sendJson(res, 200, { judged: false, reason: gate.reason });
    }
    sendJson(res, 202, { judged: true });
    inflight = inflight.then(() => judgeInBackground(turn.value, e)).catch((error) => {
      console.warn(`[judge] background judging failed: ${error?.message || error}`);
    });
    return undefined;
  });

  return { pending: () => inflight };
}
