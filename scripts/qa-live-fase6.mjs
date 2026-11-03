#!/usr/bin/env node
/**
 * qa-live-fase6.mjs — GPT-Live backend runtime proof, items 1-3 of the Fase 6
 * plan (docs/gpt-live-migration.md): session connects, a spoken tool call
 * lands, and a "what am I looking at" turn triggers the gpt-5.6-luna
 * screenshot reader. Item 4 (physical mic/speaker echo-loop) is NOT provable
 * headlessly — see scripts/manual-fase6-echo-test.md for that step.
 *
 * Credentialed (hits the real OpenAI GPT-Live + gpt-5.6-luna APIs through the
 * app's own proxy) and spends real, small money. Mirrors qa-voice-wav.mjs's
 * fake-microphone pattern; does not modify src/.
 *
 * Run: node scripts/qa-live-fase6.mjs [appUrl]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const appUrl = process.argv[2] || 'http://localhost:4173';
const appOrigin = new URL(appUrl).origin;

// --- Build a two-phrase fake-mic fixture with macOS `say` -----------------
// Ephemeral (/tmp), never committed — unlike the approved WAV fixture under
// scripts/fixtures/voice/, this one is generated per-run for this proof only.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-fase6-'));
const aiffPath = path.join(tmpDir, 'fase6.aiff');
const wavPath = path.join(tmpDir, 'fase6.wav');
// Leading/inter-phrase silence must outlast WebRTC/SDP negotiation: audio
// produced by the fake-capture device before the data channel opens is not
// buffered by the RTP pipeline — it is simply lost, not delayed. Empirically
// (3 prior runs) the SDP POST + ICE wait takes ~12-14s, so the first phrase
// must not start before ~18s of file time.
const SCRIPT_TEXT =
  '[[slnc 18000]] Please turn on the ships layer. ' +
  '[[slnc 14000]] What am I looking at right now on the screen? Please read any visible labels. ' +
  '[[slnc 15000]]';
execFileSync('say', ['-o', aiffPath, SCRIPT_TEXT]);
execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', aiffPath, wavPath]);

let pass = 0, fail = 0;
const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`[${ok ? 'PROVEN' : 'FAIL'}] ${label} — ${detail}`);
  if (ok) pass += 1; else fail += 1;
}

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: puppeteer.executablePath(),
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavPath}%noloop`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,900',
    // Cesium's WebGL canvas needs a real GPU path even headless, or
    // captureViewportImage() sees no fresh frame and read_screen always
    // resolves to the no_viewport fallback (not a product bug — a headless
    // rendering precondition for this proof specifically).
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});

try {
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(appOrigin, ['microphone']);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  // Instrument BEFORE any app code runs: count/record calls to the two
  // credentialed routes without needing CDP body capture. Runtime override of
  // window.fetch, not a src/ edit.
  await page.evaluateOnNewDocument(() => {
    window.__fase6 = { sessionCalls: [], visionCalls: [], channelMsgs: [] };
    const origFetch = window.fetch.bind(window);
    window.fetch = async (url, opts) => {
      const u = typeof url === 'string' ? url : url?.url || '';
      const res = await origFetch(url, opts);
      if (u.includes('/api/live/session')) {
        window.__fase6.sessionCalls.push({ status: res.status });
      } else if (u.includes('/api/live/vision')) {
        const clone = res.clone();
        clone.text().then((t) => {
          let text = '';
          try { text = JSON.parse(t).text || ''; } catch { /* ignore */ }
          window.__fase6.visionCalls.push({ status: res.status, textLen: text.length, excerpt: text.slice(0, 80) });
        }).catch(() => {});
      }
      return res;
    };
    // Diagnostic only (test-fixture level, not a src/ edit): capture every
    // oai-events data-channel message so a failed proof can be explained
    // (model never heard the phrase vs. heard it but chose no tool, etc.).
    const OrigPC = window.RTCPeerConnection;
    window.RTCPeerConnection = function (...args) {
      const pc = new OrigPC(...args);
      const origCreateDC = pc.createDataChannel.bind(pc);
      pc.createDataChannel = (label, opts) => {
        const dc = origCreateDC(label, opts);
        dc.addEventListener('message', (ev) => {
          let parsed = ev.data;
          try { parsed = JSON.parse(ev.data); } catch { /* keep raw */ }
          window.__fase6.channelMsgs.push({ dir: 'in', type: parsed?.type || parsed?.event?.type, raw: typeof ev.data === 'string' ? ev.data.slice(0, 300) : '[binary]' });
        });
        const origSend = dc.send.bind(dc);
        dc.send = (data) => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch { /* keep raw */ }
          window.__fase6.channelMsgs.push({ dir: 'out', type: parsed?.type, raw: typeof data === 'string' ? data.slice(0, 300) : '[binary]' });
          return origSend(data);
        };
        return dc;
      };
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigPC.prototype;
  });

  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => (
    window.__gevVoiceCommands
      && document.getElementById('gev-voice-button')
  ), { timeout: 30_000 });

  // Let Cesium actually paint a non-black frame before relying on
  // captureViewportImage() — confirmed empirically that the globe/tiles need
  // ~15s to render under headless SwiftShader, well after __godsEyeView
  // exists. Without this wait, read_screen's no_viewport fallback fires even
  // though the real capture path works fine once warmed up.
  await new Promise((r) => setTimeout(r, 15_000));

  const meterBefore = await page.evaluate(() => window.__gevVoiceCommands.getDiagnostics());

  // Start the session (opens the mic, which immediately starts feeding the fake WAV).
  await page.evaluate(() => document.getElementById('gev-voice-button').click());

  // --- PROOF 1: session reaches connected/listening ------------------------
  let connected = false;
  try {
    await page.waitForFunction(() => {
      const d = window.__gevVoiceCommands.getDiagnostics();
      return d.backend === 'gpt-live-1' && d.channelOpen === true;
    }, { timeout: 20_000 });
    connected = true;
  } catch { /* timed out */ }
  const sessionCalls = await page.evaluate(() => window.__fase6.sessionCalls);
  record(connected, 'GPT-Live session reaches connected (channel open)',
    `sdp POST status=${sessionCalls[0]?.status ?? 'none'}`);

  // --- PROOF 2: spoken tool call lands (ships layer toggled) --------------
  let toolRan = false;
  if (connected) {
    try {
      await page.waitForFunction(() => window.__godsEyeView.dataManager.isEnabled('ais-live-vessels') === true,
        { timeout: 35_000 });
      toolRan = true;
    } catch { /* timed out */ }
  }
  record(toolRan, 'spoken "turn on the ships layer" runs set_layer_visibility',
    toolRan ? 'ais-live-vessels layer is enabled' : 'layer never flipped within budget');
  if (!toolRan) {
    const msgs = await page.evaluate(() => window.__fase6.channelMsgs);
    console.log(`  [debug] data-channel traffic so far (${msgs.length} msgs):`);
    msgs.slice(-20).forEach((m) => console.log(`    ${m.dir} ${m.type}: ${m.raw}`));
  }

  // --- PROOF 3: "what am I looking at" triggers the gpt-5.6-luna reader ---
  let visionCalls = [];
  if (connected) {
    try {
      await page.waitForFunction(() => window.__fase6.visionCalls.length > 0, { timeout: 25_000 });
    } catch { /* timed out */ }
    visionCalls = await page.evaluate(() => window.__fase6.visionCalls);
  }
  const visionOk = visionCalls.length > 0 && visionCalls.every((c) => c.status === 200 && c.textLen > 0);
  record(visionOk, 'read_screen triggers /api/live/vision and returns text',
    `calls=${visionCalls.length} ${visionCalls.map((c) => `[${c.status}, ${c.textLen}ch: "${c.excerpt}"]`).join(' ')}`);
  if (!visionOk) {
    const msgs = await page.evaluate(() => window.__fase6.channelMsgs);
    console.log(`  [debug] data-channel traffic (${msgs.length} msgs total):`);
    msgs.slice(-25).forEach((m) => console.log(`    ${m.dir} ${m.type}: ${m.raw}`));
  }

  const meterAfter = await page.evaluate(() => window.__gevVoiceCommands.getDiagnostics());
  const meterMoved = meterAfter.costUsd > meterBefore.costUsd;
  record(meterMoved, 'per-minute meter advanced across the session', `before=$${meterBefore.costUsd} after=$${meterAfter.costUsd}`);

  console.log(`\nread_screen call count this run: ${visionCalls.length}`);
  console.log(`Meter total after session: $${meterAfter.costUsd} (audio + reader; delegated per-turn backend reasoning NOT separately metered)`);
  if (consoleErrors.length) console.log(`Console errors observed: ${consoleErrors.length} (first: ${consoleErrors[0]})`);

  const allMsgs = await page.evaluate(() => window.__fase6.channelMsgs);
  fs.writeFileSync(path.join(os.tmpdir(), 'fase6-channel-log.json'), JSON.stringify(allMsgs, null, 2));
  const fnCalls = allMsgs.filter((m) => m.type === 'response.output_item.done' && m.raw.includes('function_call'));
  const sessionCreated = allMsgs.filter((m) => m.type === 'session.created' || m.type === 'session.update' || (m.dir === 'out' && m.type === 'session.update'));
  console.log(`Total channel messages: ${allMsgs.length}; function_call items seen: ${fnCalls.length}; outbound session.update: ${sessionCreated.length}`);
  console.log(`Full log written to ${path.join(os.tmpdir(), 'fase6-channel-log.json')}`);

  await page.evaluate(() => document.getElementById('gev-voice-button').click()); // stop
  await new Promise((r) => setTimeout(r, 500));
} finally {
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\n${pass}/${pass + fail} proofs passed.`);
process.exit(fail > 0 ? 1 : 0);
