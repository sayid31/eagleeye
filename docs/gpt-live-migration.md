# GPT-Live migration — working design note (branch `feature/gpt-live-voice`)

> **2026-11-03 update:** the OpenAI Realtime and Claude backends are deleted; references below to them or to a "fallback" are historical. See `docs/DECISIONS.md`.

Status: **IN PROGRESS**, started 2026-10-29. No runtime proof yet. This note
captures the verified connection contract and the one open architecture
decision, so the work can resume in a fresh session without re-researching.

## Goal (from the owner)

- New **full-duplex `gpt-live-1`** voice path; existing OpenAI Realtime stays
  as a selectable fallback backend (do not delete it).
- Image reading delegated to a **separate `gpt-5.6-luna`** call (not a second
  voice session) — returns text into the voice turn.
- Swap the cost meter (GPT-Live is **$0.05/min**, billed per second; backend
  model + tools billed separately — a per-minute meter, not token-based).
- Preserve `echoCancellation` on the mic (`gevRealtimeSession.js:78`).
- Prove via runtime: session connects, tools run, screenshot is read, and the
  AI does not self-trigger on an open mic. Mark proven vs inferred.

## Verified connection contract (DOCS + openai/openai-live-console @ main)

- Transport: **WebRTC is canonical for browser**. Session is created
  server-side: `POST https://api.openai.com/v1/live/sessions` with the project
  key, body `{ session:{...}, transport:{ type:'webrtc', sdp:<browser offer> } }`;
  response carries the answer SDP. **No ephemeral client_secret for Live** —
  the security boundary is "server does the SDP POST", unlike Realtime's
  `/v1/realtime/client_secrets`. So our proxy must proxy SDP, not mint a token.
- Data channel is still named `oai-events`, but what the browser may see is
  gated by `session.client.data_channel.allowed_server_events` (allowlist).
- Server-side sideband events WS: `wss://api.openai.com/v1/live/sessions/{id}/attach`
  (Bearer project key) — where `session.delegation.created`,
  `session.input_transcript.delta`, `session.output_transcript.delta`,
  `session.usage.updated`, and the `session.commentary/thinking/instructions.append`
  acks flow. Hangup: `POST /v1/live/sessions/{id}/hangup`.
- Delegation modes: `delegation.type` = `"client"` | `"responses"`. **Immutable
  per session.** Client mode declares **no** `tools` in the session body.
- Audio mechanics identical to Realtime: `getUserMedia({audio})` + `addTrack`;
  assistant audio via `ontrack`. `audio.output.voice` default `"marin"`.
  **VAD / turn_detection field names for Live: NOT IN DOCS** — the sample sets
  none (full-duplex model manages interruption itself). Do NOT assume Realtime's
  `turn_detection` schema carries over.

## The crux (why this is not a 1:1 port)

Our 28 tools run in the **browser** (`gevActions.js`) against the live Cesium
viewer. GPT-Live's official pattern runs delegation **server-side**. And in
**client** mode, `session.delegation.created` carries only
`{ id, type, target }` — **no function name, no args, no utterance**. To pick a
tool you must accumulate transcripts and run your **own** model to infer intent.

### Candidate architectures

- **A. Responses-mode + route function_calls to browser.** Declare the 28 tools
  in `delegation.responses.tools`; OpenAI's backend emits structured
  `response.event` → `function_call` (call_id/name/arguments) — **the same shape
  Realtime already emits**, so `gevActions` + `toolSchemas` + the
  `function_call_output` contract are reused almost verbatim. Risk: the
  function_call events flow on the server sideband; whether they can be
  allowlisted onto the browser `oai-events` channel is **INFERRED, not confirmed
  in docs**. If not, needs a thin server sideband relay forwarding them to the
  browser (and `function_call_output` back). Backend model billed separately.
- **B. Client-mode + client intent router.** Browser receives transcripts +
  `session.delegation.created` (widen allowlist), and a local model reconstructs
  which tool+args to run. New intent-resolution layer; most divergent from
  today; extra model call per turn.
- **C. Server-side tools (official sample shape).** Can't drive the browser
  globe — rejected for this app.

Leaning **A**: smallest diff, reuses the proven 28-tool runner. Needs the
allowlist/relay question settled (verify in runtime before committing).

### Arch A — relay core PROVEN by runtime (Node harness, 2026-10-29)

Throwaway `/tmp` WS harness against `wss://api.openai.com/v1/live/sessions`
(Bearer project key, `OpenAI-Beta: realtime=v1`). Proven end-to-end:

1. `session.start` with `delegation.type:"responses"`,
   `delegation.responses.{model:"gpt-5.6-luna",tools:[...],tool_choice:"auto"}`,
   `audio.format:{type:"audio/pcm",rate:24000}` → `session.started`.
2. Inject a user turn with **`response.item.create`** `{item:{type:"message",
   role:"user",content:[{type:"input_text",text}]}}` then **`response.create`**.
   (`session.input` is NOT a valid client event — see the authoritative list below.)
3. Backend emits `session.delegation.created` then a stream of **`response.event`**
   envelopes `{type:"response.event",delegation_id,event:<standard Responses
   streaming event>}`. The `function_call` arrives as
   `event.type==="response.output_item.done"` with `event.item.type==="function_call"`
   (`item.name`, `item.arguments`, `item.call_id`) — **same shape Realtime emits**,
   so `gevActions`/`toolSchemas`/`function_call_output` contract is reused.
4. Answer with **`response.item.create`** `{item:{type:"function_call_output",
   call_id,output:<json string>}}` then **`response.create`** → backend speaks a
   result-grounded reply (observed: tool `set_marker({place:"Surabaya"})` →
   output → *"I marked Surabaya on the map."*).

**Authoritative client-event list** (from the server's own rejection error):
`session.start`, `session.update`, `session.input_audio.append`,
`session.input_audio.mute`, `session.input_audio.unmute`,
`session.output_audio.fixture.play`, `transport.dtmf.send`,
`session.instructions.append`, `session.thinking.append`,
`session.commentary.append`, `decision.create`, `decision.item.create`,
`decision.item.delete`, `response.item.create`, `response.create`,
`session.close`. (No text-input event — real user input is `session.input_audio.append`
PCM; the harness injected text via `response.item.create` as a conversation item.)

PROVEN: our **server** receives the `function_call` and the
`function_call_output` round-trip drives a spoken answer.

### Fase 0 — CABANG A CONFIRMED in a headless WebRTC browser (2026-10-29)

Throwaway puppeteer harness (`/tmp/gev-live-harness/browser-probe`): tiny Node
SDP proxy (holds key) + headless Chromium (`--use-fake-device-for-media-stream`)
doing a real `RTCPeerConnection` + `oai-events` data channel. **Verdict: no
server sideband relay needed — the data channel is sufficient.** Proven in-browser:

1. WebRTC Live session connects; `oai-events` opens.
2. `function_call` (`set_marker`) is delivered **on the data channel** as a
   `response.event` envelope.
3. `function_call_output` sent back **over the same channel** (`response.item.create`
   + `response.create`) is accepted.
4. Backend produces a spoken reply afterward (`session.output_transcript.delta`).

**Proven SDP-POST session shape for WebRTC** (differs from the WS harness):
- `POST https://api.openai.com/v1/live/sessions`, body
  `{ session:{...}, transport:{ type:'webrtc', sdp:<offer> } }`, returns answer SDP.
- **OMIT `session.audio.format`** — "only supported for WebSocket sessions";
  WebRTC negotiates audio in SDP. Keep `audio.output.voice`.
- **Allowlist is required** to see delegation on the browser channel. Shape:
  `session.client.data_channel.allowed_server_events` = array of objects. For
  nested backend events each entry is
  `{ type:'response.event', response_event:'<inner Responses event type string>' }`
  — **one entry per inner type** (`response.output_item.added/done`,
  `response.output_text.delta`, `response.completed`). Plain events are
  `{ type:'session.delegation.created' }`, `{ type:'session.usage.updated' }`,
  `{ type:'session.output_transcript.delta' }`, `{ type:'error' }`.
- Channel event types actually observed: `info`, `session.delegation.created`,
  `response.event`, `session.output_transcript.delta`, `session.usage.updated`.

STILL INFERRED (later browser proof, Fase 6): echoCancellation + no-self-trigger
on an open mic over ~30 s, real spoken (not injected-text) user turns, and the
`gpt-5.6-luna` screenshot reader round-trip.

## Fase 1 — DONE: `/api/live/session` SDP proxy (production, proven)

- `src/voice/openAiLiveProxy.mjs` (new): pure `buildLiveSessionConfig()` +
  `LIVE_ALLOWED_SERVER_EVENTS` + `installLiveSessionRoute()`. Encodes the two
  proven shape facts (no `audio.format`; object allowlist with `response_event`
  string selectors). Backend model `OPENAI_LIVE_BACKEND_MODEL` (default
  `gpt-5.6-luna`), frontend `OPENAI_LIVE_MODEL` (default `gpt-live-1`).
- `src/voice/openAiVoiceProxy.mjs` (renamed from `openAiRealtimeProxy.mjs`): registers the
  route; `readRequestBody` is exported. The Realtime route was later deleted.
- Unit test `openAiLiveProxy.test.mjs` (7 cases) — config-shape regressions
  for every 400 we hit in Fase 0.
- **Runtime PROVEN** (throwaway puppeteer vs the live dev-server route, 28 real
  tools + real system prompt): `/api/live/session` → **201** + working answer
  SDP; `oai-events` opens; delegation runs; a **real GEV tool**
  (`set_layer_visibility`) is emitted on the channel; `function_call_output`
  accepted; transcript follows.
- Not yet user-visible: no client controller/UI wiring, so `CURRENT-STATE.md` /
  `CHANGELOG.md` stay untouched until the backend is selectable (Fase 3).

## Fase 2 — DONE: client controller + channel handler (unit-proven)

- `src/voice/gevLiveEvents.js` (new): pure `oai-events` handler. `parseLiveMessage`,
  `extractFunctionCall`, `createLiveChannelHandler({runner,send,isOpen,...})`.
  Unwraps `response.event` → `response.output_item.done`/`function_call`, runs the
  reused `gevActions` runner, answers `response.item.create`(function_call_output)
  + `response.create`. Dedupes by `call_id`; a throwing tool still answers (error
  output) so the turn never strands; a closed channel skips the send.
- `src/voice/gevLiveSession.js` (new): `GevLiveController` mirroring
  `GevClaudeVoiceController`'s surface (`status`/`isActive`/`start`/`stop`/
  `setStatus`/`setMicrophoneEnabled`/`setVoiceSpeaker`/`syncCostUi`/
  `getDiagnostics`/`runner`) + `initGevLiveVoice()` factory. WebRTC →
  `/api/live/session` (SDP POST, answer parsed as `{sdp}` or raw), data channel
  `oai-events`. Browser globals injected (fetch/mediaDevices/RTCPeerConnection/
  document) for test; mic constraints echoCancellation-preserving verbatim;
  epoch guards abandon in-flight resources on stop/restart.
- Tests: `gevLiveEvents.test.mjs` (10) + `gevLiveSession.test.mjs` (9) — 19/19
  pass. Cover tool round-trip, dedupe, throw-still-answers, closed-channel skip,
  negotiate→listening, echoCancellation, mic gate, teardown, SDP-failure → error
  (no throw, mic released), getUserMedia denial, no-op-while-active.
- **PROVEN** (unit, no browser): handler + controller logic. **INFERRED** (held
  to Fase 6 browser proof): the live WebRTC media path, real spoken turns,
  no-self-trigger on open mic. Not wired into `voiceBackendSwitch.js` yet (Fase 3),
  so not user-selectable; `CURRENT-STATE.md`/`CHANGELOG.md` stay untouched.

## Fase 3 — DONE: `gpt-live-1` selectable in the backend pill (unit-proven)

- `voiceBackendSwitch.js`: `createVoiceBackendCoordinator` now takes an optional
  `liveController`. Backends form an ordered cycle `[openai, live?, claude]`; the
  pill advances to the next one (wrapping) and labels GPT / GPT-LIVE / CLAUDE.
  `_activeBackend()` returns `'openai'|'live'|'claude'`. `initGevVoiceBackendSwitch`
  builds the live controller via `initGevLiveVoice`, reusing the ONE shared
  `gevActions` runner (same as Claude).
- **Default is GPT-Live (flipped on explicit owner request).** `DEFAULT_VOICE_BACKEND
  = 'live'`; the coordinator takes `defaultBackend` and falls back to OpenAI when no
  live controller exists. Flipped BEFORE Fase 6 proof 4 (physical echo/self-trigger)
  was run, and with voice-driven `set_layer_visibility` and the `/api/live/vision`
  round trip still unproven end-to-end (headless `captureViewportImage()` is flaky) —
  OpenAI Realtime remains one pill click away. `aria-pressed` = "not OpenAI".
- Reveal: pill un-hides when a selectable alternate exists — Claude
  (`anthropic` key set && `isSupported()`) OR gpt-live (`openai` key set; paid
  tier can't be probed client-side, surfaces at `start()`). New shared helper
  `fetchConfiguredKeyIds()`; `isAnthropicKeyConfigured()` kept as a thin wrapper.
- Tests: `voiceBackendSwitch.test.mjs` extended to 13 (3-way cycle, live switch
  + cost sync, live-only reveal, no-reveal-without-live-controller,
  `fetchConfiguredKeyIds`) — 13/13 pass; the original binary-pill cases unchanged.
- **PROVEN** (unit): coordinator cycle + reveal logic. **INFERRED**: the live
  session actually running when selected in a real browser (Fase 6). Still not
  flagged user-visible in `CURRENT-STATE.md`/`CHANGELOG.md` until Fase 6.

## Fase 4 — DONE: per-minute ($0.05/min) cost meter (unit-proven)

- `src/voice/liveCost.js` (new): the Realtime meter is per-TOKEN; GPT-Live bills
  a flat **$0.05/min of live audio, per second** (backend model + tools billed
  separately, NOT estimated here), so it gets its own tracker. Exports
  `estimateLiveCostUsd`, `createLiveCostTracker` (monotonic seconds → USD, warn/
  cap latched once each, snapshot shape compatible with the shared readout),
  `paintLiveCostUi` (writes `#gev-voice-cost-value` text/level/title), and
  `createLiveCostMeter` (wall-clock 1 s tick + authoritative-duration reconcile +
  `onCap`). Reuses `formatCostUsd`/`normalizeCostLimits` from `voiceCost.js`.
- `gevLiveSession.js`: `syncCostUi()` now paints the per-minute readout; the
  meter starts on channel open, reconciles `session.usage.updated` durations,
  and the hard cap ends the session through the normal stop path (mic released),
  mirroring the Realtime backend. Default limits $2 warn / $5 cap = 40 / 100 min.
- Tests: `liveCost.test.mjs` (10) + 4 new controller cases (meter paints,
  usage reconcile, hard-cap stop, rate in diagnostics). Full voice suite 433/433.
- **PROVEN** (unit): pricing, latches, cap-stop, UI paint. **INFERRED** (Fase 6):
  the real `session.usage.updated` field name (wall-clock drives the meter
  regardless) and live billing reconciliation. The $0.05/min rate is an external
  fact — `LIVE_VOICE_RATES_VERIFIED_ON = 2026-10-29`; re-verify at release.
- NOTE: `gevLiveSession.js` is now at the 300-line service soft-limit; a future
  split (transport vs. lifecycle) is worth considering if it grows further.

DONE Fase 5 (2026-10-29): `gpt-5.6-luna` screenshot reader, responses-mode wiring.
- New `src/voice/openAiLiveVisionProxy.mjs` — `/api/live/vision` one-shot route:
  pure `buildVisionRequest` (`input_image` @ `detail:'high'`) + `extractResponseText`
  (`output_text` or `output[].content[]` walk) + `isAllowedVisionImage` SSRF guard
  (only `data:image/...` accepted, never a client-supplied remote URL). Exports the
  live-only `READ_SCREEN_TOOL` schema.
- New `src/voice/gevLiveVision.js` — `createViewportReader({captureImage,fetchImpl})`;
  `readScreen()` NEVER throws (every failure → `{ok:false,text:<spoken fallback>}`
  because the result is JSON-stringified straight into `function_call_output`).
- Wiring: `openAiVoiceProxy.mjs` registers the vision route and declares the
  live session tools as `[...GEV_VOICE_TOOLS, READ_SCREEN_TOOL]` (live-only — the
  shared gevActions runner has no `read_screen` handler, and Realtime reads the
  viewport as ambient image context instead). `initGevLiveVoice` wraps the shared
  runner so `read_screen` routes to the reader; all other tools pass through.
- Tests: `gevLiveVision.test.mjs` (7), `openAiLiveVisionProxy.test.mjs` (10). Full
  voice suite 450/450.
- PROVEN (unit): round-trip shape, SSRF rejection, key-guard, non-throw fallbacks.
  INFERRED (until Fase 6 browser proof): the backend actually emits `read_screen`
  on a "what am I looking at" turn, and `gpt-5.6-luna` Responses `input_image` shape.
- NOTE: `gevLiveSession.js` is now 308 lines (8 over the 300 service soft-limit;
  under the 500 hard limit). Candidate split: move `initGevLiveVoice` to its own
  wiring module. Flagged, not done.

## Image reader (`gpt-5.6-luna`)

Separate one-shot call, not a voice session. Input `input_image` (base64 data
URL accepted; PNG/JPEG). `detail:'high'` within 2048x2048 / 2500-patch budget;
multiplier 1.2 (documented). Current capture is `captureViewportImage()` in
`gevRealtimeViewport.js` (already clamps to ~1.08 MP, JPEG q0.74, ~200 KB). The
reader's text result feeds back into the voice turn (append in client mode, or a
tool result in responses mode). ~$0.0005 per 1080p screenshot input.

## Cost meter

GPT-Live = **$0.05/min billed per second**, not rounded up; delegated backend
model billed separately (NOT metered). The `gpt-5.6-luna` screenshot reader
($0.20/1M in, $1.20/1M out) IS now folded into the same meter: the reader
returns its token usage, the client prices it (`estimateVisionCostUsd`) with a
documented ~$0.0005/read fallback, and the controller adds it via
`costMeter.recordExtraUsd` so the readout and the hard spend cap both account
for it. Per-minute meter lives in `liveCost.js` (not the token-based
`voiceCost.js`), selected when the active backend is `gpt-live-1`.

## Account access (verified structurally, no key printed)

`/v1/models` → `gpt-live-1`, all `gpt-realtime-*`, `gpt-5.6-luna`, `gpt-6-luna/sol`
all present. `gpt-live-1` refuses Free usage tier.

## Files in play

- `src/voice/openAiVoiceProxy.mjs` — Live session-create (SDP proxy). (Realtime route since deleted.)
- `src/voice/gevLiveSession.js` — mic `echoCancellation` (preserve).
- `gevRealtimeEvents.js` (deleted) — was the old `input_image` send site.
- `src/voice/voiceBackendSwitch.js` — add `gpt-live-1` as a backend (today it
  switches OpenAI Realtime ↔ Claude).
- `src/voice/toolSchemas.js`, `voiceCost.js`, `gevRealtimeCost.js`.

## Proof plan (runtime)

Dev server + browser: (1) Live session reaches `connected`; (2) a spoken command
runs a tool and the globe reacts; (3) a "what am I looking at" triggers the
`gpt-5.6-luna` read and the answer uses screenshot labels; (4) open mic for ~30 s
of silence + assistant speech → no self-triggered response loop (echoCancellation
+ full-duplex). Record each as PROVEN or INFERRED.
