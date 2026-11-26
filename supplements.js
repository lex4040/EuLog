/* ==========================================================================
   EuLog — Daily Supplements Catalog, Default Stack & Streak Tracker
   Every supplement carries its micronutrient contribution so checking it off
   updates both daily nutrition and Weekly Vital Nutrients automatically.
   ========================================================================== */

(function (global) {
  'use strict';

  const SUPPLEMENT_TIMINGS = ['Morning', 'With Meal', 'Evening', 'Anytime'];

  const DEFAULT_SUPPLEMENTS = [
    {
      id: 'supp-vit-d3',
      name: 'Vitamin D3',
      dose: '50 µg',
      timing: 'Morning',
      notes: 'Take with a meal containing healthy fats',
      nutrients: { vitD: 50 },
    },
    {
      id: 'supp-omega3',
      name: 'Omega-3 Fish Oil',
      dose: '1,000 mg EPA+DHA',
      timing: 'With Meal',
      notes: 'Supports brain, heart & inflammation balance',
      nutrients: { omega3: 1.0 },
    },
    {
      id: 'supp-mag-glycinate',
      name: 'Magnesium Glycinate',
      dose: '200 mg elemental',
      timing: 'Evening',
      notes: 'Gentle chelated form for sleep & recovery',
      nutrients: { magnesium: 200 },
    },
    {
      id: 'supp-vit-b12',
      name: 'Vitamin B12 (Methylcobalamin)',
      dose: '500 µg',
      timing: 'Morning',
      notes: 'Energy metabolism & nervous system',
      nutrients: { vitB12: 500 },
    },
    {
      id: 'supp-protein-scoop',
      name: 'Protein Scoop',
      dose: '1 scoop (30 g · 24 g protein)',
      timing: 'Anytime',
      notes: 'Whey or plant protein scoop · adds 24 g protein & 120 kcal',
      calories: 120,
      protein: 24,
      carbs: 3,
      fat: 1.5,
      fiber: 0.5,
      nutrients: { vitB12: 0.9, calcium: 130, magnesium: 25, potassium: 160, zinc: 0.6 },
    },
  ];

  const SUPPLEMENT_PRESETS = [
    {
      presetId: 'preset-protein-scoop',
      name: 'Protein Scoop',
      dose: '1 scoop (30 g · 24 g protein)',
      timing: 'Anytime',
      notes: 'Whey or plant protein scoop · adds 24 g protein & 120 kcal',
      calories: 120,
      protein: 24,
      carbs: 3,
      fat: 1.5,
      fiber: 0.5,
      nutrients: { vitB12: 0.9, calcium: 130, magnesium: 25, potassium: 160, zinc: 0.6 },
    },
    {
      presetId: 'preset-multi',
      name: 'Daily Multivitamin',
      dose: '1 capsule',
      timing: 'With Meal',
      notes: 'Balanced broad-spectrum daily micronutrient insurance',
      nutrients: {
        vitA: 450, vitC: 60, vitD: 20, vitE: 10, vitK: 40,
        vitB12: 6, folate: 400, iron: 9, calcium: 150,
        magnesium: 60, zinc: 11,
      },
    },
    {
      presetId: 'preset-vit-d3-k2',
      name: 'Vitamin D3 + K2',
      dose: '50 µg D3 + 90 µg K2',
      timing: 'Morning',
      notes: 'Synergistic bone & cardiovascular support',
      nutrients: { vitD: 50, vitK: 90 },
    },
    {
      presetId: 'preset-iron-c',
      name: 'Gentle Iron + Vitamin C',
      dose: '18 mg Iron + 60 mg Vit C',
      timing: 'Morning',
      notes: 'Vitamin C enhances non-heme iron absorption',
      nutrients: { iron: 18, vitC: 60 },
    },
    {
      presetId: 'preset-calcium',
      name: 'Calcium Citrate',
      dose: '500 mg',
      timing: 'With Meal',
      notes: 'Well-absorbed with or without food',
      nutrients: { calcium: 500 },
    },
    {
      presetId: 'preset-vit-c',
      name: 'Vitamin C',
      dose: '500 mg',
      timing: 'Morning',
      notes: 'Antioxidant & immune support',
      nutrients: { vitC: 500 },
    },
    {
      presetId: 'preset-zinc',
      name: 'Zinc Picolinate',
      dose: '15 mg',
      timing: 'With Meal',
      notes: 'Take with food to avoid stomach upset',
      nutrients: { zinc: 15 },
    },
    {
      presetId: 'preset-folate',
      name: 'Methylfolate (B9)',
      dose: '400 µg DFE',
      timing: 'Morning',
      notes: 'Bioavailable active folate form',
      nutrients: { folate: 400 },
    },
    {
      presetId: 'preset-b-complex',
      name: 'B-Complex',
      dose: '1 capsule',
      timing: 'Morning',
      notes: 'Full B-vitamin energy complex',
      nutrients: { vitB12: 50, folate: 400 },
    },
    {
      presetId: 'preset-electrolytes',
      name: 'Electrolyte Mix',
      dose: '1 packet',
      timing: 'Anytime',
      notes: 'Hydration minerals (potassium & magnesium)',
      nutrients: { potassium: 400, magnesium: 60 },
    },
    {
      presetId: 'preset-algae-omega',
      name: 'Algae Omega-3 (Vegan)',
      dose: '600 mg DHA+EPA',
      timing: 'With Meal',
      notes: 'Plant-based marine omega-3',
      nutrients: { omega3: 0.6 },
    },
    {
      presetId: 'preset-creatine',
      name: 'Creatine Monohydrate',
      dose: '5 g',
      timing: 'Anytime',
      notes: 'Strength, muscle & cognitive support',
      nutrients: {},
    },
    {
      presetId: 'preset-probiotic',
      name: 'Daily Probiotic',
      dose: '20B CFU',
      timing: 'Morning',
      notes: 'Gut microbiome balance',
      nutrients: {},
    },
    {
      presetId: 'preset-collagen',
      name: 'Collagen Peptides',
      dose: '10 g scoop',
      timing: 'Morning',
      notes: 'Skin, joints & connective tissue',
      calories: 36,
      protein: 9,
      nutrients: {},
    },
  ];

  function computeSupplementStreak(suppId, supplementLogs, anchorDateKey, shiftDateFn) {
    let streak = 0;
    let cursor = anchorDateKey;
    // Check if taken today; if not taken yet today, count consecutive days up through yesterday
    const takenToday = (supplementLogs[cursor] || []).includes(suppId);
    if (!takenToday) {
      cursor = shiftDateFn(cursor, -1);
    }
    for (let i = 0; i < 365; i += 1) {
      if ((supplementLogs[cursor] || []).includes(suppId)) {
        streak += 1;
        cursor = shiftDateFn(cursor, -1);
      } else {
        break;
      }
    }
    return streak;
  }

  function summarizeSupplementNutrients(supp) {
    const nuts = supp.nutrients || {};
    const defs = global.EuLogNutrients?.VITAL_NUTRIENTS || [];
    const parts = [];
    if (Number(supp.protein) > 0) parts.push(`Protein ${supp.protein}g`);
    if (Number(supp.calories) > 0) parts.push(`${supp.calories} kcal`);
    for (const d of defs) {
      const v = Number(nuts[d.key]);
      if (v > 0) {
        parts.push(`${d.short} ${v}${d.unit}`);
      }
    }
    return parts;
  }

  global.EuLogSupplements = {
    SUPPLEMENT_TIMINGS,
    DEFAULT_SUPPLEMENTS,
    SUPPLEMENT_PRESETS,
    computeSupplementStreak,
    summarizeSupplementNutrients,
  };
})(window);
