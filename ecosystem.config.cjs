// pm2 process file for EagleEye View.
//
// Runs the Vite DEV server (not `vite preview`) because the app's upstream
// proxies (OpenSky, CCTV, AIS live, voice/Realtime token minting, etc. — see
// vite.config.js) are registered as dev-server middleware and are not all
// available under `vite preview`.
//
// HOST=0.0.0.0 exposes this server beyond localhost — vite.config.js reacts
// to that by setting `allowedHosts: true` (see server.allowedHosts), which is
// what lets a reverse-proxied/tunneled public hostname like
// eagle-eye.wibudev.com through the Host-header check that otherwise blocks
// non-local hostnames.
//
// WARNING: HOST=0.0.0.0 also means this process brokers every API key you've
// configured (OpenAI, AISStream, TomTom, FIRMS, ...) to anyone who can reach
// it. Set GEV_RATELIMIT_* throttles and provider-side budget caps before
// exposing this publicly — see SECURITY.md.
//
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 restart eagleeye
//   pm2 logs eagleeye

module.exports = {
  apps: [
    {
      name: 'eagleeye',
      cwd: __dirname,
      script: 'npx',
      args: 'vite --host 0.0.0.0 --port 4005',
      env: {
        HOST: '0.0.0.0',
        PORT: '4005',
        NODE_ENV: 'production',
      },
      // Keys (OPENAI_API_KEY, AISSTREAM_API_KEY, TOMTOM_API_KEY, FIRMS_MAP_KEY,
      // OPENSKY_*, CESIUM_ION_TOKEN, GOOGLE_MAPS_API_KEY, ...) are read from
      // this project's .env via Vite's loadEnv — set them there rather than
      // here, so `npm run doctor` and the in-app POWER UP panel stay in sync
      // with what's actually configured.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      watch: false,
      out_file: './logs/eagleeye-out.log',
      error_file: './logs/eagleeye-err.log',
      time: true,
    },
  ],
};
