// DataLayerManager listener subscriptions, visibility guards and notification fan-out.

export const subscriptionsMixin = {
subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  },

/**
   * Subscribe to explicit setEnabled intent before it joins the lifecycle queue.
   * This lets a newer direct-user OFF request cancel older work before that work
   * can publish an intermediate settled visibility state.
   * @param {(change:{type:string,layerId:string,enabled:boolean,origin:string}) => void} callback
   * @returns {() => void} Unsubscribe function.
   */
  subscribeVisibilityRequests(callback) {
    if (typeof callback !== 'function') return () => {};
    this._visibilityRequestListeners.add(callback);
    return () => this._visibilityRequestListeners.delete(callback);
  },

/**
   * Register a visibility guard evaluated before layer lifecycle work. Guards
   * may await bounded mode preparation and return a string or `{reason}` to
   * refuse a transition.
   * @param {(change:{type:string,layerId:string,enabled:boolean,origin:string}) => (string|object|null|void)} callback Guard.
   * @returns {() => void} Unsubscribe function.
   */
  addVisibilityGuard(callback) {
    if (typeof callback !== 'function') return () => {};
    this._visibilityGuards.add(callback);
    return () => this._visibilityGuards.delete(callback);
  },

/**
   * Subscribe to the awaited pre-destroy lifecycle boundary.
   * @param {(change:{type:string,layerId:string}) => (void|Promise<void>)} callback
   * @returns {() => void} Unsubscribe function.
   */
  subscribeBeforeDestroy(callback) {
    if (typeof callback !== 'function') return () => {};
    this._beforeDestroyListeners.add(callback);
    return () => this._beforeDestroyListeners.delete(callback);
  },

_notifyListeners(change) {
    for (const callback of this._listeners) {
      try {
        callback(change);
      } catch (error) {
        console.warn('[Data] listener error:', error);
      }
    }
  },

_notifyVisibilityRequest(change) {
    for (const callback of this._visibilityRequestListeners) {
      try {
        callback(change);
      } catch (error) {
        console.warn('[Data] visibility request listener error:', error);
      }
    }
  },

async _visibilityBlockReason(change) {
    for (const callback of this._visibilityGuards) {
      try {
        const result = await callback(change);
        if (typeof result === 'string' && result.trim()) return result.trim();
        if (result && typeof result.reason === 'string' && result.reason.trim()) {
          return result.reason.trim();
        }
      } catch (error) {
        console.warn('[Data] visibility guard error:', error);
      }
    }
    return null;
  },
};

