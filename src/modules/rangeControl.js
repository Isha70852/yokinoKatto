// Compact, shared double-ended range control. Times remain numeric seconds.
import { t } from '../i18n/index.js';
import { formatTime } from './time.js';
export function mountRangeControl(container, range, window, onChange, onInteraction = () => {}) {
  container.replaceChildren();
  const header = document.createElement('div'); header.className = 'compact-range-header';
  const title = document.createElement('span'); title.textContent = t('speech.adjustRange');
  const output = document.createElement('output'); header.append(title, output); container.append(header);
  const track = document.createElement('div'); track.className = 'compact-range-track';
  const fill = document.createElement('div'); fill.className = 'compact-range-fill'; track.append(fill);
  const handles = {};
  const sync = () => {
    const size = window.end - window.start;
    const left = (range.start - window.start) / size * 100, right = (range.end - window.start) / size * 100;
    fill.style.left = `${left}%`; fill.style.width = `${right - left}%`;
    output.textContent = `${formatTime(range.start)} → ${formatTime(range.end)}`;
    for (const bound of ['start', 'end']) {
      const handle = handles[bound]; handle.style.left = `${bound === 'start' ? left : right}%`;
      handle.setAttribute('aria-valuemin', String(bound === 'start' ? window.start : range.start + .001));
      handle.setAttribute('aria-valuemax', String(bound === 'start' ? range.end - .001 : window.end));
      handle.setAttribute('aria-valuenow', String(range[bound])); handle.setAttribute('aria-valuetext', formatTime(range[bound]));
      handle.title = `${t(`speech.${bound}Time`)} ${formatTime(range[bound])}`;
    }
  };
  const setValue = (bound, value) => {
    const min = bound === 'start' ? window.start : range.start + .001;
    const max = bound === 'start' ? range.end - .001 : window.end;
    if (max < min) return;
    const next = Math.max(min, Math.min(max, Math.round(value * 1000) / 1000));
    onChange(bound, next); sync();
  };
  for (const bound of ['start', 'end']) {
    const handle = document.createElement('button'); handle.type = 'button'; handle.className = `compact-range-handle ${bound}`;
    handle.setAttribute('role', 'slider'); handle.setAttribute('aria-label', t(`speech.${bound}Time`)); handles[bound] = handle;
    let pointer = null;
    const move = event => {
      const rect = track.getBoundingClientRect();
      if (rect.width) setValue(bound, window.start + (event.clientX - rect.left) / rect.width * (window.end - window.start));
    };
    handle.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); pointer = event.pointerId; onInteraction(true); handle.setPointerCapture(pointer); move(event); });
    handle.addEventListener('pointermove', event => { if (event.pointerId === pointer) move(event); });
    const release = () => { if (pointer !== null) onInteraction(false); pointer = null; }; handle.addEventListener('pointerup', release); handle.addEventListener('pointercancel', release); handle.addEventListener('lostpointercapture', release);
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.shiftKey ? .001 : .01;
      onInteraction(true);
      setValue(bound, event.key === 'Home' ? window.start : event.key === 'End' ? window.end : range[bound] + (event.key === 'ArrowLeft' ? -step : step));
      onInteraction(false);
    }); track.append(handle);
  }
  container.append(track);
  const scale = document.createElement('div'); scale.className = 'compact-range-scale';
  for (const time of [window.start, window.end]) { const label = document.createElement('span'); label.textContent = formatTime(time); scale.append(label); }
  container.append(scale); sync();
}
