// modules/fileList.js — 檔案清單管理
import { t } from '../i18n/index.js';
import { openPreview } from './preview.js';
import { Input, BlobSource, ALL_FORMATS } from 'mediabunny';

/** Global file state */
export const state = {
  files: [], // Array of { id, file, meta, objectUrl }
  listeners: [],
};

let nextId = 1;

/** Add files and extract metadata */
export async function addFiles(files) {
  const newEntries = [];

  for (const file of files) {
    const id = nextId++;
    const entry = {
      id,
      file,
      meta: null,
      objectUrl: null,
    };

    // Create object URL for preview thumbnail
    if (file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/')) {
      entry.objectUrl = URL.createObjectURL(file);
    }

    // Extract basic metadata from the file itself
    entry.meta = await extractBasicMeta(file, entry.objectUrl);

    state.files.push(entry);
    newEntries.push(entry);
  }

  renderFileList();
  notifyListeners();
  return newEntries;
}

/** Extract basic metadata using MediaBunny and fall back to HTMLMediaElement */
async function extractBasicMeta(file, objectUrl) {
  // 1. Try MediaBunny first if the browser supports it
  if (typeof VideoEncoder !== 'undefined' && !file.type.startsWith('image/')) {
    const mbMeta = await extractMetadataWithMediaBunny(file);
    if (mbMeta) return mbMeta;
  }

  // 2. Fallback to HTMLMediaElement or Image
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mkv|mov|avi|flv|wmv|ts|m4v|ogv|3gp)$/i.test(file.name);
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|aac|m4a|flac|ogg|wma|opus)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(file.name);

    const meta = {
      formatName: file.name.split('.').pop()?.toUpperCase() || 'Unknown',
      duration: null,
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: null,
      fps: null,
      bitrate: null,
      isVideo,
      isAudio,
      isImage,
    };

    if (!objectUrl) {
      resolve(meta);
      return;
    }

    if (isImage) {
      const img = new Image();
      const timeoutId = setTimeout(() => {
        resolve(meta);
      }, 5000);

      img.onload = () => {
        clearTimeout(timeoutId);
        meta.width = img.naturalWidth;
        meta.height = img.naturalHeight;
        resolve(meta);
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(meta);
      };

      img.src = objectUrl;
      return;
    }

    const el = isVideo ? document.createElement('video') : document.createElement('audio');
    el.preload = 'metadata';

    const timeoutId = setTimeout(() => {
      resolve(meta);
    }, 5000);

    el.addEventListener('loadedmetadata', () => {
      clearTimeout(timeoutId);
      meta.duration = el.duration;
      if (isVideo && el instanceof HTMLVideoElement) {
        meta.width = el.videoWidth;
        meta.height = el.videoHeight;
      }
      resolve(meta);
    });

    el.addEventListener('error', () => {
      clearTimeout(timeoutId);
      resolve(meta);
    });

    el.src = objectUrl;
  });
}

/** Extract detailed metadata using MediaBunny Input class */
async function extractMetadataWithMediaBunny(file) {
  try {
    const source = new BlobSource(file);
    const input = new Input({
      source,
      formats: ALL_FORMATS,
    });

    const formatObj = await input.getFormat();
    const duration = await input.computeDuration();
    const tracks = await input.getTracks();

    let videoCodec = null;
    let audioCodec = null;
    let width = null;
    let height = null;
    let fps = null;
    let bitrate = null;
    let isVideo = false;
    let isAudio = false;

    for (const track of tracks) {
      if (track.isVideoTrack()) {
        isVideo = true;
        videoCodec = await track.getCodec();
        width = await track.getDisplayWidth();
        height = await track.getDisplayHeight();
        try {
          // Average packet rate is FPS for video tracks
          await new Promise(r => setTimeout(r, 20));
          const stats = await track.computePacketStats();
          fps = stats.averagePacketRate;
          if (stats.averageBitrate) {
            bitrate = (bitrate || 0) + stats.averageBitrate;
          }
        } catch (e) {
          console.warn("Failed to compute video packet stats:", e);
        }
      } else if (track.isAudioTrack()) {
        isAudio = true;
        audioCodec = await track.getCodec();
        try {
          await new Promise(r => setTimeout(r, 20));
          const stats = await track.computePacketStats();
          if (stats.averageBitrate) {
            bitrate = (bitrate || 0) + stats.averageBitrate;
          }
        } catch (e) {
          console.warn("Failed to compute audio packet stats:", e);
        }
      }
    }

    return {
      formatName: formatObj.name,
      duration,
      width,
      height,
      videoCodec,
      audioCodec,
      fps,
      bitrate, // in bps
      isVideo,
      isAudio,
    };
  } catch (err) {
    console.warn("MediaBunny metadata extraction failed, falling back:", err);
    return null;
  }
}

/** Remove a file by id */
export function removeFile(id) {
  const idx = state.files.findIndex(f => f.id === id);
  if (idx !== -1) {
    const entry = state.files[idx];
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    state.files.splice(idx, 1);
  }
  renderFileList();
  notifyListeners();
}

/** Clear all files */
export function clearAllFiles() {
  state.files.forEach(entry => {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  });
  state.files = [];
  renderFileList();
  notifyListeners();
}

/** Register a listener for file changes */
export function onFilesChanged(cb) {
  state.listeners.push(cb);
}

function notifyListeners() {
  state.listeners.forEach(cb => cb(state.files));
}

/** Format file size in human-readable form */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/** Format duration in M:SS.mmm */
export function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Render the file list UI */
function renderFileList() {
  const section = document.getElementById('file-list-section');
  const list = document.getElementById('file-list');
  if (!section || !list) return;

  if (state.files.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = '';

  state.files.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.setAttribute('role', 'listitem');

    const meta = entry.meta || {};
    const metaText = [
      formatFileSize(entry.file.size),
      meta.duration ? formatDuration(meta.duration) : null,
      meta.width && meta.height ? `${meta.width}×${meta.height}` : null,
    ].filter(Boolean).join(' · ');

    // Thumbnail
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'file-card-thumb';
    thumbDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      openPreview(entry);
    });

    if (meta.isVideo && entry.objectUrl) {
      const vid = document.createElement('video');
      vid.src = entry.objectUrl;
      vid.preload = 'metadata';
      vid.muted = true;
      vid.addEventListener('loadeddata', () => { vid.currentTime = 0.5; });
      thumbDiv.appendChild(vid);
    } else if (meta.isImage && entry.objectUrl) {
      const img = document.createElement('img');
      img.src = entry.objectUrl;
      thumbDiv.appendChild(img);
    } else {
      thumbDiv.innerHTML = `
        <svg class="file-card-thumb-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3v14M5 8l5-5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }

    // Info
    const infoDiv = document.createElement('div');
    infoDiv.className = 'file-card-info';
    infoDiv.innerHTML = `
      <div class="file-card-name" title="${entry.file.name}">${entry.file.name}</div>
      <div class="file-card-meta">${metaText}</div>
    `;

    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'file-card-actions';

    // Preview button
    const previewBtn = document.createElement('button');
    previewBtn.className = 'file-card-icon-btn';
    previewBtn.title = t('preview.title');
    previewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l6 4-6 4V3z" fill="currentColor"/></svg>`;
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPreview(entry);
    });

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-card-icon-btn danger';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(entry.id);
    });

    actionsDiv.appendChild(previewBtn);
    actionsDiv.appendChild(removeBtn);

    card.appendChild(thumbDiv);
    card.appendChild(infoDiv);
    card.appendChild(actionsDiv);
    list.appendChild(card);
  });
}

/** Initialize file list */
export function initFileList() {
  const clearBtn = document.getElementById('clear-files-btn');
  clearBtn?.addEventListener('click', clearAllFiles);
}
