/* ==========================================================================
   EuLog — Cross-Browser Offline 1D Barcode Scanner (EAN-13, EAN-8, UPC-A)
   - Works natively on iPhone / iOS Safari, Android Chrome, Firefox & Desktop
     even when window.BarcodeDetector is unavailable.
   - Uses adaptive local thresholding + ZXing-style normalized run-length
     matching across horizontal, tilted, vertical & reversed scanlines,
     protected by EAN/UPC parity + Modulo-10 checksum verification.
   - Zero external dependencies, 100% offline.
   ========================================================================== */

(function (global) {
  'use strict';

  // Run-length patterns for digits 0..9 (sum = 7 modules each)
  // L-codes: Space-Bar-Space-Bar (left odd parity)
  // R-codes: Bar-Space-Bar-Space (same run lengths as L-codes!)
  const L_PATTERNS = [
    [3, 2, 1, 1], // 0
    [2, 2, 2, 1], // 1
    [2, 1, 2, 2], // 2
    [1, 4, 1, 1], // 3
    [1, 1, 3, 2], // 4
    [1, 2, 3, 1], // 5
    [1, 1, 1, 4], // 6
    [1, 3, 1, 2], // 7
    [1, 2, 1, 3], // 8
    [3, 1, 1, 2], // 9
  ];

  // G-codes: Space-Bar-Space-Bar (left even parity = reversed L-codes)
  const G_PATTERNS = L_PATTERNS.map((p) => [p[3], p[2], p[1], p[0]]);

  // Combined 20 left patterns (0..9 = L, 10..19 = G)
  const LG_PATTERNS = [...L_PATTERNS, ...G_PATTERNS];

  // First digit encoded by 6-bit L/G parity pattern of left 6 digits
  const FIRST_DIGIT_BY_PARITY = {
    LLLLLL: '0',
    LLGLGG: '1',
    LLGGLG: '2',
    LLGGGL: '3',
    LGLLGG: '4',
    LGGLLG: '5',
    LGGGLL: '6',
    LGLGLG: '7',
    LGLGGL: '8',
    LGGLGL: '9',
  };

  const MAX_AVG_VARIANCE = 0.48;
  const MAX_INDIVIDUAL_VARIANCE = 0.72;

  function isValidEan13(code) {
    if (!/^\d{13}$/.test(code)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += (code.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === code.charCodeAt(12) - 48;
  }

  function isValidEan8(code) {
    if (!/^\d{8}$/.test(code)) return false;
    let sum = 0;
    for (let i = 0; i < 7; i += 1) {
      sum += (code.charCodeAt(i) - 48) * (i % 2 === 0 ? 3 : 1);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === code.charCodeAt(7) - 48;
  }

  function patternVariance(counters, offset, pattern, maxIndividual) {
    const len = pattern.length;
    let total = 0;
    let patternSum = 0;
    for (let i = 0; i < len; i += 1) {
      total += counters[offset + i];
      patternSum += pattern[i];
    }
    if (total < patternSum) return Infinity;
    const unitWidth = total / patternSum;
    const limit = maxIndividual * unitWidth;
    let totalVar = 0;
    for (let i = 0; i < len; i += 1) {
      const scaled = pattern[i] * unitWidth;
      const diff = Math.abs(counters[offset + i] - scaled);
      if (diff > limit) return Infinity;
      totalVar += diff;
    }
    return totalVar / total;
  }

  function matchDigit(counters, offset, patterns) {
    let bestVar = MAX_AVG_VARIANCE;
    let bestIdx = -1;
    for (let i = 0; i < patterns.length; i += 1) {
      const v = patternVariance(counters, offset, patterns[i], MAX_INDIVIDUAL_VARIANCE);
      if (v < bestVar) {
        bestVar = v;
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? { idx: bestIdx, variance: bestVar } : null;
  }

  /**
   * Convert a grayscale luminance scanline into alternating [white, black, white, black, ...]
   * run-lengths using adaptive local mean thresholding (handles shadows & uneven glare).
   */
  function binarizeLineToRuns(luma, len, bias = 6) {
    const win = Math.max(12, Math.min(48, Math.round(len / 14)));
    // Prefix sums for O(N) local window mean
    const prefix = new Float32Array(len + 1);
    for (let i = 0; i < len; i += 1) {
      prefix[i + 1] = prefix[i] + luma[i];
    }

    const runs = [];
    let isDark = false; // Always start index 0 as white/light run (even indices = light, odd = dark)
    let count = 0;

    for (let i = 0; i < len; i += 1) {
      const lo = i - win < 0 ? 0 : i - win;
      const hi = i + win >= len ? len - 1 : i + win;
      const localMean = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
      const dark = luma[i] < localMean - bias;
      if (dark === isDark) {
        count += 1;
      } else {
        runs.push(count);
        isDark = dark;
        count = 1;
      }
    }
    runs.push(count);
    return runs;
  }

  const GUARD_3 = [1, 1, 1];
  const GUARD_5 = [1, 1, 1, 1, 1];

  function decodeRunsEan13(runs) {
    // Structure starting at dark run index `s` (odd index):
    // Start guard (3): s..s+2 (B,W,B)
    // Left 6 digits (24): s+3..s+26 (6 * [W,B,W,B])
    // Center guard (5): s+27..s+31 (W,B,W,B,W)
    // Right 6 digits (24): s+32..s+55 (6 * [B,W,B,W])
    // End guard (3): s+56..s+58 (B,W,B)
    // Total: 59 runs!
    const limit = runs.length - 59;
    if (limit < 1) return null;

    let bestResult = null;

    for (let s = 1; s <= limit; s += 2) {
      // Quick check start guard (B, W, B)
      const startVar = patternVariance(runs, s, GUARD_3, 0.85);
      if (startVar > 0.45) continue;

      // Quiet zone before start guard should be at least ~2.5 modules wide
      const estModule = (runs[s] + runs[s + 1] + runs[s + 2]) / 3;
      if (runs[s - 1] < estModule * 2.2) continue;

      // Quick check center guard (W, B, W, B, W)
      const midVar = patternVariance(runs, s + 27, GUARD_5, 0.85);
      if (midVar > 0.48) continue;

      // Quick check end guard (B, W, B)
      const endVar = patternVariance(runs, s + 56, GUARD_3, 0.85);
      if (endVar > 0.45) continue;

      // Quiet zone after end guard (if present)
      if (s + 59 < runs.length && runs[s + 59] < estModule * 2.0) continue;

      let parityStr = '';
      let digits = '';
      let varSum = startVar + midVar + endVar;
      let ok = true;

      // Decode 6 left digits (L or G)
      for (let d = 0; d < 6; d += 1) {
        const m = matchDigit(runs, s + 3 + d * 4, LG_PATTERNS);
        if (!m) {
          ok = false;
          break;
        }
        if (m.idx < 10) {
          parityStr += 'L';
          digits += String(m.idx);
        } else {
          parityStr += 'G';
          digits += String(m.idx - 10);
        }
        varSum += m.variance;
      }
      if (!ok) continue;

      const firstDigit = FIRST_DIGIT_BY_PARITY[parityStr];
      if (!firstDigit) continue;

      // Decode 6 right digits (R = L run lengths)
      for (let d = 0; d < 6; d += 1) {
        const m = matchDigit(runs, s + 32 + d * 4, L_PATTERNS);
        if (!m) {
          ok = false;
          break;
        }
        digits += String(m.idx);
        varSum += m.variance;
      }
      if (!ok) continue;

      const code = firstDigit + digits;
      if (!isValidEan13(code)) continue;

      if (!bestResult || varSum < bestResult.score) {
        bestResult = { code, format: 'ean_13', score: varSum };
      }
    }

    return bestResult;
  }

  function decodeRunsEan8(runs) {
    // Start (3) + Left 4 (16) + Center (5) + Right 4 (16) + End (3) = 43 runs
    const limit = runs.length - 43;
    if (limit < 1) return null;

    let bestResult = null;
    for (let s = 1; s <= limit; s += 2) {
      const startVar = patternVariance(runs, s, GUARD_3, 0.85);
      if (startVar > 0.45) continue;

      const estModule = (runs[s] + runs[s + 1] + runs[s + 2]) / 3;
      if (runs[s - 1] < estModule * 2.2) continue;

      const midVar = patternVariance(runs, s + 19, GUARD_5, 0.85);
      if (midVar > 0.48) continue;

      const endVar = patternVariance(runs, s + 40, GUARD_3, 0.85);
      if (endVar > 0.45) continue;

      if (s + 43 < runs.length && runs[s + 43] < estModule * 2.0) continue;

      let digits = '';
      let varSum = startVar + midVar + endVar;
      let ok = true;

      for (let d = 0; d < 4; d += 1) {
        const m = matchDigit(runs, s + 3 + d * 4, L_PATTERNS);
        if (!m) {
          ok = false;
          break;
        }
        digits += String(m.idx);
        varSum += m.variance;
      }
      if (!ok) continue;

      for (let d = 0; d < 4; d += 1) {
        const m = matchDigit(runs, s + 24 + d * 4, L_PATTERNS);
        if (!m) {
          ok = false;
          break;
        }
        digits += String(m.idx);
        varSum += m.variance;
      }
      if (!ok) continue;

      if (!isValidEan8(digits)) continue;
      if (!bestResult || varSum < bestResult.score) {
        bestResult = { code: digits, format: 'ean_8', score: varSum };
      }
    }
    return bestResult;
  }

  function decodeScanline(luma, len, biases = [6, 14]) {
    // Try both normal and reversed (upside-down barcode)
    const rev = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) rev[i] = luma[len - 1 - i];

    for (let b = 0; b < biases.length; b += 1) {
      const bias = biases[b];
      const runsFwd = binarizeLineToRuns(luma, len, bias);
      const hitFwd = decodeRunsEan13(runsFwd) || decodeRunsEan8(runsFwd);
      if (hitFwd) return hitFwd;

      const runsRev = binarizeLineToRuns(rev, len, bias);
      const hitRev = decodeRunsEan13(runsRev) || decodeRunsEan8(runsRev);
      if (hitRev) return hitRev;
    }
    return null;
  }

  function sampleLine(rgba, width, height, x0, y0, x1, y1, outBuf) {
    const steps = outBuf.length;
    const dx = (x1 - x0) / (steps - 1);
    const dy = (y1 - y0) / (steps - 1);
    for (let i = 0; i < steps; i += 1) {
      const x = Math.max(0, Math.min(width - 1, Math.round(x0 + dx * i)));
      const y = Math.max(0, Math.min(height - 1, Math.round(y0 + dy * i)));
      const p = (y * width + x) * 4;
      // Fast Rec.601 luminance
      outBuf[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
    }
  }

  /**
   * Scan an RGBA ImageData buffer across horizontal, slightly tilted, and vertical lines.
   * Uses scanline consensus voting to eliminate false positives.
   */
  function decodeFromImageData(imageData, options = {}) {
    const { width, height, data } = imageData;
    if (width < 80 || height < 40) return null;

    const thorough = Boolean(options.thorough);
    const votes = new Map(); // code -> { count, bestScore, format }

    const recordHit = (hit) => {
      if (!hit) return;
      const cur = votes.get(hit.code) || { count: 0, bestScore: Infinity, format: hit.format };
      cur.count += 1;
      if (hit.score < cur.bestScore) cur.bestScore = hit.score;
      votes.set(hit.code, cur);
    };

    const horizBuf = new Uint8Array(width);
    const biases = thorough ? [6, 14, 2] : [7];

    // 1. Horizontal scanlines (concentrated in middle band, expanded in thorough mode)
    const numH = thorough ? 31 : 15;
    const yStart = thorough ? 0.1 : 0.22;
    const yEnd = thorough ? 0.9 : 0.78;
    for (let i = 0; i < numH; i += 1) {
      const frac = numH === 1 ? 0.5 : yStart + ((yEnd - yStart) * i) / (numH - 1);
      const y = Math.round(height * frac);
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        const p = rowOffset + x * 4;
        horizBuf[x] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
      }
      recordHit(decodeScanline(horizBuf, width, biases));
      // Early exit on strong consensus during live video
      if (!thorough) {
        for (const [code, info] of votes) {
          if (info.count >= 2) return { code, format: info.format, confidence: info.count };
        }
      }
    }

    // 2. Slightly tilted scanlines (-7° to +7°) for hand-held phone tilt
    const tilts = thorough ? [-0.14, -0.07, 0.07, 0.14] : [-0.08, 0.08];
    const tiltCenters = thorough ? [0.35, 0.5, 0.65] : [0.5];
    for (const cyFrac of tiltCenters) {
      for (const slope of tilts) {
        const cy = height * cyFrac;
        const dy = height * slope;
        sampleLine(data, width, height, 0, cy - dy, width - 1, cy + dy, horizBuf);
        recordHit(decodeScanline(horizBuf, width, biases));
      }
    }

    // 3. Vertical scanlines (for sideways/90°-rotated barcodes)
    const vertBuf = new Uint8Array(height);
    const numV = thorough ? 15 : 5;
    for (let i = 0; i < numV; i += 1) {
      const frac = 0.2 + (0.6 * i) / Math.max(1, numV - 1);
      const x = Math.round(width * frac);
      for (let y = 0; y < height; y += 1) {
        const p = (y * width + x) * 4;
        vertBuf[y] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
      }
      recordHit(decodeScanline(vertBuf, height, biases));
    }

    // Pick best voted code
    let winner = null;
    for (const [code, info] of votes) {
      if (
        !winner ||
        info.count > winner.count ||
        (info.count === winner.count && info.bestScore < winner.bestScore)
      ) {
        winner = { code, format: info.format, count: info.count, bestScore: info.bestScore };
      }
    }

    if (!winner) return null;
    // Require >= 2 scanline votes, or 1 very clean match in thorough single-photo mode
    if (winner.count >= 2 || (thorough && winner.bestScore < 2.2)) {
      return { code: winner.code, format: winner.format, confidence: winner.count };
    }
    return null;
  }

  let sharedCanvas = null;
  let sharedCtx = null;

  function getWorkCanvas(w, h) {
    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
      sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (sharedCanvas.width !== w || sharedCanvas.height !== h) {
      sharedCanvas.width = w;
      sharedCanvas.height = h;
    }
    return { canvas: sharedCanvas, ctx: sharedCtx };
  }

  /**
   * Decode a barcode from a live <video> frame.
   * Downscales cleanly to <= 960px wide for fast (<5 ms) mobile decoding.
   */
  function decodeFromVideo(video) {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
    const maxW = 960;
    const scale = Math.min(1, maxW / video.videoWidth);
    const w = Math.max(160, Math.round(video.videoWidth * scale));
    const h = Math.max(120, Math.round(video.videoHeight * scale));
    const { ctx } = getWorkCanvas(w, h);
    ctx.drawImage(video, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    return decodeFromImageData(imgData, { thorough: false });
  }

  /**
   * Decode a barcode from an uploaded File / Blob photo (works on iOS Safari camera/library).
   * Tries native BarcodeDetector first if available, then falls back to thorough JS decoder.
   */
  async function decodeFromFile(file) {
    if (!file) return null;

    // Prepare an ImageBitmap or HTMLImageElement scaled to <= 1280px (sharp enough for thin EAN bars)
    let drawable = null;
    let srcW = 0;
    let srcH = 0;
    let cleanup = () => {};

    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file);
        drawable = bmp;
        srcW = bmp.width;
        srcH = bmp.height;
        cleanup = () => bmp.close();
      } catch {
        drawable = null;
      }
    }

    if (!drawable) {
      const url = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to load barcode image'));
        el.src = url;
      });
      drawable = img;
      srcW = img.naturalWidth || img.width;
      srcH = img.naturalHeight || img.height;
      cleanup = () => URL.revokeObjectURL(url);
    }

    try {
      // Fast-path: native BarcodeDetector if supported (Chrome/Android/Edge)
      if ('BarcodeDetector' in global) {
        try {
          const detector = new global.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
          });
          const hits = await detector.detect(drawable);
          if (hits && hits.length > 0 && hits[0].rawValue) {
            return { code: String(hits[0].rawValue).trim(), format: hits[0].format || 'native' };
          }
        } catch {
          // fall through to built-in JS decoder
        }
      }

      // Built-in pure-JS decoder (try full-width 1200px, then 720px for noisy/blurred photos)
      const tryWidths = [1200, 720];
      for (const maxW of tryWidths) {
        const scale = Math.min(1, maxW / Math.max(srcW, srcH));
        const w = Math.max(160, Math.round(srcW * scale));
        const h = Math.max(120, Math.round(srcH * scale));
        const { ctx } = getWorkCanvas(w, h);
        ctx.drawImage(drawable, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const hit = decodeFromImageData(imgData, { thorough: true });
        if (hit) return hit;
      }
      return null;
    } finally {
      cleanup();
    }
  }

  global.EuLogBarcode = {
    isValidEan13,
    isValidEan8,
    decodeFromImageData,
    decodeFromVideo,
    decodeFromFile,
  };
})(window);
