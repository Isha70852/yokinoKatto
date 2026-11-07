// features/compress.js — 壓縮功能
import { t } from '../i18n/index.js';
import { state, formatFileSize } from '../modules/fileList.js';
import { addJob } from '../modules/jobQueue.js';
import { executeCompression } from '../modules/engine.js';
import { showToast } from '../modules/toast.js';

const RESOLUTIONS = [
  { key: 'original', label: () => t('compress.preset.original'), width: null, height: null },
  { key: '1080p', label: () => '1080p', width: 1920, height: 1080 },
  { key: '720p', label: () => '720p', width: 1280, height: 720 },
  { key: '480p', label: () => '480p', width: 854, height: 480 },
  { key: '360p', label: () => '360p', width: 640, height: 360 },
  { key: 'custom', label: () => t('compress.preset.custom'), width: null, height: null },
];

const QUALITY_PRESETS = [
  { key: 'very_low', label: () => t('compress.quality.veryLow'), factor: 0.3 },
  { key: 'low', label: () => t('compress.quality.low'), factor: 0.6 },
  { key: 'medium', label: () => t('compress.quality.medium'), factor: 1.0 },
  { key: 'high', label: () => t('compress.quality.high'), factor: 2.0 },
  { key: 'very_high', label: () => t('compress.quality.veryHigh'), factor: 4.0 },
  { key: 'custom', label: () => t('compress.preset.custom'), factor: null },
];

const AUDIO_BITRATES = [
  { key: '64', label: () => '64 kbps', kbps: 64 },
  { key: '128', label: () => '128 kbps', kbps: 128 },
  { key: '192', label: () => '192 kbps', kbps: 192 },
  { key: '256', label: () => '256 kbps', kbps: 256 },
];

let selectedResolution = 'original';
let selectedQuality = 'medium';
let selectedAudioBitrate = '128';

export function initCompress() {
  renderResolutionGrid();
  renderBitrateGrid();
  renderAudioBitrateGrid();
  updateEstimate();
  updateCompressButton();

  document.getElementById('compress-start-btn')?.addEventListener('click', startCompression);
  document.getElementById('custom-width')?.addEventListener('input', updateEstimate);
  document.getElementById('custom-height')?.addEventListener('input', updateEstimate);
  document.getElementById('custom-bitrate-val')?.addEventListener('input', updateEstimate);
  document.getElementById('custom-bitrate-unit')?.addEventListener('change', updateEstimate);
}

function renderResolutionGrid() {
  const grid = document.getElementById('resolution-grid');
  if (!grid) return;
  grid.innerHTML = '';

  RESOLUTIONS.forEach(res => {
    const chip = document.createElement('div');
    chip.className = `preset-chip${res.key === selectedResolution ? ' selected' : ''}`;
    chip.textContent = res.label();
    chip.dataset.key = res.key;
    chip.addEventListener('click', () => {
      selectedResolution = res.key;
      grid.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const customEl = document.getElementById('custom-resolution');
      if (customEl) customEl.classList.toggle('hidden', res.key !== 'custom');
      updateEstimate();
    });
    grid.appendChild(chip);
  });
}

function renderBitrateGrid() {
  const grid = document.getElementById('bitrate-grid');
  if (!grid) return;
  grid.innerHTML = '';

  QUALITY_PRESETS.forEach(q => {
    const chip = document.createElement('div');
    chip.className = `preset-chip${q.key === selectedQuality ? ' selected' : ''}`;
    chip.textContent = q.label();
    chip.dataset.key = q.key;
    chip.addEventListener('click', () => {
      selectedQuality = q.key;
      grid.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const customEl = document.getElementById('custom-bitrate');
      if (customEl) customEl.classList.toggle('hidden', q.key !== 'custom');
      updateEstimate();
    });
    grid.appendChild(chip);
  });
}

function renderAudioBitrateGrid() {
  const grid = document.getElementById('audio-bitrate-grid');
  if (!grid) return;
  grid.innerHTML = '';

  AUDIO_BITRATES.forEach(ab => {
    const chip = document.createElement('div');
    chip.className = `preset-chip${ab.key === selectedAudioBitrate ? ' selected' : ''}`;
    chip.textContent = ab.label();
    chip.dataset.key = ab.key;
    chip.addEventListener('click', () => {
      selectedAudioBitrate = ab.key;
      grid.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      updateEstimate();
    });
    grid.appendChild(chip);
  });
}

function getEffectiveVideoBitrateKbps() {
  if (selectedQuality === 'custom') {
    const val = parseFloat(document.getElementById('custom-bitrate-val')?.value || '0');
    const unit = document.getElementById('custom-bitrate-unit')?.value || 'mbps';
    return unit === 'mbps' ? val * 1000 : val;
  }
  const preset = QUALITY_PRESETS.find(q => q.key === selectedQuality);
  // Use factor * 1000 as rough kbps baseline (factor=1 => ~1000 kbps)
  return preset ? preset.factor * 1000 : 1000;
}

function getEffectiveAudioBitrateKbps() {
  const ab = AUDIO_BITRATES.find(a => a.key === selectedAudioBitrate);
  return ab ? ab.kbps : 128;
}

export function updateEstimate() {
  const sizeEl = document.getElementById('estimate-size');
  const origEl = document.getElementById('original-size');
  if (!sizeEl || !origEl) return;

  if (state.files.length === 0) {
    sizeEl.textContent = '—';
    origEl.textContent = '—';
    return;
  }

  // Sum all files
  let totalOrigSize = 0;
  let totalDuration = 0;
  state.files.forEach(e => {
    totalOrigSize += e.file.size;
    totalDuration += (e.meta?.duration || 60);
  });

  origEl.textContent = formatFileSize(totalOrigSize);

  const videoBitrateKbps = getEffectiveVideoBitrateKbps();
  const audioBitrateKbps = getEffectiveAudioBitrateKbps();
  const totalBitrateKbps = videoBitrateKbps + audioBitrateKbps;
  const estimatedBytes = (totalBitrateKbps * 1000 / 8) * totalDuration;

  sizeEl.textContent = `≈ ${formatFileSize(estimatedBytes)}`;
}

export function updateCompressButton() {
  const btn = document.getElementById('compress-start-btn');
  if (btn) btn.disabled = state.files.length === 0;
}

function startCompression() {
  if (state.files.length === 0) return;

  const useGpu = document.getElementById('gpu-toggle')?.checked ?? true;

  state.files.forEach(entry => {
    const meta = entry.meta || {};

    // Build compress options
    const compressOptions = { useGpu };

    // Resolution
    if (selectedResolution === 'custom') {
      const w = parseInt(document.getElementById('custom-width')?.value || '0');
      const h = parseInt(document.getElementById('custom-height')?.value || '0');
      if (w > 0) compressOptions.width = w;
      if (h > 0) compressOptions.height = h;
    } else if (selectedResolution !== 'original') {
      const res = RESOLUTIONS.find(r => r.key === selectedResolution);
      if (res) {
        compressOptions.width = res.width;
        compressOptions.height = res.height;
      }
    }

    // Video bitrate
    if (selectedQuality === 'custom') {
      const kbps = getEffectiveVideoBitrateKbps();
      compressOptions.videoBitrate = kbps * 1000; // bps for MediaBunny
    } else {
      compressOptions.videoBitrate = selectedQuality; // Quality key for MediaBunny
    }

    // Audio bitrate
    compressOptions.audioBitrateKbps = getEffectiveAudioBitrateKbps();

    const ext = entry.file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const outputFilename = entry.file.name.replace(/\.[^.]+$/, `_compressed.${ext}`);

    addJob({
      type: 'compress',
      filename: entry.file.name,
      outputFilename,
      execute: async (opts) => {
        return await executeCompression(entry.file, compressOptions, opts);
      },
    });
  });

  showToast(t('toast.fileAdded', { n: state.files.length }), 'info');
}
