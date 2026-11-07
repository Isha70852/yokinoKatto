import { mountRangeControl } from '../modules/rangeControl.js';
// TXT/manual timing -> standard SRT. Independent from speech segments and VAD.
import { t } from '../i18n/index.js';
import { showToast } from '../modules/toast.js';
import { formatTime, parseTime, srtTime } from '../modules/time.js';
import { triggerDownload } from '../modules/jobQueue.js';
const $ = id => document.getElementById(`subtitles-${id}`);
let files = [], file = null, url = null, duration = 0, cues = [], activeId = null;
let previewId = null, editorWindow = null, rangeEditing = false;
const previewCue = () => cues.find(cue => cue.id === previewId);
const activeCue = () => cues.find(cue => cue.id === activeId);
const warn = key => showToast(t(`subtitles.${key}`), 'warn');
const complete = cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && (!duration || cue.end <= duration);
function button(text, action) { const node = document.createElement('button'); node.type = 'button'; node.className = 'btn btn-ghost btn-sm'; node.textContent = text; node.addEventListener('click', action); return node; }
export function initSubtitles() {
  $('file').addEventListener('change', () => {
    const next = files.find(entry => String(entry.id) === $('file').value)?.file || null;
    if (file !== next && cues.some(cue => cue.start !== null) && !confirm(t('subtitles.replaceVideo'))) { $('file').value = files.find(entry => entry.file === file)?.id || ''; return; }
    loadFile(next);
  });
  $('txt').addEventListener('change', async () => {
    const source = $('txt').files[0]; if (!source) return;
    try { const text = await source.text(); $('text').value = text; importText(text); }
    catch (error) { showToast(t('toast.error', { msg: error.message }), 'error'); }
    $('txt').value = '';
  });
  $('import').addEventListener('click', () => importText($('text').value));
  $('video').addEventListener('loadedmetadata', () => { duration = Number.isFinite($('video').duration) ? $('video').duration : 0; $('seek').max = duration; render(); });
  $('video').addEventListener('error', () => { duration = 0; warn('previewError'); });
  $('video').addEventListener('timeupdate', updateTime);
  let frame = null;
  const tick = () => { updateTime(); frame = requestAnimationFrame(tick); };
  $('video').addEventListener('play', () => { if (frame === null) tick(); });
  $('video').addEventListener('pause', () => { cancelAnimationFrame(frame); frame = null; });
  $('video').addEventListener('ended', () => {
    const cue = previewCue();
    if (cue && complete(cue) && $('preview-mode').value === 'loop') { seek(cue.start); $('video').play().catch(() => warn('previewError')); }
  });
  $('preview-mode').addEventListener('change', () => { const cue = previewCue(); if (cue && $('preview-mode').value === 'loop') seek(cue.start); else updateTime(); renderRangeEditor(); });
  $('seek').addEventListener('input', () => seek(Number($('seek').value)));
  $('play').addEventListener('click', play); $('start').addEventListener('click', markStart); $('end').addEventListener('click', () => markEnd(false)); $('next').addEventListener('click', quick);
  $('export').addEventListener('click', exportSrt);
  document.addEventListener('keydown', event => {
    if (!document.getElementById('panel-subtitles').classList.contains('active')) return;
    if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (event.target.closest('button') && key === ' ') return;
    const actions = { ' ': play, arrowleft: () => seek($('video').currentTime - 1), arrowright: () => seek($('video').currentTime + 1), s: markStart, d: () => markEnd(false), enter: quick };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  });
  document.querySelectorAll('.tab-btn').forEach(tab => tab.addEventListener('click', () => { if (tab.dataset.tab !== 'subtitles') $('video').pause(); }));
  document.addEventListener('localechange', () => { const empty = $('file').querySelector('option[value=""]'); if (empty) empty.textContent = t('speech.selectFile'); render(); });
  render();
}
export function onFilesChangedForSubtitles(next) {
  files = next.filter(entry => entry.meta?.isVideo); $('file').replaceChildren(new Option(t('speech.selectFile'), ''));
  files.forEach(entry => $('file').add(new Option(entry.file.name, entry.id)));
  if (!files.some(entry => entry.file === file)) loadFile(files[0]?.file || null);
  $('file').value = files.find(entry => entry.file === file)?.id || '';
}
function loadFile(next) {
  if (next === file) return;
  $('video').pause(); $('video').removeAttribute('src'); $('video').load(); if (url) URL.revokeObjectURL(url);
  previewId = null; editorWindow = null;
  file = next; duration = 0; url = null; $('seek').value = 0; $('seek').max = 0;
  cues.forEach(cue => { cue.start = cue.end = null; }); activeId = cues[0]?.id || null;
  if (file) { url = URL.createObjectURL(file); $('video').src = url; } render();
}
function importText(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return warn('emptyText');
  if (cues.length && !confirm(t('subtitles.replaceText'))) return;
  previewId = null; editorWindow = null;
  cues = lines.map(text => ({ id: crypto.randomUUID(), text, start: null, end: null })); activeId = cues[0].id; render();
}
function seek(time) { if (duration) { $('video').currentTime = Math.max(0, Math.min(duration, time)); updateTime(); } }
function play() { if (!file || !duration) return; if ($('video').paused) $('video').play().catch(() => warn('previewError')); else $('video').pause(); }
function markStart() {
  const cue = activeCue(); if (!cue || !duration) return warn('needCue');
  previewId = null; editorWindow = null;
  cue.start = $('video').currentTime; if (cue.end !== null && cue.end <= cue.start) cue.end = null;
  render(); showToast(t('speech.startMarked', { time: formatTime(cue.start) }), 'success', 1400);
}
function markEnd(chain) {
  const cue = activeCue(); if (!cue || !duration) return warn('needCue');
  const end = $('video').currentTime; if (cue.start === null || end <= cue.start) return warn('invalid');
  previewId = null; editorWindow = null;
  cue.end = end; const next = cues[cues.indexOf(cue) + 1]; activeId = next?.id || null;
  if (chain && next) { next.start = end; next.end = null; }
  render(); showToast(t('subtitles.added'), 'success', 1400);
}
function quick() { const cue = activeCue(); if (!cue) return warn('needCue'); if (cue.start === null) markStart(); else markEnd(true); }
function updateCurrentCueText() {
  const cue = activeCue();
  $('current').textContent = cue ? t('subtitles.current', { n: cues.indexOf(cue) + 1, text: cue.text }) : t('subtitles.noneAtTime');
}
function syncContinuousCue(current) {
  if (rangeEditing || $('preview-mode').value !== 'continuous') return;
  const match = cues.filter(complete).sort((a, b) => a.start - b.start).find(cue => current >= cue.start && current < cue.end) || null;
  const nextId = match?.id || null;
  if (nextId === activeId) return;
  activeId = nextId; previewId = nextId; editorWindow = null;
  document.querySelectorAll('#subtitles-list .subtitle-row').forEach((row, index) => row.classList.toggle('selected', cues[index]?.id === nextId));
  updateCurrentCueText(); renderRangeEditor();
}
function updateTime() {
  let current = $('video').currentTime || 0;
  syncContinuousCue(current);
  const cue = previewCue();
  if (cue && complete(cue) && $('preview-mode').value === 'loop' && !$('video').paused && (current >= cue.end || current < cue.start)) {
    $('video').currentTime = cue.start; current = cue.start;
  }
  $('time').textContent = `${formatTime(current)} / ${formatTime(duration)}`; $('seek').value = current;
  const loopSeek = $('range-editor').querySelector('.compact-loop-seek input');
  if (loopSeek && !rangeEditing) loopSeek.value = Math.max(Number(loopSeek.min), Math.min(Number(loopSeek.max), current));
}
function selectCue(cue) {
  activeId = cue.id; previewId = complete(cue) ? cue.id : null; editorWindow = null;
  if (cue.start !== null) seek(cue.start); render();
  if (cue.start !== null) $('video').play().catch(() => warn('previewError'));
  $('preview').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function orderedTimedCues() { return cues.filter(cue => cue.start !== null).sort((a, b) => a.start - b.start); }
function moveCue(offset) {
  const ordered = orderedTimedCues(), index = ordered.findIndex(cue => cue.id === activeId), next = ordered[index + offset];
  if (next) selectCue(next);
}
function deleteCue(cue) {
  const position = cues.indexOf(cue), next = cues[position + 1] || null;
  cues = cues.filter(item => item.id !== cue.id);
  if (previewId === cue.id) previewId = null;
  if (activeId === cue.id) activeId = cues[position]?.id || cues[position - 1]?.id || null;
  editorWindow = null; render();
  if (next) selectCue(next);
}
function renderRangeEditor() {
  const container = $('range-editor'), cue = activeCue();
  container.replaceChildren(); container.classList.toggle('hidden', !cue || !complete(cue) || !duration);
  if (!cue || !complete(cue) || !duration) return;
  if (!editorWindow) editorWindow = { start: Math.max(0, cue.start - 10), end: Math.min(duration, cue.end + 10) };
  const text = document.createElement('textarea'); text.rows = 2; text.value = cue.text; text.setAttribute('aria-label', t('subtitles.text')); text.className = 'compact-cue-text';
  text.addEventListener('input', () => {
    cue.text = text.value; updateCurrentCueText();
    const index = cues.indexOf(cue), rowText = document.querySelectorAll('#subtitles-list .subtitle-row textarea')[index]; if (rowText) rowText.value = cue.text;
    $('export').disabled = !cues.some(item => complete(item) && item.text.trim());
  }); container.append(text);
  const range = document.createElement('div'); container.append(range);
  let syncLoopSeek = () => {};
  mountRangeControl(range, cue, editorWindow, (bound, value) => {
    cue[bound] = value; if ($('video').paused) seek(value); syncCueVisual(cue); syncLoopSeek();
  }, active => { rangeEditing = active; });
  if ($('preview-mode').value === 'loop') {
    const loop = document.createElement('label'); loop.className = 'compact-loop-seek';
    const title = document.createElement('span'); title.textContent = t('speech.loopPosition');
    const input = document.createElement('input'); input.type = 'range'; input.step = '0.001';
    syncLoopSeek = (time = $('video').currentTime) => {
      input.min = cue.start; input.max = cue.end;
      input.value = Math.max(cue.start, Math.min(cue.end, time));
    };
    input.addEventListener('input', () => seek(Number(input.value)));
    loop.append(title, input); container.append(loop); syncLoopSeek();
  }
  const ordered = orderedTimedCues(), index = ordered.findIndex(item => item.id === cue.id), actions = document.createElement('div'); actions.className = 'compact-range-actions';
  const previous = button(t('subtitles.previous'), () => moveCue(-1)); previous.disabled = index <= 0;
  const next = button(t('subtitles.next'), () => moveCue(1)); next.disabled = index >= ordered.length - 1;
  actions.append(previous, next, button(t('subtitles.deleteCurrent'), () => deleteCue(cue)),
    button(t('speech.zoomRange'), () => { editorWindow = null; renderRangeEditor(); }),
    button(t('speech.fullRange'), () => { editorWindow = { start: 0, end: duration }; renderRangeEditor(); }));
  container.append(actions);
}
function syncCueVisual(cue) {
  const row = document.querySelector(`#subtitles-list .subtitle-row[data-id="${cue.id}"]`);
  row?.querySelectorAll('input[data-bound]').forEach(input => { input.value = cue[input.dataset.bound] === null ? '' : formatTime(cue[input.dataset.bound]); });
  $('export').disabled = !cues.some(item => complete(item) && item.text.trim());
}
function render(updateEditor = true) {
  $('list').replaceChildren();
  const cue = activeCue(); updateCurrentCueText();
  $('export').disabled = !cues.some(cue => complete(cue) && cue.text.trim());
  cues.forEach((cue, index) => {
    const row = document.createElement('div'); row.dataset.id = cue.id; row.className = `subtitle-row${cue.id === activeId ? ' selected' : ''}`;
    row.append(button(String(index + 1), () => selectCue(cue)));
    ['start', 'end'].forEach(bound => {
      const label = document.createElement('label'); label.textContent = t(`speech.${bound}Time`);
      const input = document.createElement('input'); input.type = 'text'; input.dataset.bound = bound; input.placeholder = '0:00.000'; input.value = cue[bound] === null ? '' : formatTime(cue[bound]);
      input.addEventListener('change', () => {
        const value = input.value.trim() === '' ? null : parseTime(input.value);
        const start = bound === 'start' ? value : cue.start, end = bound === 'end' ? value : cue.end;
        if ((value !== null && (!Number.isFinite(value) || value < 0 || (duration && value > duration))) || (start !== null && end !== null && end <= start)) { warn('invalid'); input.value = cue[bound] === null ? '' : formatTime(cue[bound]); return; }
        cue[bound] = value; editorWindow = null; render();
      }); label.append(input); row.append(label);
    });
    const text = document.createElement('textarea'); text.rows = 2; text.value = cue.text; text.setAttribute('aria-label', t('subtitles.text'));
    text.addEventListener('input', () => { cue.text = text.value; $('export').disabled = !cues.some(cue => complete(cue) && cue.text.trim()); if (cue.id === activeId) $('current').textContent = t('subtitles.current', { n: index + 1, text: cue.text }); }); row.append(text);
    row.append(button(t('speech.delete'), () => deleteCue(cue)));
    row.addEventListener('click', event => { if (!event.target.closest('input, textarea, select, button, label')) selectCue(cue); });
    $('list').append(row);
  });
  if (!previewCue() || !complete(previewCue())) previewId = null;
  if (updateEditor) renderRangeEditor();
  updateTime();
}
function exportSrt() {
  const ready = cues.filter(cue => complete(cue) && cue.text.trim() && Math.round(cue.end * 1000) > Math.round(cue.start * 1000)).sort((a, b) => a.start - b.start);
  if (!ready.length) return warn('invalid');
  const srt = ready.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text.trim().replace(/\r\n?/g, '\n').replace(/\n\s*\n/g, '\n')}`).join('\n\n') + '\n\n';
  triggerDownload(new Blob([srt], { type: 'application/x-subrip;charset=utf-8' }), `${file?.name.replace(/\.[^.]+$/, '') || 'subtitles'}.srt`);
}

