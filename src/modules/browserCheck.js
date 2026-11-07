// modules/browserCheck.js — 瀏覽器支援檢查
import { t } from '../i18n/index.js';

/** Check browser capabilities and return a result object */
export function checkBrowserSupport() {
  const result = {
    webCodecs: typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined',
    opfs: typeof navigator?.storage?.getDirectory === 'function',
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };
  return result;
}

/** Display banner if issues are found */
export function showBrowserBanner(capabilities) {
  const banner = document.getElementById('browser-check-banner');
  if (!banner) return;

  const messages = [];

  // Only warn about SharedArrayBuffer if WebCodecs is NOT supported (since we fall back to FFmpeg and SAB is useful there)
  if (!capabilities.webCodecs) {
    messages.push(t('browser.noWebCodecs'));
    if (!capabilities.sharedArrayBuffer) {
      messages.push(t('browser.noSAB'));
    }
  }

  if (!capabilities.opfs) {
    messages.push(t('browser.noOPFS'));
  }

  if (messages.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  // Determine severity
  const isError = !capabilities.webCodecs && !capabilities.sharedArrayBuffer;
  banner.className = `browser-check-banner ${isError ? 'error' : 'warn'}`;
  banner.textContent = messages.join(' | ');
}
