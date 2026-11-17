// src/auth/clientIp.mjs
/**
 * The client address the login records and rate-limits by. The TCP peer is
 * used unless it is one of AUTH_TRUSTED_PROXIES (env, comma-separated IPs or
 * CIDRs, opt-in); only then is `X-Forwarded-For` read, right to left, skipping
 * trusted hops. A client can therefore never choose its own address.
 *
 * @module auth/clientIp
 */

import net from 'node:net';

const familyOf = (ip) => (net.isIPv6(ip) ? 'ipv6' : 'ipv4');
const stripMapped = (ip) => (String(ip ?? '').toLowerCase().startsWith('::ffff:') && net.isIPv4(ip.slice(7)) ? ip.slice(7) : String(ip ?? ''));

/**
 * Parse AUTH_TRUSTED_PROXIES. Invalid entries are returned by name so boot can warn.
 * @param {string | undefined} raw
 * @returns {{list: import('node:net').BlockList, entries: string[], invalid: string[]}}
 */
export function parseTrustedProxies(raw) {
  const list = new net.BlockList();
  const entries = [];
  const invalid = [];
  for (const entry of String(raw ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const [address, bits] = entry.split('/');
    if (!net.isIP(address) || (bits !== undefined && !/^\d{1,3}$/.test(bits))) { invalid.push(entry); continue; }
    if (bits === undefined) list.addAddress(address, familyOf(address));
    else list.addSubnet(address, Number(bits), familyOf(address));
    entries.push(entry);
  }
  return { list, entries, invalid };
}

const isTrusted = (ip, trusted) => Boolean(ip) && net.isIP(ip) && trusted.entries.length > 0 && trusted.list.check(ip, familyOf(ip));

/**
 * @param {string | undefined} socketIp `req.socket.remoteAddress`.
 * @param {string | string[] | undefined} forwardedFor `X-Forwarded-For` header.
 * @param {{list: import('node:net').BlockList, entries: string[]}} trusted From parseTrustedProxies.
 * @returns {string} The client IP ('' when the socket has none).
 */
export function resolveClientIp(socketIp, forwardedFor, trusted) {
  const peer = stripMapped(socketIp);
  if (!isTrusted(peer, trusted)) return peer;
  const hops = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : String(forwardedFor ?? ''))
    .split(',').map((hop) => stripMapped(hop.trim())).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    if (!net.isIP(hops[i])) return peer;
    if (!isTrusted(hops[i], trusted)) return hops[i];
  }
  return peer;
}
