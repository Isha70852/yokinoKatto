// features/convert.js — 轉檔功能
import { t } from '../i18n/index.js';
import { state } from '../modules/fileList.js';
import { addJob } from '../modules/jobQueue.js';
import { executeConversion } from '../modules/engine.js';
import { showToast } from '../modules/toast.js';

import { OUTPUT_FORMATS, AUDIO_FORMATS } from '../modules/mediabunnyEngine.js';
const VIDEO_FORMATS = OUTPUT_FORMATS.filter(fmt => !AUDIO_FORMATS.includes(fmt));

let selectedFormat = null;

export function initConvert() {
  renderFormatGrid();
  updateStartButton();

  document.getElementById('convert-start-btn')?.addEventListener('click', startConversion);
}

function renderFormatGrid() {
  const grid = document.getElementById('convert-format-grid');
  if (!grid) return;
  grid.innerHTML = '';

  VIDEO_FORMATS.forEach(fmt => {
    const chip = document.createElement('div');
    chip.className = 'format-chip';
    chip.textContent = fmt.toUpperCase();
    chip.dataset.format = fmt;
    chip.addEventListener('click', () => selectFormat(fmt, chip));
    grid.appendChild(chip);
  });

  AUDIO_FORMATS.forEach(fmt => {
    const chip = document.createElement('div');
    chip.className = 'format-chip audio-chip';
    chip.textContent = fmt.toUpperCase();
    chip.dataset.format = fmt;
    chip.addEventListener('click', () => selectFormat(fmt, chip));
    grid.appendChild(chip);
  });
}

function selectFormat(fmt, chip) {
  // Deselect all
  document.querySelectorAll('#convert-format-grid .format-chip').forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
  selectedFormat = fmt;
  updateStartButton();
}

export function updateStartButton() {
  const btn = document.getElementById('convert-start-btn');
  const hint = document.getElementById('convert-hint');
  if (!btn) return;

  const hasFiles = state.files.length > 0;
  const hasFormat = !!selectedFormat;
  btn.disabled = !hasFiles || !hasFormat;

  if (hint) {
    if (!hasFiles) hint.textContent = t('convert.hint.selectFile');
    else if (!hasFormat) hint.textContent = t('convert.hint.selectFormat');
    else hint.textContent = '';
  }
}

function startConversion() {
  if (!selectedFormat || state.files.length === 0) return;

  state.files.forEach(entry => {
    const outputFilename = entry.file.name.replace(/\.[^.]+$/, `.${selectedFormat}`);

    addJob({
      type: 'convert',
      filename: entry.file.name,
      outputFilename,
      execute: async (opts) => {
        return await executeConversion(entry.file, selectedFormat, opts);
      },
    });
  });

  showToast(t('toast.fileAdded', { n: state.files.length }), 'info');
}
