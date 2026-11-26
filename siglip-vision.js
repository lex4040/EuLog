/* ==========================================================================
   EuLog — On-Device SigLIP Food Photo Recognition Engine (v2 Mobile-Safe)
   1. Hardware-downscales phone camera photos (even 50MP/200MP) to <= 256px
      using createImageBitmap BEFORE decoding pixels (prevents mobile OOM!).
   2. Runs ONLY the lightweight ~60 MB SiglipVisionModel (q4) inside a
      dedicated Web Worker (siglip-worker.js) — never freezes or reloads tab!
   3. Matches the 768-dim image embedding against precomputed SigLIP text
      embeddings for ALL 260 USDA foods in <1 ms via cosine similarity.
   4. Gracefully falls back to offline visual matching if offline before cache.
   ========================================================================== */

(function (global) {
  'use strict';

  const MODEL_ID = 'Xenova/siglip-base-patch16-224';

  let worker = null;
  let workerSeq = 0;
  let activeDevice = 'wasm';
  let modelStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'fallback'
  let decodedEmbCache = null;

  const pendingJobs = new Map();

  function getDecodedEmbeddings() {
    if (decodedEmbCache) return decodedEmbCache;
    const raw = global.EuLogSiglipEmbeddings;
    if (!raw || !raw.vectorsB64 || !raw.ids) return null;

    const bin = atob(raw.vectorsB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    const int8 = new Int8Array(bytes.buffer);
    decodedEmbCache = {
      dim: raw.dim,
      ids: raw.ids,
      scales: raw.scales,
      int8,
    };
    return decodedEmbCache;
  }

  function ensureWorker(onProgress) {
    if (worker) {
      worker._onProgress = onProgress;
      return worker;
    }
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers unavailable');
    }

    const w = new Worker('./siglip-worker.js', { type: 'module' });
    w._onProgress = onProgress;

    w.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'progress') {
        if (msg.stage === 'ready') modelStatus = 'ready';
        w._onProgress?.(msg);
        return;
      }
      const job = pendingJobs.get(msg.id);
      if (!job) return;
      pendingJobs.delete(msg.id);
      if (msg.type === 'error') {
        job.reject(new Error(msg.message || 'SigLIP worker error'));
      } else {
        if (msg.device) activeDevice = msg.device;
        modelStatus = 'ready';
        job.resolve(msg);
      }
    };

    w.onerror = (err) => {
      const errorObj = new Error(err?.message || 'SigLIP worker failed to start');
      for (const [, job] of pendingJobs) job.reject(errorObj);
      pendingJobs.clear();
      worker = null;
      modelStatus = 'fallback';
    };

    worker = w;
    return w;
  }

  function postWorkerJob(payload, transfer, onProgress) {
    const w = ensureWorker(onProgress);
    const id = ++workerSeq;
    return new Promise((resolve, reject) => {
      pendingJobs.set(id, { resolve, reject });
      w.postMessage({ ...payload, id }, transfer || []);
    });
  }

  async function ensureModelLoaded(onProgress) {
    modelStatus = 'loading';
    const res = await postWorkerJob({ type: 'preload' }, [], onProgress);
    activeDevice = res.device || activeDevice;
    modelStatus = 'ready';
    return res;
  }

  /**
   * Memory-safe downscale from File/Blob OR HTMLVideoElement/HTMLCanvasElement
   * straight to a compact <= 256px canvas + tiny JPEG preview data URL.
   * Avoids reading huge 50MP/200MP camera images into base64 strings!
   */
  async function prepareCompactFrame(source, maxSide = 256) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (source instanceof HTMLVideoElement) {
      const vw = source.videoWidth || 640;
      const vh = source.videoHeight || 480;
      const scale = Math.min(1, maxSide / Math.max(vw, vh));
      canvas.width = Math.max(1, Math.round(vw * scale));
      canvas.height = Math.max(1, Math.round(vh * scale));
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    } else if (source instanceof Blob) {
      let bitmap = null;
      try {
        if (typeof createImageBitmap === 'function') {
          try {
            // Native hardware resize before full bitmap allocation (critical for Galaxy S25 200MP / iPhone HEIC)
            bitmap = await createImageBitmap(source, {
              resizeWidth: maxSide,
              resizeQuality: 'medium',
            });
          } catch {
            bitmap = await createImageBitmap(source);
          }
          const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }
      } finally {
        if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      }

      if (canvas.width === 0 || canvas.height === 0) {
        const objUrl = URL.createObjectURL(source);
        try {
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
              canvas.width = Math.max(1, Math.round(img.width * scale));
              canvas.height = Math.max(1, Math.round(img.height * scale));
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve();
            };
            img.onerror = () => reject(new Error('Could not decode photo'));
            img.src = objUrl;
          });
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      }
    } else if (typeof source === 'string') {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve();
        };
        img.onerror = () => reject(new Error('Could not decode image URL'));
        img.src = source;
      });
    } else {
      throw new Error('Unsupported photo source');
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const previewUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { canvas, imageData, previewUrl, width: canvas.width, height: canvas.height };
  }

  function scoreAgainstPrecomputedEmbeddings(imageVec, foods) {
    const emb = getDecodedEmbeddings();
    if (!emb || emb.dim !== imageVec.length) return null;

    const byId = Object.create(null);
    for (const f of foods) byId[f.id] = f;

    const { dim, ids, scales, int8 } = emb;
    const rawDots = [];

    for (let i = 0; i < ids.length; i += 1) {
      const food = byId[ids[i]];
      if (!food) continue;
      const base = i * dim;
      const scale = scales[i];
      let dot = 0;
      for (let d = 0; d < dim; d += 1) {
        dot += imageVec[d] * (int8[base + d] * scale);
      }
      rawDots.push({ food, dot });
    }

    rawDots.sort((a, b) => b.dot - a.dot);

    // Calibrated temperature softmax over top 12 candidates for intuitive display confidence
    // while preserving exact SigLIP cosine ranking across all 260 foods.
    const top12 = rawDots.slice(0, 12);
    const maxDot = top12[0]?.dot ?? 0;
    const temp = 28; // SigLIP cosine margin sharpening
    let sumExp = 0;
    const exps = top12.map((item) => {
      const e = Math.exp((item.dot - maxDot) * temp);
      sumExp += e;
      return e;
    });

    return top12.slice(0, 8).map((item, idx) => ({
      food: item.food,
      score: exps[idx] / Math.max(1e-9, sumExp),
      cosine: item.dot,
    }));
  }

  function analyzeOfflineVisualHints(canvas, foods, topK = 8) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = canvas;
    const sx = Math.floor(width * 0.15);
    const sy = Math.floor(height * 0.15);
    const sw = Math.max(1, Math.floor(width * 0.7));
    const sh = Math.max(1, Math.floor(height * 0.7));
    const data = ctx.getImageData(sx, sy, sw, sh).data;

    const buckets = {
      green: 0, red: 0, orange: 0, yellow: 0, brown: 0, white: 0, purple: 0, pink: 0, amber: 0,
    };
    let total = 0;

    for (let i = 0; i < data.length; i += 16) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const s = max === 0 ? 0 : d / max;
      const v = max;
      total += 1;

      if (s < 0.16 && v > 0.72) {
        buckets.white += 1;
        continue;
      }
      if (v < 0.25) {
        buckets.brown += 0.7;
        buckets.purple += 0.3;
        continue;
      }

      let h = 0;
      if (d > 0) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
      }

      if (h >= 65 && h < 165) buckets.green += 1;
      else if (h >= 42 && h < 65) buckets.yellow += 1;
      else if (h >= 24 && h < 42) {
        if (v < 0.58) buckets.brown += 1;
        else if (s < 0.45) buckets.amber += 1;
        else buckets.orange += 1;
      } else if (h >= 10 && h < 24) {
        if (v < 0.5) buckets.brown += 1;
        else buckets.orange += 1;
      } else if (h >= 335 || h < 10) {
        if (s < 0.55 && v > 0.65) buckets.pink += 1;
        else buckets.red += 1;
      } else if (h >= 260 && h < 335) {
        if (v > 0.62) buckets.pink += 1;
        else buckets.purple += 1;
      } else {
        buckets.white += 0.4;
      }
    }

    const norm = Math.max(1, total);
    const ranked = foods.map((food) => {
      const ratio = (buckets[food.colorHint] || 0) / norm;
      const everydayBoost = ['Meals & Drinks', 'Fruits', 'Vegetables', 'Meat & Eggs', 'Seafood'].includes(
        food.category
      )
        ? 0.08
        : 0.02;
      return { food, score: Math.min(0.89, Math.max(0.08, ratio * 1.45 + everydayBoost)) };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, topK);
  }

  /**
   * Recognize foods from a File/Blob, live <video>, or data URL against ALL 260 USDA foods.
   */
  async function recognizeFoodPhoto(source, foods, onProgress) {
    const start = performance.now();
    const list = foods && foods.length ? foods : (global.EuLogFoods?.USDA_FOODS || []);

    onProgress?.({ stage: 'prep', pct: 4, text: 'Preparing compact photo frame…' });
    const frame = await prepareCompactFrame(source, 256);

    try {
      const rgbaCopy = new Uint8ClampedArray(frame.imageData.data);
      const res = await postWorkerJob(
        { type: 'embed', rgba: rgbaCopy.buffer, width: frame.width, height: frame.height },
        [rgbaCopy.buffer],
        onProgress
      );

      onProgress?.({
        stage: 'rank',
        pct: 97,
        text: `Matching against all ${list.length} USDA foods…`,
      });

      const imageVec = new Float32Array(res.embedding);
      const ranked = scoreAgainstPrecomputedEmbeddings(imageVec, list);
      if (!ranked || ranked.length === 0) {
        throw new Error('Precomputed SigLIP embeddings not loaded');
      }

      onProgress?.({ stage: 'done', pct: 100, text: `Matched across all ${list.length} USDA foods` });

      return {
        engine: 'siglip',
        modelId: MODEL_ID,
        device: res.device || activeDevice,
        previewUrl: frame.previewUrl,
        totalFoods: list.length,
        elapsedMs: Math.round(performance.now() - start),
        results: ranked,
      };
    } catch (err) {
      console.warn('SigLIP vision worker unavailable, using offline fallback:', err);
      const fallbackResults = analyzeOfflineVisualHints(frame.canvas, list, 8);
      onProgress?.({
        stage: 'fallback',
        pct: 100,
        text: 'Offline visual quick-match used (connect once to cache SigLIP Vision)',
      });
      return {
        engine: 'offline-fallback',
        modelId: MODEL_ID,
        device: 'canvas',
        previewUrl: frame.previewUrl,
        totalFoods: list.length,
        error: err?.message || 'Could not load SigLIP Vision model',
        elapsedMs: Math.round(performance.now() - start),
        results: fallbackResults,
      };
    }
  }

  function getStatus() {
    return {
      status: modelStatus,
      modelId: MODEL_ID,
      device: activeDevice,
    };
  }

  global.EuLogVision = {
    MODEL_ID,
    prepareCompactFrame,
    ensureModelLoaded,
    recognizeFoodPhoto,
    getStatus,
  };
})(window);
