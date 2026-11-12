/**
 * Legacy share-link checks for scripts/qa-map-source-tray.mjs, split out of
 * the harness to keep it within its size budget (2026-11-12) — same steps.
 */
import path from 'node:path';

/**
 * Open old `map=` links and assert each lands on the boot basemap.
 * @param {{page: import('puppeteer').Page, appUrl: string, shotsDir: string,
 *   check: (name: string, passed: boolean, detail?: string) => void,
 *   forceKeyless: boolean, ionAvailable: boolean}} ctx
 * @returns {Promise<void>}
 */
export async function checkLegacyLinksLandOnBootStack({ page, appUrl, shotsDir, check, forceKeyless, ionAvailable }) {
  // The share hash neither carries nor restores a basemap: every load lands on
  // the boot stack — Bing Labels when the server has an ion token, keyless Esri
  // otherwise (activateBootStack). Old links with `map=photoreal` (which used to
  // load Google 3D behind the boot activation), retired ids like `bing-road`,
  // and garbage all take the SAME path and must end on the boot stack with its
  // tile lit. Google 3D remains a manual in-session pick.
  await page.setViewport({ width: 1000, height: 900, deviceScaleFactor: 1 });
  const expectedLegacyActive = ionAvailable && !forceKeyless ? 'bing-labels' : 'esri-imagery';
  for (const legacyId of ['photoreal', 'bing-road', 'garbage']) {
    if (forceKeyless) {
      // Keep the forced-keyless seam alive. A full reload would rebuild the
      // controller from the keyed server before this in-page override exists,
      // so drive the same parse/apply startup contract on the current keyless
      // controller instead.
      await page.evaluate(async (id) => {
        const styleManager = window.__godsEyeView.styleManager;
        // Without a reload nothing re-runs boot, so set the keyless boot stack
        // here with a clean lastError: a restore that tried to honor `map=`
        // (Google 3D is unavailable keyless) would then show up as an error.
        await styleManager._setMapStack('esri-imagery', { syncShare: false });
        history.replaceState(null, '', `?welcome=0#v=2&lat=30.27&lon=-97.74&map=${id}`);
        const state = styleManager.shareLinkManager.parseInitialHash();
        await styleManager.shareLinkManager.applyState(state, { applyCamera: false });
        styleManager.shareLinkManager.completeInitialRestore();
      }, legacyId);
    } else {
      // A goto that differs from the current URL only in its hash is a
      // same-document navigation: the app is not reloaded and keeps the stack
      // the steps above left active (photoreal on a keyed machine). Leave the
      // document first so every link is opened by a fresh boot, as a recipient
      // opens it.
      await page.goto('about:blank');
      await page.goto(`${appUrl}/?welcome=0#v=2&lat=30.27&lon=-97.74&map=${legacyId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await page.waitForFunction(() => window.__godsEyeView?.styleManager, { timeout: 60_000 });
      await page.waitForFunction(
        () => document.getElementById('loading-screen')?.classList.contains('hidden'),
        { timeout: 60_000 },
      );
    }
    await page.waitForFunction(
      () => window.__godsEyeView.styleManager.mapStackController.getState()?.status !== 'switching',
      { timeout: 20_000 },
    // A stack still switching after 20 s is not swallowed: the check below
    // reads the same controller state and reports it as a failure.
    ).catch(() => {});
    const restored = await page.evaluate(() => ({
      activeId: window.__godsEyeView.styleManager.mapStackController.getActiveId(),
      lastError: window.__godsEyeView.styleManager.mapStackController.getState()?.lastError || null,
      status: document.getElementById('map-stack-status').textContent.trim(),
      pressed: [...document.querySelectorAll('.map-stack-chip')]
        .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
        .map((chip) => chip.dataset.stackId),
    }));
    check(
      `a map=${legacyId} link lands on the boot stack (${expectedLegacyActive}) with its tile lit`,
      restored.activeId === expectedLegacyActive
        && restored.lastError === null
        && JSON.stringify(restored.pressed) === JSON.stringify([expectedLegacyActive]),
      JSON.stringify(restored),
    );
    await page.screenshot({ path: path.join(shotsDir, `legacy-${legacyId}.png`) });
  }
}
