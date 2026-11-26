# EuLog

A private, offline-capable Progressive Web App (PWA) for daily food logging, daily supplements, and **Weekly Vital Nutrients** tracking — featuring a custom pink line-art chef hat icon, **153 curated USDA FoodData Central foods**, and **100% on-device SigLIP photo recognition**.

**Live site:** [https://lex4040.github.io/EuLog/](https://lex4040.github.io/EuLog/)

## Features

- **153 USDA Foods Library (`foods-db.js`)** — Curated USDA FoodData Central foods across 10 categories with per-serving calories, macros (protein, carbs, fat, fiber, sugar), and 14 micronutrients, plus instant search, favorites, nutrient-density sorting, and custom food creation.
- **On-Device SigLIP Photo Recognition (`siglip-vision.js`)** — Runs quantized `Xenova/siglip-base-patch16-224` directly in your browser via Transformers.js v3 (WebGPU with automatic WASM fallback). Photos never leave your device, weights are cached locally after first load, and an offline visual quick-match fallback keeps photo logging smooth even without a connection.
- **Daily Supplements (`supplements.js`)** — Customizable daily stack grouped by timing (`Morning`, `With Meal`, `Evening`, `Anytime`), 13 evidence-based quick-add presets, streaks, and automatic nutrient contribution into your daily & weekly totals.
- **Weekly Vital Nutrients (`nutrients.js`)** — Rolling 7-day adequacy tracker across 13 vital nutrients (Vitamins A, C, D, E, K, B12, Folate; Minerals Iron, Calcium, Magnesium, Potassium, Zinc; Omega-3), `Food + Supplements` vs `Food Only` toggle, 7-day consistency strips, Weekly Vital Score, and one-tap USDA food recommendations for your top weekly gaps.
- **Offline PWA & Themes** — Blush Light, AMOLED True-Black Dark, and Warm Paper themes; swipeable daily sheet; JSON backup/restore & CSV export; installable on Android and iOS with custom pink line-art chef hat icons.

## Local Preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
