/**
 * openAiVoiceProxy.mjs — Vite dev/preview plugin for the OpenAI-backed voice
 * routes: the GPT-Live session create (`/api/live/session`), the gpt-5.6-luna
 * screenshot reader (`/api/live/vision`) and the five-word HUD scene-summary
 * endpoint.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * Keeps OPENAI_API_KEY server-side; the browser never receives the key (the
 * live session SDP is exchanged through this server). Lives under src/voice/
 * (not src/data/) because it depends on the voice-domain modules
 * (toolSchemas.js, voiceSystemPrompt.js) rather than being a generic
 * upstream-API proxy.
 *
 * @module voice/openAiVoiceProxy
 */

import { enforceOptInRateLimit, openAiRateLimiter } from '../server/proxyInfra.mjs';
import { keylessHudSummaryResponse } from '../hudSummaryResponse.js';
import { GEV_TOOL_SCHEMAS, toOpenAiRealtimeTools } from './toolSchemas.js';
import { GEV_VOICE_SYSTEM_PROMPT } from './voiceSystemPrompt.js';
import { installLiveSessionRoute } from './openAiLiveProxy.mjs';
import { installLiveVisionRoute, READ_SCREEN_TOOL } from './openAiLiveVisionProxy.mjs';

const OPENAI_HUD_SUMMARY_MODEL_DEFAULT = 'gpt-5-nano';

export function readRequestBody(req, maxBytes = 1024 * 1024) {
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

export function openAiVoiceProxy() {
  function install(middlewares) {
    // GPT-Live full-duplex session create: the server holds the key and
    // exchanges the browser's SDP offer.
    installLiveSessionRoute(middlewares, {
      readRequestBody,
      enforceRateLimit: (req, res) => enforceOptInRateLimit(openAiRateLimiter(), req, res),
      // The live backend additionally gets the live-only `read_screen` tool —
      // gpt-live-1 can't see images, so it delegates the viewport read to the
      // one-shot gpt-5.6-luna call behind /api/live/vision (below).
      tools: [...GEV_VOICE_TOOLS, READ_SCREEN_TOOL],
      instructions: GEV_VOICE_SYSTEM_PROMPT,
    });
    installLiveVisionRoute(middlewares, {
      readRequestBody,
      enforceRateLimit: (req, res) => enforceOptInRateLimit(openAiRateLimiter(), req, res),
    });

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
  }

  return {
    name: 'openai-voice-proxy',
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

const GEV_VOICE_TOOLS = toOpenAiRealtimeTools(GEV_TOOL_SCHEMAS);
