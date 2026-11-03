/**
 * openAiLiveProxy.mjs — Vite dev/preview route for the OpenAI **GPT-Live**
 * (`gpt-live-1`) full-duplex voice backend, the app's only voice backend.
 *
 * GPT-Live has the *server* create the session (no ephemeral client token): we take the
 * browser's WebRTC SDP offer and POST it, together with the full session
 * config, to `/v1/live/sessions`, then pass the answer SDP straight back. The
 * key stays server-side; the browser never receives it.
 *
 * The session config is a pure builder (`buildLiveSessionConfig`) so its exact
 * shape — the parts that are easy to get wrong and only fail at the SDP POST —
 * is unit-tested without the network. Two shape facts proven by the Fase 0
 * runtime de-risk and encoded here:
 *   - `audio.format` must be OMITTED for WebRTC (it is a WebSocket-only field;
 *     WebRTC negotiates audio in the SDP). Sending it returns a 400.
 *   - delegated backend events only reach the browser `oai-events` data channel
 *     when requested via `client.data_channel.allowed_server_events`, where a
 *     nested Responses event is selected as
 *     `{ type:'response.event', response_event:'<inner event type string>' }`.
 *
 * Node-only (imported by openAiVoiceProxy.mjs), never bundled for the browser.
 *
 * @module voice/openAiLiveProxy
 */

export const LIVE_SESSIONS_URL = 'https://api.openai.com/v1/live/sessions';

// Frontend full-duplex model; the delegated backend reasoning model is billed
// separately (see docs/gpt-live-migration.md cost section).
export const OPENAI_LIVE_MODEL_DEFAULT = 'gpt-live-1';
export const OPENAI_LIVE_BACKEND_MODEL_DEFAULT = 'gpt-5.6-luna';
export const LIVE_VOICE_DEFAULT = 'marin';

// What the browser data channel is allowed to receive. Nested backend
// (Responses) events are selected one-per-inner-type via `response_event`; the
// rest are plain session events. Both forms are objects — a bare string is
// rejected (invalid_type), as is a `response.event` entry with no selector.
export const LIVE_ALLOWED_SERVER_EVENTS = [
  { type: 'response.event', response_event: 'response.output_item.added' },
  { type: 'response.event', response_event: 'response.output_item.done' },
  { type: 'response.event', response_event: 'response.output_text.delta' },
  { type: 'response.event', response_event: 'response.completed' },
  { type: 'session.delegation.created' },
  { type: 'session.usage.updated' },
  { type: 'session.output_transcript.delta' },
  { type: 'session.input_transcript.delta' },
  { type: 'error' },
];

/**
 * Build the `session` body for a GPT-Live WebRTC session-create request.
 * Pure — no I/O, no env reads — so the exact proven shape is unit-testable.
 *
 * @param {object} opts
 * @param {string} opts.model Frontend model id (`gpt-live-1`).
 * @param {string} opts.backendModel Delegated Responses reasoning model.
 * @param {string} opts.voice Output voice id.
 * @param {string} opts.instructions System prompt for the session.
 * @param {Array<object>} opts.tools Tool schemas (function-tool schemas).
 * @param {string} [opts.toolChoice='auto'] tool_choice.
 * @returns {object} The `session` object (no `audio.format`; allowlist included).
 */
export function buildLiveSessionConfig({ model, backendModel, voice, instructions, tools, toolChoice = 'auto' }) {
  return {
    model,
    instructions,
    // NB: deliberately no `audio.format` — WebRTC-only session; that field is
    // WebSocket-only and returns a 400 here.
    audio: { output: { voice } },
    delegation: {
      type: 'responses',
      responses: { model: backendModel, tools, tool_choice: toolChoice },
    },
    client: { data_channel: { allowed_server_events: LIVE_ALLOWED_SERVER_EVENTS } },
  };
}

/**
 * Register the `/api/live/session` SDP-proxy route on a connect middleware
 * stack. Dependencies are injected so this file stays free of the other proxy
 * modules' local helpers (and testable in isolation).
 *
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {(req: any, maxBytes?: number) => Promise<string>} deps.readRequestBody
 * @param {(req: any, res: any) => boolean} deps.enforceRateLimit Returns false when it already responded.
 * @param {Array<object>} deps.tools Tool schemas to declare for delegation.
 * @param {string} deps.instructions System prompt.
 * @param {typeof fetch} [deps.fetchImpl]
 */
export function installLiveSessionRoute(middlewares, deps) {
  const { readRequestBody, enforceRateLimit, tools, instructions, fetchImpl = fetch } = deps;
  middlewares.use('/api/live/session', async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    if (!enforceRateLimit(req, res)) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not set' }));
      return;
    }

    let offerSdp;
    try {
      offerSdp = await readRequestBody(req, 256 * 1024);
    } catch (error) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: error?.message || 'SDP offer too large' }));
      return;
    }
    if (!offerSdp || !offerSdp.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing SDP offer' }));
      return;
    }

    const session = buildLiveSessionConfig({
      model: process.env.OPENAI_LIVE_MODEL || OPENAI_LIVE_MODEL_DEFAULT,
      backendModel: process.env.OPENAI_LIVE_BACKEND_MODEL || OPENAI_LIVE_BACKEND_MODEL_DEFAULT,
      voice: process.env.OPENAI_LIVE_VOICE || LIVE_VOICE_DEFAULT,
      instructions,
      tools,
    });

    try {
      const upstream = await fetchImpl(LIVE_SESSIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'realtime=v1',
          'OpenAI-Safety-Identifier': 'gev-local-dev',
        },
        body: JSON.stringify({ session, transport: { type: 'webrtc', sdp: offerSdp } }),
      });
      const body = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.setHeader('X-GEV-Voice-Backend', OPENAI_LIVE_MODEL_DEFAULT);
      res.end(body);
    } catch (error) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: error?.message || 'Failed to create GPT-Live session' }));
    }
  });
}
