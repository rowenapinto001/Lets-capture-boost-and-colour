/* Capture Store
   Keeps screenshot payloads on the extension origin in IndexedDB so large
   full-page captures do not overflow chrome.storage.local. */

var CaptureStore = (() => {
  const DB_NAME = 'lcbc-capture-store';
  const DB_VERSION = 1;
  const STORE_NAME = 'captures';
  const MAX_RECORDS = 8;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is unavailable in this browser context.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open capture storage.'));
    });
  }

  function transaction(storeMode, callback) {
    return openDatabase().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, storeMode);
      const store = tx.objectStore(STORE_NAME);
      let callbackResult;

      tx.oncomplete = () => {
        db.close();
        resolve(callbackResult);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Capture storage transaction failed.'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error('Capture storage transaction was aborted.'));
      };

      callbackResult = callback(store);
    }));
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Capture storage request failed.'));
    });
  }

  function createId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `capture-${Date.now()}-${random}`;
  }

  function stripDataUrls(capture) {
    if (!capture) return null;
    const metadata = { ...capture };
    delete metadata.dataUrl;
    if (Array.isArray(metadata.parts)) {
      metadata.parts = metadata.parts.map(part => {
        const partMeta = { ...part };
        delete partMeta.dataUrl;
        return partMeta;
      });
    }
    return metadata;
  }

  function captureByteEstimate(capture) {
    if (!capture) return 0;
    if (capture.multiPart && Array.isArray(capture.parts)) {
      return capture.parts.reduce((sum, part) => sum + estimateDataUrlBytes(part.dataUrl), 0);
    }
    return estimateDataUrlBytes(capture.dataUrl);
  }

  function estimateDataUrlBytes(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    const base64 = dataUrl.split(',')[1] || '';
    return Math.round(base64.length * 0.75);
  }

  async function pruneOldCaptures(keepId) {
    const records = await transaction('readonly', (store) => requestToPromise(store.getAll()));
    const oldRecords = records
      .filter(record => record.id !== keepId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(MAX_RECORDS - 1);

    if (!oldRecords.length) return;
    await transaction('readwrite', (store) => {
      oldRecords.forEach(record => store.delete(record.id));
    });
  }

  async function saveCapture(capture) {
    const id = createId();
    const createdAt = Date.now();
    const metadata = stripDataUrls(capture);
    const bytes = captureByteEstimate(capture);

    await transaction('readwrite', (store) => {
      store.put({ id, createdAt, capture, metadata, bytes });
    });
    pruneOldCaptures(id).catch(e => console.warn('[CaptureStore] prune failed', e));

    return {
      stored: true,
      captureId: id,
      createdAt,
      bytes,
      ...metadata
    };
  }

  async function loadCapture(id) {
    if (!id) return null;
    const record = await transaction('readonly', (store) => requestToPromise(store.get(id)));
    return record ? record.capture : null;
  }

  async function resolvePendingCapture(pendingCapture) {
    if (!pendingCapture) return null;
    if (pendingCapture.stored && pendingCapture.captureId) {
      return loadCapture(pendingCapture.captureId);
    }
    return pendingCapture;
  }

  async function deleteCapture(id) {
    if (!id) return;
    await transaction('readwrite', (store) => {
      store.delete(id);
    });
  }

  async function deletePendingCapture(pendingCapture) {
    if (pendingCapture?.stored && pendingCapture.captureId) {
      await deleteCapture(pendingCapture.captureId);
    }
  }

  return {
    saveCapture,
    loadCapture,
    resolvePendingCapture,
    deleteCapture,
    deletePendingCapture,
    stripDataUrls,
    estimateDataUrlBytes
  };
})();

if (typeof globalThis !== 'undefined') {
  globalThis.CaptureStore = CaptureStore;
}

if (typeof module !== 'undefined') {
  module.exports = CaptureStore;
}
