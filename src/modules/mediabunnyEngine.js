// modules/mediabunnyEngine.js — MediaBunny 引擎封裝
import {
  VideoSampleSink, AudioSampleSink, VideoSampleSource, AudioSampleSource, AudioSample,
  getEncodableVideoCodecs, getEncodableAudioCodecs,
  Input, Output, Conversion, BlobSource, BufferTarget, ALL_FORMATS,
  Mp4OutputFormat, WebMOutputFormat, MkvOutputFormat, MovOutputFormat,
  Mp3OutputFormat, WavOutputFormat, OggOutputFormat, AdtsOutputFormat,
  FlacOutputFormat, MpegTsOutputFormat,
  QUALITY_VERY_LOW, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH, QUALITY_VERY_HIGH,
} from 'mediabunny';

// Register the MP3 encoder extension
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
registerMp3Encoder();

/**
 * Map output format string to OutputFormat class
 */
const OUTPUT_FORMAT_MAP = {
  'mp4': () => new Mp4OutputFormat(),
  'm4a': () => new Mp4OutputFormat(),
  'm4v': () => new Mp4OutputFormat(),
  'mov': () => new MovOutputFormat(),
  'webm': () => new WebMOutputFormat(),
  'mkv': () => new MkvOutputFormat(),
  'mp3': () => new Mp3OutputFormat(),
  'wav': () => new WavOutputFormat(),
  'ogg': () => new OggOutputFormat(),
  'aac': () => new AdtsOutputFormat(),
  'flac': () => new FlacOutputFormat(),
  'ts': () => new MpegTsOutputFormat(),
};

/**
 * MediaBunny supported input formats (containers it can demux)
 */
const MB_INPUT_EXTENSIONS = new Set([
  'mp4', 'm4v', 'm4a', 'mov', 'webm', 'mkv', 'mp3', 'wav',
  'ogg', 'aac', 'flac', 'ts', 'opus',
]);

/**
 * Quality string to Quality constant mapping
 */
export const OUTPUT_FORMATS = Object.keys(OUTPUT_FORMAT_MAP);
export const AUDIO_FORMATS = ["m4a", "mp3", "wav", "ogg", "aac", "flac"];

export const QUALITY_MAP = {
  'very_low': QUALITY_VERY_LOW,
  'low': QUALITY_LOW,
  'medium': QUALITY_MEDIUM,
  'high': QUALITY_HIGH,
  'very_high': QUALITY_VERY_HIGH,
};

/**
 * Check if MediaBunny can handle the given input file extension
 */
export function canHandleInput(ext) {
  return MB_INPUT_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Check if MediaBunny can write to the given output format
 */
export function canHandleOutput(ext) {
  return !!OUTPUT_FORMAT_MAP[ext.toLowerCase()];
}

/**
 * Convert a file to a different format using MediaBunny
 * @param {File} file
 * @param {string} outputFormat - e.g. 'mp4', 'webm', 'mp3'
 * @param {object} options
 * @param {(progress: number) => void} options.onProgress
 * @param {AbortSignal} options.signal
 * @returns {Promise<{blob: Blob, canceled: boolean}>}
 */
export async function mbConvert(file, outputFormat, options = {}) {
  const { onProgress, signal } = options;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let conversion;
  const cancel = () => conversion?.cancel();
  try {
    if (signal?.aborted) return { blob: null, canceled: true };
    const factory = OUTPUT_FORMAT_MAP[outputFormat.toLowerCase()];
    if (!factory) throw new Error(`Unsupported output format: ${outputFormat}`);
    const output = new Output({ target: new BufferTarget(), format: factory() });
    conversion = await Conversion.init({
      input, output, tracks: 'primary', trim: options.trim,
      video: AUDIO_FORMATS.includes(outputFormat.toLowerCase()) ? { discard: true } : undefined,
    });
    if (signal?.aborted) { await conversion.cancel(); return { blob: null, canceled: true }; }
    signal?.addEventListener('abort', cancel, { once: true });
    if (!conversion.isValid) throw new Error('No compatible tracks or encoder for this output format.');
    if (onProgress) conversion.onProgress = onProgress;
    await conversion.execute();
    if (signal?.aborted) return { blob: null, canceled: true };
    return { blob: new Blob([output.target.buffer], { type: output.format.mimeType }), canceled: false };
  } catch (err) {
    if (signal?.aborted || err?.name === 'ConversionCanceledError') return { blob: null, canceled: true };
    throw err;
  } finally {
    signal?.removeEventListener('abort', cancel);
    input.dispose();
  }
}

/**
 * Compress a file using MediaBunny
 * @param {File} file
 * @param {object} compressOptions
 * @param {number|null} compressOptions.width
 * @param {number|null} compressOptions.height
 * @param {string|number} compressOptions.videoBitrate - Quality key or bps number
 * @param {number|null} compressOptions.audioBitrateKbps
 * @param {boolean} compressOptions.useGpu
 * @param {(progress: number) => void} options.onProgress
 * @param {AbortSignal} options.signal
 */
export async function mbCompress(file, compressOptions = {}, options = {}) {
  const { onProgress, signal } = options;

  const source = new BlobSource(file);
  const input = new Input({ source, formats: ALL_FORMATS });

  // Determine output format (same as input or default to MP4)
  const inputExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const outputExt = canHandleOutput(inputExt) ? inputExt : 'mp4';
  const formatFactory = OUTPUT_FORMAT_MAP[outputExt];

  const output = new Output({
    target: new BufferTarget(),
    format: formatFactory(),
  });

  // Build video options
  const videoOpts = {};
  if (compressOptions.width) videoOpts.width = compressOptions.width;
  if (compressOptions.height) videoOpts.height = compressOptions.height;
  if (compressOptions.width && compressOptions.height) videoOpts.fit = 'contain';

  // Bitrate
  if (compressOptions.videoBitrate) {
    if (typeof compressOptions.videoBitrate === 'string' && QUALITY_MAP[compressOptions.videoBitrate]) {
      videoOpts.bitrate = QUALITY_MAP[compressOptions.videoBitrate];
    } else if (typeof compressOptions.videoBitrate === 'number') {
      videoOpts.bitrate = compressOptions.videoBitrate;
    }
  }

  // GPU
  if (compressOptions.useGpu) {
    videoOpts.hardwareAcceleration = 'prefer-hardware';
  } else {
    videoOpts.hardwareAcceleration = 'prefer-software';
  }

  // Audio options
  const audioOpts = {};
  if (compressOptions.audioBitrateKbps) {
    audioOpts.bitrate = compressOptions.audioBitrateKbps * 1000;
  }

  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: Object.keys(videoOpts).length > 0 ? videoOpts : undefined,
    audio: Object.keys(audioOpts).length > 0 ? audioOpts : undefined,
  });

  if (signal) {
    signal.addEventListener('abort', () => conversion.cancel(), { once: true });
  }

  if (onProgress) {
    conversion.onProgress = (progress) => onProgress(progress);
  }

  try {
    await conversion.execute();
    const buffer = output.target.buffer;
    const blob = new Blob([buffer], { type: output.format.mimeType });
    return { blob, canceled: false };
  } catch (err) {
    if (err?.name === 'ConversionCanceledError' || err?.message?.includes('cancel')) {
      return { blob: null, canceled: true };
    }
    throw err;
  }
}

/**
 * Split/trim a file using MediaBunny
 * @param {File} file
 * @param {number} start - seconds
 * @param {number} end - seconds
 * @param {object} options
 */
export async function mbSplit(file, start, end, options = {}) {
  const inputExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const outputExt = options.outputFormat || (canHandleOutput(inputExt) ? inputExt : 'mp4');
  return mbConvert(file, outputExt, { ...options, trim: { start, end } });
}

/** Concatenate non-contiguous ranges. Conversion.trim only accepts one range. */
export async function mbMerge(file, ranges, outputFormat, options = {}) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let output;
  const checkCancel = () => { if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError'); };
  try {
    checkCancel();
    const format = OUTPUT_FORMAT_MAP[outputFormat]?.();
    if (!format) throw new Error(`Unsupported output format: ${outputFormat}`);
    output = new Output({ format, target: new BufferTarget() });
    const video = AUDIO_FORMATS.includes(outputFormat) ? null : await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    let videoSource, audioSource;
    if (video) {
      const [codec] = await getEncodableVideoCodecs(format.getSupportedVideoCodecs(), {
        width: video.displayWidth, height: video.displayHeight, bitrate: QUALITY_HIGH,
      });
      if (!codec) throw new Error('No compatible video encoder for this output format.');
      videoSource = new VideoSampleSource({ codec, bitrate: QUALITY_HIGH });
      output.addVideoTrack(videoSource);
    }
    if (audio) {
      const [codec] = await getEncodableAudioCodecs(format.getSupportedAudioCodecs(), {
        numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, bitrate: QUALITY_HIGH,
      });
      if (!codec) throw new Error('No compatible audio encoder for this output format.');
      audioSource = new AudioSampleSource({ codec, bitrate: QUALITY_HIGH });
      output.addAudioTrack(audioSource);
    }
    if (!videoSource && !audioSource) throw new Error('No compatible media track.');
    await output.start();
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const total = sorted.reduce((sum, r) => sum + r.end - r.start, 0);
    let offset = 0;
    for (const range of sorted) {
      checkCancel();
      const length = range.end - range.start;
      const copyVideo = async () => {
        if (!videoSource) return;
        for await (const sample of new VideoSampleSink(video).samples(range.start, range.end)) {
          try {
            checkCancel();
            const start = Math.max(range.start, sample.timestamp);
            const end = Math.min(range.end, sample.timestamp + sample.duration);
            if (end <= start) continue;
            sample.setTimestamp(offset + start - range.start);
            sample.setDuration(end - start);
            await videoSource.add(sample);
          } finally { sample.close(); }
        }
      };
      const copyAudio = async () => {
        if (!audioSource) return;
        for await (const sample of new AudioSampleSink(audio).samples(range.start, range.end)) {
          try {
            checkCancel();
            const first = Math.max(0, Math.round((range.start - sample.timestamp) * sample.sampleRate));
            const last = Math.min(sample.numberOfFrames, Math.round((range.end - sample.timestamp) * sample.sampleRate));
            if (last <= first) continue;
            const data = new Float32Array((last - first) * sample.numberOfChannels);
            sample.copyTo(data, { planeIndex: 0, format: 'f32', frameOffset: first, frameCount: last - first });
            const trimmed = new AudioSample({ data, format: 'f32', numberOfChannels: sample.numberOfChannels,
              sampleRate: sample.sampleRate, timestamp: offset + Math.max(0, sample.timestamp + first / sample.sampleRate - range.start) });
            try { await audioSource.add(trimmed); } finally { trimmed.close(); }
          } finally { sample.close(); }
        }
      };
      const results = await Promise.allSettled([copyVideo(), copyAudio()]);
      const failure = results.find(r => r.status === 'rejected');
      if (failure) throw failure.reason;
      offset += length;
      options.onProgress?.(offset / total);
    }
    checkCancel();
    await output.finalize();
    checkCancel();
    return { blob: new Blob([output.target.buffer], { type: format.mimeType }), canceled: false, engine: 'mediabunny' };
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
    if (options.signal?.aborted) return { blob: null, canceled: true, engine: 'mediabunny' };
    throw error;
  } finally { input.dispose(); }
}
