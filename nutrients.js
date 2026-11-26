/* ==========================================================================
   EuLog — Vital Nutrients Reference & Weekly Aggregation Engine
   Tracks 13 vital micronutrients + daily/weekly macros across a 7-day window.
   ========================================================================== */

(function (global) {
  'use strict';

  const VITAL_NUTRIENTS = [
    { key: 'vitD', label: 'Vitamin D', short: 'Vit D', unit: 'µg', group: 'Vitamins', dailyDV: 15, desc: 'Bone density, mood & immune regulation' },
    { key: 'vitB12', label: 'Vitamin B12', short: 'B12', unit: 'µg', group: 'Vitamins', dailyDV: 2.4, desc: 'Red blood cells, nerves & cellular energy' },
    { key: 'folate', label: 'Folate (B9)', short: 'Folate', unit: 'µg', group: 'Vitamins', dailyDV: 400, desc: 'DNA synthesis & healthy cell division' },
    { key: 'vitC', label: 'Vitamin C', short: 'Vit C', unit: 'mg', group: 'Vitamins', dailyDV: 90, desc: 'Collagen synthesis, antioxidant & iron absorption' },
    { key: 'vitA', label: 'Vitamin A', short: 'Vit A', unit: 'µg', group: 'Vitamins', dailyDV: 900, desc: 'Vision, skin renewal & immune defense' },
    { key: 'vitE', label: 'Vitamin E', short: 'Vit E', unit: 'mg', group: 'Vitamins', dailyDV: 15, desc: 'Cell membrane antioxidant protection' },
    { key: 'vitK', label: 'Vitamin K', short: 'Vit K', unit: 'µg', group: 'Vitamins', dailyDV: 120, desc: 'Blood clotting & bone mineralization' },
    { key: 'iron', label: 'Iron', short: 'Iron', unit: 'mg', group: 'Minerals', dailyDV: 18, desc: 'Oxygen transport & sustained energy' },
    { key: 'calcium', label: 'Calcium', short: 'Calcium', unit: 'mg', group: 'Minerals', dailyDV: 1000, desc: 'Skeletal strength & muscle contraction' },
    { key: 'magnesium', label: 'Magnesium', short: 'Mag', unit: 'mg', group: 'Minerals', dailyDV: 400, desc: 'Sleep quality, nerve signaling & recovery' },
    { key: 'potassium', label: 'Potassium', short: 'Potas', unit: 'mg', group: 'Minerals', dailyDV: 3400, desc: 'Hydration, electrolyte & blood pressure balance' },
    { key: 'zinc', label: 'Zinc', short: 'Zinc', unit: 'mg', group: 'Minerals', dailyDV: 11, desc: 'Immune resilience, skin & hormone health' },
    { key: 'omega3', label: 'Omega-3', short: 'Omega-3', unit: 'g', group: 'Essential Fats', dailyDV: 1.6, desc: 'Brain, heart & anti-inflammatory support' },
  ];

  const DV_PROFILES = {
    standard: {
      label: 'Standard Adult (FDA DV)',
      vitD: 15, vitB12: 2.4, folate: 400, vitC: 90, vitA: 900, vitE: 15, vitK: 120,
      iron: 18, calcium: 1000, magnesium: 400, potassium: 3400, zinc: 11, omega3: 1.6,
    },
    female: {
      label: 'Adult Female (NIH RDA)',
      vitD: 15, vitB12: 2.4, folate: 400, vitC: 75, vitA: 700, vitE: 15, vitK: 90,
      iron: 18, calcium: 1000, magnesium: 320, potassium: 2600, zinc: 8, omega3: 1.1,
    },
    male: {
      label: 'Adult Male (NIH RDA)',
      vitD: 15, vitB12: 2.4, folate: 400, vitC: 90, vitA: 900, vitE: 15, vitK: 120,
      iron: 8, calcium: 1000, magnesium: 420, potassium: 3400, zinc: 11, omega3: 1.6,
    },
  };

  function emptyNutrientTotals() {
    const out = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
    for (const n of VITAL_NUTRIENTS) out[n.key] = 0;
    return out;
  }

  function addFoodEntryToTotals(totals, entry, foodLookup) {
    const mult = Number(entry.servings) || 1;
    const food = entry.snapshot || foodLookup(entry.foodId);
    if (!food) return;

    totals.calories += (food.calories || 0) * mult;
    totals.protein += (food.protein || 0) * mult;
    totals.carbs += (food.carbs || 0) * mult;
    totals.fat += (food.fat || 0) * mult;
    totals.fiber += (food.fiber || 0) * mult;
    totals.sugar += (food.sugar || 0) * mult;

    const nuts = food.nutrients || {};
    totals.sodium += (nuts.sodium || 0) * mult;
    for (const n of VITAL_NUTRIENTS) {
      totals[n.key] += (nuts[n.key] || 0) * mult;
    }
  }

  function addSupplementToTotals(totals, supp) {
    if (!supp || !supp.nutrients) return;
    for (const n of VITAL_NUTRIENTS) {
      const val = Number(supp.nutrients[n.key]);
      if (val > 0) totals[n.key] += val;
    }
  }

  function computeDayTotals(dayEntries, takenSupplementIds, supplementsList, foodLookup, includeSupplements = true) {
    const totals = emptyNutrientTotals();
    for (const entry of dayEntries || []) {
      addFoodEntryToTotals(totals, entry, foodLookup);
    }
    if (includeSupplements && takenSupplementIds && takenSupplementIds.length > 0) {
      const byId = Object.create(null);
      for (const s of supplementsList || []) byId[s.id] = s;
      for (const sid of takenSupplementIds) {
        if (byId[sid]) addSupplementToTotals(totals, byId[sid]);
      }
    }
    return totals;
  }

  function getDailyTarget(key, profileKey) {
    const prof = DV_PROFILES[profileKey] || DV_PROFILES.standard;
    return prof[key] ?? (VITAL_NUTRIENTS.find((n) => n.key === key)?.dailyDV || 100);
  }

  function computeWeeklyReport(dateKeys, state, foodLookup, includeSupplements = true) {
    const profileKey = state.settings?.dvProfile || 'standard';
    const daySummaries = dateKeys.map((dateKey) => {
      const entries = state.foodLogs[dateKey] || [];
      const takenIds = state.supplementLogs[dateKey] || [];
      const totals = computeDayTotals(entries, takenIds, state.supplements, foodLookup, includeSupplements);
      const foodOnly = computeDayTotals(entries, [], state.supplements, foodLookup, false);
      return {
        dateKey,
        totals,
        foodOnly,
        entryCount: entries.length,
        suppCount: takenIds.length,
        hasActivity: entries.length > 0 || takenIds.length > 0,
      };
    });

    const weeklyTotals = emptyNutrientTotals();
    const weeklyFoodOnly = emptyNutrientTotals();
    let loggedDays = 0;

    for (const d of daySummaries) {
      if (d.hasActivity) loggedDays += 1;
      for (const k of Object.keys(weeklyTotals)) {
        weeklyTotals[k] += d.totals[k];
        weeklyFoodOnly[k] += d.foodOnly[k];
      }
    }

    const numDays = dateKeys.length || 7;
    const nutrients = VITAL_NUTRIENTS.map((def) => {
      const dailyTarget = getDailyTarget(def.key, profileKey);
      const weeklyTarget = dailyTarget * numDays;
      const total = weeklyTotals[def.key];
      const foodTotal = weeklyFoodOnly[def.key];
      const suppTotal = Math.max(0, total - foodTotal);
      const pct = weeklyTarget > 0 ? Math.round((total / weeklyTarget) * 100) : 0;
      const cappedPct = Math.min(100, pct);
      const dailyBreakdown = daySummaries.map((d) => ({
        dateKey: d.dateKey,
        value: d.totals[def.key],
        pct: dailyTarget > 0 ? Math.min(130, Math.round((d.totals[def.key] / dailyTarget) * 100)) : 0,
      }));

      let status = 'low';
      if (pct >= 85) status = 'optimal';
      else if (pct >= 50) status = 'moderate';

      return {
        ...def,
        dailyTarget,
        weeklyTarget,
        total,
        foodTotal,
        suppTotal,
        pct,
        cappedPct,
        status,
        dailyBreakdown,
      };
    });

    const vitalScore = Math.round(
      nutrients.reduce((sum, n) => sum + n.cappedPct, 0) / nutrients.length
    );

    const gaps = [...nutrients]
      .filter((n) => n.pct < 80)
      .sort((a, b) => a.pct - b.pct);

    const avgCalories = loggedDays > 0 ? Math.round(weeklyTotals.calories / loggedDays) : 0;
    const avgProtein = loggedDays > 0 ? Math.round(weeklyTotals.protein / loggedDays) : 0;
    const avgFiber = loggedDays > 0 ? Math.round(weeklyTotals.fiber / loggedDays) : 0;

    return {
      dateKeys,
      daySummaries,
      weeklyTotals,
      nutrients,
      gaps,
      vitalScore,
      loggedDays,
      avgCalories,
      avgProtein,
      avgFiber,
    };
  }

  function getTopFoodsForNutrient(nutrientKey, limit = 5) {
    const foods = global.EuLogFoods?.USDA_FOODS || [];
    return [...foods]
      .filter((f) => (f.nutrients?.[nutrientKey] || 0) > 0)
      .sort((a, b) => (b.nutrients[nutrientKey] || 0) - (a.nutrients[nutrientKey] || 0))
      .slice(0, limit);
  }

  function formatNutrientValue(val, unit) {
    if (!val || val <= 0) return `0 ${unit}`;
    if (unit === 'g' || val < 10) return `${val.toFixed(1)} ${unit}`;
    return `${Math.round(val).toLocaleString()} ${unit}`;
  }

  global.EuLogNutrients = {
    VITAL_NUTRIENTS,
    DV_PROFILES,
    emptyNutrientTotals,
    computeDayTotals,
    computeWeeklyReport,
    getDailyTarget,
    getTopFoodsForNutrient,
    formatNutrientValue,
  };
})(window);
