/**
 * cctvStreetView.mjs — Google Street View static-image fallback frame for CCTV
 * cameras with no working upstream. Node-only; needs GOOGLE_MAPS_API_KEY.
 */
import { CCTV_PROXY_USER_AGENT, CCTV_FRAME_FETCH_TIMEOUT_MS } from './cctvFrameFetch.mjs';

/**
 * Fetch a Street View still for a camera pose. Returns null (never throws) when the
 * key or coordinates are missing, the upstream errors, or it answers with a non-image.
 *
 * @param {{lat:number, lon:number, heading?:number, fov?:number, pitch?:number}} pose
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} [deps] injectable for tests
 * @returns {Promise<{ok:true, body:Buffer, contentType:string}|null>}
 */
export async function fetchStreetViewFrame(
  { lat, lon, heading, fov, pitch },
  { apiKey = process.env.GOOGLE_MAPS_API_KEY, fetchImpl = fetch } = {},
) {
  if (!apiKey || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const sv = new URL('https://maps.googleapis.com/maps/api/streetview');
    sv.searchParams.set('size', '960x540');
    sv.searchParams.set('location', `${lat},${lon}`);
    sv.searchParams.set('heading', String(Number.isFinite(heading) ? heading : 0));
    sv.searchParams.set('fov', String(Number.isFinite(fov) ? Math.max(20, Math.min(120, fov)) : 80));
    sv.searchParams.set('pitch', String(Number.isFinite(pitch) ? Math.max(-40, Math.min(20, pitch)) : 0));
    sv.searchParams.set('source', 'outdoor');
    sv.searchParams.set('return_error_code', 'true');
    sv.searchParams.set('key', apiKey);

    const svResp = await fetchImpl(sv.toString(), {
      headers: { 'User-Agent': CCTV_PROXY_USER_AGENT },
      signal: AbortSignal.timeout(CCTV_FRAME_FETCH_TIMEOUT_MS),
    });
    const svType = svResp.headers.get('content-type') || '';
    if (!svResp.ok || !svType.startsWith('image/')) return null;

    return { ok: true, body: Buffer.from(await svResp.arrayBuffer()), contentType: svType };
  } catch {
    // Fallback tier: any failure just hands over to the synthetic frame.
    return null;
  }
}
