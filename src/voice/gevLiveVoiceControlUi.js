// src/voice/gevLiveVoiceControlUi.js
/**
 * Builds the dock voice-control tray (mic button, status, detail, cost readout,
 * help and error trays) that GPT-Live drives. DOM only; no session logic.
 *
 * @module voice/gevLiveVoiceControlUi
 */

/** Mic status line text per controller status (the dock shows these words). */
export const STATUS_LABELS = Object.freeze({
  idle: 'MATI',
  connecting: 'MENGHUBUNGKAN',
  listening: 'MENDENGARKAN',
  executing: 'MENJALANKAN',
  error: 'GALAT',
});
/** `data-status` values that differ from the controller status name. */
export const DATASET_STATUS = Object.freeze({ executing: 'executing' });

/** Bars per side of the mic; their heights are shaped in theme/voiceWave.css. */
export const VOICE_WAVE_BARS = 12;

/** One decorative waveform half; the right half is mirrored by CSS. */
function voiceWaveMarkup(side) {
  return `<span class="gev-voice-wave" data-side="${side}" aria-hidden="true">${'<i></i>'.repeat(VOICE_WAVE_BARS)}</span>`;
}

/**
 * Create (or reuse) the voice-control tray and return its element refs.
 * @param {{reset?: boolean}} [options] `reset` removes any existing tray first.
 * @returns {object} refs: root, button, buttonLabel, status, detail, helpDetail, errorDetail, costValue
 */
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
        <div class="gev-voice-kicker">AGEN AI</div>
        <div id="gev-voice-status">MATI</div>
        <div class="gev-voice-cost">
          <span id="gev-voice-cost-value" class="gev-voice-cost-value" data-level="ok" title="Perkiraan biaya sesi">~$0.00</span>
        </div>
      </div>
      ${voiceWaveMarkup('left')}
      <button id="gev-voice-button" type="button" aria-label="Kontrol suara — klik untuk menyalakan atau mematikan suara" aria-describedby="gev-voice-help">
        <span class="gev-mic-arc" aria-hidden="true"></span>
        <span class="gev-mic-orbit"><img src="/voice-mic.svg" alt="" /></span>
        <span class="gev-mic-label">HIDUP/MATI</span>
      </button>
      ${voiceWaveMarkup('right')}
      <div class="gev-voice-readout">
        <div id="gev-voice-detail">SUARA SIAGA</div>
      </div>
      <div id="gev-voice-help" class="gev-voice-help-tray" role="tooltip">
        <span class="gev-voice-help-kicker">KONTROL SUARA</span>
        <span class="gev-voice-help-detail">Klik mik untuk menyalakan suara · bicara bebas, tanpa tombol tahan</span>
      </div>
      <div class="gev-voice-error-tray" role="alert" aria-live="assertive">
        <div class="gev-voice-error-header">
          <span>GALAT SISTEM SUARA</span>
          <button class="gev-voice-error-dismiss" type="button">TUTUP</button>
        </div>
        <div id="gev-voice-error-detail"></div>
        <div class="gev-voice-error-hint">Periksa izin mikrofon dan akses jaringan, lalu coba lagi.</div>
      </div>
    `;
    const commandDock = document.getElementById('command-dock');
    if (commandDock) {
      const locationBar = document.getElementById('location-bar');
      const controlPanel = document.getElementById('control-panel');
      commandDock.appendChild(root);
      if (locationBar) commandDock.insertBefore(locationBar, root);
      // The shell moves the style picker into the icon rail before voice
      // mounts (shell/stylePickerMount.js); only re-order it while it is
      // still a dock child.
      if (controlPanel?.parentNode === commandDock) commandDock.appendChild(controlPanel);
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
    costValue: root.querySelector('#gev-voice-cost-value'),
  };
}
