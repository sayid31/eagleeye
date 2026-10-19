// StyleManager UI wiring, slider panel, HUD toggle and the Cockpit display portal.
import { STYLES } from './uiConstants.js';
import { canonicalizeDensity } from './data/detectionPolicy.js';
import { cycleMode as cycleDetectionMode } from './data/detection.js';
import { governorRequestRender } from './renderGovernor.js';
import {
  isScopeMaskEnabled,
  setScopeMaskEnabled,
  setScopeMaskFeather,
  setScopeMaskOpacity,
} from './scopeMask.js';

export const hudPortalMixin = {
/**
   * Wires up all primary UI event listeners: style buttons, keyboard shortcuts
   * (1-8 style keys, H/O/V/F/D/C hotkeys, Escape), AI prompt input with
   * debounce, bloom/sharpen/HUD toggles, detection density slider, and
   * clean-view toggle.
   * @returns {void}
   */
  _initUI() {
    // Style buttons
    document.querySelectorAll('.style-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setStyle(btn.dataset.style));
    });

    // Keyboard shortcuts: 1-7, H, Escape
    this._globalKeydownHandler = (e) => {
      // Ignore when interacting with a form control (except Escape). Global
      // hotkeys ('1'-'7', 'h', 'o', 'v', 'd', 'c', 'f') otherwise fire while a
      // <select> dropdown (e.g. HUD layout) is focused and its native
      // type-ahead is in use, or while typing in a text field (M9).
      const isFormControl = e.target?.matches?.('select, input, textarea, .scene-picker-trigger')
        || e.target === this._locationSearch
        || this._isCctvListboxOpen?.();
      if (isFormControl && e.key !== 'Escape') return;

      const keyMap = {
        '1': 'normal', '2': 'retro', '3': 'surveillance',
        '4': 'thermal', '5': 'anime', '6': 'noir',
        '7': 'snow',
      };
      if (keyMap[e.key]) this.setStyle(keyMap[e.key]);
      if (e.key === 'Escape') {
        if (this._locationSearch.classList.contains('expanded')) {
          this._locationSearch.classList.remove('expanded');
          this._locationSearch.value = '';
          this._locationSearch.blur();
        }
      }
      if (e.key.toLowerCase() === 'h') {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this.hud.toggle();
        this._updateHudButtonState();
        this._syncShareState();
      }
      if (e.key.toLowerCase() === 'o') this._toggleOrbit();
      if (e.key.toLowerCase() === 'v') this.toggleCleanView();
      if (e.key.toLowerCase() === 'f') {
        document.getElementById('data-panel').classList.toggle('active');
      }
      if (e.key.toLowerCase() === 'd') {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._detectionUserOverridden = true;
        cycleDetectionMode();
        this._syncShareState();
      }
      if (e.key.toLowerCase() === 'c') {
        this._toggleCctvEnabled();
      }
    };
    document.addEventListener('keydown', this._globalKeydownHandler);

    // Bloom toggle
    this._bloomBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._setBloomEnabled(!this.bloomEnabled);
    });

    // Bloom intensity slider
    this._bloomSlider.addEventListener('input', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._setBloomIntensity(parseInt(this._bloomSlider.value, 10));
    });

    // Sharpen toggle
    this._sharpenBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._setSharpenEnabled(!this.sharpenEnabled);
    });

    // Scope mask — the explicit circular viewport treatment (owner ask:
    // standalone toggle + featherable edge; see src/scopeMask.js).
    this._scopeBtn?.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      const next = !isScopeMaskEnabled();
      setScopeMaskEnabled(next);
      this._scopeBtn.classList.toggle('active', next);
      this._scopeBtn.setAttribute('aria-pressed', String(next));
      this._syncShareState();
    });
    this._scopeFeatherSlider?.addEventListener('input', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      const pct = Math.max(0, Math.min(100, parseInt(this._scopeFeatherSlider.value, 10) || 0));
      if (this._scopeFeatherValue) this._scopeFeatherValue.textContent = `${pct}%`;
      setScopeMaskFeather(pct / 100);
      this._syncShareState();
    });
    // Intensity dial — independent of the feather (edge softness) slider above
    // and of the terminus/override system in scopeMask.js. Pure alpha
    // multiplier: 0% is fully transparent (no mask paint beyond the toggle's
    // off state), 100% is today's shipped look.
    this._scopeIntensitySlider?.addEventListener('input', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      const pct = Math.max(0, Math.min(100, parseInt(this._scopeIntensitySlider.value, 10) || 0));
      if (this._scopeIntensityValue) this._scopeIntensityValue.textContent = `${pct}%`;
      setScopeMaskOpacity(pct / 100);
      this._syncShareState();
    });

    if (this._sharpenSlider) {
      this._sharpenSlider.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        const pct = parseInt(this._sharpenSlider.value, 10);
        if (this._sharpenSliderValue) {
          this._sharpenSliderValue.textContent = `${pct}%`;
        }
        this._applySharpenIntensity(pct / 100);
        this._syncShareState();
      });
    }

    if (this._hudLayoutSelect) {
      this._hudLayoutSelect.addEventListener('change', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._setHudVariant(this._hudLayoutSelect.value);
      });
    }

    if (this._cleanViewBtn) {
      this._cleanViewBtn.addEventListener('click', () => this.toggleCleanView());
    }
    if (this._cleanViewExitBtn) {
      this._cleanViewExitBtn.addEventListener('click', () => this.toggleCleanView(false));
    }

    if (this._detectionDensitySlider) {
      this._detectionDensitySlider.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._detectionUserOverridden = true;
        const pct = canonicalizeDensity(this._detectionDensitySlider.value);
        this._detectionDensitySlider.value = String(pct);
        if (this._detectionDensityValue) {
          this._detectionDensityValue.textContent = `${pct}%`;
        }
        this._applyDetectionDensityFromUi();
        this._syncShareState();
      });
    }

    for (const button of this._detectionAllocationBtns) {
      button.addEventListener('click', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._detectionUserOverridden = true;
        this._setDetectionAllocation(button.dataset.allocation);
      });
    }

    for (const slider of [this._detectionFadeSlider, this._detectionOpacitySlider]) {
      slider?.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._applyDetectionFadeFromUi();
        this._syncShareState();
      });
    }

    if (this._celestialBtn) {
      this._celestialBtn.addEventListener('click', () => {
        const ringIsVisible = !!this.celestialRing?.visible;
        if (!this.celestialRingEnabled || !ringIsVisible) {
          this.setCelestialRingEnabled(true, { focus: true });
        } else {
          this.setCelestialRingEnabled(false);
        }
      });
    }
  },

// ── Parameter Sliders ─────────────────────────

  /**
   * Rebuilds the parameter slider panel for the given style's shader uniforms.
   * Creates a labeled range input for each tunable uniform. Hides the panel
   * for 'normal' mode which has no shader parameters.
   * @param {string} styleName - Style name whose uniforms to display.
   * @returns {void}
   */
  _updateSliderPanel(styleName, { reveal = false } = {}) {
    this._sliderContainer.innerHTML = '';
    const shader = STYLES[styleName];

    if (!shader || !shader.uniforms || styleName === 'normal') {
      this._sliderPanel.classList.remove('active');
      this._scheduleRightPanelLayout();
      return;
    }

    for (const [uName, uMeta] of Object.entries(shader.uniforms)) {
      const row = document.createElement('div');
      row.className = 'param-slider-row';

      const label = document.createElement('span');
      label.className = 'param-label';
      label.textContent = uMeta.label;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'param-slider';
      slider.min = uMeta.min;
      slider.max = uMeta.max;
      slider.step = uMeta.max <= 1 ? '0.01' : '0.1';
      slider.value = this.stages[styleName].uniforms[uName];

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'param-value';
      valueDisplay.textContent = parseFloat(slider.value).toFixed(uMeta.max <= 1 ? 2 : 1);

      slider.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        const val = parseFloat(slider.value);
        this.stages[styleName].uniforms[uName] = val;
        valueDisplay.textContent = val.toFixed(uMeta.max <= 1 ? 2 : 1);
        // Uniform writes don't auto-render under the idle governor —
        // without this the slider visibly does nothing until the next
        // camera move (browser finding). (perf wave 2)
        governorRequestRender('style-param-slider');
        this._syncShareState();
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      this._sliderContainer.appendChild(row);
    }

    this._sliderPanel.classList.add('active');
    this._scheduleRightPanelLayout();
    if (reveal) this._revealStyleParameters();
  },

/** Reveal the map-only parameter surface in the standard Display scroll owner. */
  _revealStyleParameters() {
    if (!this._sliderPanel?.classList.contains('active')) return;
    if (this._cockpitDisplayPortalActive) return;
    this._sliderPanel.classList.remove('collapsed');
    this._syncPanelCollapseButton(this._sliderPanel);
    this.setPanelCollapsed('pp-toggles', false, { explicit: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const scrollOwner = this._ppToggles;
      if (!scrollOwner) return;
      const ownerRect = scrollOwner.getBoundingClientRect();
      const panelRect = this._sliderPanel.getBoundingClientRect();
      scrollOwner.scrollTop += panelRect.top - ownerRect.top - 8;
    }));
  },

_initHUDToggle() {
    this._hudBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this.hud.toggle();
      this._updateHudButtonState();
      this._syncShareState();
    });

    if (this._hudLayoutSelect) {
      this._hudLayoutSelect.value = 'tactical';
    }
    this._setHudVariant('tactical');
    this.hud.setMode('on');
    this._updateHudButtonState();

    // Detection toggle button
    this._detectionBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._detectionUserOverridden = true;
      cycleDetectionMode();
      this._syncShareState();
    });
    this._cockpitDisplayToggleBtn?.addEventListener('click', () => {
      const open = this._cockpitDisplayToggleBtn.getAttribute('aria-expanded') === 'true';
      this._setCockpitDisclosure?.('display', !open);
    });
    this._initCockpitDisplayPortal();
  },

/**
   * Reuses the production Display controls inside Cockpit without cloning
   * stateful inputs or event listeners. Comment anchors preserve each group's
   * exact home in the standard Display panel for exit and teardown.
   * @returns {void}
   */
  _initCockpitDisplayPortal() {
    const definitions = [
      ['hud', this._hudBtn?.closest('.pp-toggle-group')],
      ['detection', this._detectionBtn?.closest('.pp-toggle-group')],
      ['parameters', this._sliderPanel],
      ['models3d', this._models3dBtn?.closest('.pp-toggle-group')],
    ];
    this._cockpitDisplayPortalRecords = definitions.flatMap(([name, group]) => {
      const slot = this._cockpitDisplayPanel?.querySelector(
        `[data-cockpit-display-slot="${name}"]`,
      );
      if (!group || !slot || !group.parentNode) return [];
      const anchor = document.createComment(`cockpit-display-home:${name}`);
      group.before(anchor);
      return [{ name, group, slot, anchor }];
    });
    this._standardDisplayScrollTop = this._ppToggles?.scrollTop || 0;
    this._cockpitDisplayScrollTop = this._cockpitDisplayPanel?.scrollTop || 0;
    this._standardDisplayScrollHandler = () => {
      if (!this._cockpitDisplayPortalActive) {
        this._standardDisplayScrollTop = this._ppToggles?.scrollTop || 0;
      }
    };
    this._cockpitDisplayScrollHandler = () => {
      if (this._cockpitDisplayPortalActive) {
        this._cockpitDisplayScrollTop = this._cockpitDisplayPanel?.scrollTop || 0;
      }
    };
    this._ppToggles?.addEventListener('scroll', this._standardDisplayScrollHandler, { passive: true });
    this._cockpitDisplayPanel?.addEventListener('scroll', this._cockpitDisplayScrollHandler, { passive: true });
    this._cockpitDisplayModeHandler = (event) => {
      this._setCockpitDisplayPortalActive(event?.detail?.active === true);
    };
    window.addEventListener('gev:cockpit-mode-changed', this._cockpitDisplayModeHandler);
    this._setCockpitDisplayPortalActive(document.body.classList.contains('cockpit-mode'));
  },

/**
   * Moves the shared HUD, Detection, Parameters, and 3D controls into or out
   * of Cockpit.
   * @param {boolean} active Whether Cockpit owns the Display control groups.
   * @returns {void}
   */
  _setCockpitDisplayPortalActive(active) {
    const nextActive = active === true;
    if (this._cockpitDisplayPortalActive === nextActive) return;
    const focusedRecord = this._cockpitDisplayPortalRecords.find((record) => (
      record.group.contains(document.activeElement)
    ));
    const focusedElement = focusedRecord ? document.activeElement : null;
    this._displayPortalScrollRestoreOwner = nextActive ? 'cockpit' : 'standard';
    this._cockpitDisplayPortalActive = nextActive;
    for (const record of this._cockpitDisplayPortalRecords) {
      if (nextActive) {
        record.slot.append(record.group);
      } else if (record.anchor.parentNode) {
        record.anchor.after(record.group);
      }
    }
    this._cockpitDisplayPanel?.classList.toggle('uses-shared-display-controls', nextActive);
    requestAnimationFrame(() => {
      if (nextActive && this._cockpitDisplayPanel) {
        this._cockpitDisplayPanel.scrollTop = this._cockpitDisplayScrollTop;
      }
      if (!nextActive && this._ppToggles) {
        this._ppToggles.scrollTop = this._standardDisplayScrollTop;
      }
      focusedElement?.focus?.({ preventScroll: true });
      // Portal movement can trigger one more adaptive-layout/clamp pass after
      // the first frame. Reapply the owning surface's saved position once the
      // new layout has fully settled.
      requestAnimationFrame(() => {
        if (nextActive && this._cockpitDisplayPanel) {
          this._cockpitDisplayPanel.scrollTop = this._cockpitDisplayScrollTop;
        }
        if (!nextActive && this._ppToggles) {
          this._ppToggles.scrollTop = this._standardDisplayScrollTop;
        }
        if (this._displayPortalScrollRestoreOwner === (nextActive ? 'cockpit' : 'standard')) {
          this._displayPortalScrollRestoreOwner = null;
        }
      });
    });
    this._layoutRightPanels();
    this.cockpitView?.scheduleContextLayout();
  },

/**
   * Syncs the HUD toggle button active class and HUD layout row visibility
   * with the current HUD visible state.
   * @returns {void}
   */
  _updateHudButtonState() {
    this._hudBtn.classList.toggle('active', this.hud.visible);
    if (this._hudLayoutRow) {
      this._hudLayoutRow.classList.toggle('visible', this.hud.visible);
    }
    this._scheduleAdaptivePanelLayout({ settle: true });
  },
};

