import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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

test('turning CCTV on for the first time never auto-expands its panel', () => {
  const block = cctvSrc.match(/const effectiveActiveId = enabled[\s\S]*?this\._lastSeenCctvActiveId = effectiveActiveId;/);
  assert.ok(block, 'auto-expand block is missing');
  assert.match(block[0], /&& !isFirstActivation\s*&& !state\?\.autoHop/);
  assert.doesNotMatch(block[0], /\|\| isFirstActivation/);
});

test('voiceWave.css is imported by the theme and hides the bars until a session is live', () => {
  assert.match(themeCss, /@import '\.\/voiceWave\.css'/);
  assert.ok(themeCss.indexOf("'./dock.css'") < themeCss.indexOf("'./voiceWave.css'"));
  assert.match(waveCss, /\.gev-mic-wave \{\s*display: none;/);
  assert.match(waveCss, /\[data-status='listening'\], \[data-status='executing'\]\) #gev-voice-button \.gev-mic-wave \{\s*display: flex;/);
});

test('the waveform follows the live --mic-level and falls back to a CSS shimmer', () => {
  assert.match(waveCss, /\[data-meter='live'\] \.gev-mic-wave i:nth-child\(3\) \{ transform: scaleY\(calc\(0\.2 \+ var\(--mic-level, 0\)/);
  assert.match(waveCss, /:not\(\[data-meter='live'\]\) \.gev-mic-wave i \{\s*animation: gev-mic-wave/);
  assert.match(waveCss, /@keyframes gev-mic-wave/);
  assert.match(waveCss, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
});

test('the voice button markup carries five decorative wave bars', () => {
  const wave = voiceUi.match(/<span class="gev-mic-wave" aria-hidden="true">((?:<i><\/i>){5})<\/span>/);
  assert.ok(wave, 'five-bar aria-hidden waveform is missing from the mic button');
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
