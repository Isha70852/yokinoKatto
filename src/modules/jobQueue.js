// modules/jobQueue.js — 任務佇列
import { t } from '../i18n/index.js';
import { showToast } from './toast.js';
import { saveToOPFS } from './opfs.js';
import { formatFileSize } from './fileList.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

let jobs = [];
let nextJobId = 1;

/**
 * Add a job to the queue and start it
 * @param {object} jobDef
 * @param {string} jobDef.type - 'convert' | 'compress' | 'split'
 * @param {string} jobDef.filename
 * @param {() => Promise<{blob:Blob|null, canceled:boolean, engine:string}>} jobDef.execute
 * @param {string} jobDef.outputFilename
 */
export function addJob(jobDef) {
  const controller = new AbortController();
  const job = {
    id: nextJobId++,
    type: jobDef.type,
    filename: jobDef.filename,
    outputFilename: jobDef.outputFilename || jobDef.filename,
    status: 'pending',
    progress: 0,
    engine: '—',
    resultBlob: null,
    resultUrl: null,
    controller,
    error: null,
  };

  jobs.push(job);
  renderJobList();

  // Start processing async
  runJob(job, jobDef.execute).catch(() => {});

  return job;
}

async function runJob(job, executeFn) {
  job.status = 'running';
  renderJobList();

  try {
    const result = await executeFn({
      signal: job.controller.signal,
      onProgress: (p) => {
        job.progress = p;
        updateJobProgress(job);
      },
    });

    if (result.canceled || job.controller.signal.aborted) {
      job.status = 'canceled';
      showToast(t('toast.canceled'), 'warn');
    } else if (result.blob) {
      job.status = 'done';
      job.resultBlob = result.blob;
      job.engine = result.engine || '—';

      // Save to OPFS
      const opfsName = `job_${job.id}_${job.outputFilename}`;
      await saveToOPFS(result.blob, opfsName);

      // Auto download
      triggerDownload(result.blob, job.outputFilename);
      showToast(t('toast.downloadReady'), 'success');
    }
  } catch (err) {
    console.error('Job failed:', err);
    job.status = 'error';
    job.error = err.message || String(err);
    showToast(t('toast.error', { msg: job.error }), 'error');
  }

  renderJobList();
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function updateJobProgress(job) {
  const bar = document.getElementById(`job-progress-${job.id}`);
  const info = document.getElementById(`job-info-${job.id}`);
  if (bar) bar.style.width = `${Math.round(job.progress * 100)}%`;
  if (info) info.textContent = `${Math.round(job.progress * 100)}%`;
}

export function cancelJob(id) {
  const job = jobs.find(j => j.id === id);
  if (job && (job.status === 'pending' || job.status === 'running')) {
    job.controller.abort();
    job.status = 'canceled';
    renderJobList();
  }
}

export function clearDoneJobs() {
  jobs = jobs.filter(j => j.status === 'running' || j.status === 'pending');
  renderJobList();
}

function renderJobList() {
  const list = document.getElementById('job-list');
  const empty = document.getElementById('job-empty');
  const clearBtn = document.getElementById('clear-done-btn');
  if (!list) return;

  const hasDone = jobs.some(j => j.status !== 'pending' && j.status !== 'running');
  if (clearBtn) clearBtn.classList.toggle('hidden', !hasDone);

  if (jobs.length === 0) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');
  list.innerHTML = '';

  jobs.forEach(job => {
    const card = document.createElement('div');
    card.className = 'job-card';

    const badgeClass = `badge-${job.type}`;
    const statusClass = job.status;
    const statusText = t(`queue.status.${job.status}`);

    card.innerHTML = `
      <div class="job-card-header">
        <span class="job-type-badge ${badgeClass}">${job.type === 'speech' ? t('speech.title') : job.type}</span>
        <span class="job-filename" title="${escapeHtml(job.filename)}">${escapeHtml(job.filename)}</span>
        <span class="job-status ${statusClass}">${statusText}</span>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar ${job.status === 'done' ? 'done' : job.status === 'error' ? 'error' : ''}"
             id="job-progress-${job.id}"
             style="width:${Math.round(job.progress * 100)}%"></div>
      </div>
      <div class="job-card-footer">
        <span class="job-info-text" id="job-info-${job.id}">
          ${job.status === 'done' ? (job.resultBlob ? formatFileSize(job.resultBlob.size) : '') : 
            job.status === 'error' ? escapeHtml(job.error || '') :
            job.status === 'running' ? Math.round(job.progress * 100) + '%' : ''}
          ${job.engine !== '—' ? ` · ${t('queue.engine')}: ${job.engine}` : ''}
        </span>
        <div class="job-actions"></div>
      </div>
    `;

    const actionsDiv = card.querySelector('.job-actions');

    if (job.status === 'pending' || job.status === 'running') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-ghost btn-sm';
      cancelBtn.textContent = t('queue.cancel');
      cancelBtn.addEventListener('click', () => cancelJob(job.id));
      actionsDiv.appendChild(cancelBtn);
    }

    if (job.status === 'done' && job.resultBlob) {
      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn btn-primary btn-sm';
      dlBtn.textContent = t('queue.download');
      dlBtn.addEventListener('click', () => triggerDownload(job.resultBlob, job.outputFilename));
      actionsDiv.appendChild(dlBtn);
    }

    list.appendChild(card);
  });
}

export function initJobQueue() {
  const clearBtn = document.getElementById('clear-done-btn');
  clearBtn?.addEventListener('click', clearDoneJobs);
  renderJobList();
}
