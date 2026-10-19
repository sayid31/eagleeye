// Moved out of militaryAwareness.js (militaryAwarenessPanel).

import { AWARENESS_RADIUS_M, formatAwarenessDistance, formatAwarenessLabel } from './militaryAwarenessEngine.js';
import { AWARENESS_PAGE_ROTATE_MS, AWARENESS_PAGE_SIZE, state } from './militaryAwarenessConstants.js';
import { canNavigateNext, focusCurrentSubject, navigateHistory, requestFocus } from './militaryAwarenessNavigation.js';
import { scheduleDirectionOverlayUpdate } from './militaryAwarenessOverlay.js';

export function ensurePanel() {
  if (state.panel) return state.panel;
  const existing = document.getElementById('military-awareness-panel');
  const panel = existing || document.createElement('aside');
  state.panelOwned = !existing;
  if (!existing) {
    panel.id = 'military-awareness-panel';
  }
  state.panelClickListener = (event) => {
    const action = event.target.closest('button[data-awareness-action]');
    if (action) {
      event.preventDefault();
      if (action.dataset.awarenessAction === 'previous') navigateHistory(-1, { origin: 'user' });
      if (action.dataset.awarenessAction === 'next') navigateHistory(1, { origin: 'user' });
      if (action.dataset.awarenessAction === 'focus') focusCurrentSubject({ origin: 'user' });
      return;
    }
    const target = event.target.closest('button[data-awareness-layer][data-awareness-id]');
    if (!target) return;
    event.preventDefault();
    requestFocus(target.dataset.awarenessLayer, target.dataset.awarenessId, false, { origin: 'user' });
  };
  panel.addEventListener('click', state.panelClickListener);
  if (!existing) document.body.appendChild(panel);
  state.panel = panel;
  return panel;
}

export function hidePanel() {
  if (state.panel) {
    const markup = `<div class="military-awareness-standby">
      <strong>${state.enabled ? 'KONTEKS SIAP' : 'KONTEKS GLOBAL MATI'}</strong>
      <span>${state.enabled ? 'PILIH PENERBANGAN, KAPAL, ATAU INSTALASI TERPETAKAN' : 'NYALAKAN UNTUK MEMUAT KEDEKATAN TERAMATI / TERPETAKAN'}</span>
    </div>`;
    state.panel.hidden = false;
    if (state.panelMarkup !== markup) {
      state.panel.innerHTML = markup;
      state.panelMarkup = markup;
    }
  }
  if (state.directionRoot) state.directionRoot.hidden = true;
}

function rowHtml(cohort) {
  const summary = cohort.summary;
  const count = summary.count === null ? '?' : String(summary.count);
  const page = state.cohortPages.get(cohort.id) || 0;
  const nearest = summary.nearest.slice(page, page + AWARENESS_PAGE_SIZE).map((item) => {
    const label = formatAwarenessLabel(item);
    const targetId = item.icao24 || item.mmsi || item.id;
    if (!targetId) {
      return `<li><span class="military-awareness-target unavailable" aria-label="Tidak tersedia">${escapeHtml(label)} <span>${formatAwarenessDistance(item.distanceM)}</span></span></li>`;
    }
    const accessibleLabel = label === '—' ? 'Tidak tersedia' : label;
    return `<li><button type="button" class="military-awareness-target" data-awareness-layer="${escapeHtml(cohort.id)}" data-awareness-id="${escapeHtml(targetId)}" aria-label="Fokus ${escapeHtml(accessibleLabel)}">${escapeHtml(label)} <span>${formatAwarenessDistance(item.distanceM)}</span></button></li>`;
  }).join('');
  const pageCount = Math.max(1, Math.ceil(summary.nearest.length / AWARENESS_PAGE_SIZE));
  const pageLabel = pageCount > 1 ? ` · ${Math.floor(page / AWARENESS_PAGE_SIZE) + 1}/${pageCount}` : '';
  const coverage = cohort.coverage ? ` · ${escapeHtml(cohort.coverage)}` : '';
  return `<section class="military-awareness-row ${summary.relationship.toLowerCase()}">
    <div><strong>${escapeHtml(cohort.label)}</strong><b aria-live="polite">${count}${pageLabel}</b></div>
    <small>${escapeHtml(cohort.source)}${coverage} · ${escapeHtml(summary.reason)}</small>
    ${nearest ? `<ul>${nearest}</ul>` : ''}
  </section>`;
}

function navigationControlsHtml() {
  const canPrevious = state.navigationIndex > 0;
  return `<div class="military-awareness-controls" role="group" aria-label="Navigasi Konteks Global">
    <button type="button" data-awareness-action="previous" title="Sebelumnya — kontak yang dikunjungi sebelumnya dalam jendela 250 km"${canPrevious ? '' : ' disabled'}>SEBELUMNYA</button>
    <button type="button" data-awareness-action="focus">FOKUS</button>
    <button type="button" data-awareness-action="next" title="Berikutnya — kontak terdekat yang belum dikunjungi dalam jendela 250 km"${canNavigateNext() ? '' : ' disabled'}>BERIKUTNYA</button>
  </div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

export function renderResults() {
  if (!state.enabled || !state.results) return hidePanel();
  const panel = ensurePanel();
  const { subject, cohorts } = state.results;
  const markup = `<div class="military-awareness-subject">${escapeHtml(subject.label)} · ${formatAwarenessDistance(AWARENESS_RADIUS_M)} JENDELA PENERBANGAN / KAPAL</div>
    ${navigationControlsHtml()}
    ${cohorts.map(rowHtml).join('')}
    <p class="military-awareness-note">Konteks terpetakan/teramati dari sumber terbuka. Siaran yang hilang, area peta yang belum dimuat, atau situs yang tidak terpetakan bukan bukti ketiadaan.</p>`;
  panel.hidden = false;
  if (state.panelMarkup !== markup) {
    panel.innerHTML = markup;
    state.panelMarkup = markup;
  }
}

function rotateAwarenessPages() {
  if (!state.enabled || !state.results) return;
  let changed = false;
  for (const cohort of state.results.cohorts) {
    const pageCount = Math.max(1, Math.ceil(cohort.summary.nearest.length / AWARENESS_PAGE_SIZE));
    if (pageCount <= 1) continue;
    const current = state.cohortPages.get(cohort.id) || 0;
    state.cohortPages.set(cohort.id, ((Math.floor(current / AWARENESS_PAGE_SIZE) + 1) % pageCount) * AWARENESS_PAGE_SIZE);
    changed = true;
  }
  if (changed) { renderResults(); scheduleDirectionOverlayUpdate(true); }
}

export function startAwarenessPageRotation() {
  if (!state.pageTimer) state.pageTimer = window.setInterval(rotateAwarenessPages, AWARENESS_PAGE_ROTATE_MS);
}

export function stopAwarenessPageRotation() {
  if (state.pageTimer) window.clearInterval(state.pageTimer);
  state.pageTimer = null;
}
