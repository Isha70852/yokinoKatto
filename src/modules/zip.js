// Stored ZIP entries: no compression or dependency; UTF-8 paths, ZIP32 limits.
const encoder = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
export async function createZip(entries, signal) {
  const chunks = [], directory = [];
  let offset = 0, directorySize = 0;
  if (entries.length > 65535) throw new Error('ZIP32 entry limit exceeded.');
  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    const name = encoder.encode(entry.path);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    if (name.length > 65535 || data.length >= 0xffffffff) throw new Error('ZIP32 size limit exceeded.');
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 255];
      if (i && i % 4194304 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
    const central = new Uint8Array(46), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    chunks.push(local, name, entry.blob); directory.push(central, name);
    offset += 30 + name.length + data.length; directorySize += 46 + name.length;
    if (offset + directorySize >= 0xffffffff) throw new Error('ZIP32 archive limit exceeded.');
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
