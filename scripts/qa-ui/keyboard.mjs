// scripts/qa-ui/keyboard.mjs
/**
 * Keyboard-probe helpers other workers extend. Each helper throws an Error with a readable message on failure
 * (probes are plain async functions; the runner turns a throw into a failed probe).
 */

/** Describe the focused element: tag, id, aria-label/text and whether it sits inside `selector`. */
export async function focusInfo(page, selector = null) {
  return page.evaluate((within) => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: 'body', text: '', label: '', id: '', inside: false };
    const label = el.getAttribute('aria-label') || '';
    return {
      tag: el.tagName.toLowerCase(), id: el.id, label, role: el.getAttribute('role') || '',
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), slot: el.getAttribute('data-slot') || '',
      inside: within ? Boolean(el.closest(within)) : false,
    };
  }, selector);
}

/** Press a key `times` times. */
export async function press(page, key, times = 1) {
  for (let index = 0; index < times; index += 1) await page.keyboard.press(key);
}

/** Whether the focused element matches a CSS selector. */
export const focusMatches = (page, selector) => page.evaluate((s) => Boolean(document.activeElement?.matches(s)), selector);

/** Press Tab until the focused element matches `selector`; returns how many presses it took. */
export async function tabUntil(page, selector, { max = 60, shift = false } = {}) {
  for (let count = 1; count <= max; count += 1) {
    if (shift) await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    if (shift) await page.keyboard.up('Shift');
    if (await focusMatches(page, selector)) return count;
  }
  throw new Error(`Tab did not reach "${selector}" within ${max} presses (stopped on ${JSON.stringify(await focusInfo(page))})`);
}

/** Wait until the focused element satisfies `selector` (after an async open/close). */
export async function waitForFocus(page, selector, timeout = 3000) {
  try {
    await page.waitForFunction((s) => Boolean(document.activeElement?.matches(s)), { timeout }, selector);
  } catch {
    throw new Error(`Focus did not land on "${selector}" (it is on ${JSON.stringify(await focusInfo(page))})`);
  }
}

/** Tab `count` times and assert focus never leaves `containerSelector` (focus trap). */
export async function expectFocusTrapped(page, containerSelector, count = 10) {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page, containerSelector);
    if (!info.inside) throw new Error(`Focus escaped "${containerSelector}" on Tab ${index + 1}: ${JSON.stringify(info)}`);
  }
}

/** Assert Esc closes `overlaySelector` and focus returns to `returnSelector`. */
export async function expectEscapeRestoresFocus(page, overlaySelector, returnSelector) {
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 3000 }, overlaySelector)
    .catch(() => { throw new Error(`Esc did not close "${overlaySelector}"`); });
  await waitForFocus(page, returnSelector);
}

/**
 * Walk the whole tab order and list the stops; flags stops that are not visible (hidden tab stops, WCAG 2.4.3/2.4.7).
 * @returns {Promise<{stops: string[], hidden: string[]}>}
 */
export async function tabOrder(page, { max = 80 } = {}) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const stops = [];
  const hidden = [];
  for (let index = 0; index < max; index += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      return { name: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`, visible };
    });
    if (!stop) break;
    if (stops[0] === stop.name && stops.length > 1) break;
    stops.push(stop.name);
    if (!stop.visible) hidden.push(stop.name);
  }
  return { stops, hidden };
}
