/* ==========================================================================
   EuLog — Dedicated Web Worker for On-Device SigLIP Vision Encoder
   Runs Xenova/siglip-base-patch16-224 vision-only (dtype: 'q4', ~60 MB)
   completely off the main UI thread so mobile browsers stay smooth and never
   freeze or reload during photo recognition.
   ========================================================================== */

const MODEL_ID = 'Xenova/siglip-base-patch16-224';
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';

let processor = null;
let visionModel = null;
let activeDevice = 'wasm';
let loadPromise = null;

async function detectDevice() {
  try {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // Fall back to WASM
  }
  return 'wasm';
}

async function ensureVisionLoaded() {
  if (processor && visionModel) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    self.postMessage({ type: 'progress', stage: 'init', pct: 6, text: 'Starting on-device SigLIP vision worker…' });

    const timeoutMs = typeof navigator !== 'undefined' && navigator.onLine === false ? 3500 : 12000;
    const importWithTimeout = (url, ms = timeoutMs) =>
      Promise.race([
        import(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SigLIP CDN timed out')), ms)),
      ]);

    const { AutoProcessor, SiglipVisionModel, RawImage, env } = await importWithTimeout(TRANSFORMERS_CDN, timeoutMs);
    self._RawImage = RawImage;

    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // Keep WASM memory footprint lean on mobile phones (Galaxy S25 / iPhone Safari)
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
    }

    const preferredDevice = await detectDevice();
    activeDevice = preferredDevice;

    const fileProgress = Object.create(null);
    const progress_callback = (info) => {
      if (!info) return;
      if (info.status === 'progress' && info.file) {
        fileProgress[info.file] = typeof info.progress === 'number' ? info.progress : 0;
        const vals = Object.values(fileProgress);
        const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        const pct = Math.min(84, Math.max(10, Math.round(avg * 0.8)));
        self.postMessage({
          type: 'progress',
          stage: 'download',
          pct,
          text: `Downloading SigLIP Vision (${activeDevice.toUpperCase()}, ~60 MB)… ${Math.round(avg)}%`,
        });
      }
    };

    processor = await AutoProcessor.from_pretrained(MODEL_ID);

    try {
      visionModel = await SiglipVisionModel.from_pretrained(MODEL_ID, {
        device: preferredDevice,
        dtype: preferredDevice === 'webgpu' ? 'q4f16' : 'q4',
        progress_callback,
      });
    } catch (gpuErr) {
      if (preferredDevice === 'webgpu') {
        activeDevice = 'wasm';
        self.postMessage({ type: 'progress', stage: 'init', pct: 12, text: 'Switching SigLIP Vision to WASM…' });
        visionModel = await SiglipVisionModel.from_pretrained(MODEL_ID, {
          device: 'wasm',
          dtype: 'q4',
          progress_callback,
        });
      } else {
        throw gpuErr;
      }
    }

    self.postMessage({ type: 'progress', stage: 'ready', pct: 88, text: 'SigLIP Vision ready on device' });
  })();

  try {
    await loadPromise;
  } catch (err) {
    loadPromise = null;
    processor = null;
    visionModel = null;
    throw err;
  }
}

self.onmessage = async (event) => {
  const { id, type, rgba, width, height } = event.data || {};
  try {
    if (type === 'preload') {
      await ensureVisionLoaded();
      self.postMessage({ id, type: 'preloaded', device: activeDevice });
      return;
    }

    if (type === 'embed') {
      await ensureVisionLoaded();
      self.postMessage({ type: 'progress', stage: 'infer', pct: 92, text: 'Extracting visual features with SigLIP…' });

      const RawImage = self._RawImage;
      const rawImg = new RawImage(new Uint8ClampedArray(rgba), width, height, 4);
      const inputs = await processor(rawImg);
      const out = await visionModel(inputs);

      const raw = out.pooler_output.data;
      const vec = new Float32Array(raw.length);
      let normSq = 0;
      for (let i = 0; i < raw.length; i += 1) {
        const v = raw[i];
        normSq += v * v;
      }
      const invNorm = 1 / Math.sqrt(normSq || 1);
      for (let i = 0; i < raw.length; i += 1) {
        vec[i] = raw[i] * invNorm;
      }

      self.postMessage(
        { id, type: 'embedded', device: activeDevice, embedding: vec.buffer },
        [vec.buffer]
      );
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) });
  }
};
