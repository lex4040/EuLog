/* ==========================================================================
   EuLog — Local Storage Persistence, Date Utilities & Backup/Export
   ========================================================================== */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'eulog_state_v1';

  const DEFAULT_SETTINGS = {
    theme: 'light', // 'light' (White & Brown) | 'dark' (Dark Brown & White)
    calorieGoal: 2000,
    proteinGoal: 110,
    carbsGoal: 225,
    fatGoal: 65,
    fiberGoal: 28,
    dvProfile: 'standard', // 'standard' | 'female' | 'male'
    includeSuppsInWeekly: true,
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function todayKey() {
    return toDateKey(new Date());
  }

  function shiftDateKey(key, deltaDays) {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + deltaDays);
    return toDateKey(d);
  }

  function getLast7DateKeys(endKey) {
    const keys = [];
    for (let i = 6; i >= 0; i -= 1) {
      keys.push(shiftDateKey(endKey, -i));
    }
    return keys;
  }

  function formatDateHeading(key) {
    const d = parseDateKey(key);
    const today = todayKey();
    const yesterday = shiftDateKey(today, -1);
    const tomorrow = shiftDateKey(today, 1);
    const formatted = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    if (key === today) return { primary: 'Today', sub: formatted, isToday: true };
    if (key === yesterday) return { primary: 'Yesterday', sub: formatted, isToday: false };
    if (key === tomorrow) return { primary: 'Tomorrow', sub: formatted, isToday: false };
    return {
      primary: d.toLocaleDateString(undefined, { weekday: 'long' }),
      sub: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      isToday: false,
    };
  }

  function formatShortWeekday(key) {
    return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'narrow' });
  }

  function formatShortDate(key) {
    return parseDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function createInitialState() {
    const defaults = (global.EuLogSupplements?.DEFAULT_SUPPLEMENTS || []).map((s) => ({
      ...s,
      nutrients: { ...(s.nutrients || {}) },
    }));
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      foodLogs: {},         // { [dateKey]: [{ id, foodId, meal, servings, createdAt, snapshot }] }
      supplementLogs: {},   // { [dateKey]: [suppId, ...] }
      supplements: defaults,
      customFoods: [],      // user-created custom foods with same schema as USDA_FOODS
      favorites: ['atlantic-salmon', 'avocado', 'greek-yogurt-0', 'spinach-raw', 'blueberries', 'whole-egg'],
      dailyNotes: {},       // { [dateKey]: string }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw);
      const base = createInitialState();
      const supplements = Array.isArray(parsed.supplements) ? parsed.supplements : base.supplements;
      const migrations = { ...(parsed.migrations || {}) };

      // One-time migration: add Protein Scoop to existing users' supplement stacks
      if (!migrations.proteinScoopAdded) {
        const hasProtein = supplements.some((s) => /protein\s*scoop/i.test(s.name || ''));
        if (!hasProtein) {
          const defScoop = (global.EuLogSupplements?.DEFAULT_SUPPLEMENTS || []).find(
            (s) => s.id === 'supp-protein-scoop'
          );
          if (defScoop) {
            supplements.push({ ...defScoop, nutrients: { ...(defScoop.nutrients || {}) } });
          }
        }
        migrations.proteinScoopAdded = true;
      }

      // Normalize legacy IU/mcg labels in existing default supplements to SI
      for (const s of supplements) {
        if (s.dose === '2,000 IU (50 mcg)') s.dose = '50 µg';
        else if (s.dose === '500 mcg') s.dose = '500 µg';
        else if (s.dose === '2,000 IU + 90 mcg MK-7') s.dose = '50 µg D3 + 90 µg K2';
        else if (s.dose === '400 mcg DFE') s.dose = '400 µg DFE';
      }

      return {
        ...base,
        ...parsed,
        migrations,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        foodLogs: parsed.foodLogs || {},
        supplementLogs: parsed.supplementLogs || {},
        supplements,
        customFoods: Array.isArray(parsed.customFoods) ? parsed.customFoods : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : base.favorites,
        dailyNotes: parsed.dailyNotes || {},
      };
    } catch {
      return createInitialState();
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn('EuLog saveState failed:', err);
      return false;
    }
  }

  function makeId(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function exportJsonBackup(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eulog-backup-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsvLogs(state, foodLookup) {
    const header = [
      'Date', 'Meal', 'Food', 'Servings', 'Calories_kcal', 'Protein_g', 'Carbs_g', 'Fat_g', 'Fiber_g',
      'VitD_ug', 'VitB12_ug', 'Folate_ug', 'VitC_mg', 'VitA_ug', 'VitE_mg', 'VitK_ug',
      'Iron_mg', 'Calcium_mg', 'Magnesium_mg', 'Potassium_mg', 'Zinc_mg', 'Omega3_g',
    ];
    const rows = [header.join(',')];
    const dates = Object.keys(state.foodLogs || {}).sort();
    for (const dateKey of dates) {
      for (const entry of state.foodLogs[dateKey] || []) {
        const f = entry.snapshot || foodLookup(entry.foodId);
        if (!f) continue;
        const m = Number(entry.servings) || 1;
        const n = f.nutrients || {};
        const csvName = `"${String(f.name || '').replace(/"/g, '""')}"`;
        rows.push([
          dateKey, entry.meal, csvName, m,
          Math.round((f.calories || 0) * m),
          ((f.protein || 0) * m).toFixed(1),
          ((f.carbs || 0) * m).toFixed(1),
          ((f.fat || 0) * m).toFixed(1),
          ((f.fiber || 0) * m).toFixed(1),
          ((n.vitD || 0) * m).toFixed(1),
          ((n.vitB12 || 0) * m).toFixed(1),
          ((n.folate || 0) * m).toFixed(1),
          ((n.vitC || 0) * m).toFixed(1),
          ((n.vitA || 0) * m).toFixed(1),
          ((n.vitE || 0) * m).toFixed(1),
          ((n.vitK || 0) * m).toFixed(1),
          ((n.iron || 0) * m).toFixed(1),
          ((n.calcium || 0) * m).toFixed(1),
          ((n.magnesium || 0) * m).toFixed(1),
          ((n.potassium || 0) * m).toFixed(1),
          ((n.zinc || 0) * m).toFixed(1),
          ((n.omega3 || 0) * m).toFixed(2),
        ].join(','));
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eulog-nutrition-log-${todayKey()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.EuLogStorage = {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    todayKey,
    toDateKey,
    parseDateKey,
    shiftDateKey,
    getLast7DateKeys,
    formatDateHeading,
    formatShortWeekday,
    formatShortDate,
    createInitialState,
    loadState,
    saveState,
    makeId,
    exportJsonBackup,
    exportCsvLogs,
  };
})(window);
