/**
 * openAiLiveVisionProxy.mjs — one-shot screenshot reader for the GPT-Live
 * backend. `gpt-live-1` has no image input, so when the user asks "what am I
 * looking at", the delegated backend model emits a `read_screen` function_call;
 * the browser captures the viewport and POSTs it here, and this route runs a
 * SEPARATE one-shot `gpt-5.6-luna` vision call over the Responses API and hands
 * the text back. That text becomes the tool's `function_call_output`, which the
 * live voice turn then speaks (see docs/gpt-live-migration.md, Fase 5).
 *
 * Kept out of openAiLiveProxy.mjs (the SDP session route) so each module stays
 * one cohesive concern and under the file-size budget — mirrors liveCost.js
 * splitting the per-minute meter out of voiceCost.js.
 *
 * The request body (`buildVisionRequest`) and the response-text extraction
 * (`extractResponseText`) are pure so the Responses-API shape is unit-tested
 * without the network. Node-only; never bundled for the browser.
 *
 * @module voice/openAiLiveVisionProxy
 */

import { READ_SCREEN_TOOL_NAME } from './gevLiveVision.js';

export const RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const LIVE_VISION_URL = '/api/live/vision';
export const OPENAI_VISION_MODEL_DEFAULT = 'gpt-5.6-luna';
export const VISION_MAX_OUTPUT_TOKENS = 400;

// Bounds the inline image payload: captureViewportImage() clamps to ~200 KB,
// but the body also carries the question + JSON overhead, so allow some slack
// while still rejecting a runaway upload long before it reaches OpenAI.
export const VISION_MAX_BODY_BYTES = 1024 * 1024;

const VISION_READER_INSTRUCTION =
  'You are the vision channel for the EagleEye View geospatial console. Describe ' +
  'what is visible in this 3D map/globe viewport in two or three short spoken ' +
  'sentences. Read any clearly legible street, building, and place labels and ' +
  'combine them with obvious geography (coastline, terrain, city density). Do ' +
  'not invent labels that are not actually legible, and do not identify ' +
  'individual people. If the frame is blank or unreadable, say so plainly.';

/**
 * Live-only tool schema advertised to the delegated backend model. Not added to
 * GEV_TOOL_SCHEMAS (the shared Realtime/Claude list) because Realtime reads the
 * viewport as ambient image context rather than via a tool, and its gevActions
 * runner has no `read_screen` handler — the live controller wraps the runner to
 * service this one name (gevLiveVision.js).
 */
export const READ_SCREEN_TOOL = {
  type: 'function',
  name: READ_SCREEN_TOOL_NAME,
  description:
    "Read the EagleEye View 3D viewport that is on screen right now. Call this " +
    "whenever the user asks what they are looking at, what is on screen, to read " +
    "visible labels/street names, or to describe the current view. Returns a short " +
    "text description you should then speak.",
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      question: {
        type: 'string',
        description: "The user's specific question about the view, if any (else leave empty).",
      },
    },
  },
};

/**
 * Build the Responses-API body for a one-shot viewport read. Pure — no I/O.
 * @param {object} opts
 * @param {string} opts.model Vision model id (`gpt-5.6-luna`).
 * @param {string} [opts.question] The user's question about the view.
 * @param {string} opts.imageUrl A `data:image/...;base64,...` viewport capture.
 * @param {number} [opts.maxOutputTokens]
 * @returns {object}
 */
export function buildVisionRequest({ model, question, imageUrl, maxOutputTokens = VISION_MAX_OUTPUT_TOKENS }) {
  const ask = question && String(question).trim() ? String(question).trim() : 'What is currently visible in this view?';
  return {
    model,
    max_output_tokens: maxOutputTokens,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `${VISION_READER_INSTRUCTION}\n\nUser question: ${ask}` },
          { type: 'input_image', image_url: imageUrl, detail: 'high' },
        ],
      },
    ],
  };
}

/**
 * Pull the assistant text out of a Responses-API result, tolerating both the
 * `output_text` convenience field and the raw `output[].content[]` walk.
 * @param {object} payload
 * @returns {string}
 */
export function extractResponseText(payload) {
  if (!payload) return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const chunk of content) {
      if ((chunk?.type === 'output_text' || chunk?.type === 'text') && typeof chunk.text === 'string') parts.push(chunk.text);
    }
  }
  return parts.join('').trim();
}

/**
 * Only accept a same-content data URL for an image. A client-supplied remote
 * URL would let the model fetch an arbitrary host (SSRF) — we never trust a
 * client upstream (see the CCTV/Overpass proxies for the same rule).
 * @param {unknown} image
 * @returns {boolean}
 */
export function isAllowedVisionImage(image) {
  return typeof image === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image);
}

/**
 * Register the `/api/live/vision` one-shot reader route. Dependencies injected
 * so this file stays free of the Realtime proxy's module-local helpers.
 *
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {(req: any, maxBytes?: number) => Promise<string>} deps.readRequestBody
 * @param {(req: any, res: any) => boolean} deps.enforceRateLimit Returns false when it already responded.
 * @param {typeof fetch} [deps.fetchImpl]
 */
export function installLiveVisionRoute(middlewares, deps) {
  const { readRequestBody, enforceRateLimit, fetchImpl = fetch } = deps;
  const json = (res, status, obj) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  middlewares.use(LIVE_VISION_URL, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!enforceRateLimit(req, res)) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json(res, 503, { error: 'OPENAI_API_KEY is not set' });

    let raw;
    try {
      raw = await readRequestBody(req, VISION_MAX_BODY_BYTES);
    } catch (error) {
      return json(res, 413, { error: error?.message || 'Image payload too large' });
    }
    let parsed;
    try {
      parsed = JSON.parse(raw || '{}');
    } catch {
      return json(res, 400, { error: 'Invalid JSON body' });
    }
    if (!isAllowedVisionImage(parsed.image)) {
      return json(res, 400, { error: 'Missing or non-data-URL image' });
    }

    const body = buildVisionRequest({
      model: process.env.OPENAI_VISION_MODEL || OPENAI_VISION_MODEL_DEFAULT,
      question: typeof parsed.question === 'string' ? parsed.question : '',
      imageUrl: parsed.image,
    });

    try {
      const upstream = await fetchImpl(RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Safety-Identifier': 'gev-local-dev',
        },
        body: JSON.stringify(body),
      });
      const payloadText = await upstream.text();
      if (!upstream.ok) {
        return json(res, upstream.status, { error: `Vision read failed: HTTP ${upstream.status}`, detail: payloadText.slice(0, 200) });
      }
      let payload;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        return json(res, 502, { error: 'Vision upstream returned non-JSON' });
      }
      const text = extractResponseText(payload);
      // Pass the token usage back so the client can price the read into the live
      // cost meter (the reader is billed per-token, separate from audio).
      return json(res, 200, { text, usage: payload.usage || null });
    } catch (error) {
      return json(res, 502, { error: error?.message || 'Failed to reach vision model' });
    }
  });
}
