/**
 * Page-side probes for scripts/qa-map-source-tray.mjs. Each export is a
 * self-contained function passed to `page.evaluate`: puppeteer sends its
 * source text to the browser, so it must use nothing from Node scope (only
 * its arguments and the page's globals). Split out of the harness to keep it
 * within its size budget (2026-11-12) — the bodies are unchanged.
 */

/** Geometry of the open Map Source tray, its popover and every chip. Runs in the page. */
export const probeTrayMetrics = () => {
const panel = document.getElementById('control-panel');
const popover = document.getElementById('control-panel-popover');
const row = document.getElementById('map-stack-chips');
const popoverRect = popover.getBoundingClientRect();
const chips = [...row.children].map((chip) => {
  const rect = chip.getBoundingClientRect();
  return {
    id: chip.dataset.stackId,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    pressed: chip.getAttribute('aria-pressed'),
    ariaDisabled: chip.getAttribute('aria-disabled'),
    ariaLabel: chip.getAttribute('aria-label'),
  };
});
return {
  viewport: { width: innerWidth, height: innerHeight },
  expanded: document.getElementById('control-panel-toggle').getAttribute('aria-expanded'),
  pinned: panel.classList.contains('dock-pinned'),
  popover: {
    left: popoverRect.left,
    right: popoverRect.right,
    top: popoverRect.top,
    bottom: popoverRect.bottom,
    width: popoverRect.width,
  },
  columns: getComputedStyle(row).gridTemplateColumns,
  rows: new Set(chips.map((chip) => chip.top)).size,
  chips,
};
};

/** Switch to Esri, raise two tile errors, and report the OSM fallback state. Runs in the page. */
export const probeEsriTileFailureFallback = async () => {
  const styleManager = window.__godsEyeView.styleManager;
  const controller = styleManager.mapStackController;
  await styleManager._setMapStack('esri-imagery', { syncShare: false });
  // Cesium writes a newly added static credit into the DOM on its next
  // rendered frame. Boot used to start on Esri, so the credit was already
  // there; since the boot basemap can be Bing it may be added only now.
  const creditDeadline = performance.now() + 2000;
  while (!document.body.innerText.includes('Powered by Esri') && performance.now() < creditDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const provider = controller._activeImageryProvider;
  const before = {
    activeId: controller.getActiveId(),
    creditVisible: document.body.innerText.includes('Powered by Esri'),
    globeShown: styleManager.viewer.scene.globe.show,
    hasLayer: Boolean(controller._imageryLayer),
  };
  provider?.errorEvent?.raiseEvent?.({ timesRetried: 0 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const afterOne = controller.getActiveId();
  provider?.errorEvent?.raiseEvent?.({ timesRetried: 1 });
  const deadline = performance.now() + 5000;
  while (controller.getActiveId() !== 'osm' && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  // The controller commits `activeId` before its fallback promise callback
  // emits the terminal error state that re-syncs the chips. Give that
  // callback one turn so the DOM assertion observes the completed contract.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const afterTwo = {
    activeId: controller.getActiveId(),
    lastError: controller.getState().lastError,
    creditVisible: document.body.innerText.includes('Powered by Esri'),
    globeShown: styleManager.viewer.scene.globe.show,
    hasLayer: Boolean(controller._imageryLayer),
    active: [...document.querySelectorAll('.map-stack-chip')]
      .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
      .map((chip) => chip.dataset.stackId),
  };
  await styleManager._setMapStack('esri-imagery', { syncShare: false });
  return { before, afterOne, afterTwo };
};

/** Switch stacks and record the feedback shown before, during and after commit. Runs in the page. */
export const probeSwitching = async () => {
  const styleManager = window.__godsEyeView.styleManager;
  const controller = styleManager.mapStackController;
  const originalSetStack = controller.setStack.bind(controller);
  const before = controller.getActiveId();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  controller.setStack = async (stackId) => {
    await gate;
    return originalSetStack(stackId);
  };
  const switchPromise = styleManager._setMapStack('osm', { syncShare: false });
  const during = {
    status: document.getElementById('map-stack-status').textContent,
    active: [...document.querySelectorAll('.map-stack-chip')]
      .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
      .map((chip) => chip.dataset.stackId),
  };
  release();
  await switchPromise;
  const after = {
    status: document.getElementById('map-stack-status').textContent,
    active: [...document.querySelectorAll('.map-stack-chip')]
      .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
      .map((chip) => chip.dataset.stackId),
  };
  controller.setStack = originalSetStack;
  await styleManager._setMapStack(before, { syncShare: false });
  return { before, during, after };
};

/** Drive the ACQUIRING notice through follow, stale terminal and cancel. Runs in the page. */
export const probeAcquiringLifecycle = async () => {
  const styleManager = window.__godsEyeView.styleManager;
  const status = document.getElementById('global-loading-status');
  const snapshot = () => ({
    hidden: status.hidden,
    state: status.dataset.state || null,
    label: document.getElementById('global-loading-label').textContent.trim(),
    detail: document.getElementById('global-loading-detail').textContent.trim(),
  });
  styleManager._handleShareTrackingRestoreStatus({
    classification: 'pending',
    layerId: 'flights',
    targetId: 'qa-flight',
    label: 'flight',
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  const pending = snapshot();
  styleManager._handleShareTrackingRestoreStatus({
    classification: 'followed',
    layerId: 'flights',
    targetId: 'qa-flight',
    label: 'flight',
  });
  const followed = snapshot();
  styleManager._handleShareTrackingRestoreStatus({
    classification: 'pending',
    layerId: 'military',
    targetId: 'qa-military',
    label: 'military flight',
  });
  styleManager._handleShareTrackingRestoreStatus({
    classification: 'source-unavailable',
    layerId: 'flights',
    targetId: 'qa-flight',
    label: 'flight',
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  const staleTerminal = snapshot();
  styleManager._handleShareTrackingRestoreStatus({
    classification: 'cancelled',
    layerId: 'military',
    targetId: 'qa-military',
    label: 'military flight',
  });
  const cancelled = snapshot();
  return { pending, followed, staleTerminal, cancelled };
};

/** Order a manager failure and a queued share failure and sample each dwell. Runs in the page. */
export const probeAcquiringFailureArbitration = async (shareFailureNotice) => {
  const styleManager = window.__godsEyeView.styleManager;
  const dataManager = styleManager._dataManager;
  const status = document.getElementById('global-loading-status');
  const originalGetAll = dataManager.getAll;
  const snapshot = () => ({
    hidden: status.hidden,
    state: status.dataset.state || null,
    label: document.getElementById('global-loading-label').textContent.trim(),
    detail: document.getElementById('global-loading-detail').textContent.trim(),
  });
  const waitForQueuedNotice = async (label, timeoutMs = 1000) => {
    const deadline = performance.now() + timeoutMs;
    while (styleManager._globalStatusNotice?.label !== label
        && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return styleManager._globalStatusNotice?.label === label;
  };
  const baseNow = performance.now();
  try {
    styleManager._loadingFeedbackState = {
      phase: 'idle', visible: false, startedAt: 0, showAt: 0, hideAt: 0,
      activeIds: [], batchOutcome: null, terminal: null, operation: null,
    };
    styleManager._handleShareTrackingRestoreStatus({
      classification: 'pending',
      layerId: 'flights',
      targetId: 'qa-failure-flight',
      label: 'flight',
    });
    dataManager.getAll = () => [{
      id: 'qa-unrelated-layer',
      name: 'QA unrelated layer',
      lifecycleState: 'enabling',
      enabled: false,
      stats: {},
    }];
    styleManager._updateGlobalLoadingFeedback(baseNow);
    styleManager._updateGlobalLoadingFeedback(baseNow + 200);
    dataManager.getAll = () => [];
    styleManager._loadingFeedbackEvent = {
      type: 'visibility-failed',
      layerId: 'qa-unrelated-layer',
      error: new Error('QA offline'),
    };
    styleManager._updateGlobalLoadingFeedback(baseNow + 300);
    const failureStart = snapshot();
    styleManager._handleShareTrackingRestoreStatus({
      classification: 'source-unavailable',
      layerId: 'flights',
      targetId: 'qa-failure-flight',
      label: 'flight',
    });
    const queuedNoticeReady = await waitForQueuedNotice(shareFailureNotice);
    const shareFailureQueued = snapshot();
    styleManager._updateGlobalLoadingFeedback(baseNow + 5299);
    const failureEnd = snapshot();
    styleManager._updateGlobalLoadingFeedback(baseNow + 5300);
    const shareFailureStart = snapshot();
    styleManager._updateGlobalLoadingFeedback(baseNow + 10299);
    const shareFailureEnd = snapshot();
    styleManager._updateGlobalLoadingFeedback(baseNow + 10300);
    const settled = snapshot();
    return {
      failureStart,
      queuedNoticeReady,
      shareFailureQueued,
      failureEnd,
      shareFailureStart,
      shareFailureEnd,
      settled,
    };
  } finally {
    dataManager.getAll = originalGetAll;
    styleManager._handleShareTrackingRestoreStatus({
      classification: 'cancelled',
      layerId: 'flights',
      targetId: 'qa-failure-flight',
      label: 'flight',
    });
  }
};
