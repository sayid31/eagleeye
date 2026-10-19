// Module constants moved out of cockpitViewController.js.

export const COCKPIT_HEADING_SLEW_DPS = 28;

export const COCKPIT_FORWARD_OFFSET_M = 7;

export const COCKPIT_UP_OFFSET_M = 2.6;

export const COCKPIT_MIN_GROUND_CLEARANCE_M = 12;

export const COCKPIT_VIEW_PITCH_DEG = -4;

export const COCKPIT_CAMERA_UPDATE_MS = 50;

export const COCKPIT_HUD_UPDATE_MS = 100;

export const COCKPIT_CONTEXT_UPDATE_MS = 250;

// Cockpit's Display/Radio strip hangs off the REC readout it shares the right
// margin with, and never touches the briefing card underneath it.
export const COCKPIT_UTILITY_REC_GAP_PX = 12;

export const COCKPIT_UTILITY_SIGNAL_GAP_PX = 8;

export const COCKPIT_UTILITY_MIN_TOP_PX = 96;

export const COCKPIT_UTILITY_MIN_TOP_RATIO = 0.12;

export const COCKPIT_UTILITY_LAUNCHER_MIN_HEIGHT_PX = 50;

export const COCKPIT_GROUND_PROBE_MS = 500;

export const COCKPIT_GROUND_WAIT_TIMEOUT_MS = 5000;

export const COCKPIT_BRIEF_ROTATE_MS = 9000;

export const COCKPIT_BRIEF_CYCLE_OFF_HELP = 'Putar halaman ringkasan otomatis setiap 9 detik (Sinyal → Berita → Lokal). Berhenti sementara saat kursor atau fokus ada di panel. Data sinyal live tetap diperbarui terus-menerus.';

export const COCKPIT_BRIEF_CYCLE_ON_HELP = 'Hentikan perputaran halaman otomatis. Sebelumnya, Berikutnya, dan tab SIN/BERITA/LOKAL tetap tersedia.';

export const COCKPIT_REGIONAL_REFRESH_MS = 5 * 60_000;

export const COCKPIT_REGIONAL_REFRESH_DISTANCE_M = 25_000;

export const COCKPIT_BRIEF_PAGES = [
  {
    id: 'signals',
    kicker: 'SINYAL LIVE',
    subtitle: 'PING TERAMATI / TERPETAKAN',
    source: 'PERISTIWA BERSUMBER · TANPA BERITA SINTETIS',
  },
  {
    id: 'news',
    kicker: 'BERITA REGIONAL',
    subtitle: 'LIPUTAN TERBARU SESUAI LOKASI',
    source: 'GOOGLE NEWS RSS · KUERI LOKASI · TERBARU',
  },
  {
    id: 'local',
    kicker: 'INFO LOKAL',
    subtitle: 'TEMPAT / KONDISI / POSISI',
    source: 'OPENSTREETMAP · OPEN-METEO · UTC',
  },
];
