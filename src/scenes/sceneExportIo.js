import { normalizeProject } from './sceneProjectSchema.js';

/**
 * Prototype mixin for `SceneDirector` (see `director.js`): project
 * export/import and last-run telemetry download — the three methods that
 * turn director state into a browser file download or read one back in.
 *
 * This is a mechanical method-body relocation to shrink `director.js`, not
 * a logic extraction: fields (`_project`, `_lastRunJson`) are still declared
 * and initialized in the `SceneDirector` constructor in `director.js`; only
 * the method bodies live here. `this.foo()` calls into the rest of the
 * prototype (`_saveProject`, `_renderSceneSelect`, `_renderShotList`,
 * `_updateStatus`) resolve normally via prototype dispatch — no call site
 * anywhere in `director.js` (including the `_initUI` button wiring) needed
 * to change.
 *
 * This is the first use of the `Object.assign(prototype, mixin)` pattern on
 * `SceneDirector` — the pattern itself is already established elsewhere in
 * the codebase for `StyleManager` (`cockpitControlMixin.js`,
 * `navigationLocationMixin.js` in `ui.js`), just not previously applied to
 * this class.
 *
 * Pre-existing, not introduced by this split: `exportProject` and
 * `downloadLastRunMetadata` both build a `Blob` + temporary `<a>` element to
 * trigger a download — identical boilerplate, left as-is here rather than
 * factored into a shared helper, to keep this a pure relocation.
 */
export const sceneExportIoMixin = {
  /** Export the entire project as a timestamped JSON file download. */
  exportProject() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `scene-presets-${stamp}.json`;
    const payload = JSON.stringify(this._project, null, 2);
    // Trigger a browser download via a temporary anchor element
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * Import a project from a user-selected JSON file, replacing the current project.
   * The file is normalized/migrated on load; invalid JSON shows an error status.
   * @param {File} file - Browser File object from an <input type="file">
   */
  async importProjectFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      this._project = normalizeProject(parsed);
      this._selectedSceneId = this._project.scenes[0]?.id || null;
      this._selectedShotId = this._project.scenes[0]?.shots[0]?.id || null;
      this._saveProject();
      this._renderSceneSelect();
      this._renderShotList();
      this._updateStatus(`Imported ${file.name}`);
    } catch {
      this._updateStatus('Import failed (invalid JSON)');
    }
  },

  /** Download the telemetry metadata from the most recent completed run as JSON. */
  downloadLastRunMetadata() {
    if (!this._lastRunJson) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `scene-run-${stamp}.json`;
    const blob = new Blob([this._lastRunJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
