// src/voice/gevLiveRtc.js
/**
 * WebRTC plumbing for the GPT-Live controller (`gevLiveSession.js`): mic
 * constraints, track teardown, the bounded ICE wait and the one-shot SDP
 * exchange with our own `/api/live/session` route. No controller state here.
 *
 * @module voice/gevLiveRtc
 */

// A full-duplex open mic hearing its own assistant output is exactly the
// self-trigger loop echoCancellation guards against.
export const MIC_CONSTRAINTS = Object.freeze({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });

/** The one-shot SDP POST cannot trickle later candidates, so the ICE wait is capped. */
export const ICE_WAIT_MS = 2000;

/** Stop every track of a stream; already-stopped tracks are ignored. */
export function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
}

/** Resolve when ICE gathering completes, or after ICE_WAIT_MS with what the host has. */
export function waitForIceComplete(pc, waitMs = ICE_WAIT_MS) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    setTimeout(resolve, waitMs);
  });
}

/** POST the local SDP offer to the server-side session route. */
export function postSdpOffer(fetchImpl, url, sdp) {
  return fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: sdp });
}

/**
 * Answer SDP from the session route: raw SDP, or JSON carrying it under
 * `sdp`, `answer.sdp` or `transport.sdp`. A non-2xx answer throws with the
 * status and the first 200 characters of the body.
 * @param {Response} response
 * @returns {Promise<string>}
 */
export async function readAnswerSdp(response) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GPT-Live SDP failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 200)}` : ''}`);
  }
  const body = await response.text();
  try {
    const parsed = JSON.parse(body);
    return parsed.sdp || parsed.answer?.sdp || parsed.transport?.sdp || body;
  } catch {
    return body; // raw SDP passthrough
  }
}
