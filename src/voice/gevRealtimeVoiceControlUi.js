// Push-to-talk key handling + voice-visualizer/control-DOM helpers,
// mechanically relocated out of gevRealtime.js (that file's own header notes
// the split). No split-import needed: none of these functions call back
// into anything that stays in gevRealtime.js.

/**
 * Returns whether a keyboard event represents the hold-Space voice shortcut.
 * @param {KeyboardEvent|object|null} event
 * @returns {boolean}
 */
export function isPushToTalkKey(event) {
  return event?.code === 'Space' || event?.key === ' ';
}

/**
 * Protects text entry and modified shortcuts from the global push-to-talk key.
 * @param {KeyboardEvent|object|null} event
 * @returns {boolean}
 */
export function shouldHandlePushToTalkKeyDown(event) {
  if (!isPushToTalkKey(event) || event.defaultPrevented) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const target = event.target;
  if (target?.isContentEditable) return false;
  const editingControl = target?.closest?.('input, textarea, select, [contenteditable], [role="textbox"]');
  return !editingControl;
}

/**
 * Avoids a click/Space race that could stop an active voice session mid-turn.
 * @param {boolean} spaceKeyHeld
 * @returns {boolean}
 */
export function shouldIgnoreVoiceButtonClick(spaceKeyHeld) {
  return Boolean(spaceKeyHeld);
}

/**
 * Selects input or output frequency data for the active voice speaker.
 * @param {'idle'|'user'|'ai'} speaker
 * @param {{analyser: AnalyserNode|null, data: Uint8Array|null}} input
 * @param {{analyser: AnalyserNode|null, data: Uint8Array|null}} output
 * @returns {{analyser: AnalyserNode, data: Uint8Array}|null}
 */
export function selectVoiceVisualizerSignal(speaker, input, output) {
  const signal = speaker === 'ai' ? output : input;
  return signal?.analyser && signal?.data ? signal : null;
}

/**
 * Keeps analysing buffered assistant audio after the response-done control event.
 * @param {'idle'|'user'|'ai'} currentSpeaker
 * @param {'idle'|'user'|'ai'} nextSpeaker
 * @param {boolean} keepCurrent
 * @returns {'idle'|'user'|'ai'}
 */
export function resolveVoiceVisualizerSpeaker(currentSpeaker, nextSpeaker, keepCurrent = false) {
  if (keepCurrent && currentSpeaker === 'ai') return 'ai';
  return nextSpeaker === 'user' || nextSpeaker === 'ai' ? nextSpeaker : 'idle';
}

/**
 * Resolves the in-app help tray copy for the current push-to-talk state.
 * @param {boolean} pushToTalkMode
 * @param {boolean} pushToTalkKeyHeld
 * @returns {string}
 */
export function resolveVoiceControlHint(pushToTalkMode, pushToTalkKeyHeld) {
  return pushToTalkMode && pushToTalkKeyHeld
    ? 'Release Space to send'
    : 'Hold Space to speak · click mic to toggle voice';
}

/**
 * Removes low-level room noise before it can animate the voice meter.
 * @param {number} level - Normalized frequency energy (0–1).
 * @param {number} threshold - Noise-floor cutoff (0–1).
 * @returns {number} Re-normalized audible level (0–1).
 */
export function gateVoiceVisualizerLevel(level, threshold) {
  const cleanLevel = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  const cleanThreshold = Number.isFinite(threshold) ? Math.min(0.95, Math.max(0, threshold)) : 0;
  if (cleanLevel <= cleanThreshold) return 0;
  return (cleanLevel - cleanThreshold) / (1 - cleanThreshold);
}

/**
 * Restores the CSS-owned standby baseline for every visualizer bar.
 * @param {Iterable<HTMLElement>|null|undefined} bars
 * @returns {void}
 */
export function resetVoiceVisualizerBars(bars) {
  if (!bars) return;
  for (const bar of bars) {
    bar.style.removeProperty('--audio-level');
    bar.style.removeProperty('--audio-opacity');
  }
}

export function createVoiceControl({ reset = false } = {}) {
  let root = document.getElementById('gev-voice-control');
  if (root && reset) {
    root.remove();
    root = null;
  }
  if (!root) {
    root = document.createElement('div');
    root.id = 'gev-voice-control';
    root.dataset.status = 'idle';
    root.dataset.speaker = 'idle';
    root.innerHTML = `
      <div class="gev-voice-heading">
        <div class="gev-voice-kicker">AI AGENT</div>
        <div id="gev-voice-status">OFF</div>
        <div class="gev-voice-cost">
          <button id="gev-voice-backend" class="gev-voice-tier-btn gev-voice-backend-btn" type="button" hidden aria-pressed="false" title="Voice backend">GPT</button>
          <button id="gev-voice-tier" class="gev-voice-tier-btn" type="button" aria-pressed="false" title="Voice model tier — applies next session">STD</button>
          <span id="gev-voice-cost-value" class="gev-voice-cost-value" data-level="ok" title="Estimated session cost">~$0.00</span>
        </div>
      </div>
      <button id="gev-voice-button" type="button" aria-label="Voice control — hold Space to speak; click to toggle voice" aria-describedby="gev-voice-help">
        <span class="gev-mic-orbit"><img src="/mic.svg" alt="" /></span>
        <span class="gev-mic-label">ON/OFF</span>
      </button>
      <div class="gev-voice-visualizer" aria-hidden="true">
        ${Array.from({ length: 15 }, (_, index) => `<span style="--bar:${index}"></span>`).join('')}
      </div>
      <div class="gev-voice-readout">
        <div id="gev-voice-detail">VOICE STANDBY</div>
      </div>
      <div id="gev-voice-help" class="gev-voice-help-tray" role="tooltip">
        <span class="gev-voice-help-kicker">VOICE CONTROL</span>
        <span class="gev-voice-help-detail">Hold Space to speak · click mic to toggle voice</span>
      </div>
      <div class="gev-voice-error-tray" role="alert" aria-live="assertive">
        <div class="gev-voice-error-header">
          <span>VOICE SYSTEM ERROR</span>
          <button class="gev-voice-error-dismiss" type="button">DISMISS</button>
        </div>
        <div id="gev-voice-error-detail"></div>
        <div class="gev-voice-error-hint">Check microphone permission and network access, then try again.</div>
      </div>
    `;
    const commandDock = document.getElementById('command-dock');
    if (commandDock) {
      const locationBar = document.getElementById('location-bar');
      const controlPanel = document.getElementById('control-panel');
      commandDock.appendChild(root);
      if (locationBar) commandDock.insertBefore(locationBar, root);
      if (controlPanel) commandDock.appendChild(controlPanel);
    } else {
      document.body.appendChild(root);
    }
    root.querySelector('.gev-voice-error-dismiss')?.addEventListener('click', () => {
      root.classList.add('error-dismissed');
    });
  }
  return {
    root,
    button: root.querySelector('#gev-voice-button'),
    buttonLabel: root.querySelector('.gev-mic-label'),
    status: root.querySelector('#gev-voice-status'),
    detail: root.querySelector('#gev-voice-detail'),
    helpDetail: root.querySelector('.gev-voice-help-detail'),
    errorDetail: root.querySelector('#gev-voice-error-detail'),
    tierButton: root.querySelector('#gev-voice-tier'),
    costValue: root.querySelector('#gev-voice-cost-value'),
    backendButton: root.querySelector('#gev-voice-backend'),
  };
}
