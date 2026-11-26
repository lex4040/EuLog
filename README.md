# EuLog

A private, offline-capable Progressive Web App (PWA) for daily food logging, daily supplements, and **Weekly Vital Nutrients** tracking — featuring a custom pink line-art chef hat icon, **320 curated USDA & local Greek foods**, and **100% on-device SigLIP photo recognition**.

**Live site:** [https://lex4040.github.io/EuLog/](https://lex4040.github.io/EuLog/)

## Features

- **320 USDA & Local Greek Foods (`foods-db.js`)** — Curated USDA FoodData Central foods plus a dedicated **Greek & Med** category (60 authentic local Greek dishes: gyros, souvlaki, moussaka, pastitsio, gemista, spanakopita, tiropita, bougatsa, koulouri, dakos, horiatiki, horta, tzatziki, fava, dolmadakia, saganaki, halloumi, grilled octopus, tsipoura, lavraki, freddo espresso/cappuccino, baklava, loukoumades, and more) with per-serving macros and 14 micronutrients.
- **Ultra-Light On-Device SigLIP Photo Recognition (`siglip-vision.js`, `siglip-worker.js`, `siglip-embeddings.js`)** — Uses a low-bandwidth (`320×320 @ 15fps`) in-app **Live Camera** that snaps a `224×224` (`200 KB`) center-crop and immediately stops the camera hardware before running the ~60 MB quantized `SiglipVisionModel` (`q4`) in a background Web Worker against precomputed 768-dim SigLIP embeddings for all 320 foods. Photos never leave your device.
- **Daily Supplements (`supplements.js`)** — Customizable daily stack grouped by timing (`Morning`, `With Meal`, `Evening`, `Anytime`), 13 evidence-based quick-add presets, streaks, and automatic nutrient contribution into your daily & weekly totals.
- **Weekly Vital Nutrients (`nutrients.js`)** — Rolling 7-day adequacy tracker across 13 vital nutrients (Vitamins A, C, D, E, K, B12, Folate; Minerals Iron, Calcium, Magnesium, Potassium, Zinc; Omega-3), `Food + Supplements` vs `Food Only` toggle, 7-day consistency strips, Weekly Vital Score, and one-tap USDA food recommendations for your top weekly gaps.
- **Offline PWA & Themes** — Blush Light, AMOLED True-Black Dark, and Warm Paper themes; swipeable daily sheet; JSON backup/restore & CSV export; installable on Android and iOS with custom pink line-art chef hat icons.

## Local Preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
