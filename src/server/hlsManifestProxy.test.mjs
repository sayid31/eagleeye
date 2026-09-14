import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isManifestContentType,
  resolveRelUrl,
  buildProxyRelUrl,
  isAllowedRelOrigin,
  rewriteHlsManifest,
} from './hlsManifestProxy.mjs';

// ---------------------------------------------------------------------------
// isManifestContentType
// ---------------------------------------------------------------------------

test('isManifestContentType: recognizes apple mpegurl content-type', () => {
  assert.equal(isManifestContentType('application/vnd.apple.mpegurl', '/foo'), true);
});

test('isManifestContentType: recognizes x-mpegurl content-type', () => {
  assert.equal(isManifestContentType('application/x-mpegurl; charset=utf-8', '/foo'), true);
});

test('isManifestContentType: recognizes .m3u8 path suffix with generic content-type', () => {
  assert.equal(isManifestContentType('application/octet-stream', '/tracks-v1/index.fmp4.m3u8'), true);
});

test('isManifestContentType: recognizes .m3u8 path suffix with query string', () => {
  assert.equal(isManifestContentType('application/octet-stream', '/index.m3u8?ts=123'), true);
});

test('isManifestContentType: rejects non-manifest content-type and path', () => {
  assert.equal(isManifestContentType('video/mp2t', '/seg-0-12.ts'), false);
});

test('isManifestContentType: rejects empty inputs', () => {
  assert.equal(isManifestContentType('', ''), false);
});

// ---------------------------------------------------------------------------
// resolveRelUrl
// ---------------------------------------------------------------------------

test('resolveRelUrl: resolves a same-directory relative path', () => {
  const result = resolveRelUrl('tracks-v1/index.fmp4.m3u8', 'https://dki-jkt.balitower.co.id:7028/CAM1/index.fmp4.m3u8');
  assert.equal(result, 'https://dki-jkt.balitower.co.id:7028/CAM1/tracks-v1/index.fmp4.m3u8');
});

test('resolveRelUrl: resolves a sibling segment relative to a sub-playlist', () => {
  const result = resolveRelUrl('seg-0-12.hls.fmp4', 'https://dki-jkt.balitower.co.id:7028/CAM1/tracks-v1/index.fmp4.m3u8');
  assert.equal(result, 'https://dki-jkt.balitower.co.id:7028/CAM1/tracks-v1/seg-0-12.hls.fmp4');
});

test('resolveRelUrl: resolves an absolute-path reference against the origin', () => {
  const result = resolveRelUrl('/other/path.ts', 'https://atcs-dishub.bandung.go.id:1990/Samsat/index.m3u8');
  assert.equal(result, 'https://atcs-dishub.bandung.go.id:1990/other/path.ts');
});

test('resolveRelUrl: passes through an already-absolute URL unchanged (modulo normalization)', () => {
  const result = resolveRelUrl('https://example.com/seg.ts', 'https://atcs.denpasarkota.go.id/stream/X/index.m3u8');
  assert.equal(result, 'https://example.com/seg.ts');
});

test('resolveRelUrl: resolves ../ traversal', () => {
  const result = resolveRelUrl('../alt/seg.ts', 'https://example.com/a/b/index.m3u8');
  assert.equal(result, 'https://example.com/a/alt/seg.ts');
});

test('resolveRelUrl: returns null for malformed input', () => {
  assert.equal(resolveRelUrl('seg.ts', 'not a url'), null);
});

// ---------------------------------------------------------------------------
// buildProxyRelUrl / isAllowedRelOrigin
// ---------------------------------------------------------------------------

test('buildProxyRelUrl: encodes camera id and absolute URL into a /rel query', () => {
  const result = buildProxyRelUrl('jakarta-unofficial-gatot-subroto-jpo-02', 'https://dki-jkt.balitower.co.id:7028/CAM1/tracks-v1/index.fmp4.m3u8');
  assert.equal(
    result,
    '/api/cctv/media/jakarta-unofficial-gatot-subroto-jpo-02/rel?p=' +
      encodeURIComponent('https://dki-jkt.balitower.co.id:7028/CAM1/tracks-v1/index.fmp4.m3u8'),
  );
});

test('isAllowedRelOrigin: accepts a same-origin candidate URL', () => {
  const ok = isAllowedRelOrigin(
    'https://atcs-dishub.bandung.go.id:1990/Samsat/main_stream.m3u8',
    'https://atcs-dishub.bandung.go.id:1990/Samsat/index.m3u8',
  );
  assert.equal(ok, true);
});

test('isAllowedRelOrigin: rejects a cross-origin candidate URL (SSRF attempt)', () => {
  const ok = isAllowedRelOrigin(
    'https://evil.example.com/steal',
    'https://atcs-dishub.bandung.go.id:1990/Samsat/index.m3u8',
  );
  assert.equal(ok, false);
});

test('isAllowedRelOrigin: rejects a differing port on the same host', () => {
  const ok = isAllowedRelOrigin(
    'https://atcs-dishub.bandung.go.id:9999/Samsat/main_stream.m3u8',
    'https://atcs-dishub.bandung.go.id:1990/Samsat/index.m3u8',
  );
  assert.equal(ok, false);
});

test('isAllowedRelOrigin: rejects a non-http(s) scheme', () => {
  const ok = isAllowedRelOrigin('file:///etc/passwd', 'https://atcs-dishub.bandung.go.id:1990/Samsat/index.m3u8');
  assert.equal(ok, false);
});

test('isAllowedRelOrigin: rejects malformed candidate/registered URLs', () => {
  assert.equal(isAllowedRelOrigin('not a url', 'https://example.com/x'), false);
  assert.equal(isAllowedRelOrigin('https://example.com/x', 'not a url'), false);
});

// ---------------------------------------------------------------------------
// rewriteHlsManifest — Jakarta-shaped (master -> sub-playlist, fMP4, EXT-X-MAP)
// ---------------------------------------------------------------------------

test('rewriteHlsManifest: Jakarta master playlist rewrites EXT-X-STREAM-INF URI line', () => {
  const master = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720',
    'tracks-v1/index.fmp4.m3u8',
    '',
  ].join('\n');
  const id = 'jakarta-unofficial-gatot-subroto-jpo-02';
  const base = 'https://dki-jkt.balitower.co.id:7028/502045_JKP_POLDA_JPO-JL.-GATOT-SUBROTO-7_CCTV-02/index.fmp4.m3u8';
  const out = rewriteHlsManifest(master, base, id);
  const lines = out.split('\n');

  assert.equal(lines[0], '#EXTM3U');
  assert.equal(lines[1], '#EXT-X-VERSION:6');
  assert.equal(lines[2], '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720');
  assert.equal(
    lines[3],
    buildProxyRelUrl(id, 'https://dki-jkt.balitower.co.id:7028/502045_JKP_POLDA_JPO-JL.-GATOT-SUBROTO-7_CCTV-02/tracks-v1/index.fmp4.m3u8'),
  );
  // trailing blank line preserved
  assert.equal(out.endsWith('\n'), true);
});

test('rewriteHlsManifest: Jakarta sub-playlist rewrites EXT-X-MAP URI and fmp4 segment lines', () => {
  const sub = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-TARGETDURATION:2',
    '#EXT-X-MAP:URI="init-mi-2065989632.hls.fmp4"',
    '#EXTINF:2.000,',
    'seg-0-12.hls.fmp4',
    '#EXTINF:2.000,',
    'seg-0-13.hls.fmp4',
  ].join('\n');
  const id = 'jakarta-unofficial-gatot-subroto-jpo-02';
  const subBase = 'https://dki-jkt.balitower.co.id:7028/502045_JKP_POLDA_JPO-JL.-GATOT-SUBROTO-7_CCTV-02/tracks-v1/index.fmp4.m3u8';
  const out = rewriteHlsManifest(sub, subBase, id);
  const lines = out.split('\n');

  assert.equal(
    lines[3],
    `#EXT-X-MAP:URI="${buildProxyRelUrl(id, 'https://dki-jkt.balitower.co.id:7028/502045_JKP_POLDA_JPO-JL.-GATOT-SUBROTO-7_CCTV-02/tracks-v1/init-mi-2065989632.hls.fmp4')}"`,
  );
  assert.equal(lines[4], '#EXTINF:2.000,');
  assert.equal(
    lines[5],
    buildProxyRelUrl(id, 'https://dki-jkt.balitower.co.id:7028/502045_JKP_POLDA_JPO-JL.-GATOT-SUBROTO-7_CCTV-02/tracks-v1/seg-0-12.hls.fmp4'),
  );
  assert.equal(
    lines[7],
    buildProxyRelUrl(id, 'https://dki-jkt.balitower.co.id:7028/502045_JKP_POLDA_JPO-JL.-GATOT-SUBROTO-7_CCTV-02/tracks-v1/seg-0-13.hls.fmp4'),
  );
});

// ---------------------------------------------------------------------------
// rewriteHlsManifest — Bandung-shaped (index.m3u8 -> main_stream.m3u8 -> .ts)
// ---------------------------------------------------------------------------

test('rewriteHlsManifest: Bandung top-level playlist rewrites sub-playlist reference', () => {
  const top = ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=800000', 'main_stream.m3u8', ''].join('\n');
  const id = 'bandung-unofficial-samsat';
  const base = 'https://atcs-dishub.bandung.go.id:1990/Samsat/index.m3u8';
  const out = rewriteHlsManifest(top, base, id);
  const lines = out.split('\n');
  assert.equal(
    lines[2],
    buildProxyRelUrl(id, 'https://atcs-dishub.bandung.go.id:1990/Samsat/main_stream.m3u8'),
  );
});

test('rewriteHlsManifest: Bandung sub-playlist rewrites .ts segment lines', () => {
  const sub = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:6',
    '#EXT-X-MEDIA-SEQUENCE:1348',
    '#EXTINF:6.000,',
    'fa76b4073721_main_seg1348.ts',
    '#EXTINF:6.000,',
    'fa76b4073721_main_seg1349.ts',
  ].join('\n');
  const id = 'bandung-unofficial-samsat';
  const base = 'https://atcs-dishub.bandung.go.id:1990/Samsat/main_stream.m3u8';
  const out = rewriteHlsManifest(sub, base, id);
  const lines = out.split('\n');
  assert.equal(lines[1], '#EXT-X-VERSION:3');
  assert.equal(lines[2], '#EXT-X-TARGETDURATION:6');
  assert.equal(lines[3], '#EXT-X-MEDIA-SEQUENCE:1348');
  assert.equal(
    lines[5],
    buildProxyRelUrl(id, 'https://atcs-dishub.bandung.go.id:1990/Samsat/fa76b4073721_main_seg1348.ts'),
  );
  assert.equal(
    lines[7],
    buildProxyRelUrl(id, 'https://atcs-dishub.bandung.go.id:1990/Samsat/fa76b4073721_main_seg1349.ts'),
  );
});

// ---------------------------------------------------------------------------
// rewriteHlsManifest — Denpasar-shaped (index.m3u8 -> stream.m3u8 -> .ts)
// ---------------------------------------------------------------------------

test('rewriteHlsManifest: Denpasar sub-playlist rewrites .ts segment lines', () => {
  const sub = [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:6',
    '#EXTINF:6.000,',
    'ef4c10bf52c6_seg26021.ts',
  ].join('\n');
  const id = 'denpasar-unofficial-gunung-agung';
  const base = 'https://atcs.denpasarkota.go.id/stream/A001GUNUNGAGUNGPTZ/stream.m3u8';
  const out = rewriteHlsManifest(sub, base, id);
  const lines = out.split('\n');
  assert.equal(
    lines[3],
    buildProxyRelUrl(id, 'https://atcs.denpasarkota.go.id/stream/A001GUNUNGAGUNGPTZ/ef4c10bf52c6_seg26021.ts'),
  );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('rewriteHlsManifest: preserves blank lines', () => {
  const text = ['#EXTM3U', '', '#EXT-X-VERSION:3', ''].join('\n');
  const out = rewriteHlsManifest(text, 'https://example.com/index.m3u8', 'cam');
  assert.equal(out, text);
});

test('rewriteHlsManifest: preserves trailing newline presence', () => {
  const withNewline = '#EXTM3U\n#EXT-X-ENDLIST\n';
  const out = rewriteHlsManifest(withNewline, 'https://example.com/index.m3u8', 'cam');
  assert.equal(out.endsWith('\n'), true);
});

test('rewriteHlsManifest: preserves absence of trailing newline', () => {
  const withoutNewline = '#EXTM3U\n#EXT-X-ENDLIST';
  const out = rewriteHlsManifest(withoutNewline, 'https://example.com/index.m3u8', 'cam');
  assert.equal(out.endsWith('\n'), false);
});

test('rewriteHlsManifest: does not choke on #EXT-X-ENDLIST (VOD marker)', () => {
  const text = ['#EXTM3U', '#EXTINF:6.000,', 'seg1.ts', '#EXT-X-ENDLIST'].join('\n');
  const out = rewriteHlsManifest(text, 'https://example.com/a/index.m3u8', 'cam');
  assert.match(out, /#EXT-X-ENDLIST$/);
});

test('rewriteHlsManifest: empty input returns unchanged', () => {
  assert.equal(rewriteHlsManifest('', 'https://example.com/index.m3u8', 'cam'), '');
  assert.equal(rewriteHlsManifest(null, 'https://example.com/index.m3u8', 'cam'), '');
  assert.equal(rewriteHlsManifest(undefined, 'https://example.com/index.m3u8', 'cam'), '');
});

test('rewriteHlsManifest: EXT-X-STREAM-INF followed by a blank/malformed line degrades gracefully', () => {
  const text = ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=100', '', '#EXT-X-VERSION:3'].join('\n');
  const out = rewriteHlsManifest(text, 'https://example.com/index.m3u8', 'cam');
  // The blank line is left as-is rather than being guessed at as a URI.
  assert.equal(out, text);
});

test('rewriteHlsManifest: does not throw on a malformed base URL', () => {
  const text = ['#EXTM3U', 'seg.ts'].join('\n');
  const out = rewriteHlsManifest(text, 'not a url', 'cam');
  // Unresolvable line is left unchanged rather than throwing.
  assert.equal(out, text);
});
