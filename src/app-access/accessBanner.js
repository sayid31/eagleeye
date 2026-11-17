// src/app-access/accessBanner.js
/**
 * The single dismissible "Beberapa fitur belum diaktifkan admin" banner on the
 * map, listing which toggles are off. Dismissal lasts for the browser session
 * and only for that exact set: a feature locked later brings it back.
 *
 * @module app-access/accessBanner
 */

import { CAPABILITY_LABELS } from './capabilityDenial.js';
import { CAPABILITY_GATES } from './capabilityRoutes.js';

export const ACCESS_BANNER_TITLE = 'Beberapa fitur belum diaktifkan admin';
export const ACCESS_BANNER_DISMISS_LABEL = 'Tutup';
/** sessionStorage key holding the dismissed set's signature. */
export const ACCESS_BANNER_DISMISS_KEY = 'gev:account-banner-dismissed';
const KILLED_SUFFIX = ' (dimatikan sementara)';

/**
 * What the banner shows. Pure.
 * @param {Map<string, string>} locks gate → lock kind ('plan' | 'revoked' | 'killed').
 * @param {string | null} dismissedKey Signature the viewer dismissed this session.
 * @returns {{title: string, items: string[], key: string} | null} null = no banner.
 */
export function accessBannerModel(locks, dismissedKey) {
  const gates = CAPABILITY_GATES.filter((gate) => locks.has(gate));
  if (!gates.length) return null;
  const key = gates.map((gate) => `${gate}:${locks.get(gate) === 'killed' ? 'k' : 'o'}`).join(',');
  if (key === dismissedKey) return null;
  const items = gates.map((gate) => CAPABILITY_LABELS[gate] + (locks.get(gate) === 'killed' ? KILLED_SUFFIX : ''));
  return { title: ACCESS_BANNER_TITLE, items, key };
}

/**
 * sessionStorage, or an in-memory stand-in when the browser refuses it
 * (private mode, blocked site data) — the banner then just reappears on reload.
 * @param {() => Storage} [read]
 * @returns {{get: () => string | null, set: (value: string) => void}}
 */
export function bannerDismissStore(read = () => globalThis.sessionStorage) {
  let memory = null;
  const storage = () => {
    try {
      return read() ?? null;
    } catch (error) {
      console.warn(`[access] sessionStorage unavailable: ${error.message}`);
      return null;
    }
  };
  return {
    get: () => {
      try {
        return storage()?.getItem(ACCESS_BANNER_DISMISS_KEY) ?? memory;
      } catch (error) {
        console.warn(`[access] banner state unreadable: ${error.message}`);
        return memory;
      }
    },
    set: (value) => {
      memory = value;
      try {
        storage()?.setItem(ACCESS_BANNER_DISMISS_KEY, value);
      } catch (error) {
        console.warn(`[access] banner state not saved: ${error.message}`);
      }
    },
  };
}

/**
 * Show, update or remove `#account-banner` for a model.
 * @param {Document} doc
 * @param {{title: string, items: string[], key: string} | {text: string} | null} model
 *   A list model, a plain status line (`text`), or null to remove.
 * @param {(key: string) => void} onDismiss
 */
export function renderAccessBanner(doc, model, onDismiss) {
  let banner = doc.getElementById('account-banner');
  if (!model) {
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = doc.createElement('div');
    banner.id = 'account-banner';
    banner.setAttribute('role', 'status');
    doc.body.append(banner);
  }
  banner.replaceChildren();
  const title = doc.createElement('span');
  title.className = 'account-banner-title';
  title.textContent = model.text ?? `${model.title}:`;
  banner.append(title);
  if (!model.items) return;
  const list = doc.createElement('ul');
  for (const item of model.items) {
    const li = doc.createElement('li');
    li.textContent = item;
    list.append(li);
  }
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'account-banner-close';
  close.textContent = ACCESS_BANNER_DISMISS_LABEL;
  close.setAttribute('aria-label', `${ACCESS_BANNER_DISMISS_LABEL} pemberitahuan`);
  close.addEventListener('click', () => onDismiss(model.key));
  banner.append(list, close);
}
