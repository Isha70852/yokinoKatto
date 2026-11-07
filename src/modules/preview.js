// modules/preview.js — 預覽模組
import { t } from '../i18n/index.js';
import { formatFileSize, formatDuration } from './fileList.js';

let currentObjectUrl = null;

/** Open the preview modal for a given file entry */
export function openPreview(fileEntry) {
  const modal = document.getElementById('preview-modal');
  const video = document.getElementById('preview-video');
  const metaContainer = document.getElementById('preview-meta');

  if (!modal || !video) return;

  // Cleanup previous
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(fileEntry.file);
  video.src = currentObjectUrl;

  // Render metadata
  metaContainer.innerHTML = '';
  const meta = fileEntry.meta || {};

  const items = [
    { label: t('preview.format'), value: meta.formatName || fileEntry.file.name.split('.').pop().toUpperCase() },
    { label: t('preview.duration'), value: meta.duration ? formatDuration(meta.duration) : '—' },
    { label: t('preview.resolution'), value: meta.width && meta.height ? `${meta.width}×${meta.height}` : '—' },
    { label: t('preview.size'), value: formatFileSize(fileEntry.file.size) },
    { label: t('preview.videoCodec'), value: meta.videoCodec || '—' },
    { label: t('preview.audioCodec'), value: meta.audioCodec || '—' },
    { label: t('preview.fps'), value: meta.fps ? `${Math.round(meta.fps * 100) / 100} FPS` : '—' },
    { label: t('preview.bitrate'), value: meta.bitrate ? formatBitrate(meta.bitrate) : '—' },
  ];

  items.forEach(({ label, value }) => {
    const item = document.createElement('div');
    item.className = 'preview-meta-item';
    item.innerHTML = `
      <span class="preview-meta-label">${label}</span>
      <span class="preview-meta-value">${value}</span>
    `;
    metaContainer.appendChild(item);
  });

  modal.classList.remove('hidden');
}

function formatBitrate(bps) {
  if (bps < 1000) return bps + ' bps';
  if (bps < 1000 * 1000) return (bps / 1000).toFixed(1) + ' kbps';
  return (bps / (1000 * 1000)).toFixed(2) + ' Mbps';
}

/** Close the preview modal */
export function closePreview() {
  const modal = document.getElementById('preview-modal');
  const video = document.getElementById('preview-video');

  if (video) {
    video.pause();
    video.src = '';
  }

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  if (modal) {
    modal.classList.add('hidden');
  }
}

/** Initialize preview modal event listeners */
export function initPreview() {
  const modal = document.getElementById('preview-modal');
  const closeBtn = document.getElementById('preview-modal-close');

  closeBtn?.addEventListener('click', closePreview);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closePreview();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closePreview();
    }
  });
}
