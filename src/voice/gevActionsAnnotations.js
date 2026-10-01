// Moved out of gevActions.js (gevActionsAnnotations).

import { MAX_ANNOTATIONS_PER_CALL, MAX_LABEL_LEN, MAX_ROUTE_POINTS, MAX_TARGET_LEN } from './gevActionsConstants.js';
import { clampStr } from './gevActionsNormalize.js';

/** Bound the free-text + array sizes inside one annotation spec before it reaches the engine. */
function sanitizeAnnotationSpec(spec) {
  if (!spec || typeof spec !== 'object') return spec;
  const out = { ...spec };
  if (typeof out.target === 'string') out.target = clampStr(out.target, MAX_TARGET_LEN);
  if (typeof out.toTarget === 'string') out.toTarget = clampStr(out.toTarget, MAX_TARGET_LEN);
  if (typeof out.label === 'string') out.label = clampStr(out.label, MAX_LABEL_LEN);
  if (Array.isArray(out.points)) {
    out.points = out.points.slice(0, MAX_ROUTE_POINTS).map((p) => (
      p && typeof p === 'object' && typeof p.target === 'string'
        ? { ...p, target: clampStr(p.target, MAX_TARGET_LEN) }
        : p
    ));
  }
  return out;
}

/**
 * Draw "whiteboard" annotations on the 3D world to point out what the agent is
 * talking about. Place names are resolved to real-world coordinates (and OSM
 * footprints) by the annotation engine, so the agent never has to guess pixels.
 */
export async function annotateMap(annotations, args = {}) {
  if (!annotations || typeof annotations.annotate !== 'function') {
    return { ok: false, action: 'annotate_map', error: 'Annotation engine unavailable' };
  }
  const raw = Array.isArray(args.annotations) ? args.annotations : [];
  if (!raw.length) {
    return { ok: false, action: 'annotate_map', error: 'No annotations supplied' };
  }
  if (raw.length > MAX_ANNOTATIONS_PER_CALL) {
    return {
      ok: false,
      action: 'annotate_map',
      error: `Too many annotations in one call (${raw.length}); max ${MAX_ANNOTATIONS_PER_CALL}. Mark fewer places, or split across calls.`,
    };
  }
  const requests = raw.map(sanitizeAnnotationSpec);
  const result = await annotations.annotate(requests, {
    // C1 invariant enforced in CODE (not just the prompt): the VOICE path NEVER clears as
    // a side effect of drawing — annotations accumulate/persist, and only an explicit
    // clear_annotations tool call wipes the board. (clearPrevious is intentionally ignored
    // here and removed from the annotate_map schema; the console/demo API still has it.)
    clearPrevious: false,
    persist: args.persist !== false,
    flyTo: Boolean(args.flyTo),
  });
  // Honesty: surface partial failure explicitly so the agent can tell the user
  // which place(s) it couldn't mark instead of implying everything appeared.
  const drewSome = result.drawn > 0;
  const someFailed = result.failed > 0;
  const failedLabels = [];
  for (const r of (result.results || [])) {
    if (r.ok) continue;
    // Route failures carry the specific missing waypoint name(s) in failedTargets;
    // everything else names its own label/target.
    if (Array.isArray(r.failedTargets) && r.failedTargets.length) failedLabels.push(...r.failedTargets);
    else failedLabels.push(r.target || r.label || 'an unnamed place'); // target (the place) before caption
  }
  return {
    ok: drewSome,
    action: 'annotate_map',
    drawn: result.drawn,
    failed: result.failed,
    partial: drewSome && someFailed,
    failedLabels: someFailed ? failedLabels : undefined,
    // A drawn route whose street routing was unavailable is a straight direct line,
    // not a real walking/driving route — flag it so the voice layer stays honest.
    routeFallback: (result.results || []).some((r) => r.ok && r.fallback),
    capped: Boolean(result.capped),
    // Progressive outlines: anchors are placed and returned immediately; footprints for
    // these items are still being traced and will appear on their own (or the mark
    // honestly stays a point). NOT a failure — the voice layer must not report it as one.
    outlinePending: (result.results || []).some((r) => r.ok && r.outlinePending) || undefined,
    items: result.results,
    // Keep `error` populated whenever ANYTHING failed (partial or total) so the
    // result never reads as a clean success — but keep it STATIC (no raw place text);
    // the actual names live only in the structured failedLabels DATA field, so the
    // model-facing prose can't carry injected instructions from a place name.
    error: someFailed ? 'Could not place one or more annotations' : null,
  };
}

export function clearAnnotations(annotations) {
  if (!annotations || typeof annotations.clear !== 'function') {
    return { ok: false, action: 'clear_annotations', error: 'Annotation engine unavailable' };
  }
  annotations.clear();
  return { ok: true, action: 'clear_annotations' };
}
