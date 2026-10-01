// DataLayerManager registration: eager/lazy layer registration, module resolution and stats normalization.
import { VALID_LAYER_SERIALIZATION_DISPOSITIONS } from './managerConstants.js';

export const registrationMixin = {
register(layerModule) {
    if (this._registrationsFinalized) {
      throw new Error('Data-layer registrations are finalized');
    }
    this._registerLayer(layerModule);
  },

/** Register a synthetic layer after sealing in an explicitly dev-enabled manager. */
  registerForQa(layerModule) {
    if (!this._allowQaRegistration || !this._registrationsFinalized) {
      throw new Error('QA layer registration is not authorized');
    }
    this._registerLayer(layerModule);
    this._qaLayerIds.add(layerModule.id);
    return layerModule.id;
  },

/** Destroy a layer previously registered through the dev QA seam. */
  async unregisterForQa(layerId) {
    if (!this._allowQaRegistration || !this._qaLayerIds.has(layerId)) return false;
    const destroyed = await this.destroyLayer(layerId);
    if (destroyed) this._qaLayerIds.delete(layerId);
    return destroyed;
  },

/**
   * Shared entry-shape constructor for both registration paths (eager
   * `_registerLayer` and lazy `registerLazy`) so the ~25-field entry shape
   * can't drift between them. `module`/`lazy`/`loader`/`staticMeta` are
   * filled in by the caller — everything else is identical either way.
   */
  _newEntry() {
    return {
      module: null,
      enabled: false,
      initialized: false,
      intervalId: null,
      // Periodic data refreshes are manager-owned work, independent from the
      // authoritative enable/disable lifecycle above. Every registered layer
      // receives the same normalized presentation contract even when its own
      // getStats() omits loading fields.
      refreshing: false,
      refreshEpoch: 0,
      managerRefreshError: null,
      // `enabled` is authoritative settled visibility. Awaited lifecycle work
      // is reported separately so callers never mistake activation for ON or
      // teardown for OFF before the transaction settles.
      lifecycleState: 'disabled',
      // A lifecycle rejection can leave the module's real state unknowable.
      // Keep the conservative public state, but do not let setEnabled() treat
      // that state as settled until the requested lifecycle is reconciled.
      lifecycleUncertain: false,
      // Absolute setEnabled() calls own a monotonic intent lane separate from
      // relative toggle() calls. A newer request can abort lifecycle work that
      // is already inside this entry's serialized queue, while the epoch keeps
      // older queued requests from starting after they have been superseded.
      visibilityIntentEpoch: 0,
      visibilityIntentEnabled: false,
      visibilityIntentOrigin: 'programmatic',
      activeVisibilityIntent: null,
      latestQueuedAbsoluteIntent: null,
      pendingVisibilityAdoptionEpoch: 0,
      // Exact absolute-intent completions are retained in a small bounded map.
      // Context transactions use these records to adopt a named successor
      // without guessing from mutable lifecycle state during listener re-entry.
      visibilityIntentRecords: new Map(),
      visibilityIntentFailures: new Map(),
      paramsIntentEpoch: 0,
      paramsIntentOrigin: 'programmatic',
      // Teardown owns the layer from its synchronous entry boundary. New
      // visibility work is refused while destroy drains and cleans up earlier
      // intents, so no request can publish settled state into a dying entry.
      destroying: false,
      // Clear All reserves its complete target set synchronously before any
      // per-layer teardown begins. A later absolute request supersedes this
      // reservation by advancing visibilityIntentEpoch.
      clearVisibilityReservation: null,
      // Promise chain that serializes toggle() calls for THIS entry. Without it
      // a second toggle during the awaited init()/first-update() of the first
      // interleaves: the disable branch runs while enable is mid-flight, the
      // interval is armed after the user already turned the layer off, and a
      // subsequent enable arms a SECOND interval → 2× poll → OpenSky 429 (M1).
      toggleChain: Promise.resolve(),
      // Lazy-loading fields (registerLazy path) — left at these defaults for
      // eager registrations, which always start already-resolved.
      lazy: false,
      loader: null,
      staticMeta: null,
      resolvePromise: null,
      pendingSubscribers: null,
      resolvedSubscriberUnsubs: null,
      pendingParams: null,
    };
  },

_registerLayer(layerModule) {
    if (!layerModule || typeof layerModule.id !== 'string' || !layerModule.id) {
      throw new Error('Data layer must provide a stable id');
    }
    if (this.layers.has(layerModule.id)) {
      throw new Error(`Duplicate data-layer id: ${layerModule.id}`);
    }
    this.layers.set(layerModule.id, {
      ...this._newEntry(),
      module: layerModule,
      staticMeta: Object.freeze({
        id: layerModule.id,
        name: layerModule.name,
        icon: layerModule.icon,
        source: layerModule.source,
        showInTogglePanel: layerModule.showInTogglePanel !== false,
        hasRowControls: typeof layerModule.getRowControls === 'function',
      }),
    });
  },

/**
   * Register a layer without importing its module up front — the module is
   * resolved on first lifecycle touch (see `_ensureModuleResolved`). Does
   * NOT change `register()`'s existing eager contract; this is a distinct
   * entry point for layers converted to dynamic `import()` (plan §3.2).
   * @param {{id:string, name?:string, icon?:string, source?:string,
   *   showInTogglePanel?:boolean, hasRowControls?:boolean,
   *   loader: () => Promise<object>}} config
   */
  registerLazy({ id, name, icon, source, showInTogglePanel, hasRowControls, loader } = {}) {
    if (this._registrationsFinalized) {
      throw new Error('Data-layer registrations are finalized');
    }
    if (typeof id !== 'string' || !id) {
      throw new Error('Lazy data layer must provide a stable id');
    }
    if (typeof loader !== 'function') {
      throw new Error(`Lazy data layer ${id} must provide a loader function`);
    }
    if (this.layers.has(id)) {
      throw new Error(`Duplicate data-layer id: ${id}`);
    }
    this.layers.set(id, {
      ...this._newEntry(),
      module: null,
      lazy: true,
      loader,
      staticMeta: Object.freeze({
        id,
        name,
        icon,
        source,
        showInTogglePanel: showInTogglePanel !== false,
        hasRowControls: !!hasRowControls,
      }),
    });
  },

/**
   * Resolve a lazy entry's module exactly once, memoizing concurrent
   * callers onto the same in-flight promise. No-ops (returns the module
   * immediately) for an already-resolved or non-lazy entry — safe to call
   * unconditionally from any lifecycle-triggering path.
   * @param {object} entry Entry object from `this.layers`.
   * @returns {Promise<object|null>}
   */
  async _ensureModuleResolved(entry) {
    if (entry.module) return entry.module;
    if (!entry.lazy) return null;
    if (!entry.resolvePromise) {
      entry.resolvePromise = entry.loader().then((module) => {
        if (!module || typeof module.id !== 'string') {
          throw new Error(`Lazy layer ${entry.staticMeta.id} loader resolved to an invalid module`);
        }
        if (module.id !== entry.staticMeta.id) {
          throw new Error(`Lazy layer id mismatch: expected ${entry.staticMeta.id}, loader resolved ${module.id}`);
        }
        entry.module = module;
        module.attachDataManager?.(this);
        if (entry.pendingSubscribers?.size && typeof module.subscribe === 'function') {
          entry.resolvedSubscriberUnsubs = entry.resolvedSubscriberUnsubs || new Map();
          for (const cb of entry.pendingSubscribers) {
            entry.resolvedSubscriberUnsubs.set(cb, module.subscribe(cb));
          }
        }
        if (entry.pendingParams) {
          module.setParams?.(entry.pendingParams);
          entry.pendingParams = null;
        }
        return module;
      });
    }
    return entry.resolvePromise;
  },

/** Seal registration and prove each production layer has one share disposition. */
  finalizeRegistrations(serializationRegistry) {
    if (this._registrationsFinalized) throw new Error('Data-layer registrations are already finalized');
    if (!Array.isArray(serializationRegistry)) throw new Error('Layer serialization registry must be an array');
    const dispositions = new Map();
    for (const entry of serializationRegistry) {
      if (!entry?.id || !entry?.disposition) throw new Error('Layer serialization disposition is incomplete');
      if (dispositions.has(entry.id)) throw new Error(`Duplicate layer serialization disposition: ${entry.id}`);
      if (!VALID_LAYER_SERIALIZATION_DISPOSITIONS.has(entry.disposition)) {
        throw new Error(`Invalid layer serialization disposition: ${entry.id}`);
      }
      dispositions.set(entry.id, entry.disposition);
    }
    const registeredIds = [...this.layers.keys()];
    const missing = registeredIds.filter((id) => !dispositions.has(id));
    const extra = [...dispositions.keys()].filter((id) => !this.layers.has(id));
    if (missing.length || extra.length) {
      throw new Error(`Layer serialization registry mismatch (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
    }
    this._registrationDispositions = dispositions;
    this._registrationsFinalized = true;
    return true;
  },

_moduleStats(entry) {
    if (!entry?.initialized || typeof entry.module?.getStats !== 'function') {
      return { count: 0, lastUpdate: null };
    }
    try {
      const stats = entry.module.getStats();
      return stats && typeof stats === 'object' ? stats : { count: 0, lastUpdate: null };
    } catch (error) {
      console.warn(`[Data] ${entry.module.id} getStats error:`, error);
      return { count: 0, lastUpdate: null, error };
    }
  },

_normalizedStats(entry) {
    const moduleStats = this._moduleStats(entry);
    const lifecycleLoading = entry.lifecycleState === 'enabling' || entry.lifecycleState === 'disabling';
    return {
      count: 0,
      lastUpdate: null,
      ...moduleStats,
      loading: lifecycleLoading || moduleStats.loading === true,
      refreshing: entry.refreshing || moduleStats.refreshing === true,
      managerRefreshError: entry.managerRefreshError,
    };
  },
};

