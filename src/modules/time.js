export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '--';
  const ms = Math.round(seconds * 1000);
  return `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
}
export function parseTime(text) {
  const match = text.trim().match(/^(\d+):([0-5]?\d(?:\.\d{1,3})?)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}
export function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
