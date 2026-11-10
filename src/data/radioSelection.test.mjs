// Radio tag change: picking a station tag moves the selection into that tag.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getRadioUIState, planRadioFilterRetune, radioLayer, setRadioParams } from './radio.js';

test('a tag change moves to the best-ranked station that is not already selected', () => {
  const ranked = [{ id: 'current' }, { id: 'next' }, { id: 'third' }];
  const plan = planRadioFilterRetune(ranked, 'current', 'playing');
  assert.equal(plan.station.id, 'next', 'the station that was on matches the tag too, but re-picking it changes nothing');
  assert.equal(plan.fallbackId, 'current');
  assert.equal(plan.autoplay, true);
});

test('the top-ranked station is taken when the current one is outside the tag', () => {
  const plan = planRadioFilterRetune([{ id: 'a' }, { id: 'b' }], 'elsewhere', 'stopped');
  assert.equal(plan.station.id, 'a');
  assert.equal(plan.fallbackId, 'b');
});

test('the only station in a tag is kept even when it is already selected', () => {
  const plan = planRadioFilterRetune([{ id: 'only' }], 'only', 'playing');
  assert.equal(plan.station.id, 'only');
  assert.equal(plan.fallbackId, null);
});

test('playback follows a tag change only when audio was already active', () => {
  for (const state of ['loading', 'buffering', 'playing']) {
    assert.equal(planRadioFilterRetune([{ id: 'a' }], null, state).autoplay, true, state);
  }
  for (const state of ['stopped', 'paused', 'error']) {
    assert.equal(planRadioFilterRetune([{ id: 'a' }], null, state).autoplay, false, state);
  }
});

test('an empty tag plans nothing', () => {
  assert.equal(planRadioFilterRetune([], 'a', 'playing'), null);
  assert.equal(planRadioFilterRetune(null, 'a', 'playing'), null);
});

test('the layer selects a station in the new tag without starting stopped audio', async () => {
  const originalFetch = globalThis.fetch;
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: {
      canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} },
      requestRender() {},
    },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() { return true; } },
  };
  const station = (suffix, tags) => ({
    id: `00000000-0000-4000-8000-0000000000${suffix}`,
    name: `Tag ${suffix}`,
    lat: 0,
    lon: 0,
    streamUrl: `https://radio.example.com/${suffix}.mp3`,
    homepage: null,
    tags,
    languages: ['English'],
    state: '',
    country: 'Ecuador',
    countryCode: 'EC',
    metadataTrust: 'untrusted-community',
    codec: 'MP3',
    bitrate: 128,
  });
  const newsWeather = station('b1', ['news', 'weather']);
  const newsOnly = station('b2', ['news']);
  const jazz = station('b3', ['jazz']);

  radioLayer.destroy();
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      stations: [newsWeather, newsOnly, jazz],
      stale: false,
      degraded: false,
      acceptedGeneration: 1,
      catalogInstance: 'qa-instance-tag-change',
      updatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    radioLayer.init(viewer);
    radioLayer.enable();
    radioLayer.setLifecyclePresentation({ lifecycleState: 'enabled', enabled: true, uncertain: false });
    await radioLayer.update();
    assert.equal(radioLayer.selectStation(newsWeather.id, { autoplay: false, focus: false }), true);

    assert.equal(setRadioParams({ filter: 'genre:jazz' }), true);
    assert.equal(radioLayer.selectStationForFilter({ origin: 'user' })?.id, jazz.id);
    assert.equal(getRadioUIState().selected?.id, jazz.id);
    assert.equal(getRadioUIState().audioState, 'stopped', 'a tag change never starts audio that was off');

    // Back to News: the first News station is not the one already selected,
    // so it is taken; a second News pick then moves on to the other one.
    assert.equal(setRadioParams({ filter: 'news' }), true);
    assert.equal(radioLayer.selectStationForFilter({ origin: 'user' })?.id, newsWeather.id);
    assert.equal(radioLayer.selectStationForFilter({ origin: 'user' })?.id, newsOnly.id);
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});

test('the panel moves the station only after the tag was accepted, before rebuilding the tuner band', () => {
  const source = readFileSync(new URL('../radioPanelMixin.js', import.meta.url), 'utf8');
  const start = source.indexOf("this._radioFilter?.addEventListener('change'");
  const handler = source.slice(start, source.indexOf('\n    });', start));
  const accepted = handler.indexOf("if (!this._dataManager?.setLayerParams('radio'");
  const retune = handler.indexOf("callLayerMethod('radio', 'selectStationForFilter', { origin: 'user' })");
  const rebuild = handler.indexOf('refreshTunerBand({ force: true })');
  assert.ok(accepted > 0 && retune > accepted, 'a rejected tag never moves the station');
  assert.ok(rebuild > retune, 'the tuner band is rebuilt around the new selection');
});
