// Pure formatters for the shell's status bar and clock.

/** @param {number} value Degrees. @param {'lat'|'lon'} axis @returns {string} e.g. 6°10′30″S */
export function formatDms(value, axis) {
  const hemisphere = axis === 'lat' ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  let minutes = Math.floor((abs - degrees) * 60);
  let seconds = Math.round(((abs - degrees) * 60 - minutes) * 60);
  if (seconds === 60) { seconds = 0; minutes += 1; }
  if (minutes === 60) { minutes = 0; degrees += 1; }
  return `${degrees}°${minutes}′${seconds}″${hemisphere}`;
}

/** Spaced MGRS: `48MYU04111311` → `48M YU 0411 1311`. Unparseable input passes through. */
export function formatMgrs(raw) {
  const match = /^(\d{1,2}[C-X])([A-Z]{2})(\d*)$/.exec(String(raw || ''));
  if (!match) return String(raw || '---');
  const digits = match[3];
  const half = digits.length / 2;
  return half === Math.floor(half) && half > 0
    ? `${match[1]} ${match[2]} ${digits.slice(0, half)} ${digits.slice(half)}`
    : `${match[1]} ${match[2]} ${digits}`.trim();
}

/** Altitude with `.` thousands separator: 1245 → `1.245 m`; non-finite → `—`. */
export function formatAltitude(meters) {
  if (!Number.isFinite(meters)) return '—';
  const rounded = Math.round(meters);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${grouped} m`;
}

/** `UTC 06:12:48` */
export function formatUtcClock(date) {
  const part = (n) => String(n).padStart(2, '0');
  return `UTC ${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())}`;
}

/** Health chip text pieces; the degraded part is omitted when zero. */
export function healthLabels({ live, degraded }) {
  return {
    live: `${live} sumber live`,
    degraded: degraded > 0 ? `${degraded} terganggu` : '',
  };
}
