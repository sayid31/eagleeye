# Staging (stg) runbook

How to bring up the `sayid31/main` build on the stg server with GPT-Live
voice working. Cost guards and login are deliberately deferred — read the
2026-11-06 entry in `docs/DECISIONS.md` before opening stg to anyone.

## Requirements

- Node `>=24.14.0 <25` (or `>=26 <27`), matching `package.json` `engines`.
- pm2 installed globally (`npm i -g pm2`).
- HTTPS in front of the server (reverse proxy or tunnel). The browser only
  grants the microphone (`getUserMedia`) on a secure context — over plain
  `http://<ip>:4005` voice cannot start.

## Steps

```bash
git clone https://github.com/sayid31/eagleeye.git && cd eagleeye   # or git pull on main
npm ci
cp .env.example .env     # then fill OPENAI_API_KEY (and any other keys you use)
chmod 600 .env
mkdir -p logs            # pm2 writes logs/eagleeye-out.log and logs/eagleeye-err.log
pm2 start ecosystem.config.cjs
pm2 save                 # optional: survive a reboot together with `pm2 startup`
```

`ecosystem.config.cjs` runs the **Vite dev server** on `0.0.0.0:4005`, not
`vite preview` or `dist/`: the API proxies (voice, AIS, OpenSky, CCTV, ...)
are dev-server middleware and are not available under `vite preview`.

## Voice (GPT-Live)

- `OPENAI_API_KEY` must be set in `.env`; without it `/api/live/session`
  answers `503`.
- Keep `OPENAI_LIVE_MODEL=gpt-live-1` (the default when unset) and
  `OPENAI_LIVE_BACKEND_MODEL=gpt-5.6-luna` for `read_screen`.
- Voice is on by default. It is off only if `.gev-cache/voice-settings.json`
  holds `enabled: false` (then `/api/live/session` answers `403
  voice_disabled`).
- Check: open the stg HTTPS URL, press the voice button, allow the mic, and
  `pm2 logs eagleeye` should show no `/api/live/session` error.

## Day-to-day

```bash
git pull && npm ci && pm2 restart eagleeye
pm2 logs eagleeye
```
