/**
 * Runs `run` once the open dropdown menu has left the DOM and Radix has handed focus back to its trigger. Dialogs opened
 * straight from a menu item would otherwise capture focus mid-teardown (the <body>), so closing them could not return
 * to the row's "…" button.
 */

/** Longest wait for the menu to disappear before opening the dialog anyway. */
export const MENU_CLOSE_WAIT_MS = 600;

/** @param {() => void} run */
export function afterMenuCloses(run) {
  const started = performance.now();
  const tick = () => {
    if (document.querySelector('[role="menu"]') && performance.now() - started < MENU_CLOSE_WAIT_MS) {
      requestAnimationFrame(tick);
      return;
    }
    // One more macrotask: Radix restores focus to the trigger in a timeout after unmounting the menu.
    setTimeout(run, 0);
  };
  requestAnimationFrame(tick);
}
