// modules/engine.js — 引擎調度器
import { canHandleInput, canHandleOutput, mbConvert, mbCompress, mbSplit } from './mediabunnyEngine.js';
import { ffmpegConvert, ffmpegCompress, ffmpegSplit } from './ffmpegEngine.js';

/**
 * Determine which engine to use based on input/output formats
 * @param {string} inputExt
 * @param {string} outputExt
 * @returns {'mediabunny'|'ffmpeg'}
 */
export function pickEngine(inputExt, outputExt) {
  const inOk = canHandleInput(inputExt?.toLowerCase());
  const outOk = outputExt ? canHandleOutput(outputExt?.toLowerCase()) : true;
  return (inOk && outOk) ? 'mediabunny' : 'ffmpeg';
}

/**
 * Execute a conversion with automatic engine selection
 */
export async function executeConversion(file, outputFormat, options = {}) {
  const inputExt = file.name.split('.').pop()?.toLowerCase() || '';
  const engine = pickEngine(inputExt, outputFormat);
  options.engine = engine;

  if (engine === 'mediabunny') {
    return { ...(await mbConvert(file, outputFormat, options)), engine };
  } else {
    return { ...(await ffmpegConvert(file, outputFormat, options)), engine };
  }
}

/**
 * Execute compression with automatic engine selection
 */
export async function executeCompression(file, compressOptions, options = {}) {
  const inputExt = file.name.split('.').pop()?.toLowerCase() || '';
  const engine = pickEngine(inputExt, null);
  options.engine = engine;

  if (engine === 'mediabunny') {
    return { ...(await mbCompress(file, compressOptions, options)), engine };
  } else {
    // Convert MediaBunny options to ffmpeg options
    const ffOpts = {};
    if (compressOptions.height) ffOpts.height = compressOptions.height;
    if (compressOptions.videoBitrate && typeof compressOptions.videoBitrate === 'number') {
      ffOpts.videoBitrateKbps = Math.round(compressOptions.videoBitrate / 1000);
    }
    if (compressOptions.audioBitrateKbps) ffOpts.audioBitrateKbps = compressOptions.audioBitrateKbps;
    return { ...(await ffmpegCompress(file, ffOpts, options)), engine };
  }
}

/**
 * Execute split with automatic engine selection
 */
export async function executeSplit(file, start, end, options = {}) {
  const inputExt = file.name.split('.').pop()?.toLowerCase() || '';
  const engine = pickEngine(inputExt, options.outputFormat);
  options.engine = engine;

  if (engine === 'mediabunny') {
    return { ...(await mbSplit(file, start, end, options)), engine };
  } else {
    return { ...(await ffmpegSplit(file, start, end, options)), engine };
  }
}
