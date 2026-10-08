// hls.js options for CCTV live feeds. Deliberately no live-sync override.
//
// The player sits liveSyncDurationCount * EXT-X-TARGETDURATION behind the live
// edge, and the upstream only keeps a short window of segments. Segment length
// varies per host (2 s to 10 s across the packs), so a larger count that looks
// safe for 7.5 s segments puts a 2 s-segment host (Denpasar, Mataram: 7 segments
// = 14 s window) 10 s back, leaving ~4 s before the segment being fetched has
// rolled off and 404s; hosts with a short window (Surabaya, Jakarta) end up
// outside it entirely. hls.js's default (3 segments) keeps every measured host
// inside its window.

/** Options passed to `new Hls(...)` for CCTV projection feeds. */
export const CCTV_HLS_CONFIG = Object.freeze({});
