import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLivePlaneOn,
  shouldShowCoverageWireframe,
  shouldShowViewshedVolume,
} from './cctvCoverageVisibility.js';

const base = {
  enabled: true, livePlaneOn: false, calibrating: false,
  isActive: false, coverageOn: true, inVisibleSet: true,
};

test('isLivePlaneOn needs layer enabled, projection on, and a selected camera', () => {
  assert.equal(isLivePlaneOn({ enabled: true, showProjection: true, hasActive: true }), true);
  assert.equal(isLivePlaneOn({ enabled: false, showProjection: true, hasActive: true }), false);
  assert.equal(isLivePlaneOn({ enabled: true, showProjection: false, hasActive: true }), false);
  assert.equal(isLivePlaneOn({ enabled: true, showProjection: true, hasActive: false }), false);
});

test('without a live plane, coverage follows the mode and neighbor cohort', () => {
  assert.equal(shouldShowCoverageWireframe(base), true);
  assert.equal(shouldShowCoverageWireframe({ ...base, coverageOn: false }), false);
  assert.equal(shouldShowCoverageWireframe({ ...base, inVisibleSet: false }), false);
  assert.equal(shouldShowCoverageWireframe({ ...base, enabled: false }), false);
});

test('with a live plane, neighbor wireframes are hidden even when coverage is on', () => {
  assert.equal(shouldShowCoverageWireframe({ ...base, livePlaneOn: true }), false);
});

test('with a live plane, the active camera frustum is hidden outside ADJUST', () => {
  assert.equal(shouldShowCoverageWireframe({ ...base, livePlaneOn: true, isActive: true }), false);
});

test('with a live plane in ADJUST, only the active camera frustum shows', () => {
  const adjust = { ...base, livePlaneOn: true, calibrating: true };
  assert.equal(shouldShowCoverageWireframe({ ...adjust, isActive: true }), true);
  assert.equal(shouldShowCoverageWireframe({ ...adjust, isActive: false }), false);
});

test('viewshed fills never exist while a live plane is showing', () => {
  const v = { enabled: true, livePlaneOn: false, viewshedOn: true, inVisibleSet: true, hasGeometry: true };
  assert.equal(shouldShowViewshedVolume(v), true);
  assert.equal(shouldShowViewshedVolume({ ...v, livePlaneOn: true }), false);
  assert.equal(shouldShowViewshedVolume({ ...v, viewshedOn: false }), false);
  assert.equal(shouldShowViewshedVolume({ ...v, inVisibleSet: false }), false);
  assert.equal(shouldShowViewshedVolume({ ...v, hasGeometry: false }), false);
  assert.equal(shouldShowViewshedVolume({ ...v, enabled: false }), false);
});
