import { mountRangeControl } from '../modules/rangeControl.js';
import { formatTime, parseTime } from '../modules/time.js';
// Independent manual annotation workspace; shared media engine and job downloads.
import { t } from '../i18n/index.js';
import { formatDuration } from '../modules/fileList.js';
import { executeSplit } from '../modules/engine.js';
import { OUTPUT_FORMATS, mbMerge, canHandleInput } from '../modules/mediabunnyEngine.js';
import { addJob } from '../modules/jobQueue.js';
import { showToast } from '../modules/toast.js';
import { createZip } from '../modules/zip.js';

const labels = ['happy', 'angry', 'sad', 'afraid', 'disgusted', 'melancholic', 'surprised', 'calm'];
const folders = ['快樂', '生氣', '傷心', '害怕', '厭惡', '憂鬱', '驚訝', '冷靜'];
const $ = id => document.getElementById(`speech-${id}`);
let files = [], file = null, url = null, duration = 0;
let speakers = [{ id: crypto.randomUUID(), name: 'speaker1' }];
let activeSpeaker = speakers[0].id, activeLabel = 'calm', segmentStart = null;
let segments = [];
const checkedSegments = new Set();
let selectedSegmentId = null, editorWindow = null, rangeEditing = false;
const customLabels = new Map();
const labelName = label => customLabels.get(label) || t(`speech.label.${label}`);
const selectedSegment = () => segments.find(seg => seg.id === selectedSegmentId);
const notify = (key, params = {}) => showToast(t(`speech.${key}`, params), 'success', 1800);
const id = () => crypto.randomUUID();
const message = key => showToast(t(`speech.${key}`), 'warn');
function option(select, text, value) { select.add(new Option(text, value)); }
function valid(start, end) { return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration; }
function button(text, action) {
  const node = document.createElement('button'); node.type = 'button'; node.className = 'btn btn-ghost btn-sm';
  node.textContent = text; node.addEventListener('click', action); return node;
}

export function initSpeech() {
  OUTPUT_FORMATS.forEach(fmt => option($('format'), fmt.toUpperCase(), fmt));
  $('file').addEventListener('change', () => {
    const next = files.find(entry => String(entry.id) === $('file').value)?.file || null;
    if (segments.length && next !== file && !confirm(t('speech.replace'))) {
      $('file').value = files.find(entry => entry.file === file)?.id || ''; return;
    }
    loadFile(next);
  });
  $('speaker').addEventListener('change', () => { activeSpeaker = $('speaker').value; renderSpeakers(); });
  $('add').addEventListener('click', () => {
    const entered = $('name').value.trim();
    let number = speakers.length + 1;
    while (speakers.some(s => s.name === `speaker${number}`)) number++;
    const currentName = speakers.find(s => s.id === activeSpeaker)?.name;
    const name = !entered || entered === currentName ? `speaker${number}` : entered;
    if (speakers.some(s => s.name === name)) return message('duplicate');
    const speaker = { id: id(), name }; speakers.push(speaker); activeSpeaker = speaker.id; renderSpeakers(); renderSegments();
  });
  $('rename').addEventListener('click', () => {
    const name = $('name').value.trim();
    if (!name || !activeSpeaker) return;
    if (speakers.some(s => s.id !== activeSpeaker && s.name === name)) return message('duplicate');
    speakers.find(s => s.id === activeSpeaker).name = name; renderSpeakers(); renderSegments();
  });
  $('delete').addEventListener('click', () => {
    if (!activeSpeaker) return;
    if (segments.some(s => s.speakerId === activeSpeaker) && !confirm(t('speech.deleteConfirm'))) return;
    segments = segments.filter(s => s.speakerId !== activeSpeaker);
    speakers = speakers.filter(s => s.id !== activeSpeaker); activeSpeaker = speakers[0]?.id || null;
    renderSpeakers(); renderSegments();
  });
  $('video').addEventListener('loadedmetadata', () => {
    duration = Number.isFinite($('video').duration) ? $('video').duration : 0;
    $('seek').max = duration; renderSegments(); updateTime();
  });
  $('video').addEventListener('error', () => { duration = 0; renderSegments(); message('previewError'); });
  $('video').addEventListener('timeupdate', updateTime);
  let playbackFrame = null;
  const tick = () => { updateTime(); playbackFrame = requestAnimationFrame(tick); };
  $('video').addEventListener('play', () => { if (playbackFrame === null) tick(); });
  $('video').addEventListener('pause', () => { cancelAnimationFrame(playbackFrame); playbackFrame = null; });
  $('seek').addEventListener('input', () => seek(Number($('seek').value)));
  $('play').addEventListener('click', play);
  $('start').addEventListener('click', markStart);
  $('end').addEventListener('click', markEnd);
  $('export').addEventListener('click', exportSegments);
  $('select-all').addEventListener('click', () => { segments.forEach(seg => checkedSegments.add(seg.id)); renderSegments(); });
  $('select-none').addEventListener('click', () => { checkedSegments.clear(); renderSegments(); });
  $('delete-selected').addEventListener('click', () => deleteSegments(checkedSegments));
  $('label-add').addEventListener('click', () => {
    const name = $('label-name').value.trim();
    if (!name) return;
    if (labels.some(label => labelName(label).toLocaleLowerCase() === name.toLocaleLowerCase())) return message('duplicateLabel');
    const label = `custom-${id()}`;
    labels.push(label); customLabels.set(label, name); activeLabel = label;
    $('label-name').value = ''; renderLabels(); renderSegments();
  });
  $('preview-mode').addEventListener('change', () => {
    const seg = selectedSegment();
    if (seg && $('preview-mode').value === 'loop') seek(seg.start);
    else updateTime();
    renderRangeEditor();
  });
  $('video').addEventListener('ended', () => {
    const seg = selectedSegment();
    if (seg && $('preview-mode').value === 'loop') { seek(seg.start); $('video').play().catch(() => message('previewError')); }
  });
  document.addEventListener('keydown', event => {
    if (!$('video') || !document.getElementById('panel-speech').classList.contains('active')) return;
    if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === ' ' && event.target.closest('button')) return;
    const actions = { ' ': play, arrowleft: () => seek($('video').currentTime - 1), arrowright: () => seek($('video').currentTime + 1), s: markStart, d: markEnd, a: cycleSpeaker, z: cycleLabel };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  });
  document.addEventListener('localechange', () => {
    const placeholder = $('file').querySelector('option[value=""]');
    if (placeholder) placeholder.textContent = t('speech.selectFile');
    $('name').setAttribute('aria-label', t('speech.speaker'));
    $('seek').setAttribute('aria-label', t('speech.source'));
    renderLabels(); renderSegments(); updateTime();
  });
  document.querySelectorAll('.tab-btn').forEach(tab => tab.addEventListener('click', () => { if (tab.dataset.tab !== 'speech') $('video').pause(); }));
  $('name').setAttribute('aria-label', t('speech.speaker'));
  renderSpeakers(); renderLabels(); renderSegments();
}

export function onFilesChangedForSpeech(nextFiles) {
  files = nextFiles.filter(entry => entry.meta?.isVideo);
  $('file').replaceChildren(); option($('file'), t('speech.selectFile'), '');
  files.forEach(entry => option($('file'), entry.file.name, entry.id));
  if (file && files.some(entry => entry.file === file)) $('file').value = files.find(entry => entry.file === file).id;
  else loadFile(files[0]?.file || null);
  if (file) $('file').value = files.find(entry => entry.file === file)?.id || '';
}
function loadFile(next) {
  if (file === next) return;
  $('video').pause(); $('video').removeAttribute('src'); $('video').load();
  if (url) URL.revokeObjectURL(url);
  file = next; duration = 0; segments = []; segmentStart = null; url = null; selectedSegmentId = null; editorWindow = null;
  $('seek').max = 0; $('seek').value = 0;
  if (file) { url = URL.createObjectURL(file); $('video').src = url; }
  renderSegments(); updateTime();
}
function renderSpeakers() {
  $('speaker').replaceChildren(); speakers.forEach(s => option($('speaker'), s.name, s.id));
  $('speaker').value = activeSpeaker || '';
  $('name').value = speakers.find(s => s.id === activeSpeaker)?.name || '';
  $('rename').disabled = $('delete').disabled = !activeSpeaker;
}
function renderLabels() {
  $('labels').replaceChildren();
  labels.forEach(label => {
    const chip = button(labelName(label), () => { activeLabel = label; renderLabels(); });
    chip.classList.toggle('selected', label === activeLabel); chip.setAttribute('aria-pressed', String(label === activeLabel)); $('labels').append(chip);
  });
}
function cycleSpeaker() {
  if (!speakers.length) return message('needSource');
  const index = speakers.findIndex(speaker => speaker.id === activeSpeaker);
  activeSpeaker = speakers[(index + 1) % speakers.length].id; renderSpeakers();
  notify('speakerSwitched', { name: speakers.find(speaker => speaker.id === activeSpeaker).name });
}
function cycleLabel() {
  activeLabel = labels[(labels.indexOf(activeLabel) + 1) % labels.length]; renderLabels();
  notify('labelSwitched', { name: labelName(activeLabel) });
}
function selectSegment(seg) {
  selectedSegmentId = seg.id; editorWindow = null;
  seek(seg.start); renderSegments();
  $('video').play().catch(() => message('previewError'));
  $('preview').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function changeRange(seg, bound, value) {
  if (!valid(bound === 'start' ? value : seg.start, bound === 'end' ? value : seg.end)) { message('invalid'); return false; }
  seg[bound] = value;
  if (seg.id === selectedSegmentId && $('preview-mode').value === 'loop') {
    const current = $('video').currentTime;
    if (current < seg.start || current >= seg.end) $('video').currentTime = seg.start;
  }
  return true;
}
function orderedSegments() { return [...segments].sort((a, b) => a.start - b.start); }
function moveSegment(offset) {
  const ordered = orderedSegments(), index = ordered.findIndex(seg => seg.id === selectedSegmentId), next = ordered[index + offset];
  if (next) selectSegment(next);
}
function deleteCurrentSegment(seg) {
  const ordered = orderedSegments(), index = ordered.findIndex(item => item.id === seg.id), next = ordered[index + 1] || null;
  selectedSegmentId = null;
  deleteSegments(new Set([seg.id]));
  if (next) selectSegment(next);
}
function renderRangeEditor() {
  const container = $('range-editor'), seg = selectedSegment();
  container.replaceChildren(); container.classList.toggle('hidden', !seg);
  if (!seg || !duration) return;
  if (!editorWindow) editorWindow = { start: Math.max(0, seg.start - 10), end: Math.min(duration, seg.end + 10) };
  const meta = document.createElement('div'); meta.className = 'compact-segment-meta';
  const speaker = document.createElement('select'); speaker.setAttribute('aria-label', t('speech.speaker'));
  speakers.forEach(item => option(speaker, item.name, item.id)); speaker.value = seg.speakerId;
  speaker.addEventListener('change', () => { seg.speakerId = speaker.value; renderSegments(); });
  const label = document.createElement('select'); label.setAttribute('aria-label', t('speech.emotion'));
  labels.forEach(item => option(label, labelName(item), item)); label.value = seg.label;
  label.addEventListener('change', () => { seg.label = label.value; renderSegments(); }); meta.append(speaker, label); container.append(meta);
  const range = document.createElement('div'); container.append(range);
  let syncLoopSeek = () => {};
  mountRangeControl(range, seg, editorWindow, (bound, value) => {
    if (changeRange(seg, bound, value)) { if ($('video').paused) seek(value); syncSegmentVisual(seg); syncLoopSeek(); }
  }, active => { rangeEditing = active; });
  if ($('preview-mode').value === 'loop') {
    const loop = document.createElement('label'); loop.className = 'compact-loop-seek';
    const title = document.createElement('span'); title.textContent = t('speech.loopPosition');
    const input = document.createElement('input'); input.type = 'range'; input.step = '0.001';
    syncLoopSeek = (time = $('video').currentTime) => {
      input.min = seg.start; input.max = seg.end;
      input.value = Math.max(seg.start, Math.min(seg.end, time));
    };
    input.addEventListener('input', () => seek(Number(input.value)));
    loop.append(title, input); container.append(loop); syncLoopSeek();
  }
  const ordered = orderedSegments(), index = ordered.findIndex(item => item.id === seg.id);
  const toolbar = document.createElement('div'); toolbar.className = 'compact-range-actions';
  const previous = button(t('speech.previousSegment'), () => moveSegment(-1)); previous.disabled = index <= 0;
  const next = button(t('speech.nextSegment'), () => moveSegment(1)); next.disabled = index >= ordered.length - 1;
  toolbar.append(previous, next, button(t('speech.deleteCurrent'), () => deleteCurrentSegment(seg)),
    button(t('speech.zoomRange'), () => { editorWindow = null; renderRangeEditor(); }),
    button(t('speech.fullRange'), () => { editorWindow = { start: 0, end: duration }; renderRangeEditor(); }));
  container.append(toolbar);
}
function syncSegmentVisual(seg) {
  const row = document.querySelector(`#speech-segments .speech-row[data-id="${seg.id}"]`);
  row?.querySelectorAll('input[data-bound]').forEach(input => { input.value = formatTime(seg[input.dataset.bound]); });
  const ordered = orderedSegments(), marker = document.querySelectorAll('#speech-timeline .speech-marker')[ordered.findIndex(item => item.id === seg.id)];
  if (marker) { marker.style.left = `${seg.start / duration * 100}%`; marker.style.width = `${(seg.end - seg.start) / duration * 100}%`; }
}
function syncContinuousSegment(current) {
  if (rangeEditing || $('preview-mode').value !== 'continuous') return;
  const match = orderedSegments().find(seg => current >= seg.start && current < seg.end) || null;
  const nextId = match?.id || null;
  if (nextId === selectedSegmentId) return;
  selectedSegmentId = nextId; editorWindow = null;
  document.querySelectorAll('#speech-segments .speech-row').forEach(row => row.classList.toggle('selected', row.dataset.id === nextId));
  renderRangeEditor();
}

function seek(time) { if (duration) { $('video').currentTime = Math.max(0, Math.min(duration, time)); updateTime(); } }
function play() {
  if (!file || !duration) return;
  if ($('video').paused) $('video').play().catch(() => message('previewError')); else $('video').pause();
}
function markStart() {
  if (!file || !duration || !activeSpeaker) return message('needSource');
  selectedSegmentId = null; editorWindow = null;
  segmentStart = $('video').currentTime; renderSegments(); updateTime();
  notify('startMarked', { time: formatTime(segmentStart) });
}
function markEnd() {
  if (segmentStart === null) return message('needStart');
  const end = $('video').currentTime;
  if (!activeSpeaker || !valid(segmentStart, end)) return message('invalid');
  segments.push(createSegment(segmentStart, end, activeSpeaker, activeLabel));
  segmentStart = null; renderSegments(); updateTime();
  notify('endMarked', { time: formatTime(end) });
}
function updateTime() {
  let current = $('video').currentTime || 0;
  syncContinuousSegment(current);
  const selected = selectedSegment();
  if (selected && $('preview-mode').value === 'loop' && !$('video').paused && (current >= selected.end || current < selected.start)) {
    $('video').currentTime = selected.start; current = selected.start;
  }
  $('time').textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
  $('seek').value = current;
  const loopSeek = $('range-editor').querySelector('.compact-loop-seek input');
  if (loopSeek && !rangeEditing) loopSeek.value = Math.max(Number(loopSeek.min), Math.min(Number(loopSeek.max), current));
  $('pending').textContent = segmentStart === null ? '' : `${t('speech.pending')} ${formatTime(segmentStart)} · ${t('speech.elapsed', { seconds: Math.max(0, current - segmentStart).toFixed(3) })}`;
  document.querySelectorAll('#speech-segments .speech-row').forEach(row => {
    const seg = segments.find(s => s.id === row.dataset.id);
    row.classList.toggle('playing', seg && current >= seg.start && current < seg.end);
  });
}
function renderSegments(updateEditor = true) {
  $('segments').replaceChildren(); $('timeline').replaceChildren();
  const existing = new Set(segments.map(seg => seg.id));
  checkedSegments.forEach(key => { if (!existing.has(key)) checkedSegments.delete(key); });
  $('delete-selected').disabled = !checkedSegments.size;
  $('selected-count').textContent = t('speech.selectedCount', { n: checkedSegments.size });
  document.dispatchEvent(new Event('speechcontextchange'));
  $('export').disabled = !file || !segments.length || !duration;
  if (!segments.length) { const p = document.createElement('p'); p.textContent = t('speech.empty'); $('segments').append(p); }
  [...segments].sort((a, b) => a.start - b.start).forEach((seg, index) => {
    const row = document.createElement('div'); row.className = 'speech-row'; row.dataset.id = seg.id; row.classList.toggle('selected', seg.id === selectedSegmentId);
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'speech-checkbox';
    checkbox.checked = checkedSegments.has(seg.id); checkbox.setAttribute('aria-label', t('speech.selectSegment', { n: index + 1 }));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) checkedSegments.add(seg.id); else checkedSegments.delete(seg.id);
      $('delete-selected').disabled = !checkedSegments.size;
      $('selected-count').textContent = t('speech.selectedCount', { n: checkedSegments.size });
    }); row.append(checkbox);
    row.append(button(`${index + 1} · ${formatDuration(seg.start)} → ${formatDuration(seg.end)}`, () => selectSegment(seg)));
    const speaker = document.createElement('select'); speaker.setAttribute('aria-label', t('speech.speaker'));
    speakers.forEach(s => option(speaker, s.name, s.id)); speaker.value = seg.speakerId;
    speaker.addEventListener('change', () => { seg.speakerId = speaker.value; }); row.append(speaker);
    const label = document.createElement('select'); label.setAttribute('aria-label', t('speech.emotion'));
    labels.forEach(l => option(label, labelName(l), l)); label.value = seg.label;
    label.addEventListener('change', () => { seg.label = label.value; }); row.append(label);
    ['start', 'end'].forEach(bound => {
      const wrap = document.createElement('label'); wrap.textContent = t(`speech.${bound}Time`);
      const input = document.createElement('input'); input.type = 'text'; input.value = formatTime(seg[bound]); input.placeholder = '0:00.000'; input.dataset.bound = bound;
      input.addEventListener('change', () => {
        if (!changeRange(seg, bound, parseTime(input.value))) { input.value = formatTime(seg[bound]); return; }
        if (seg.id === selectedSegmentId) editorWindow = null;
        renderSegments();
      }); wrap.append(input); row.append(wrap);
    });
    row.append(button(t('speech.delete'), () => deleteSegments(new Set([seg.id]))));
    row.addEventListener('click', event => { if (!event.target.closest('input, select, button, label')) selectSegment(seg); });
    $('segments').append(row);
    if (duration) {
      const marker = button(`${index + 1}`, () => selectSegment(seg)); marker.className = 'speech-marker';
      marker.style.left = `${seg.start / duration * 100}%`; marker.style.width = `${(seg.end - seg.start) / duration * 100}%`;
      marker.title = `${speakers.find(s => s.id === seg.speakerId)?.name} / ${labelName(seg.label)}`;
      $('timeline').append(marker);
    }
  });
  if (!selectedSegment()) { selectedSegmentId = null; editorWindow = null; }
  if (updateEditor) renderRangeEditor();
  updateTime();
}
const safeName = name => name.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80) || 'speaker';
function exportSegments() {
  if (!file || !segments.length || segments.some(s => !valid(s.start, s.end))) return message('invalid');
  const source = file, format = $('format').value, mode = $('mode').value;
  if (mode === 'merge' && !canHandleInput(source.name.split('.').pop().toLowerCase())) return message('mergeUnsupported');
  // Snapshot annotations and names so queued jobs are independent of UI edits.
  const names = new Map(), used = new Set();
  speakers.forEach(s => {
    const base = safeName(s.name); let name = base, n = 2;
    while (used.has(name.toLowerCase())) name = `${base}_${n++}`;
    used.add(name.toLowerCase()); names.set(s.id, name);
  });
  const labelFolders = new Map(), usedLabels = new Set();
  labels.forEach((label, index) => {
    const base = safeName(customLabels.get(label) || folders[index]);
    let folder = base, number = 2;
    while (usedLabels.has(folder.toLowerCase())) folder = `${base}_${number++}`;
    usedLabels.add(folder.toLowerCase()); labelFolders.set(label, folder);
  });
  const groups = new Map();
  [...segments].sort((a, b) => a.start - b.start).forEach(seg => {
    const key = `${seg.speakerId}/${seg.label}`;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ ...seg });
  });
  const tasks = [];
  groups.forEach(group => {
    const first = group[0], path = `${names.get(first.speakerId)}/${labelFolders.get(first.label)}`;
    if (mode === 'merge') tasks.push({ path: `${path}/merged.${format}`, ranges: group });
    else group.forEach((seg, i) => tasks.push({ path: `${path}/${String(i + 1).padStart(3, '0')}.${format}`, ranges: [seg] }));
  });
  addJob({ type: 'speech', filename: source.name, outputFilename: `${safeName(source.name.replace(/\.[^.]+$/, ''))}_segments.zip`,
    execute: async opts => {
      const entries = [];
      let engine = 'mediabunny';
      for (let i = 0; i < tasks.length; i++) {
        if (opts.signal.aborted) return { canceled: true, blob: null };
        const task = tasks[i], progress = p => opts.onProgress((i + p) / (tasks.length + 1));
        const result = mode === 'merge'
          ? await mbMerge(source, task.ranges, format, { ...opts, onProgress: progress })
          : await executeSplit(source, task.ranges[0].start, task.ranges[0].end, { ...opts, outputFormat: format, onProgress: progress });
        if (result.canceled) return result;
        if (!result.blob) throw new Error(t('speech.noOutput'));
        engine = result.engine || engine;
        entries.push({ path: task.path, blob: result.blob });
      }
      try {
        const blob = await createZip(entries, opts.signal);
        if (opts.signal.aborted) return { canceled: true, blob: null };
        opts.onProgress(1); return { blob, canceled: false, engine };
      } catch (err) { if (opts.signal.aborted) return { canceled: true, blob: null }; throw err; }
    },
  });
}

function createSegment(start, end, speakerId, label) { return { id: id(), speakerId, label, start, end }; }
function deleteSegments(ids) { segments = segments.filter(seg => !ids.has(seg.id)); renderSegments(); }
// Optional producers only receive a snapshot and append ordinary editable segments.
export function getSpeechContext() { return { file, duration, speakerId: activeSpeaker, label: activeLabel }; }
export function appendSpeechRanges(context, ranges) {
  if (context.file !== file || !speakers.some(s => s.id === context.speakerId) || !labels.includes(context.label)) return false;
  segments.push(...ranges.filter(range => valid(range.start, range.end)).map(range => createSegment(range.start, range.end, context.speakerId, context.label)));
  renderSegments(); return true;
}
