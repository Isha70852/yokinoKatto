// modules/toast.js — Toast 通知模組

/**
 * Show a toast notification
 * @param {string} message
 * @param {'info'|'success'|'error'|'warn'} type
 * @param {number} duration ms
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto dismiss
  setTimeout(() => {
    toast.classList.add('toast-dismiss');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
