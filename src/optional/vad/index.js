// All VAD dependency imports/assets/settings live in this removable directory.
import { Input, BlobSource, ALL_FORMATS, AudioSampleSink } from 'mediabunny';
import { t } from '../../i18n/index.js';
import { getSpeechContext, appendSpeechRanges } from '../../features/speech.js';
import { showToast } from '../../modules/toast.js';
let controller = null, worker = null, runContext = null, statusKey = 'vad.ready', statusParams = {};
export function init() {
  const panel = document.getElementById('panel-speech')?.querySelector('.panel-body');
  if (!panel) return;
  const wrap = document.createElement('details'); wrap.className = 'vad-panel';
  const summary = document.createElement('summary'); summary.dataset.i18n = 'vad.title'; wrap.append(summary);
  const controls = document.createElement('div'); controls.className = 'speech-toolbar'; wrap.append(controls);
  const inputs = {};
  for (const [name, value, min, max, step, type] of [['sensitivity', .55, 0, 1, .05, 'range'], ['minimum', .15, .1, 10, .1, 'number'], ['gap', 0, 0, 10, .05, 'number'], ['padding', .03, 0, 5, .05, 'number']]) {
    const label = document.createElement('label'), title = document.createElement('span'); title.dataset.i18n = `vad.${name}`;
    const input = document.createElement('input'); input.type = type; input.value = value; input.min = min; input.max = max; input.step = step; inputs[name] = input;
    input.title = t(`vad.${name}Help`); input.dataset.i18nTitle = `vad.${name}Help`;
    label.append(title, input);
    if (type === 'range') { const value = document.createElement('output'); value.textContent = input.value; input.addEventListener('input', () => { value.textContent = input.value; }); label.append(value); }
    controls.append(label);
  }
  const start = document.createElement('button'); start.className = 'btn btn-ghost'; start.dataset.i18n = 'vad.start';
  const cancel = document.createElement('button'); cancel.className = 'btn btn-ghost'; cancel.dataset.i18n = 'vad.cancel'; cancel.disabled = true;
  const status = document.createElement('p'); status.setAttribute('aria-live', 'polite');
  const hint = document.createElement('p'); hint.className = 'panel-hint'; hint.dataset.i18n = 'vad.hint';
  wrap.append(start, cancel, status, hint);
  panel.insertBefore(wrap, document.getElementById('speech-segments').previousElementSibling);
  const setStatus = (key, params = {}) => { statusKey = key; statusParams = params; status.textContent = t(key, params); };
  const update = () => {
    const context = getSpeechContext();
    if (controller && context.file !== runContext.file) controller.abort();
    start.disabled = !!controller || !context.file || !context.duration || !context.speakerId;
  };
  document.addEventListener('speechcontextchange', update);
  document.addEventListener('localechange', () => { status.textContent = t(statusKey, statusParams); Object.entries(inputs).forEach(([name, input]) => { input.title = t(`vad.${name}Help`); }); });
  wrap.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); }); update(); setStatus('vad.ready');
  cancel.addEventListener('click', () => controller?.abort());
  start.addEventListener('click', async () => {
    if (controller) return;
    const context = getSpeechContext(); if (!context.file || !context.duration || !context.speakerId) return;
    const settings = Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value === '' ? NaN : Number(input.value)]));
    if (Object.entries(inputs).some(([name, input]) => !Number.isFinite(settings[name]) || settings[name] < Number(input.min) || settings[name] > Number(input.max))) { setStatus('vad.invalid'); return; }
    runContext = context; controller = new AbortController(); const signal = controller.signal;
    cancel.disabled = false; Object.values(inputs).forEach(input => { input.disabled = true; }); update();
    try {
      setStatus('vad.decoding');
      const audio = await decodeMono(context, signal, percent => setStatus('vad.decodingProgress', { percent }));
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
      setStatus('vad.analyzing');
      const ranges = await new Promise((resolve, reject) => {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        signal.addEventListener('abort', () => { worker?.terminate(); reject(new DOMException('Canceled', 'AbortError')); }, { once: true });
        worker.onmessage = ({ data }) => {
          if (data.error) reject(new Error(data.error));
          else if (data.ranges) resolve(data.ranges);
          else setStatus('vad.analyzingProgress', { percent: Math.round(data.progress * 100) });
        };
        worker.onerror = event => reject(new Error(event.message));
        worker.postMessage({ audio, duration: context.duration, settings, assetBase: new URL(`${import.meta.env.BASE_URL}vad/`, location.href).href }, [audio.buffer]);
      });
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
      if (!appendSpeechRanges(context, ranges)) { setStatus('vad.changed'); return; }
      setStatus('vad.done', { n: ranges.length }); showToast(t('vad.done', { n: ranges.length }), 'success');
    } catch (error) { if (signal.aborted) setStatus('vad.canceled'); else { setStatus('vad.failed', { message: error.message }); } }
    finally { worker?.terminate(); worker = null; controller = null; cancel.disabled = true; Object.values(inputs).forEach(input => { input.disabled = false; }); update(); }
  });
}
async function decodeMono(context, signal, onProgress) {
  const input = new Input({ source: new BlobSource(context.file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error(t('vad.noAudio'));
    // 16 kHz timeline preserves the original audio timestamps, including initial silence.
    const count = Math.ceil(context.duration * 16000), output = new Float32Array(Math.ceil(count / 1536) * 1536 + 1536);
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
        const mono = new Float32Array(sample.numberOfFrames);
        for (let channel = 0; channel < sample.numberOfChannels; channel++) {
          const plane = new Float32Array(sample.numberOfFrames); sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' });
          for (let i = 0; i < plane.length; i++) mono[i] += plane[i] / sample.numberOfChannels;
        }
        const first = Math.max(0, Math.ceil(sample.timestamp * 16000)), last = Math.min(count, Math.ceil((sample.timestamp + sample.duration) * 16000));
        for (let i = first; i < last; i++) {
          const position = Math.max(0, (i / 16000 - sample.timestamp) * sample.sampleRate);
          if (sample.sampleRate > 16000) {
            const stop = Math.min(mono.length, Math.ceil(position + sample.sampleRate / 16000));
            let sum = 0, samples = 0;
            for (let frame = Math.floor(position); frame < stop; frame++) { sum += mono[frame]; samples++; }
            output[i] = samples ? sum / samples : 0;
          } else {
            const frame = Math.min(mono.length - 1, Math.floor(position));
            output[i] = mono[frame] + (mono[Math.min(frame + 1, mono.length - 1)] - mono[frame]) * (position - Math.floor(position));
          }
        }
        onProgress(Math.min(100, Math.round(last / count * 100)));
        await new Promise(resolve => setTimeout(resolve, 0));
      } finally { sample.close(); }
    }
    return output;
  } finally { input.dispose(); }
}
