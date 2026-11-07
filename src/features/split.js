// features/split.js — 分割功能
import { t } from '../i18n/index.js';
import { state, formatDuration } from '../modules/fileList.js';
import { addJob } from '../modules/jobQueue.js';
import { executeSplit } from '../modules/engine.js';
import { OUTPUT_FORMATS } from '../modules/mediabunnyEngine.js';
import { showToast } from '../modules/toast.js';

let splitFile = null;
let videoDuration = 0;
let segments = []; // { id, start, end }
let activeSegIdx = 0;
let nextSegId = 1;
let isDragging = null; // 'start' | 'end' | null

export function initSplit() {
  document.getElementById('split-start-btn')?.addEventListener('click', startSplit);
  document.getElementById('add-segment-btn')?.addEventListener('click', addSegment);
  const select = document.getElementById('split-output-format');
  OUTPUT_FORMATS.forEach(fmt => select.add(new Option(fmt.toUpperCase(), fmt)));
  initTimelineHandles();
}

/** Called when files change — load first video file for split preview */
export function onFilesChangedForSplit(files) {
  const videoFile = files.find(f => f.meta?.isVideo);
  if (videoFile && videoFile.file !== splitFile) {
    loadVideoForSplit(videoFile);
  } else if (!videoFile) {
    resetSplit();
  }
  updateSplitButton();
}

function loadVideoForSplit(entry) {
  splitFile = entry.file;
  const video = document.getElementById('split-video');
  const placeholder = document.getElementById('split-preview-placeholder');
  const timelineWrap = document.getElementById('timeline-wrap');
  const addBtn = document.getElementById('add-segment-btn');

  if (!video) return;

  // Show video, hide placeholder
  if (placeholder) placeholder.classList.add('hidden');
  video.classList.remove('hidden');
  if (timelineWrap) timelineWrap.classList.remove('hidden');
  if (addBtn) addBtn.classList.remove('hidden');

  const url = URL.createObjectURL(splitFile);
  video.src = url;

  video.addEventListener('loadedmetadata', () => {
    videoDuration = video.duration;
    document.getElementById('tl-duration').textContent = formatDuration(videoDuration);

    // Initialize with one full segment
    segments = [{ id: nextSegId++, start: 0, end: videoDuration }];
    activeSegIdx = 0;
    renderSegments();
    renderTimelineSegments();
    updateHandles();
    updateSplitButton();
  }, { once: true });

  // Update current time display
  video.addEventListener('timeupdate', () => {
    const ct = video.currentTime;
    document.getElementById('tl-current-time').textContent = formatDuration(ct);
    const played = document.getElementById('timeline-played');
    if (played && videoDuration > 0) {
      played.style.width = `${(ct / videoDuration) * 100}%`;
    }
  });
}

function resetSplit() {
  splitFile = null;
  videoDuration = 0;
  segments = [];
  const video = document.getElementById('split-video');
  const placeholder = document.getElementById('split-preview-placeholder');
  const timelineWrap = document.getElementById('timeline-wrap');
  const addBtn = document.getElementById('add-segment-btn');

  if (video) { video.classList.add('hidden'); video.src = ''; }
  if (placeholder) placeholder.classList.remove('hidden');
  if (timelineWrap) timelineWrap.classList.add('hidden');
  if (addBtn) addBtn.classList.add('hidden');
  document.getElementById('split-segments').innerHTML = '';
}

function addSegment() {
  if (videoDuration <= 0) return;
  const lastEnd = segments.length > 0 ? segments[segments.length - 1].end : 0;
  if (lastEnd >= videoDuration) {
    // Split current active segment in half
    const seg = segments[activeSegIdx];
    if (!seg) return;
    const mid = (seg.start + seg.end) / 2;
    const newSeg = { id: nextSegId++, start: mid, end: seg.end };
    seg.end = mid;
    segments.splice(activeSegIdx + 1, 0, newSeg);
  } else {
    segments.push({ id: nextSegId++, start: lastEnd, end: videoDuration });
  }
  activeSegIdx = segments.length - 1;
  renderSegments();
  renderTimelineSegments();
  updateHandles();
  updateSplitButton();
}

function removeSegment(idx) {
  if (segments.length <= 1) return;
  segments.splice(idx, 1);
  if (activeSegIdx >= segments.length) activeSegIdx = segments.length - 1;
  renderSegments();
  renderTimelineSegments();
  updateHandles();
}

function selectSegment(idx) {
  activeSegIdx = idx;
  renderSegments();
  renderTimelineSegments();
  updateHandles();

  // Seek video to segment start
  const video = document.getElementById('split-video');
  if (video && segments[idx]) {
    video.currentTime = segments[idx].start;
  }
}

function renderSegments() {
  const container = document.getElementById('split-segments');
  if (!container) return;
  container.innerHTML = '';

  segments.forEach((seg, idx) => {
    const row = document.createElement('div');
    row.className = `segment-row${idx === activeSegIdx ? ' active' : ''}`;
    row.addEventListener('click', () => selectSegment(idx));

    row.innerHTML = `
      <span class="segment-label">${t('split.segment')} ${idx + 1}</span>
      <div class="segment-time-inputs">
        <input type="text" class="segment-time-input" value="${formatTimeInput(seg.start)}" data-idx="${idx}" data-field="start" />
        <span class="seg-sep">→</span>
        <input type="text" class="segment-time-input" value="${formatTimeInput(seg.end)}" data-idx="${idx}" data-field="end" />
      </div>
      ${segments.length > 1 ? `<button class="file-card-icon-btn danger segment-remove" data-idx="${idx}" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>` : ''}
    `;

    // Time input events
    row.querySelectorAll('.segment-time-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const i = parseInt(e.target.dataset.idx);
        const field = e.target.dataset.field;
        const val = parseTimeInput(e.target.value);
        if (!isNaN(val) && val >= 0 && val <= videoDuration) {
          segments[i][field] = val;
          renderTimelineSegments();
          updateHandles();
        }
      });
      // Stop click propagation so row click doesn't fire
      input.addEventListener('click', e => e.stopPropagation());
    });

    // Remove button
    const rmBtn = row.querySelector('.segment-remove');
    if (rmBtn) {
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeSegment(parseInt(e.currentTarget.dataset.idx));
      });
    }

    container.appendChild(row);
  });
}

function renderTimelineSegments() {
  const container = document.getElementById('timeline-segments');
  if (!container || videoDuration <= 0) return;
  container.innerHTML = '';

  segments.forEach((seg, idx) => {
    const block = document.createElement('div');
    block.className = `timeline-seg-block${idx === activeSegIdx ? ' active' : ''}`;
    block.style.left = `${(seg.start / videoDuration) * 100}%`;
    block.style.width = `${((seg.end - seg.start) / videoDuration) * 100}%`;
    block.addEventListener('click', (e) => {
      e.stopPropagation();
      selectSegment(idx);
    });
    container.appendChild(block);
  });
}

function updateHandles() {
  const seg = segments[activeSegIdx];
  if (!seg || videoDuration <= 0) return;

  const startHandle = document.getElementById('start-handle');
  const endHandle = document.getElementById('end-handle');

  if (startHandle) startHandle.style.left = `calc(${(seg.start / videoDuration) * 100}% - 7px)`;
  if (endHandle) endHandle.style.left = `calc(${(seg.end / videoDuration) * 100}% - 7px)`;
}

function initTimelineHandles() {
  const bar = document.getElementById('timeline-bar');
  const startHandle = document.getElementById('start-handle');
  const endHandle = document.getElementById('end-handle');

  if (!bar) return;

  const onDrag = (e) => {
    if (!isDragging || videoDuration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let ratio = (clientX - rect.left) / rect.width;
    ratio = Math.max(0, Math.min(1, ratio));
    const time = ratio * videoDuration;

    const seg = segments[activeSegIdx];
    if (!seg) return;

    if (isDragging === 'start') {
      seg.start = Math.min(time, seg.end - 0.1);
    } else {
      seg.end = Math.max(time, seg.start + 0.1);
    }

    updateHandles();
    renderTimelineSegments();
    renderSegments();

    // Seek video
    const video = document.getElementById('split-video');
    if (video) video.currentTime = isDragging === 'start' ? seg.start : seg.end;
  };

  const stopDrag = () => {
    isDragging = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('touchend', stopDrag);
  };

  const startDrag = (handle) => {
    isDragging = handle;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
  };

  startHandle?.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag('start'); });
  startHandle?.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag('start'); }, { passive: false });
  endHandle?.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag('end'); });
  endHandle?.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag('end'); }, { passive: false });

  // Click on timeline to seek
  bar.addEventListener('click', (e) => {
    if (isDragging) return;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const video = document.getElementById('split-video');
    if (video && videoDuration > 0) {
      video.currentTime = ratio * videoDuration;
    }
  });
}

function updateSplitButton() {
  const btn = document.getElementById('split-start-btn');
  if (btn) btn.disabled = !splitFile || segments.length === 0;
}

function startSplit() {
  if (!splitFile || segments.length === 0) return;

  const file = splitFile;
  const outputFormat = document.getElementById('split-output-format').value;
  segments.map(seg => ({ ...seg })).forEach((seg, idx) => {
    const ext = outputFormat || file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const outputFilename = `${baseName}_part_${String(idx + 1).padStart(3, '0')}.${ext}`;

    addJob({
      type: 'split',
      filename: `${splitFile.name} [${formatTimeInput(seg.start)} → ${formatTimeInput(seg.end)}]`,
      outputFilename,
      execute: async (opts) => {
        return await executeSplit(file, seg.start, seg.end, { ...opts, outputFormat });
      },
    });
  });

  showToast(t('toast.fileAdded', { n: segments.length }), 'info');
}

function formatTimeInput(seconds) {
  if (!isFinite(seconds)) return '0:00.000';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function parseTimeInput(str) {
  const parts = str.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(str) || 0;
}
