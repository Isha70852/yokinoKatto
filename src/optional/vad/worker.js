import { NonRealTimeVAD } from '@ricky0123/vad-web/dist/non-real-time-vad.js';
self.onmessage = async ({ data }) => {
  try {
    const { audio, duration, settings, assetBase } = data;
    const positiveSpeechThreshold = 0.8 - 0.65 * settings.sensitivity;
    const vad = await NonRealTimeVAD.new({
      modelURL: `${assetBase}silero_vad_legacy.onnx`,
      positiveSpeechThreshold, negativeSpeechThreshold: Math.max(0.01, positiveSpeechThreshold - 0.15),
      minSpeechMs: settings.minimum * 1000, redemptionMs: 96, preSpeechPadMs: 0,
      ortConfig: ort => { ort.env.wasm.wasmPaths = assetBase; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; },
    });
    const ranges = [];
    // run() returns milliseconds in 0.0.31. End includes the 96 ms redemption frame.
    for await (const speech of vad.run(audio, 16000)) {
      const start = Math.max(0, speech.start / 1000), end = Math.min(duration, speech.end / 1000 - 0.096);
      if (end > start && end - start >= settings.minimum) ranges.push({ start, end });
      self.postMessage({ progress: Math.min(1, speech.end / 1000 / duration) });
    }
    const merged = [];
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (previous && range.start - previous.end <= settings.gap) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
    }
    // Padding must not undo separate speech detections. Share gaps at their midpoint.
    const padded = merged.map((range, index) => {
      const previous = merged[index - 1], next = merged[index + 1];
      const lower = previous ? (previous.end + range.start) / 2 : 0;
      const upper = next ? (range.end + next.start) / 2 : duration;
      return { start: Math.max(lower, range.start - settings.padding), end: Math.min(upper, range.end + settings.padding) };
    });
    self.postMessage({ ranges: padded });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
};
