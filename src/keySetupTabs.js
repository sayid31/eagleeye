// src/keySetupTabs.js
/**
 * KUNCI / SUARA tab switching for the POWER UP dialog. Pure DOM wiring: the
 * tab strip stays hidden until `enable()` (voice settings only appear when
 * their endpoint answered), so a keys-only install looks exactly as before.
 */

/**
 * @param {Element} root The `#key-setup` dialog.
 * @returns {{enable: () => void, select: (name: string) => void}}
 */
export function wireKeySetupTabs(root) {
  const strip = root.querySelector('[data-key-setup-tabs]');
  const tabs = [...root.querySelectorAll('[data-key-setup-tab]')];
  const panes = [...root.querySelectorAll('[data-key-setup-pane]')];

  const select = (name) => {
    for (const tab of tabs) {
      const on = tab.dataset.keySetupTab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const pane of panes) pane.hidden = pane.dataset.keySetupPane !== name;
  };

  strip?.addEventListener('click', (event) => {
    const tab = event.target?.closest?.('[data-key-setup-tab]');
    if (tab) select(tab.dataset.keySetupTab);
  });
  strip?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const next = tabs[(current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    select(next.dataset.keySetupTab);
    next.focus();
  });

  return {
    enable() { if (strip) strip.hidden = false; },
    select,
  };
}
