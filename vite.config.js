import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Optional module removal requires no edits to the media engine or feature states.
const vadPluginPath = resolve('src/optional/vad/build-plugin.js');
const optionalPlugins = existsSync(vadPluginPath) ? [(await import(pathToFileURL(vadPluginPath).href)).default()] : [];

export default defineConfig({
  base: '/yokinoKatto/',
  plugins: optionalPlugins,
  worker: { format: 'es' },
  server: {
    headers: {
      // Required for SharedArrayBuffer (ffmpeg.wasm)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
