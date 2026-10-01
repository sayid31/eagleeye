// CockpitViewController signal feed and context/signal panel layout.
import {
  COCKPIT_UTILITY_LAUNCHER_MIN_HEIGHT_PX,
  COCKPIT_UTILITY_MIN_TOP_PX,
  COCKPIT_UTILITY_MIN_TOP_RATIO,
  COCKPIT_UTILITY_REC_GAP_PX,
  COCKPIT_UTILITY_SIGNAL_GAP_PX,
} from './cockpitViewControllerConstants.js';
import { formatAwarenessLabel } from './data/militaryAwarenessEngine.js';
import { isRenderedOnScreen } from './cockpitViewControllerHelpers.js';
import { resolveCockpitUtilityAnchor, resolveCockpitUtilityLayout } from './cockpitUtilityLayout.js';

export const signalsMixin = {
renderCockpitSignals() {
    if (!this.signalList) return;
    this.signalList.replaceChildren(...this.signalItems.map((item) => {
      const entry = document.createElement('li');
      entry.className = item.tone;
      const time = document.createElement('time');
      time.textContent = new Date(item.timestamp).toISOString().slice(11, 19) + 'Z';
      const body = document.createElement('div');
      const heading = item.target ? document.createElement('button') : document.createElement('strong');
      if (item.target) {
        heading.type = 'button';
        heading.className = 'cockpit-signal-target';
        heading.dataset.signalLayer = item.target.layerId;
        heading.dataset.signalId = item.target.id;
        heading.setAttribute('aria-label', `Select flight ${item.title}`);
        const label = document.createElement('span');
        label.className = 'cockpit-signal-target-label';
        label.textContent = item.title;
        const rule = document.createElement('span');
        rule.className = 'cockpit-signal-target-rule';
        rule.setAttribute('aria-hidden', 'true');
        const chevron = document.createElement('span');
        chevron.className = 'material-symbols-outlined cockpit-signal-target-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = 'chevron_right';
        heading.append(label, rule, chevron);
        entry.classList.add('actionable');
      } else {
        heading.textContent = item.title;
      }
      const copy = document.createElement('span');
      copy.textContent = item.detail;
      body.append(heading, copy);
      entry.append(time, body);
      return entry;
    }));
    this.scheduleContextLayout();
  },

pushCockpitSignal(key, tone, title, detail, target = null) {
    if (!this.signalList || !title || !detail) return;
    const signature = `${title}|${detail}|${target?.layerId || ''}|${target?.id || ''}`;
    if (this.signalSignatures.get(key) === signature) return;
    this.signalSignatures.set(key, signature);
    this.signalItems.unshift({ key, tone, title, detail, target, timestamp: Date.now() });
    this.signalItems = this.signalItems.slice(0, 5);
    this.renderCockpitSignals();
  },

updateCockpitSignals(snapshot, unknownCount) {
    const previous = new Map(this.signalItems.map((item) => [item.key, item]));
    const contacts = [];
    const subject = snapshot.subject;
    if (['flights', 'military'].includes(subject?.layerId) && subject?.id) {
      contacts.push({
        key: `flight:${subject.layerId}:${subject.id}`,
        tone: 'track',
        title: subject.label || subject.id,
        detail: `${subject.layerId === 'military' ? 'MILITARY FLIGHT' : 'COMMERCIAL FLIGHT'} · CURRENT`,
        target: { layerId: subject.layerId, id: String(subject.id) },
        distanceM: -1,
      });
    }
    for (const cohort of snapshot.cohorts) {
      if (!['flights', 'military'].includes(cohort.id)) continue;
      for (const item of cohort.nearest) {
        const id = item.icao24 || item.id;
        if (!id) continue;
        contacts.push({
          key: `flight:${cohort.id}:${id}`,
          tone: cohort.id === 'military' ? 'nearby military' : 'nearby',
          // `id` above is IDENTITY (the ICAO hex). Display must not reuse it:
          // the row's own `id` already carries the layer's label convention
          // (callsign → registration → hex), so a callsign-less enriched
          // contact reads as its registration here too. Same helper the
          // Context panel's nearest list uses.
          title: formatAwarenessLabel(item),
          detail: `${cohort.id === 'military' ? 'MILITARY FLIGHT' : 'COMMERCIAL FLIGHT'} · ${
            Number.isFinite(item.distanceM)
              ? `${item.distanceM < 10000 ? (item.distanceM / 1000).toFixed(1) : Math.round(item.distanceM / 1000)} KM`
              : 'DISTANCE UNKNOWN'
          }`,
          target: { layerId: cohort.id, id: String(id) },
          distanceM: item.distanceM ?? Infinity,
        });
      }
    }
    contacts.sort((a, b) => a.distanceM - b.distanceM);
    const nextItems = contacts.slice(0, 5).map((item) => ({
      ...item,
      timestamp: previous.get(item.key)?.timestamp || snapshot.evaluatedAt || Date.now(),
    }));
    if (unknownCount) {
      const sources = snapshot.cohorts
        .filter((cohort) => cohort.count === null)
        .map((cohort) => cohort.source)
        .join(' · ');
      nextItems.splice(4, Math.max(0, nextItems.length - 4), {
        key: 'input-status',
        tone: 'warning',
        title: `${unknownCount} INPUT${unknownCount === 1 ? '' : 'S'} UNKNOWN`,
        detail: sources || 'SOURCE STATUS UNAVAILABLE',
        target: null,
        timestamp: previous.get('input-status')?.timestamp || snapshot.evaluatedAt || Date.now(),
      });
    }
    this.signalItems = nextItems;
    this.signalSignatures.clear();
    this.renderCockpitSignals();
  },

setContextCollapsed(collapsed) {
    const wasCollapsed = this.contextCollapsed;
    this.contextCollapsed = Boolean(collapsed);
    if (this.context) this.context.dataset.collapsed = String(this.contextCollapsed);
    if (this.contextToggle) {
      const expanded = !this.contextCollapsed;
      this.contextToggle.setAttribute('aria-expanded', String(expanded));
      this.contextToggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} Contact panel`);
      this.contextToggle.title = `${expanded ? 'Collapse' : 'Expand'} contact panel`;
      const icon = this.contextToggle.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = expanded ? 'chevron_left' : 'chevron_right';
    }
    if (this.active && wasCollapsed && !this.contextCollapsed) {
      window.dispatchEvent(new CustomEvent('gev:cockpit-context-expanded'));
    }
    this.scheduleContextLayout();
  },

setSignalCollapsed(collapsed, { user = false } = {}) {
    const wasCollapsed = this.signalCollapsed;
    this.signalCollapsed = Boolean(collapsed);
    if (user) this.signalUserCollapsed = this.signalCollapsed;
    if (this.signalStream) this.signalStream.dataset.collapsed = String(this.signalCollapsed);
    if (this.signalToggle) {
      const expanded = !this.signalCollapsed;
      this.signalToggle.setAttribute('aria-expanded', String(expanded));
      this.signalToggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} cockpit briefing panel`);
      this.signalToggle.title = `${expanded ? 'Collapse' : 'Expand'} briefing panel`;
      const icon = this.signalToggle.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = expanded ? 'right_panel_close' : 'right_panel_open';
    }
    if (this.signalCollapsed) this.stopBriefRotation();
    else this.startBriefRotation({ reset: true });
    if (this.active && wasCollapsed && !this.signalCollapsed) {
      window.dispatchEvent(new CustomEvent('gev:cockpit-signal-expanded'));
    }
    this.scheduleContextLayout();
  },

syncContextLayout() {
    if (!this.context || this.context.hidden) return;
    if (window.matchMedia('(max-width: 760px)').matches) {
      this.context.dataset.layoutMode = 'compact-bottom';
      this.context.style.removeProperty('--cockpit-context-left');
      this.context.style.removeProperty('--cockpit-context-top');
      this.context.style.removeProperty('--cockpit-context-max-height');
      return;
    }

    const desktopInset = Math.max(24, Math.min(58, window.innerWidth * 0.04));
    this.context.dataset.layoutMode = 'bottom-left';
    this.context.style.setProperty('--cockpit-context-left', `${desktopInset.toFixed(1)}px`);
    this.context.style.removeProperty('--cockpit-context-top');
    this.context.style.removeProperty('--cockpit-context-max-height');
  },

syncSignalLayout() {
    if (!this.signalStream || this.signalStream.hidden) return;
    const utilityControls = document.getElementById('cockpit-utility-controls');
    if (window.matchMedia('(max-width: 760px)').matches) {
      this.signalStream.dataset.layoutMode = 'compact-top';
      utilityControls?.classList.remove('layout-primary-only');
      utilityControls?.querySelectorAll('.cockpit-utility-control').forEach((control) => {
        const hiddenSibling = Boolean(
          utilityControls.querySelector('.cockpit-utility-control.is-expanded')
          && !control.classList.contains('is-expanded')
        );
        control.setAttribute('aria-hidden', String(hiddenSibling));
      });
      this.hud?.style.removeProperty('--cockpit-utility-top');
      this.hud?.style.removeProperty('--cockpit-utility-max-height');
      this.hud?.style.removeProperty('--cockpit-utility-expanded-max-height');
      this.signalStream.style.removeProperty('--cockpit-signal-right');
      this.signalStream.style.removeProperty('--cockpit-signal-top');
      this.signalStream.style.removeProperty('--cockpit-signal-max-height');
      return;
    }

    const desktopInset = Math.max(24, Math.min(58, window.innerWidth * 0.04));
    this.signalStream.dataset.layoutMode = 'bottom-right';
    this.signalStream.style.setProperty('--cockpit-signal-right', `${desktopInset.toFixed(1)}px`);
    this.signalStream.style.removeProperty('--cockpit-signal-top');
    this.signalStream.style.removeProperty('--cockpit-signal-max-height');
    const signalBounds = this.signalStream.getBoundingClientRect();
    const utilityBounds = utilityControls?.getBoundingClientRect();
    if (utilityBounds) {
      const expandedControl = utilityControls?.querySelector('.cockpit-utility-control.is-expanded');
      const collapsedControl = utilityControls?.querySelector(
        '.cockpit-utility-control:not(.is-expanded)',
      );
      const collapsedLauncher = collapsedControl?.querySelector('.cockpit-utility-launcher');
      const expandedHeight = expandedControl
        ? Math.max(expandedControl.scrollHeight, expandedControl.getBoundingClientRect().height)
        : 0;
      const collapsedHeight = collapsedLauncher
        ? Math.max(COCKPIT_UTILITY_LAUNCHER_MIN_HEIGHT_PX, collapsedLauncher.scrollHeight)
        : 0;
      // Cockpit owns this anchor outright. The strip used to inherit the left
      // accordion's committed top, which is solved against left-lane obstacles
      // and dropped the strip straight through the briefing card below it.
      // The readout only anchors the strip while it is genuinely on screen:
      // the Minimal variant drops it with `display:none`, but HUD Off hides the
      // whole Intel HUD with `visibility`/`opacity`, which keeps its rect.
      const recReadout = document.querySelector('#intel-hud .hud-top-right');
      const recBounds = isRenderedOnScreen(recReadout) ? recReadout.getBoundingClientRect() : null;
      const utilityAnchor = resolveCockpitUtilityAnchor({
        recBottom: recBounds ? recBounds.bottom : 0,
        signalTop: signalBounds.top,
        stripHeight: utilityBounds.height,
        viewportHeight: window.innerHeight,
        collapsedHeight,
        recGap: COCKPIT_UTILITY_REC_GAP_PX,
        signalGap: COCKPIT_UTILITY_SIGNAL_GAP_PX,
        minTopFloor: COCKPIT_UTILITY_MIN_TOP_PX,
        minTopRatio: COCKPIT_UTILITY_MIN_TOP_RATIO,
      });
      const availableHeight = utilityAnchor.maxHeight;
      this.hud?.style.setProperty('--cockpit-utility-top', `${utilityAnchor.top.toFixed(1)}px`);
      this.hud?.style.setProperty('--cockpit-utility-max-height', `${availableHeight.toFixed(2)}px`);
      const utilityLayout = expandedControl && collapsedControl
        ? resolveCockpitUtilityLayout({ availableHeight, expandedHeight, collapsedHeight })
        : { primaryOnly: false, expandedMaxHeight: availableHeight };
      utilityControls?.classList.toggle('layout-primary-only', utilityLayout.primaryOnly);
      this.hud?.style.setProperty(
        '--cockpit-utility-expanded-max-height',
        `${utilityLayout.expandedMaxHeight.toFixed(2)}px`,
      );
      utilityControls?.querySelectorAll('.cockpit-utility-control').forEach((control) => {
        const hiddenSibling = utilityLayout.primaryOnly && control === collapsedControl;
        control.setAttribute('aria-hidden', String(hiddenSibling));
        if (hiddenSibling && control.contains(document.activeElement)) {
          expandedControl?.querySelector('.cockpit-utility-glyph')?.focus({ preventScroll: true });
        }
      });
    }
  },
};

