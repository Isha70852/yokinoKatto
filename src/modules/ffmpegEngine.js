// modules/ffmpegEngine.js — FFmpeg.wasm 引擎封裝
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { showToast } from './toast.js';
import { t } from '../i18n/index.js';

const BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
let ffmpegInstance = null;
let isLoaded = false;
let isLoading = false;
let onProgressCb = null;

export async function getFFmpeg(askUser = true) {
  if (isLoaded && ffmpegInstance) return ffmpegInstance;
  if (isLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (isLoaded) { clearInterval(check); resolve(ffmpegInstance); }
        if (!isLoading && !isLoaded) { clearInterval(check); resolve(null); }
      }, 200);
    });
  }
  if (askUser) {
    const ok = confirm(t('ffmpeg.confirmLoad'));
    if (!ok) return null;
  }
  return await loadFFmpeg();
}

async function loadFFmpeg() {
  if (isLoaded && ffmpegInstance) return ffmpegInstance;
  isLoading = true;
  try {
    ffmpegInstance = new FFmpeg();
    ffmpegInstance.on('progress', ({ progress }) => {
      if (onProgressCb) onProgressCb(Math.max(0, Math.min(1, progress)));
    });
    const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');
    await ffmpegInstance.load({ coreURL, wasmURL });
    isLoaded = true; isLoading = false;
    showToast(t('ffmpeg.loaded'), 'success');
    return ffmpegInstance;
  } catch (err) {
    isLoading = false;
    console.error('FFmpeg load failed:', err);
    showToast(t('ffmpeg.loadFailed'), 'error');
    return null;
  }
}

export function isFFmpegLoaded() { return isLoaded; }
function setFFmpegProgress(cb) { onProgressCb = cb; }

async function writeInput(ff, file, name) {
  await ff.writeFile(name, await fetchFile(file));
}
async function readOutput(ff, name, mime = 'application/octet-stream') {
  const d = await ff.readFile(name);
  return new Blob([d.buffer], { type: mime });
}
async function cleanupFiles(ff, files) {
  for (const f of files) { try { await ff.deleteFile(f); } catch {} }
}

const MIME_MAP = {
  mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',
  avi:'video/x-msvideo',flv:'video/x-flv',wmv:'video/x-ms-wmv',ts:'video/mp2t',
  mp3:'audio/mpeg',wav:'audio/wav',aac:'audio/aac',m4a:'audio/mp4',
  flac:'audio/flac',ogg:'audio/ogg',gif:'image/gif',
};
function getMime(ext) { return MIME_MAP[ext] || 'application/octet-stream'; }

function fmtTime(s) {
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${sec.toFixed(3).padStart(6,'0')}`;
}

export async function ffmpegConvert(file, outputFormat, options = {}) {
  const ff = await getFFmpeg();
  if (!ff) return { blob: null, canceled: true };
  setFFmpegProgress(options.onProgress || null);
  const ext = file.name.split('.').pop();
  const inp = `in_${Date.now()}.${ext}`, out = `out_${Date.now()}.${outputFormat}`;
  try {
    await writeInput(ff, file, inp);
    await ff.exec(['-i', inp, '-preset', 'ultrafast', out]);
    return { blob: await readOutput(ff, out, getMime(outputFormat)), canceled: false };
  } catch (err) {
    if (options.signal?.aborted) return { blob: null, canceled: true };
    throw err;
  } finally { await cleanupFiles(ff, [inp, out]); setFFmpegProgress(null); }
}

export async function ffmpegCompress(file, co = {}, options = {}) {
  const ff = await getFFmpeg();
  if (!ff) return { blob: null, canceled: true };
  setFFmpegProgress(options.onProgress || null);
  const ext = file.name.split('.').pop();
  const inp = `in_${Date.now()}.${ext}`, out = `cmp_${Date.now()}.${ext}`;
  try {
    await writeInput(ff, file, inp);
    const args = ['-i', inp];
    if (co.height && co.height !== 'original') args.push('-vf', `scale=-2:${co.height}`);
    args.push('-vcodec', 'libx264', '-preset', 'ultrafast');
    if (co.videoBitrateKbps && parseInt(co.videoBitrateKbps) > 0) args.push('-b:v', `${co.videoBitrateKbps}k`);
    else args.push('-crf', String(co.crf || 28));
    if (co.audioBitrateKbps) args.push('-b:a', `${co.audioBitrateKbps}k`);
    args.push(out);
    await ff.exec(args);
    return { blob: await readOutput(ff, out, getMime(ext)), canceled: false };
  } catch (err) {
    if (options.signal?.aborted) return { blob: null, canceled: true };
    throw err;
  } finally { await cleanupFiles(ff, [inp, out]); setFFmpegProgress(null); }
}

export async function ffmpegSplit(file, start, end, options = {}) {
  const ff = await getFFmpeg();
  if (!ff) return { blob: null, canceled: true };
  setFFmpegProgress(options.onProgress || null);
  const ext = file.name.split('.').pop();
  const inp = `in_${Date.now()}.${ext}`, out = `spl_${Date.now()}.${options.outputFormat || ext}`;
  try {
    await writeInput(ff, file, inp);
    const codecArgs = options.outputFormat ? [] : ['-c', 'copy'];
    await ff.exec(['-i', inp, '-ss', fmtTime(start), '-to', fmtTime(end), ...codecArgs, out]);
    return { blob: await readOutput(ff, out, getMime(options.outputFormat || ext)), canceled: false };
  } catch (err) {
    if (options.signal?.aborted) return { blob: null, canceled: true };
    throw err;
  } finally { await cleanupFiles(ff, [inp, out]); setFFmpegProgress(null); }
}
