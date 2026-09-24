/**
 * anthropicProxy.mjs — Vite dev/preview plugin: Anthropic Messages API proxy
 * for the Claude/Web Speech voice backend (see docs/CURRENT-STATE.md's Voice
 * Control section).
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * Keeps ANTHROPIC_API_KEY server-side. Unlike `openAiRealtimeProxy`'s
 * `/api/realtime/token` (which mints an ephemeral client secret for a
 * browser-to-OpenAI WebRTC connection), this proxy is a plain pass-through
 * request/response endpoint: Web Speech API recognition is turn-based (one
 * transcript per utterance), so there is no continuous session to hand the
 * browser a secret for, and no streaming benefit to preserve — a single JSON
 * POST per turn (or per tool-loop round-trip) is enough.
 *
 * The client sends only `{messages, system?, tier?}` — `tools` is never
 * accepted from the client. The tool list is injected here, server-side,
 * from the same `GEV_TOOL_SCHEMAS` the OpenAI Realtime proxy derives its own
 * tool list from (see toolSchemas.js), so the two backends can never expose
 * a different set of callable actions to a user. Likewise `system` defaults
 * server-side to `GEV_CLAUDE_VOICE_SYSTEM_PROMPT` (see voiceSystemPrompt.js)
 * when the client omits it, so the persona/tool-usage contract can't drift
 * from what the OpenAI Realtime backend enforces — a client-supplied
 * `system` (if ever added) would still be allowed to override it, same
 * trust boundary as `tier`.
 *
 * Lives under src/voice/ (not src/data/) because it already depends heavily
 * on this project's voice-domain modules, mirroring openAiRealtimeProxy.mjs.
 *
 * @module voice/anthropicProxy
 */

import { enforceOptInRateLimit, anthropicRateLimiter } from '../server/proxyInfra.mjs';
import {
  VOICE_MODELS as CLAUDE_VOICE_MODELS,
  isKnownVoiceTier as isKnownClaudeVoiceTier,
  resolveVoiceModel as resolveClaudeVoiceModel,
} from './claudeVoiceCost.js';
import { GEV_TOOL_SCHEMAS, toAnthropicTools } from './toolSchemas.js';
import { GEV_CLAUDE_VOICE_SYSTEM_PROMPT } from './voiceSystemPrompt.js';

// Same pattern as the OpenAI defaults in openAiRealtimeProxy.mjs: sourced
// from the shared Claude-voice-model registry so the client's cost estimate
// can never be computed against a different model than the request actually
// ran on.
const ANTHROPIC_VOICE_MODEL_DEFAULT = CLAUDE_VOICE_MODELS.standard.id;
const ANTHROPIC_VOICE_MODEL_PRO_DEFAULT = CLAUDE_VOICE_MODELS.pro.id;
/**
 * `anthropic-version` header value. Verified 2026-09-15 against
 * https://platform.claude.com/docs/en/api/versioning — despite the dated
 * string this has been the current API version since 2023; it is expected
 * to stay stable, but is env-overridable per Rule 15 (external facts drift).
 */
const ANTHROPIC_API_VERSION_DEFAULT = '2023-06-01';
const ANTHROPIC_MAX_TOKENS_DEFAULT = 1024;

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

export function anthropicProxy() {
  function install(middlewares) {
    middlewares.use('/api/anthropic/messages', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Opt-in per-IP throttle (GEV_RATELIMIT_ANTHROPIC_PER_MIN). No-op when unset.
      if (!enforceOptInRateLimit(anthropicRateLimiter(), req, res)) return;

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set' }));
        return;
      }

      let payload;
      try {
        const body = await readRequestBody(req, 256 * 1024);
        payload = JSON.parse(body || '{}');
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error?.message || 'Invalid request body' }));
        return;
      }

      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const system = typeof payload.system === 'string' && payload.system.trim()
        ? payload.system
        : GEV_CLAUDE_VOICE_SYSTEM_PROMPT;

      // Voice model tier, requested by the client — same total/never-throw
      // contract as resolveVoiceModel for OpenAI: an unknown, empty, or
      // hostile value resolves to `standard` instead of reaching Anthropic
      // as a model id.
      const tier = resolveClaudeVoiceModel(payload.tier).tier;
      const model =
        tier === 'pro'
          ? process.env.ANTHROPIC_VOICE_MODEL_PRO || ANTHROPIC_VOICE_MODEL_PRO_DEFAULT
          : process.env.ANTHROPIC_VOICE_MODEL || ANTHROPIC_VOICE_MODEL_DEFAULT;
      const apiVersion = process.env.ANTHROPIC_API_VERSION || ANTHROPIC_API_VERSION_DEFAULT;

      const requestBody = {
        model,
        max_tokens: ANTHROPIC_MAX_TOKENS_DEFAULT,
        messages,
        system,
        tools: toAnthropicTools(GEV_TOOL_SCHEMAS),
        tool_choice: { type: 'auto' },
      };

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': apiVersion,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        const body = await response.text();
        res.statusCode = response.status;
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        // Which tier/model this request actually ran on. The upstream body is
        // passed through untouched (the client parses it verbatim), so these
        // headers are the authoritative echo — including the case where a
        // bogus ?tier= was silently downgraded to standard.
        res.setHeader('X-GEV-Voice-Tier', tier);
        res.setHeader('X-GEV-Voice-Model', model);
        if (payload.tier && !isKnownClaudeVoiceTier(payload.tier)) {
          res.setHeader('X-GEV-Voice-Tier-Fallback', '1');
        }
        res.end(body);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error?.message || 'Failed to reach Anthropic' }));
      }
    });
  }

  return {
    name: 'anthropic-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
