# Security

EagleEye View is a local-first client for **public** data. It is built for exploration, demos, and learning — not as a hardened production service. This document explains the security model so you can run it safely and report issues responsibly.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for anything exploitable.

- Use GitHub's [private vulnerability reporting](https://github.com/bilawalsidhu/gods-eye-view/security/advisories/new) (Security tab → "Report a vulnerability"), or
- Reach the maintainer directly via the contact on the GitHub profile.

Include repro steps and impact. We'll acknowledge, investigate, and credit you (if you'd like) once a fix ships.

## How secrets are handled

The golden rule: **secret-bearing API keys stay on the server side.** The dev/preview server (Vite middleware in `vite.config.js`) brokers every request that needs a private credential, so the browser never receives one.

| Key | Where it lives | How the browser uses it |
|-----|----------------|--------------------------|
| `OPENAI_API_KEY` | Server only | Browser fetches a SDP offer to `/api/live/session` (and screenshots to `/api/live/vision`); the server attaches the key, which never ships |
| `AISSTREAM_API_KEY` | Server only | Server holds the AISStream websocket; browser polls the same-origin `/api/ais-live` cache |
| OpenSky OAuth (`OPENSKY_CLIENT_ID/SECRET`) | Server only | Server mints + refreshes the token behind `/api/opensky` |
| `GOOGLE_MAPS_API_KEY` | Server only | Browser requests Photorealistic 3D Tiles from `/api/google/3dtiles/*`, geocoding from `/api/google/geocode`, and places from `/api/google/nearby-places` / `/api/google/text-search`; the server adds the key. The browser receives only a "Google configured" boolean |

**Restrict the Google Maps key by API** (Map Tiles, Geocoding, Places) in the Google Cloud Console, and by server IP address when self-hosting. Do **not** use an HTTP-referrer restriction: the requests come from the server, which sends no browser referrer, so a referrer-restricted key is refused. The proxies are still a spend surface — anyone who can reach the server can stream tiles on your quota (see LAN exposure below).

### One deliberately client-side token — restrict it

This is designed to be used directly in the browser (like a Mapbox public token). It is injected into the client bundle via Vite's `define`, so it **will** be visible in browser devtools. Scope and restrict it rather than trying to hide it:

1. **Cesium ion token** (`CESIUM_ION_TOKEN`, optional — for ion-hosted Google Photorealistic 3D Tiles, Bing world imagery, and world terrain) — used as `Cesium.Ion.defaultAccessToken` client-side. Use a public **`assets:read`** token with **URL restrictions** for any hosted deployment. The Community plan has eligibility and usage limits; a public token is not a secret, but it can still consume the account's quota.

> The Vite `define` block in `vite.config.js` controls exactly what reaches the client: only this token plus non-secret flags (the app version and the `GOOGLE_MAPS_PROXY_AVAILABLE` boolean). Everything else stays server-side.

Never commit real keys. `.env` is gitignored; only `.env.example` (placeholder names) is tracked. On macOS `dev-fresh.sh` can read keys from the Keychain; plain Vite uses env vars or a local `.env`, and Pinokio uses its ignored app `ENVIRONMENT` file.

The official Pinokio launcher stores optional values in its ignored local
`pinokio/ENVIRONMENT` file and Vite explicitly denies that filename. Add,
replace, or remove those values through **`/dev` → API Keys** (signed in as a
super_admin from `SUPER_ADMIN_EMAILS`); the server restricts the file before writing and
restarts the local app after a save. Do not submit credentials through Pinokio 8.0.40's
native Configure form: that release targets the wrong file for this nested
launcher layout and logs the submitted values. The ignored file is local
plaintext, not encrypted storage. The macOS Keychain remains the stronger local
option when launching through `./scripts/dev-fresh.sh`.

## Login and access control

Every page except the public landing (`/`) and `/login`, and every `/api/*`
route, requires a signed-in account, also on localhost (Better Auth, email +
password, `src/auth/`). One guard plugin in `vite.config.js`, registered before
every proxy, enforces it server-side:

- No session → pages redirect to `/login?next=…`, APIs answer `401 AUTH_REQUIRED`.
  There is no public sign-up or password reset; `/api/auth/*` is an exact
  allowlist of eight endpoints (everything else, including encoded or
  dot-segment variants, is 404).
- Every `/api/*` route declares a gate when it is registered: a user toggle
  (`layers`, `ai`, `premium` → `403 CAPABILITY_REQUIRED`), `open` (any account),
  `admin`, or `super` (keys, voice settings, Server Log, System Health). A route
  without a gate fails at boot. A deactivated account loses every session.
- super_admin comes only from `SUPER_ADMIN_EMAILS` plus Google sign-in or a
  CLI-set password (`npm run auth:set-password`); an admin-created account is
  never promoted by adding its email to env. Removing an email demotes the
  account and signs it out everywhere.
- Brute force: five wrong passwords throttle the account (and unknown emails)
  for 1–15 minutes, plus Better Auth's per-IP rate limit; the client IP comes
  from `X-Forwarded-For` only when the peer is in `AUTH_TRUSTED_PROXIES`.
- Only an allowlist of static files is served without a session; the auth
  database lives in owner-only `.gev-data/` and is never served.
- CSRF: state-changing auth calls need this app's exact Origin (Better Auth
  alone checks it only when cookies are present), every `/api/*` write needs the
  exact Origin (admin writes also a JSON body), a cross-site or same-site
  `Sec-Fetch-Site` is refused, and the session cookie is HttpOnly + SameSite=Lax
  (Secure on https). Sign-in and sign-out only work on the `BETTER_AUTH_URL`
  origin.
- Accounts, sessions, the login log and the audit log live in a local SQLite
  file (`AUTH_DATABASE_FILE`, default `.gev-data/auth.db`, mode 0600 in a 0700
  directory, gitignored, never served). Server logs carry user ids, never emails.
- `BETTER_AUTH_SECRET` (32+ chars) signs sessions; rotating it signs everyone out.
- **Not covered yet:** static assets (JS/CSS/Cesium files) are served without
  a session, so `CESIUM_ION_TOKEN` in the bundle remains readable by anyone who
  can reach the server — keep it URL-restricted at Cesium ion.

## Server-side proxy hardening

The data proxies in `vite.config.js` are written so the browser cannot turn the server into an open relay:

- **No arbitrary-URL fetching.** The CCTV frame proxy fetches only server-registered camera/frame URLs — clients cannot pass an upstream URL to fetch (SSRF mitigation). Other proxies target fixed upstream hosts.
- **Radio is not an audio relay.** `/api/radio/stations` contacts only allowlisted Radio Browser HTTPS hosts and paths, rejects redirects, rejects any hostname with a loopback/private/link-local/metadata/non-public A or AAAA result, and pins each TLS connection to a validated address. It returns normalized public HTTPS stream URLs; `/api/radio/click/:uuid` applies the same destination policy and accepts only station IDs from the current bounded catalog. The browser then connects directly to the broadcaster after an explicit playback action, so the broadcaster sees the listener's IP address. GEV never proxies, caches, records, or redistributes audio.
- **Response-size caps and timeouts** on proxied responses.
- **Sanitized errors** — internal error details are not echoed back to clients.
- **Coalesced OAuth refresh** and cached successful responses only (OpenSky).
- **Redacted debug logging.** The voice debug log (`.gev-logs/`, gitignored) strips API keys, bearer tokens, client secrets, and image data URLs before writing.
- **Runtime data is not served.** The dev server serves files under the project root, so `server.fs.deny` (`src/server/devServerExposure.mjs`) refuses with 403 the credential files plus everything the app writes at runtime: `.gev-cache/` (admin audit trail, server log, voice settings/usage, caches), `.gev-logs/` (voice transcripts), `.gev-data/` and `data/auth.db*`, the root `logs/` (pm2 output) and `.claude/`, and any `*.db*`/`*.sqlite*`/`*.jsonl`/`*.log` file. Vite's `/__open-in-editor` is disabled (404). Other files under the root — docs, untracked notes — are still readable, so keep private material out of the checkout of any instance you expose.

## Network exposure — the operator threat model

The dev server is a **key broker**: every server-side key above is spendable by anyone who can send HTTP requests to it. That shapes the defaults:

- **Local-only by default.** `./scripts/dev-fresh.sh` (and the Vite config itself) bind to `localhost`, so only your machine can reach the server — and only local names are accepted (`allowedHosts` stays restricted, which also blunts DNS-rebinding tricks).
- **LAN exposure is an explicit opt-in**: `HOST=0.0.0.0 ./scripts/dev-fresh.sh`. The launcher prints a prominent warning plus your LAN URL. Understand what opting in means: **every active account can drive the proxies and spend your OpenAI / Google / OpenSky / AISStream / TomTom / FIRMS quota** for as long as the server runs (anyone without an approved account is refused). Set `BETTER_AUTH_URL` to the LAN origin people open, and add its callback to the Google OAuth client. Do this only on networks you trust.
- **App-level throttles (opt-in):** `GEV_RATELIMIT_OPENAI_PER_MIN` and `GEV_RATELIMIT_GOOGLE_PER_MIN` cap the cost-bearing endpoints per client IP per minute (over-limit requests receive a sanitized `429`). They are **per-IP, process-local, in-memory guards** — they reset on restart and are **not billing caps**.
- **Provider-side budgets are the real backstop.** For hard spend protection, configure limits where the money is: OpenAI platform usage limits, Google Cloud budget alerts + per-API quotas, and equivalent controls for any other keyed provider.
- **Pinokio LAN and Cloudflare sharing are refused.** The current supported
  Pinokio release re-reads sharing state when an app registers its Open URL and
  logs a successful tunnel-login passcode in its own notification and terminal
  stream. Before preflight, the launcher rewrites its app-scoped sharing controls
  to disabled values, clears any Pinokio-global passcode from the child, and
  pins the platform share trigger to a disabled sentinel. A stale or requested
  sharing value is therefore discarded rather than honored, and GEV starts on
  loopback only. Use a separately reviewed authentication proxy for remote
  access and keep provider-side quotas as the spend backstop.

## Scope & expectations

- The Vite server is a **development/preview** server. The built-in login protects pages and APIs, but it has not been reviewed as an internet-facing service; if you expose it beyond localhost, keep a reviewed proxy in front and review the bindings (see the threat model above).
- All data shown is from **public** sources. See [DATA_SOURCES.md](DATA_SOURCES.md). Respect each provider's terms and rate limits.
- The voice agent receives feed-sourced text (place names, callsigns) as scene context. It is instructed to act only via a fixed set of app-control tools and not to execute arbitrary instructions found in data, but treat model output as untrusted and keep the tool surface limited.

## Responsible use

This is an interface for signals that are **already public**. Use it accordingly: respect privacy, follow data providers' terms, and don't represent public-data inference as authoritative intelligence.
