import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { VOICE_WAVE_BARS } from './voice/gevLiveVoiceControlUi.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const chromeSrc = read('./uiPanelChrome.js');
const cctvSrc = read('./cctvPanelMixin.js');
const waveCss = read('./theme/voiceWave.css').replace(/\/\*[\s\S]*?\*\//g, '');
const themeCss = read('./theme/theme.css');
const voiceUi = read('./voice/gevLiveVoiceControlUi.js');

test('the visual-preset pill opens on click only; the location wing keeps hover', () => {
  assert.match(chromeSrc, /_initAutoHoverPanel\('control-panel', \{[^}]*hoverOpen: false[^}]*\}\)/);
  assert.match(chromeSrc, /_initAutoHoverPanel\('location-bar', \{ openDelayMs: 140, closeDelayMs: 420 \}\)/);
  assert.match(chromeSrc, /hoverOpen = true \} = \{\}\)/, 'hover stays the default for other panels');
  assert.match(chromeSrc, /if \(hoverOpen && panelEl\.classList\.contains\('collapsed'\)\) \{\s*scheduleOpen\(\);/);
});

test('the CCTV panel opens only from the rail: no CCTV code path expands it', () => {
  assert.doesNotMatch(cctvSrc, /setPanelCollapsed\('cctv-panel',\s*false/);
  assert.doesNotMatch(cctvSrc, /_lastSeenCctvActiveId/, 'the old auto-expand guard is gone');
});

test('voiceWave.css is imported by the theme and opens the side waves only while a session is live', () => {
  assert.match(themeCss, /@import '\.\/voiceWave\.css'/);
  assert.ok(themeCss.indexOf("'./dock.css'") < themeCss.indexOf("'./voiceWave.css'"));
  const closed = waveCss.match(/#gev-voice-control \.gev-voice-wave \{([^}]*)\}/);
  assert.ok(closed, 'base wave rule exists');
  assert.match(closed[1], /max-width:\s*0/);
  assert.match(closed[1], /opacity:\s*0/);
  const open = waveCss.match(/\[data-status='executing'\]\s*\) \.gev-voice-wave \{([^}]*)\}/);
  assert.ok(open, 'live-session wave rule exists');
  assert.match(open[1], /max-width:\s*110px/);
  assert.match(open[1], /opacity:\s*1/);
  assert.doesNotMatch(waveCss, /\[data-status='connecting'\][^{]*\.gev-voice-wave/, 'connecting turns the arc, not the waves');
});

test('the waveform follows the live --voice-level and falls back to a fixed shimmer level', () => {
  assert.match(waveCss, /--voice-wave-level: var\(--voice-level, 0\)/);
  assert.match(waveCss, /\[data-meter='css'\] \{\s*--voice-wave-level: 0\.35;/);
  assert.match(waveCss, /transform: scaleY\(calc\(0\.1 \+ var\(--voice-wave-level\) \* var\(--k, 0\.5\)\)\)/);
  assert.match(waveCss, /@keyframes gev-voice-shimmer/);
  assert.match(waveCss, /@keyframes gev-mic-arc-spin/);
  assert.match(waveCss, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  assert.doesNotMatch(waveCss, /filter:\s*(blur|drop-shadow)/, 'no per-frame blur filters');
});

test('every bar has a height share, and the right half mirrors the left', () => {
  for (let n = 1; n <= VOICE_WAVE_BARS; n += 1) {
    assert.match(waveCss, new RegExp(`\\.gev-voice-wave i:nth-child\\(${n}\\) \\{ --k: [\\d.]+; --d: \\d+ms; \\}`), `bar ${n}`);
  }
  assert.match(waveCss, /\.gev-voice-wave\[data-side='right'\] \{\s*flex-direction: row-reverse;/);
});

test('the voice control carries a wave on each side of a ringed mic with a turning arc', () => {
  assert.match(voiceUi, /\$\{voiceWaveMarkup\('left'\)\}\s*<button id="gev-voice-button"/);
  assert.match(voiceUi, /<\/button>\s*\$\{voiceWaveMarkup\('right'\)\}/);
  assert.match(voiceUi, /<span class="gev-mic-arc" aria-hidden="true"><\/span>/);
  assert.match(voiceUi, /<img src="\/voice-mic\.svg" alt="" \/>/);
  assert.match(voiceUi, /class="gev-voice-wave" data-side="\$\{side\}" aria-hidden="true"/);
  assert.equal(VOICE_WAVE_BARS, 12);
  assert.ok(existsSync(new URL('../public/voice-mic.svg', import.meta.url)), 'the mic glyph asset ships');
});

test('dock/CSS glyphs are CSS escapes, not raw non-ASCII, so a wrong charset guess cannot mojibake them', () => {
  // Owner screenshot 2026-11-03: the style pill showed "â-¾" — the UTF-8 bytes of
  // the down-triangle read as Windows-1252, because the CSS reached the browser
  // without a charset. Escapes are pure ASCII and immune to that.
  for (const rel of ['./theme/dock.css', './theme/railStyle.css', './theme/inspector.css', '../style.css']) {
    const css = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
    const raw = [...css.matchAll(/content:\s*'([^']*)'/g)].map((m) => m[1]).filter((v) => /[^\x00-\x7F]/.test(v));
    assert.deepEqual(raw, [], `${rel} has raw non-ASCII generated content`);
  }
  // A space after a hex escape is swallowed as its terminator; \20 keeps the gap.
  assert.match(read('./theme/inspector.css'), /summary::before \{ content: '\\25B8\\20'/);
});

test('the brand has a dark legibility scrim so it never vanishes into bright imagery', () => {
  const shell = read('./theme/shell.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const scrim = shell.match(/body\.ee-shell #title-bar::before \{([^}]*)\}/);
  assert.ok(scrim, 'title-bar scrim rule is missing');
  assert.match(scrim[1], /z-index:\s*-1/, 'the wash stays behind the logo and wordmark');
  assert.match(scrim[1], /pointer-events:\s*none/, 'the wash never blocks the globe');
  assert.match(scrim[1], /radial-gradient\([^)]*rgba\(4, 10, 16, 0\.\d+\)[\s\S]*rgba\(4, 10, 16, 0\)/, 'fades to fully transparent');
});
