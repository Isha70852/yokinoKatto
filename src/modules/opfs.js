// modules/opfs.js — OPFS 暫存管理

let opfsRoot = null;

/** Initialize OPFS root directory */
export async function initOPFS() {
  try {
    if (navigator?.storage?.getDirectory) {
      opfsRoot = await navigator.storage.getDirectory();
      // Create a subdirectory for our app
      opfsRoot = await opfsRoot.getDirectoryHandle('mediaconvert2', { create: true });
    }
  } catch (err) {
    console.warn('OPFS init failed:', err);
    opfsRoot = null;
  }
  return !!opfsRoot;
}

/** Save a blob to OPFS */
export async function saveToOPFS(blob, filename) {
  if (!opfsRoot) return null;
  try {
    const fileHandle = await opfsRoot.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return fileHandle;
  } catch (err) {
    console.warn('OPFS save failed:', err);
    return null;
  }
}

/** Read a file from OPFS as a Blob */
export async function readFromOPFS(filename) {
  if (!opfsRoot) return null;
  try {
    const fileHandle = await opfsRoot.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file;
  } catch (err) {
    console.warn('OPFS read failed:', err);
    return null;
  }
}

/** Remove a file from OPFS */
export async function removeFromOPFS(filename) {
  if (!opfsRoot) return;
  try {
    await opfsRoot.removeEntry(filename);
  } catch (err) {
    // File may not exist
  }
}

/** Clear all OPFS files */
export async function clearAllOPFS() {
  if (!opfsRoot) return;
  try {
    for await (const [name] of opfsRoot.entries()) {
      try { await opfsRoot.removeEntry(name); } catch {}
    }
  } catch (err) {
    console.warn('OPFS clear failed:', err);
  }
}
