// modules/dropzone.js — 拖曳上傳模組

/**
 * Initialize the dropzone with file handling
 * @param {(files: File[]) => void} onFilesAdded
 */
export function initDropzone(onFilesAdded) {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const dropzoneBtn = document.getElementById('dropzone-btn');

  if (!dropzone || !fileInput) return;

  // Click to open file selector
  dropzone.addEventListener('click', (e) => {
    // Don't trigger if clicking the button itself (it has its own handler)
    if (e.target === dropzoneBtn) return;
    fileInput.click();
  });

  dropzoneBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Keyboard accessibility
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // File input change
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    if (files.length > 0) {
      onFilesAdded(files);
    }
    fileInput.value = '';
  });

  // Drag events
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer?.files || []).filter(f => {
      return f.type.startsWith('video/') || f.type.startsWith('audio/') ||
        /\.(mkv|flac|ts|m4a|m4v|ogg|opus|mov|webm|mp4|mp3|wav|aac|avi|wmv|flv)$/i.test(f.name);
    });

    if (files.length > 0) {
      onFilesAdded(files);
    }
  });

  // Also handle global drop (outside dropzone)
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
  });
}
