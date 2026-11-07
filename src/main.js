// main.js — 應用程式入口
import './style.css';
import { initI18n } from './i18n/index.js';
import { checkBrowserSupport, showBrowserBanner } from './modules/browserCheck.js';
import { initDropzone } from './modules/dropzone.js';
import { initFileList, addFiles, onFilesChanged } from './modules/fileList.js';
import { initPreview } from './modules/preview.js';
import { initOPFS } from './modules/opfs.js';
import { initJobQueue } from './modules/jobQueue.js';
import { showToast } from './modules/toast.js';
import { t } from './i18n/index.js';
import { initConvert, updateStartButton as updateConvertBtn } from './features/convert.js';
import { initCompress, updateEstimate, updateCompressButton } from './features/compress.js';
import { initSplit, onFilesChangedForSplit } from './features/split.js';

import { initSpeech, onFilesChangedForSpeech } from './features/speech.js';
import { initSubtitles, onFilesChangedForSubtitles } from './features/subtitles.js';

// ===== Initialization =====
async function init() {
  // 1. i18n
  initI18n();

  // 2. Browser check
  const capabilities = checkBrowserSupport();
  showBrowserBanner(capabilities);

  // 3. OPFS
  await initOPFS();

  // 4. Tab switching
  initTabs();
  initTheme();

  // 5. Dropzone
  initDropzone((files) => {
    addFiles(files).then(() => {
      showToast(t('toast.fileAdded', { n: files.length }), 'success');
    });
  });

  // 6. File list
  initFileList();

  // 7. Preview modal
  initPreview();

  // 8. Job queue
  initJobQueue();

  // 9. Features
  initConvert();
  initCompress();
  initSplit();
  initSpeech();
  initSubtitles();
  // Optional feature discovery: deleting its folder leaves the core unchanged.
  const optionalFeatures = import.meta.glob('./optional/*/index.js');
  Object.values(optionalFeatures).forEach(load => load().then(module => module.init?.()).catch(error => console.warn('Optional feature unavailable:', error)));

  // 10. React to file changes
  onFilesChanged((files) => {
    updateConvertBtn();
    updateCompressButton();
    updateEstimate();
    onFilesChangedForSplit(files);
    onFilesChangedForSpeech(files);
    onFilesChangedForSubtitles(files);
  });
}

// ===== Light / Dark Theme =====
// 預設跟著系統；按過切換鈕就記住使用者的選擇
const THEME_KEY = 'katto.theme';

function initTheme() {
  const root = document.documentElement;
  const button = document.getElementById('theme-toggle');
  const system = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  };
  const apply = (dark) => {
    if (dark) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    button?.setAttribute('aria-pressed', String(dark));
  };
  apply(saved() ? saved() === 'dark' : system.matches);
  system.addEventListener('change', (e) => {
    if (!saved()) apply(e.matches);
  });
  button?.addEventListener('click', () => {
    const dark = root.dataset.theme !== 'dark';
    apply(dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      // 無法保存就只影響這次瀏覽
    }
  });
  const year = document.getElementById('footer-year');
  if (year) year.textContent = String(new Date().getFullYear());
}

// ===== Tab Switching =====
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
  const panels = document.querySelectorAll('.feature-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Update tab buttons
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Update panels
      panels.forEach(p => {
        if (p.id === `panel-${tab}`) {
          p.classList.add('active');
          p.classList.remove('hidden');
        } else {
          p.classList.remove('active');
          p.classList.add('hidden');
        }
      });
    });
  });
}

// Start the app
init().catch(err => {
  console.error('App init failed:', err);
});
