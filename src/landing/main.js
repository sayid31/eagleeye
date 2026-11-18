// src/landing/main.js
/**
 * Landing page entry. Order matters: a legacy share link leaves for `/app`
 * before anything renders; otherwise the static page stays as-is and only the
 * CTA slots are filled in once `/api/me` answers (or fails → "Masuk").
 *
 * @module landing/main
 */

import { signOut } from '../auth/authClientApi.js';
import { accessContactHref } from './landingConfig.js';
import { landingCta } from './landingCta.js';
import { mountMobileMenu, mountThemeControl } from './landingChrome.js';
import { fetchMe } from './landingSession.js';
import { legacyAppRedirect } from './legacyShareRedirect.js';

/**
 * Sign out, then reload so the CTA reflects the new state. A failed sign-out
 * is reported; the reload still happens and shows whatever the server says.
 * @param {HTMLButtonElement} button
 */
async function signOutAndReload(button) {
  button.disabled = true;
  try {
    await signOut();
  } catch (error) {
    console.warn(`[landing] sign-out failed, reloading anyway: ${error.message}`);
  }
  window.location.reload();
}

/**
 * One CTA control: a link, or a button for the sign-out action.
 * @param {import('./landingCta.js').CtaLink | import('./landingCta.js').CtaAction} item
 * @param {string} className
 * @returns {HTMLElement}
 */
function ctaElement(item, className) {
  if ('action' in item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = item.label;
    button.addEventListener('click', () => signOutAndReload(button));
    return button;
  }
  const link = document.createElement('a');
  link.className = className;
  link.href = item.href;
  link.textContent = item.label;
  return link;
}

/**
 * Replace the contents of every `[data-cta-slot]` with the computed buttons.
 * `hero` and `menu` slots get primary + secondary; the `nav` slot gets the primary only.
 * @param {import('./landingCta.js').LandingCta} cta
 */
function renderCta(cta) {
  for (const slot of document.querySelectorAll('[data-cta-slot]')) {
    const compact = slot.dataset.ctaSlot === 'nav';
    const items = [ctaElement(cta.primary, compact ? 'ld-btn ld-btn--sm' : 'ld-btn ld-btn--primary')];
    if (!compact) items.push(...cta.secondary.map((item) => ctaElement(item, 'ld-btn ld-btn--ghost')));
    slot.replaceChildren(...items);
    slot.removeAttribute('aria-busy');
  }
}

/** Show the request-access contact rows only when one is configured. */
function renderContact(href) {
  if (!href) return;
  for (const node of document.querySelectorAll('[data-access-contact]')) {
    const link = node.querySelector('a');
    if (link) link.href = href;
    node.hidden = false;
  }
}

async function start() {
  const redirect = legacyAppRedirect(window.location);
  if (redirect) {
    window.location.replace(redirect);
    return;
  }
  mountThemeControl();
  mountMobileMenu();
  const contact = accessContactHref();
  renderContact(contact);
  renderCta(landingCta(await fetchMe(), { accessContact: contact }));
}

start();
