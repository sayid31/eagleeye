import { test } from 'node:test';
import assert from 'node:assert/strict';
import Hls from 'hls.js';
import { CCTV_HLS_CONFIG } from './cctvHlsConfig.js';

// Live-window shape of each upstream host, measured 2026-10-07 from the real
// playlists: EXT-X-TARGETDURATION and the summed EXTINF of the listed segments.
const MEASURED_HOSTS = [
  { host: 'atcs.denpasarkota.go.id', targetS: 2, windowS: 14 },
  { host: 'relay-cctv.mataramkota.go.id', targetS: 2, windowS: 14 },
  { host: 'info.serbaraja-tollroad.co.id', targetS: 2, windowS: 10 },
  { host: 'pub2.hk-opt.com', targetS: 2, windowS: 10.2 },
  { host: 'pub.hk-opt.com', targetS: 5, windowS: 23.5 },
  { host: 'cctv.kkdm.co.id', targetS: 3, windowS: 30 },
  { host: 'jmlive.jasamarga.com', targetS: 10, windowS: 22.4 },
  { host: '36.66.208.101:5000', targetS: 3, windowS: 7.5 },
  { host: 'atcs.cianjurkab.go.id', targetS: 5, windowS: 25 },
  { host: 'dki-jkt.balitower.co.id', targetS: 8, windowS: 30 },
];

test('CCTV hls.js config does not override the live-sync distance', () => {
  for (const key of ['liveSyncDurationCount', 'liveSyncDuration', 'liveMaxLatencyDurationCount', 'liveMaxLatencyDuration']) {
    assert.equal(key in CCTV_HLS_CONFIG, false, key);
  }
});

test('default live-sync distance stays strictly inside the live window of every host that can fit it', () => {
  const hls = new Hls({ ...CCTV_HLS_CONFIG });
  const count = hls.config.liveSyncDurationCount;
  hls.destroy();
  assert.equal(count, 3);
  // Surabaya (7.5 s window, 3 s segments) and Jasamarga (22.4 s window, 10 s
  // segments) can't fit 3 segments plus a margin; they're excluded rather
  // than asserted, and the old count of 5 was further outside their window.
  const WINDOW_TOO_SHORT = new Set(['36.66.208.101:5000', 'jmlive.jasamarga.com']);
  for (const { host, targetS, windowS } of MEASURED_HOSTS) {
    if (WINDOW_TOO_SHORT.has(host)) continue;
    const margin = windowS - count * targetS;
    if (targetS === 2) assert.ok(margin >= 4, `${host}: 2 s-segment host needs >= 4 s margin, got ${margin}s`);
    assert.ok(margin > 0, `${host}: sync distance ${count * targetS}s exceeds ${windowS}s window`);
  }
});
