// Optional VAD assets only; discovered by config when this directory exists.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
export default function vadAssets() {
  const model = resolve('node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx');
  const runtime = resolve('node_modules/onnxruntime-web/dist');
  const files = new Map([['silero_vad_legacy.onnx', model]]);
  for (const name of readdirSync(runtime)) if (/^ort-wasm.*\.(wasm|mjs)$/.test(name)) files.set(name, resolve(runtime, name));
  return {
    name: 'optional-vad-assets',
    generateBundle() { for (const [name, path] of files) this.emitFile({ type: 'asset', fileName: `vad/${name}`, source: readFileSync(path) }); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url || '').split('?')[0]);
        const prefix = `${server.config.base}vad/`;
        if (!pathname.startsWith(prefix)) return next();
        const name = pathname.slice(prefix.length), path = files.get(name);
        if (!path) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream');
        res.end(readFileSync(path));
      });
    },
  };
}
