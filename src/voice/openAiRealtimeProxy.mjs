/**
 * openAiRealtimeProxy.mjs — Vite dev/preview plugin for the OpenAI Realtime
 * voice backend: ephemeral WebRTC client-secret minting, the five-word HUD
 * scene-summary endpoint, and an opt-in Realtime conversation debug logger.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * Keeps OPENAI_API_KEY server-side; the browser only ever receives a
 * short-lived `/api/realtime/token` client secret for its WebRTC session,
 * never the key itself (see docs/CURRENT-STATE.md's Voice Control section).
 * Lives under src/voice/ (not src/data/) because it already depends heavily
 * on this project's voice-domain modules (voiceCost.js, toolSchemas.js,
 * voiceSystemPrompt.js) rather than being a generic upstream-API proxy.
 *
 * @module voice/openAiRealtimeProxy
 */

import fs from 'node:fs';
import path from 'node:path';
import { enforceOptInRateLimit, openAiRateLimiter } from '../server/proxyInfra.mjs';
import { keylessHudSummaryResponse } from '../hudSummaryResponse.js';
import { VOICE_MODELS, isKnownVoiceTier, resolveVoiceModel } from './voiceCost.js';
import { GEV_TOOL_SCHEMAS, toOpenAiRealtimeTools } from './toolSchemas.js';
import { GEV_VOICE_SYSTEM_PROMPT } from './voiceSystemPrompt.js';

// Sourced from the shared voice-model registry so the client's cost estimate
// can never be computed against a different model than the session runs on.
const OPENAI_REALTIME_MODEL_DEFAULT = VOICE_MODELS.standard.id;
const OPENAI_REALTIME_MODEL_MINI_DEFAULT = VOICE_MODELS.mini.id;
const OPENAI_REALTIME_VOICE_DEFAULT = 'marin';
const OPENAI_REALTIME_REASONING_DEFAULT = 'low';
const OPENAI_REALTIME_CONTEXT_TOKENS_DEFAULT = 3000;
const OPENAI_REALTIME_CONTEXT_RETENTION_DEFAULT = 0.5;
const OPENAI_HUD_SUMMARY_MODEL_DEFAULT = 'gpt-5-nano';
// Mirrors vite.config.js's former use of module-relative __dirname for this
// path (this module now runs from src/voice/, so `process.cwd()` — the repo
// root the dev server is always launched from — is used instead, matching
// the sibling proxy modules' precedent, e.g. rocketLaunchesProxy.mjs's cache
// path).
const REALTIME_DEBUG_LOG_DIR = path.join(process.cwd(), '.gev-logs');
const REALTIME_DEBUG_LOG_FILE = path.join(REALTIME_DEBUG_LOG_DIR, 'realtime-conversations.jsonl');
const REALTIME_DEBUG_LOG_MAX_BYTES = 8 * 1024 * 1024;

function readRequestBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function openAiRealtimeProxy() {
  function install(middlewares) {
    middlewares.use('/api/openai/hud-summary', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const apiKey = process.env.OPENAI_API_KEY;
      const keyless = keylessHudSummaryResponse(apiKey);
      if (keyless) {
        res.statusCode = keyless.statusCode;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(keyless.payload));
        return;
      }

      // Opt-in per-IP throttle (GEV_RATELIMIT_OPENAI_PER_MIN). Keyless HUD
      // fallback has no provider cost and resolves above without consuming a
      // paid-endpoint quota slot.
      if (!enforceOptInRateLimit(openAiRateLimiter(), req, res)) return;

      try {
        const body = await readRequestBody(req, 64 * 1024);
        const context = JSON.parse(body || '{}');
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OPENAI_HUD_SUMMARY_MODEL || OPENAI_HUD_SUMMARY_MODEL_DEFAULT,
            instructions: [
              "Write one concise intelligence-HUD summary for EagleEye View.",
              'Use only the supplied place, street, nearby-place, and enabled-layer text labels.',
              'Prefer the clearest named place and include a relevant enabled layer only when useful.',
              'Do not infer from coordinates or invent a place.',
              'Output exactly five words with no title, punctuation, markdown, or introductory phrase.',
            ].join(' '),
            input: JSON.stringify(context),
            reasoning: { effort: 'minimal' },
            max_output_tokens: 100,
          }),
        });
        const data = await response.json().catch(() => ({}));
        const summary = toFiveWordHudSummary(extractOpenAiResponseText(data));
        res.statusCode = response.ok && summary ? 200 : response.status || 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
          summary: summary || null,
          error: response.ok ? null : data.error?.message || 'OpenAI HUD summary request failed',
        }));
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error?.message || 'OpenAI HUD summary request failed' }));
      }
    });

    middlewares.use('/api/realtime/debug-log', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        const body = await readRequestBody(req, REALTIME_DEBUG_LOG_MAX_BYTES);
        const record = JSON.parse(body || '{}');
        fs.mkdirSync(REALTIME_DEBUG_LOG_DIR, { recursive: true });
        fs.appendFileSync(REALTIME_DEBUG_LOG_FILE, `${JSON.stringify({
          loggedAt: new Date().toISOString(),
          ...record,
        })}\n`);
        res.statusCode = 204;
        res.end();
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error?.message || 'Failed to write Realtime debug log' }));
      }
    });

    middlewares.use('/api/realtime/token', async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Opt-in per-IP throttle (GEV_RATELIMIT_OPENAI_PER_MIN). No-op when unset.
      if (!enforceOptInRateLimit(openAiRateLimiter(), req, res)) return;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not set' }));
        return;
      }

      // Voice model tier, requested by the client as ?tier=standard|mini.
      // resolveVoiceModel is total: an unknown, empty, or hostile value
      // resolves to `standard` instead of reaching OpenAI as a model id, so a
      // bad querystring degrades to a normal session rather than a dead mic.
      // The env overrides stay authoritative per tier (see .env.example) —
      // a wrong upstream model id is then a config fix, not a code change.
      const requestedTier = (() => {
        try {
          return new URL(req.url || '', 'http://localhost').searchParams.get('tier');
        } catch {
          return null;
        }
      })();
      const tier = resolveVoiceModel(requestedTier).tier;
      const model =
        tier === 'mini'
          ? process.env.OPENAI_REALTIME_MODEL_MINI || OPENAI_REALTIME_MODEL_MINI_DEFAULT
          : process.env.OPENAI_REALTIME_MODEL || OPENAI_REALTIME_MODEL_DEFAULT;
      const voice = process.env.OPENAI_REALTIME_VOICE || OPENAI_REALTIME_VOICE_DEFAULT;
      const effort = process.env.OPENAI_REALTIME_REASONING_EFFORT || OPENAI_REALTIME_REASONING_DEFAULT;
      const contextTokenLimit = Math.round(Math.max(
        1000,
        Math.min(12000, Number(process.env.OPENAI_REALTIME_CONTEXT_TOKENS) || OPENAI_REALTIME_CONTEXT_TOKENS_DEFAULT)
      ));
      const contextRetentionRatio = Math.max(
        0.1,
        Math.min(1, Number(process.env.OPENAI_REALTIME_CONTEXT_RETENTION) || OPENAI_REALTIME_CONTEXT_RETENTION_DEFAULT)
      );
      const sessionConfig = {
        session: {
          type: 'realtime',
          model,
          reasoning: { effort },
          truncation: {
            type: 'retention_ratio',
            retention_ratio: contextRetentionRatio,
            token_limits: {
              post_instructions: contextTokenLimit,
            },
          },
          audio: {
            input: {
              noise_reduction: { type: 'near_field' },
              turn_detection: {
                type: 'semantic_vad',
                eagerness: 'low',
                create_response: true,
                interrupt_response: false,
              },
            },
            output: { voice },
          },
          instructions: GEV_VOICE_SYSTEM_PROMPT,
          tools: GEV_REALTIME_TOOLS,
          tool_choice: 'auto',
        },
      };

      try {
        const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Safety-Identifier': 'gev-local-dev',
          },
          body: JSON.stringify(sessionConfig),
        });
        const body = await response.text();
        res.statusCode = response.status;
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        // Which tier/model this secret was actually minted for. The upstream
        // body is passed through untouched (the client parses it verbatim), so
        // these headers are the authoritative echo — including the case where a
        // bogus ?tier= was silently downgraded to standard.
        res.setHeader('X-GEV-Voice-Tier', tier);
        res.setHeader('X-GEV-Voice-Model', model);
        if (requestedTier && !isKnownVoiceTier(requestedTier)) {
          res.setHeader('X-GEV-Voice-Tier-Fallback', '1');
        }
        res.end(body);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error?.message || 'Failed to create Realtime token' }));
      }
    });
  }

  return {
    name: 'openai-realtime-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

function extractOpenAiResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (!Array.isArray(data?.output)) return '';
  return data.output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => part?.text || part?.output_text || '')
    .join(' ')
    .trim();
}

function toFiveWordHudSummary(value) {
  return String(value || '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
}

const GEV_REALTIME_TOOLS = toOpenAiRealtimeTools(GEV_TOOL_SCHEMAS);
