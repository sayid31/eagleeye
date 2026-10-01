// Helper functions moved out of cockpitViewController.js.

/**
 * Whether an element currently occupies screen space a layout must respect.
 *
 * A rect alone is not enough: `visibility: hidden` and `opacity: 0` (how the
 * Intel HUD retires as a whole) leave the rect intact, so anything anchoring to
 * a HUD readout must walk the ancestors as well.
 *
 * @param {Element|null|undefined} element - Candidate element.
 * @returns {boolean} True when the element is painted and has area.
 */
export function isRenderedOnScreen(element) {
  if (!element) return false;
  for (let node = element; node instanceof Element; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function formatCockpitBriefAge(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'TIME UNKNOWN';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}H AGO` : `${Math.round(hours / 24)}D AGO`;
}

export function formatCockpitWindDirection(value) {
  if (!Number.isFinite(value)) return 'DIR UNKNOWN';
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((value % 360) + 360) % 360;
  return `${labels[Math.round(normalized / 45) % labels.length]} · ${Math.round(normalized)}°`;
}

export function setCockpitRollingValue(element, text, numericValue, {
  circularRange = null,
  immediate = false,
} = {}) {
  if (!element) return;
  const nextText = String(text);
  const previousText = element.dataset.rollingText;
  const previousValue = Number(element.dataset.rollingValue);
  const nowMs = performance.now();
  const lastRollMs = Number(element.dataset.rollingAt);
  if (!immediate
    && previousText !== undefined
    && previousText !== nextText
    && Number.isFinite(lastRollMs)
    && nowMs - lastRollMs < 220) {
    return;
  }
  element.dataset.rollingText = nextText;
  element.dataset.rollingAt = String(nowMs);
  if (Number.isFinite(numericValue)) element.dataset.rollingValue = String(numericValue);
  else delete element.dataset.rollingValue;
  element.setAttribute('aria-label', nextText);

  if (immediate || previousText === undefined || previousText === nextText) {
    if (previousText !== nextText || !element.querySelector('.cockpit-roll-token')) {
      element.replaceChildren(...Array.from(nextText, (character) => {
        const token = document.createElement('span');
        token.className = 'cockpit-roll-token';
        token.setAttribute('aria-hidden', 'true');
        token.textContent = character;
        return token;
      }));
    }
    return;
  }

  let delta = Number.isFinite(numericValue) && Number.isFinite(previousValue)
    ? numericValue - previousValue
    : 0;
  if (Number.isFinite(circularRange) && circularRange > 0) {
    const halfRange = circularRange / 2;
    if (delta > halfRange) delta -= circularRange;
    else if (delta < -halfRange) delta += circularRange;
  }
  const direction = delta < 0 ? 'down' : 'up';
  const width = Math.max(previousText.length, nextText.length);
  const from = previousText.padStart(width, ' ');
  const to = nextText.padStart(width, ' ');
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < width; index += 1) {
    const previousCharacter = from[index];
    const nextCharacter = to[index];
    const token = document.createElement('span');
    token.className = 'cockpit-roll-token';
    token.setAttribute('aria-hidden', 'true');

    if (previousCharacter === nextCharacter
      || !/\d/.test(previousCharacter)
      || !/\d/.test(nextCharacter)) {
      token.textContent = nextCharacter === ' ' ? '\u00a0' : nextCharacter;
      fragment.append(token);
      continue;
    }

    token.classList.add('is-rolling', `roll-${direction}`);
    const track = document.createElement('span');
    track.className = 'cockpit-roll-track';
    const first = document.createElement('span');
    const second = document.createElement('span');
    first.textContent = direction === 'up' ? previousCharacter : nextCharacter;
    second.textContent = direction === 'up' ? nextCharacter : previousCharacter;
    track.append(first, second);
    token.append(track);
    fragment.append(token);
  }

  element.replaceChildren(fragment);
}
