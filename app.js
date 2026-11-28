/* ==========================================================================
   EuLog — Main Application Controller
   Coordinates Today Log, Daily Supplements, Weekly Vital Nutrients,
   153 USDA Foods Library, and On-Device SigLIP Photo Recognition.
   ========================================================================== */

(function () {
  'use strict';

  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  const RING_CIRCUMFERENCE = 2 * Math.PI * 49; // r=49 => ~307.88

  const { USDA_FOODS, USDA_CATEGORIES, USDA_FOODS_BY_ID } = window.EuLogFoods;
  const {
    VITAL_NUTRIENTS,
    computeDayTotals,
    computeWeeklyReport,
    getTopFoodsForNutrient,
    formatNutrientValue,
  } = window.EuLogNutrients;
  const {
    SUPPLEMENT_TIMINGS,
    SUPPLEMENT_PRESETS,
    computeSupplementStreak,
    summarizeSupplementNutrients,
  } = window.EuLogSupplements;
  const {
    todayKey,
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
  } = window.EuLogStorage;
  const {
    INGREDIENTS_DB,
    INGREDIENTS_BY_ID,
    INGREDIENT_CATEGORIES,
  } = window.EuLogIngredients;
  const {
    getOriginalRecipeItems,
    resolveIngredient,
    computeRecipeTotals,
    summarizeRecipeChanges,
    buildFoodFromRecipeItems,
    ingredientToFood,
    getFoodSaltGrams,
    matchesSearchQuery,
  } = window.EuLogRecipes;

  let state = loadState();
  let activeTab = 'today';
  let selectedDateKey = todayKey();
  let weeklyEndKey = todayKey();
  let foodsLibraryMode = 'recipes'; // 'recipes' | 'ingredients'
  let selectedFoodCategory = 'All';
  let selectedIngredientCategory = 'All';
  let foodsSearchQuery = '';
  let foodsSortBy = 'name';
  let expandedNutrientKey = null;
  let expandedEntryId = null;

  // Modal state
  let activeModalFood = null;
  let activeRecipeOriginalItems = [];
  let activeRecipeItems = [];
  let recipePickerQuery = '';
  let editingEntryId = null;
  let customFoodMode = 'ingredients'; // 'ingredients' | 'manual'
  let customFoodItems = [];
  let customFoodPickerQuery = '';
  let scanModalMode = 'photo'; // 'photo' | 'barcode'
  let activeScanPortion = 1;
  let lastScanOutput = null;
  let barcodeCameraStream = null;
  let barcodeScanTimer = null;
  let activeBarcodeProduct = null;
  let pendingMealTarget = guessDefaultMeal();
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let foodsSearchTimer = null;
  let scanSearchTimer = null;
  const effectiveFoodCache = new Map();

  function invalidateRecipeCaches(foodId) {
    if (foodId) {
      effectiveFoodCache.delete(foodId);
    } else {
      effectiveFoodCache.clear();
    }
  }

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function guessDefaultMeal() {
    const h = new Date().getHours();
    if (h < 11) return 'Breakfast';
    if (h < 15) return 'Lunch';
    if (h < 20) return 'Dinner';
    return 'Snacks';
  }

  function getAllFoods() {
    return [...(state.customFoods || []), ...USDA_FOODS];
  }

  function getAllIngredients() {
    return [...(state.customIngredients || []), ...INGREDIENTS_DB];
  }

  function findIngredientById(id) {
    if (INGREDIENTS_BY_ID[id]) return INGREDIENTS_BY_ID[id];
    return (state.customIngredients || []).find((i) => i.id === id) || null;
  }

  function findFoodById(id) {
    if (!id) return null;
    if (String(id).startsWith('ing:')) {
      const ing = findIngredientById(String(id).slice(4));
      return ing ? ingredientToFood(ing) : null;
    }
    if (USDA_FOODS_BY_ID[id]) return USDA_FOODS_BY_ID[id];
    return (state.customFoods || []).find((f) => f.id === id) || null;
  }

  function cloneRecipeItems(items = []) {
    return (items || []).map((it) => ({
      ingredientId: it.ingredientId,
      amount: Number(it.amount) || 0,
      ...(it.inlineIngredient ? { inlineIngredient: { ...it.inlineIngredient, nutrients: { ...(it.inlineIngredient.nutrients || {}) } } } : {}),
    }));
  }

  function getEffectiveFoodForLog(food) {
    if (!food) return null;
    if (food.id && effectiveFoodCache.has(food.id)) {
      return effectiveFoodCache.get(food.id);
    }
    const origItems = getOriginalRecipeItems(food);
    const savedDefault = state.defaultRecipes?.[food.id];
    const items = Array.isArray(savedDefault) && savedDefault.length > 0 ? cloneRecipeItems(savedDefault) : origItems;
    const built = buildFoodFromRecipeItems(food, items, state.customIngredients, origItems);
    if (food.id && built) {
      if (effectiveFoodCache.size > 1200) effectiveFoodCache.clear();
      effectiveFoodCache.set(food.id, built);
    }
    return built;
  }

  function persist() {
    saveState(state);
  }

  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  }

  /* ==================== THEME ==================== */
  function applyTheme(themeName) {
    const valid = themeName === 'dark' ? 'dark' : 'light';
    state.settings.theme = valid;
    document.documentElement.setAttribute('data-theme', valid);

    const meta = $('theme-color-meta');
    if (meta) {
      meta.content = valid === 'dark' ? '#120c09' : '#f7f4f1';
    }

    const icon = $('theme-icon');
    if (icon) {
      icon.innerHTML =
        valid === 'dark'
          ? '<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />'
          : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />';
    }

    document.querySelectorAll('[data-set-theme]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.setTheme === valid);
    });
  }

  function cycleTheme() {
    const next = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    persist();
    showToast(next === 'dark' ? 'Theme: Dark Brown' : 'Theme: White & Brown');
  }

  /* ==================== NAVIGATION ==================== */
  function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.view-panel').forEach((p) => {
      p.classList.toggle('is-active', p.id === `view-${tabName}`);
    });
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.tab === tabName);
    });

    if (tabName === 'today') renderToday();
    else if (tabName === 'supplements') renderSupplements();
    else if (tabName === 'weekly') renderWeekly();
    else if (tabName === 'foods') renderFoodsLibrary();

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /* ==================== TAB 1: TODAY ==================== */
  function renderToday() {
    const heading = formatDateHeading(selectedDateKey);
    $('date-primary-heading').textContent = heading.primary;
    $('date-sub-label').textContent = heading.sub;
    $('jump-today-btn').hidden = heading.isToday;

    const entries = state.foodLogs[selectedDateKey] || [];
    const takenSupps = state.supplementLogs[selectedDateKey] || [];
    const totals = computeDayTotals(
      entries,
      takenSupps,
      state.supplements,
      findFoodById,
      state.settings.includeSuppsInWeekly
    );

    const calGoal = Number(state.settings.calorieGoal) || 2000;
    const proteinGoal = Number(state.settings.proteinGoal) || 110;
    const carbsGoal = Number(state.settings.carbsGoal) || 225;
    const fatGoal = Number(state.settings.fatGoal) || 65;
    const fiberGoal = Number(state.settings.fiberGoal) || 28;
    const sugarGoal = Number(state.settings.sugarGoal) || 50;
    const saltGoal = Number(state.settings.saltGoal) || 5;

    const cals = Math.round(totals.calories);
    $('today-calories').textContent = cals.toLocaleString();
    $('today-cal-goal-label').textContent = `/ ${calGoal.toLocaleString()} kcal`;

    const calPct = Math.min(1, cals / Math.max(1, calGoal));
    const offset = RING_CIRCUMFERENCE * (1 - calPct);
    $('calorie-ring-fill').style.strokeDashoffset = offset.toFixed(2);

    const setBar = (valId, barId, cur, goal) => {
      $(valId).textContent = `${Math.round(cur)} / ${goal}g`;
      $(barId).style.width = `${Math.min(100, Math.round((cur / Math.max(1, goal)) * 100))}%`;
    };
    const setLimitBar = (valId, barId, cur, goal, decimals = 1) => {
      const valEl = $(valId);
      const barEl = $(barId);
      const isOver = cur > goal;
      if (valEl) {
        valEl.textContent = `${cur.toFixed(decimals)} / ${goal}g`;
        valEl.classList.toggle('is-over', isOver);
      }
      if (barEl) {
        barEl.style.width = `${Math.min(100, Math.round((cur / Math.max(0.1, goal)) * 100))}%`;
        barEl.classList.toggle('is-over', isOver);
      }
    };
    setBar('macro-protein-val', 'macro-protein-bar', totals.protein, proteinGoal);
    setBar('macro-carbs-val', 'macro-carbs-bar', totals.carbs, carbsGoal);
    setBar('macro-fat-val', 'macro-fat-bar', totals.fat, fatGoal);
    setBar('macro-fiber-val', 'macro-fiber-bar', totals.fiber, fiberGoal);
    setLimitBar('macro-sugar-val', 'macro-sugar-bar', totals.sugar || 0, sugarGoal, 1);
    setLimitBar('macro-salt-val', 'macro-salt-bar', totals.salt || 0, saltGoal, 1);

    // Inline Daily Supplements quick strip
    const totalSupps = state.supplements.length;
    const takenCount = state.supplements.filter((s) => takenSupps.includes(s.id)).length;
    $('today-supp-summary').textContent = `${takenCount} of ${totalSupps} taken ${heading.isToday ? 'today' : `on ${heading.sub}`}`;

    const pillsEl = $('today-supp-pills');
    if (totalSupps === 0) {
      pillsEl.innerHTML = '<span class="section-subtitle">No supplements in stack yet.</span>';
    } else {
      pillsEl.innerHTML = state.supplements
        .map((s) => {
          const isTaken = takenSupps.includes(s.id);
          return `
            <button type="button" class="supp-quick-pill ${isTaken ? 'is-taken' : ''}" data-toggle-supp="${escapeHtml(s.id)}">
              <span class="supp-check-dot">${isTaken ? '✓' : ''}</span>
              <span>${escapeHtml(s.name)}</span>
            </button>
          `;
        })
        .join('');
    }

    // Hydration tracker (SI ml / L)
    const waterMl = Math.max(0, Number(state.waterLogs?.[selectedDateKey]) || 0);
    const waterGoal = Math.max(500, Number(state.settings.waterGoal) || 2500);
    if ($('today-water-val')) {
      $('today-water-val').textContent = `${waterMl.toLocaleString()} / ${waterGoal.toLocaleString()} ml · ${(waterMl / 1000).toFixed(2)} L`;
    }
    if ($('today-water-bar')) {
      $('today-water-bar').style.width = `${Math.min(100, Math.round((waterMl / waterGoal) * 100))}%`;
    }

    // Meal cards
    const mealsEl = $('meals-container');
    mealsEl.innerHTML = MEALS.map((meal) => {
      const mealEntries = entries.filter((e) => e.meal === meal);
      const mealTotals = computeDayTotals(mealEntries, [], [], findFoodById, false);
      const subText =
        mealEntries.length > 0
          ? `${Math.round(mealTotals.calories)} kcal · ${Math.round(mealTotals.protein)}g P`
          : 'No items yet';

      const rowsHtml =
        mealEntries.length === 0
          ? ''
          : `<div class="meal-entries">${mealEntries
              .map((entry) => {
                const liveFood = findFoodById(entry.foodId);
                const food = entry.snapshot || liveFood;
                if (!food) return '';
                const mult = Number(entry.servings) || 1;
                const kcal = Math.round((food.calories || 0) * mult);
                const p = Math.round((food.protein || 0) * mult);
                const c = Math.round((food.carbs || 0) * mult);
                const f = Math.round((food.fat || 0) * mult);
                const multStr = mult === 1 ? food.serving : `${mult}× ${food.serving}`;
                const desc = food.description || liveFood?.description || `${food.name} (${food.category || 'Food'}).`;
                const summaryBadge = food.recipeSummary || food.subRecipe?.summary || '';
                const subTagHtml = summaryBadge
                  ? `<span class="entry-sub-tag">${escapeHtml(summaryBadge)}</span>`
                  : '';
                const isExpanded = expandedEntryId === entry.id;
                let expandedHtml = '';
                if (isExpanded) {
                  const pExact = ((Number(food.protein) || 0) * mult).toFixed(1);
                  const cExact = ((Number(food.carbs) || 0) * mult).toFixed(1);
                  const sugExact = ((Number(food.sugar) || 0) * mult).toFixed(1);
                  const fExact = ((Number(food.fat) || 0) * mult).toFixed(1);
                  const saltExact = (getFoodSaltGrams(food) * mult).toFixed(2);
                  const fibExact = ((Number(food.fiber) || 0) * mult).toFixed(1);
                  expandedHtml = `
                    <div class="entry-desc-box">
                      <p class="entry-desc-text">${escapeHtml(desc)}</p>
                      <div class="macro-pills-row">
                        <span class="macro-pill">Protein ${pExact} g</span>
                        <span class="macro-pill">Carbs ${cExact} g</span>
                        <span class="macro-pill">Sugars ${sugExact} g</span>
                        <span class="macro-pill">Fat ${fExact} g</span>
                        <span class="macro-pill">Salt ${saltExact} g</span>
                        <span class="macro-pill">Fiber ${fibExact} g</span>
                      </div>
                      <div class="entry-desc-actions">
                        <button type="button" class="btn btn-soft btn-xs" data-edit-entry="${escapeHtml(entry.id)}">Edit Ingredients</button>
                      </div>
                    </div>
                  `;
                }
                return `
                  <div class="entry-row ${isExpanded ? 'is-expanded' : ''}" data-toggle-entry-desc="${escapeHtml(entry.id)}" role="button" tabindex="0" aria-expanded="${isExpanded}">
                    <div class="entry-row-top">
                      <div class="entry-main">
                        <span class="entry-name">${escapeHtml(food.name)}</span>
                        <span class="entry-meta">${escapeHtml(multStr)} · ${p}g P · ${c}g C · ${f}g F</span>
                        ${subTagHtml}
                      </div>
                      <div class="entry-right">
                        <span class="entry-cal">${kcal} kcal</span>
                        <button type="button" class="entry-del-btn" data-delete-entry="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(food.name)}">&times;</button>
                      </div>
                    </div>
                    ${expandedHtml}
                  </div>
                `;
              })
              .join('')}</div>`;

      return `
        <section class="meal-card" aria-label="${meal} meal">
          <div class="meal-head">
            <div class="meal-title-wrap">
              <h3 class="meal-title">${meal}</h3>
              <span class="meal-subtotal">${subText}</span>
            </div>
            <button type="button" class="meal-add-btn" data-add-for-meal="${meal}" aria-label="Add food to ${meal}">+</button>
          </div>
          ${rowsHtml}
        </section>
      `;
    }).join('');

    // Daily notes
    $('daily-notes-input').value = state.dailyNotes[selectedDateKey] || '';
  }

  function logFoodEntry(food, meal, servings = 1, dateKey = selectedDateKey) {
    if (!food) return;
    if (!state.foodLogs[dateKey]) state.foodLogs[dateKey] = [];
    state.foodLogs[dateKey].push({
      id: makeId('entry'),
      foodId: food.id,
      meal: MEALS.includes(meal) ? meal : 'Lunch',
      servings: Math.max(0.1, Number(servings) || 1),
      createdAt: new Date().toISOString(),
      snapshot: {
        id: food.id,
        name: food.name,
        category: food.category,
        serving: food.serving,
        description: food.description || '',
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar || 0,
        salt: getFoodSaltGrams(food),
        nutrients: { ...(food.nutrients || {}) },
        recipeItems: Array.isArray(food.recipeItems) ? cloneRecipeItems(food.recipeItems) : null,
        recipeSummary: food.recipeSummary || '',
      },
    });
    persist();
    if (activeTab === 'today') renderToday();
    if (activeTab === 'weekly') renderWeekly();
    showToast(`Logged ${food.name} (${meal})`);
  }

  function deleteFoodEntry(entryId) {
    const list = state.foodLogs[selectedDateKey] || [];
    const next = list.filter((e) => e.id !== entryId);
    if (next.length === 0) delete state.foodLogs[selectedDateKey];
    else state.foodLogs[selectedDateKey] = next;
    persist();
    renderToday();
    showToast('Entry removed');
  }

  function copyPreviousDayMeals() {
    const prevKey = shiftDateKey(selectedDateKey, -1);
    const prevEntries = state.foodLogs[prevKey] || [];
    if (prevEntries.length === 0) {
      showToast('No meals logged on the previous day');
      return;
    }
    if (!state.foodLogs[selectedDateKey]) state.foodLogs[selectedDateKey] = [];
    for (const entry of prevEntries) {
      state.foodLogs[selectedDateKey].push({
        ...entry,
        id: makeId('entry'),
        createdAt: new Date().toISOString(),
        snapshot: entry.snapshot
          ? {
              ...entry.snapshot,
              nutrients: { ...(entry.snapshot.nutrients || {}) },
              recipeItems: Array.isArray(entry.snapshot.recipeItems)
                ? cloneRecipeItems(entry.snapshot.recipeItems)
                : null,
            }
          : undefined,
      });
    }
    persist();
    renderToday();
    showToast(`Copied ${prevEntries.length} items from ${formatShortDate(prevKey)}`);
  }

  /* ==================== TAB 2: DAILY SUPPLEMENTS ==================== */
  function toggleSupplement(suppId, dateKey = selectedDateKey) {
    const current = new Set(state.supplementLogs[dateKey] || []);
    const wasTaken = current.has(suppId);
    if (wasTaken) current.delete(suppId);
    else current.add(suppId);
    state.supplementLogs[dateKey] = [...current];
    persist();

    if (activeTab === 'today') renderToday();
    else if (activeTab === 'supplements') renderSupplements();
    else if (activeTab === 'weekly') renderWeekly();

    const supp = state.supplements.find((s) => s.id === suppId);
    if (supp) {
      showToast(wasTaken ? `Unchecked ${supp.name}` : `Taken: ${supp.name}`);
    }
  }

  function renderSupplements() {
    const heading = formatDateHeading(selectedDateKey);
    $('supp-panel-date-sub').textContent = `Tracking for ${heading.primary} (${heading.sub}) · Feeds into Weekly Vital Nutrients`;

    const takenIds = state.supplementLogs[selectedDateKey] || [];
    const total = state.supplements.length;
    const takenCount = state.supplements.filter((s) => takenIds.includes(s.id)).length;
    const pct = total > 0 ? Math.round((takenCount / total) * 100) : 0;

    $('supp-progress-label').textContent = `${takenCount} of ${total} taken`;
    $('supp-progress-pct').textContent = `${pct}%`;
    $('supp-progress-bar').style.width = `${pct}%`;

    const container = $('supplements-list-container');
    if (total === 0) {
      container.innerHTML = `
        <section class="sheet-card">
          <p class="section-subtitle">Your daily supplement stack is empty. Tap any preset below or click "+ Custom" to add one.</p>
        </section>
      `;
    } else {
      const groupsHtml = SUPPLEMENT_TIMINGS.map((timing) => {
        const items = state.supplements.filter((s) => (s.timing || 'Anytime') === timing);
        if (items.length === 0) return '';
        const rows = items
          .map((s) => {
            const isTaken = takenIds.includes(s.id);
            const streak = computeSupplementStreak(s.id, state.supplementLogs, selectedDateKey, shiftDateKey);
            const nutLabels = summarizeSupplementNutrients(s);
            return `
              <div class="supp-row ${isTaken ? 'is-taken' : ''}">
                <div class="supp-row-left">
                  <button type="button" class="supp-checkbox" data-toggle-supp="${escapeHtml(s.id)}" aria-pressed="${isTaken}" aria-label="Toggle ${escapeHtml(s.name)}">
                    ${isTaken ? '✓' : ''}
                  </button>
                  <div class="supp-info">
                    <div class="supp-name-line">
                      <span class="supp-name">${escapeHtml(s.name)}</span>
                      <span class="supp-dose">${escapeHtml(s.dose)}</span>
                      ${streak > 0 ? `<span class="supp-streak">${streak}d streak</span>` : ''}
                    </div>
                    ${s.notes ? `<p class="supp-notes">${escapeHtml(s.notes)}</p>` : ''}
                    ${
                      nutLabels.length > 0
                        ? `<div class="supp-nut-badges">${nutLabels
                            .map((lbl) => `<span class="micro-badge">${escapeHtml(lbl)}</span>`)
                            .join('')}</div>`
                        : ''
                    }
                  </div>
                </div>
                <button type="button" class="entry-del-btn" data-remove-supp="${escapeHtml(s.id)}" aria-label="Delete ${escapeHtml(s.name)}">&times;</button>
              </div>
            `;
          })
          .join('');

        return `
          <section class="supp-group-card">
            <h3 class="supp-group-heading">${timing}</h3>
            <div class="supp-item-list">${rows}</div>
          </section>
        `;
      }).join('');

      container.innerHTML = groupsHtml;
    }

    // Presets grid
    const existingNames = new Set(state.supplements.map((s) => s.name.toLowerCase()));
    $('supp-presets-grid').innerHTML = SUPPLEMENT_PRESETS.map((p) => {
      const added = existingNames.has(p.name.toLowerCase());
      const nutStr = summarizeSupplementNutrients(p).slice(0, 3).join(' · ') || p.timing;
      return `
        <button type="button" class="preset-supp-btn" data-add-preset="${escapeHtml(p.presetId)}" ${added ? 'disabled style="opacity:0.55"' : ''}>
          <strong>${added ? '✓ ' : '+ '}${escapeHtml(p.name)}</strong>
          <span>${escapeHtml(p.dose)} · ${escapeHtml(nutStr)}</span>
        </button>
      `;
    }).join('');
  }

  /* ==================== TAB 3: WEEKLY VITAL NUTRIENTS ==================== */
  function renderWeekly() {
    const dateKeys = getLast7DateKeys(weeklyEndKey);
    const includeSupps = state.settings.includeSuppsInWeekly !== false;
    const report = computeWeeklyReport(dateKeys, state, findFoodById, includeSupps);

    $('weekly-range-label').textContent = `${formatShortDate(dateKeys[0])} – ${formatShortDate(dateKeys[6])} (7-day vital adequacy)`;

    $('weekly-vital-score').textContent = `${report.vitalScore}`;
    const scoreOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, report.vitalScore / 100));
    $('weekly-score-ring').style.strokeDashoffset = scoreOffset.toFixed(2);

    $('weekly-active-days').textContent = `${report.loggedDays} / 7`;
    $('weekly-avg-cal').textContent = `${report.avgCalories.toLocaleString()} kcal`;
    $('weekly-avg-protein').textContent = `${report.avgProtein} g`;
    $('weekly-avg-fiber').textContent = `${report.avgFiber} g`;

    $('source-both-btn').classList.toggle('is-active', includeSupps);
    $('source-food-btn').classList.toggle('is-active', !includeSupps);

    // Top 3 Weekly Gaps
    const gapsEl = $('weekly-gaps-list');
    const topGaps = report.gaps.slice(0, 3);
    if (topGaps.length === 0) {
      gapsEl.innerHTML = '<p class="section-subtitle">All 13 vital nutrients are at or above 80% of your weekly goal. Excellent balance!</p>';
    } else {
      gapsEl.innerHTML = topGaps
        .map((g) => {
          const richFoods = getTopFoodsForNutrient(g.key, 4);
          return `
            <div class="gap-item">
              <div class="gap-item-head">
                <div>
                  <strong>${escapeHtml(g.label)}</strong>
                  <span class="vital-amounts"> · ${formatNutrientValue(g.total, g.unit)} / ${formatNutrientValue(g.weeklyTarget, g.unit)}</span>
                </div>
                <span class="status-badge status-${g.status}">${g.pct}%</span>
              </div>
              <div class="gap-food-chips">
                ${richFoods
                  .map(
                    (f) => `
                  <button type="button" class="gap-food-btn" data-open-food-id="${escapeHtml(f.id)}">
                    + ${escapeHtml(f.name)} (${formatNutrientValue(f.nutrients[g.key], g.unit)})
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          `;
        })
        .join('');
    }

    // 7-day Calorie trend
    const calGoal = Number(state.settings.calorieGoal) || 2000;
    const maxCal = Math.max(calGoal, ...report.daySummaries.map((d) => d.totals.calories));
    $('weekly-calorie-chart').innerHTML = report.daySummaries
      .map((d) => {
        const c = Math.round(d.totals.calories);
        const hPct = maxCal > 0 ? Math.max(c > 0 ? 8 : 0, Math.round((c / maxCal) * 100)) : 0;
        return `
          <div class="trend-col">
            <span class="trend-val">${c > 0 ? c : '–'}</span>
            <div class="trend-bar-bg">
              <div class="trend-bar-fill" style="height:${hPct}%"></div>
            </div>
            <span class="trend-day-label">${formatShortWeekday(d.dateKey)}</span>
          </div>
        `;
      })
      .join('');

    // All 13 Vital Nutrients grouped by Vitamins / Minerals / Essential Fats
    const groups = ['Vitamins', 'Minerals', 'Essential Fats'];
    $('weekly-nutrients-groups').innerHTML = groups
      .map((grp) => {
        const items = report.nutrients.filter((n) => n.group === grp);
        const cardsHtml = items
          .map((n) => {
            const isExpanded = expandedNutrientKey === n.key;
            const splitNote =
              includeSupps && n.suppTotal > 0
                ? `Food: ${formatNutrientValue(n.foodTotal, n.unit)} · Supps: ${formatNutrientValue(n.suppTotal, n.unit)}`
                : `Daily goal: ${formatNutrientValue(n.dailyTarget, n.unit)} / day`;

            const stripHtml = n.dailyBreakdown
              .map((day) => {
                const h = Math.min(100, day.pct > 0 ? Math.max(12, day.pct) : 0);
                return `
                  <div class="mini-day-cell" title="${formatShortDate(day.dateKey)}: ${formatNutrientValue(day.value, n.unit)} (${day.pct}% daily DV)">
                    <div class="mini-day-bar-bg">
                      <div class="mini-day-bar-fill" style="height:${h}%"></div>
                    </div>
                    <span class="mini-day-letter">${formatShortWeekday(day.dateKey)}</span>
                  </div>
                `;
              })
              .join('');

            let expandHtml = '';
            if (isExpanded) {
              const richFoods = getTopFoodsForNutrient(n.key, 4);
              expandHtml = `
                <div class="vital-expand-box">
                  <p>${escapeHtml(n.desc)}</p>
                  <div class="gap-food-chips">
                    ${richFoods
                      .map(
                        (f) => `
                      <button type="button" class="gap-food-btn" data-open-food-id="${escapeHtml(f.id)}">
                        + ${escapeHtml(f.name)} (${formatNutrientValue(f.nutrients[n.key], n.unit)})
                      </button>
                    `
                      )
                      .join('')}
                  </div>
                </div>
              `;
            }

            return `
              <article class="vital-card" data-expand-nutrient="${escapeHtml(n.key)}">
                <div class="vital-card-top">
                  <div>
                    <span class="vital-name">${escapeHtml(n.label)}</span>
                    <span class="vital-amounts">${formatNutrientValue(n.total, n.unit)} / ${formatNutrientValue(n.weeklyTarget, n.unit)}</span>
                  </div>
                  <span class="status-badge status-${n.status}">${n.pct}%</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill fill-accent" style="width:${Math.min(100, n.pct)}%"></div>
                </div>
                <div class="vital-split-note">${escapeHtml(splitNote)}</div>
                <div class="mini-7day-strip">${stripHtml}</div>
                ${expandHtml}
              </article>
            `;
          })
          .join('');

        return `
          <section>
            <h3 class="vital-group-heading">${grp}</h3>
            <div class="vital-grid">${cardsHtml}</div>
          </section>
        `;
      })
      .join('');
  }

  /* ==================== TAB 4: RECIPES & INGREDIENTS LIBRARY ==================== */
  let foodsRenderLimit = 80;

  function getRecentAndFrequentMeals(limit = 6) {
    const map = new Map();
    const dates = Object.keys(state.foodLogs || {}).sort().reverse();
    dates.forEach((dateKey, dateIdx) => {
      const list = state.foodLogs[dateKey] || [];
      for (const entry of list) {
        if (!entry || !entry.foodId) continue;
        const existing = map.get(entry.foodId);
        const recencyBoost = Math.max(0, 7 - dateIdx);
        if (existing) {
          existing.count += 1;
          existing.score += 2 + recencyBoost * 0.4;
          if ((entry.createdAt || '') > (existing.lastAt || '')) {
            existing.lastAt = entry.createdAt || '';
            existing.lastServings = Number(entry.servings) || 1;
            existing.lastSnapshot = entry.snapshot || existing.lastSnapshot;
          }
        } else {
          map.set(entry.foodId, {
            foodId: entry.foodId,
            count: 1,
            score: 3 + recencyBoost,
            lastAt: entry.createdAt || '',
            lastServings: Number(entry.servings) || 1,
            lastSnapshot: entry.snapshot || null,
          });
        }
      }
    });
    return [...map.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function renderRecentFoods() {
    const card = $('foods-recent-card');
    const listEl = $('foods-recent-list');
    if (!card || !listEl) return;

    if (foodsLibraryMode !== 'recipes' || foodsSearchQuery.trim().length > 0) {
      card.hidden = true;
      return;
    }

    const recents = getRecentAndFrequentMeals(6);
    if (recents.length === 0) {
      card.hidden = true;
      return;
    }

    const html = recents
      .map((item) => {
        const live = findFoodById(item.foodId);
        const food = live ? getEffectiveFoodForLog(live) : item.lastSnapshot;
        if (!food) return '';
        const mult = item.lastServings || 1;
        const kcal = Math.round((food.calories || 0) * mult);
        const p = Math.round((food.protein || 0) * mult);
        const multLabel = mult === 1 ? '' : `${mult}× · `;
        return `
          <div class="recent-chip">
            <button type="button" class="recent-chip-main" data-open-food-id="${escapeHtml(item.foodId)}">
              <span class="recent-chip-name">${escapeHtml(food.name)}</span>
              <span class="recent-chip-meta">${multLabel}${kcal} kcal · ${p}g P${item.count > 1 ? ` · ${item.count}×` : ''}</span>
            </button>
            <button type="button" class="btn btn-primary btn-xs" data-quick-log-food-id="${escapeHtml(item.foodId)}" data-quick-log-servings="${mult}">+ Log</button>
          </div>
        `;
      })
      .filter(Boolean)
      .join('');

    if (!html) {
      card.hidden = true;
      return;
    }
    listEl.innerHTML = html;
    card.hidden = false;
  }

  function renderFoodsLibrary() {
    $('foods-mode-recipes-btn')?.classList.toggle('is-active', foodsLibraryMode === 'recipes');
    $('foods-mode-ingredients-btn')?.classList.toggle('is-active', foodsLibraryMode === 'ingredients');
    renderRecentFoods();

    const customBtn = $('open-custom-food-btn');
    const searchInput = $('foods-search-input');

    if (foodsLibraryMode === 'ingredients') {
      const allIngs = getAllIngredients();
      const customIngCount = (state.customIngredients || []).length;
      if (customBtn) customBtn.textContent = '+ Custom Ingredient';
      if (searchInput) searchInput.placeholder = `Search ${allIngs.length} ingredients (English or Ελληνικά)...`;
      $('foods-count-subtitle').textContent =
        customIngCount > 0
          ? `${INGREDIENTS_DB.length} SI ingredients + ${customIngCount} custom ingredients (per 100 g / 100 ml)`
          : `${INGREDIENTS_DB.length} raw & cooking ingredients database (per 100 g / 100 ml SI)`;

      const ingChips = ['All', ...(customIngCount > 0 ? ['Custom'] : []), ...INGREDIENT_CATEGORIES.slice(1)];
      $('foods-category-chips').innerHTML = ingChips
        .map(
          (cat) => `
        <button type="button" class="cat-chip ${selectedIngredientCategory === cat ? 'is-active' : ''}" data-ing-cat="${escapeHtml(cat)}">
          ${escapeHtml(cat)}
        </button>
      `
        )
        .join('');

      const q = foodsSearchQuery.trim();
      let filtered = allIngs.filter((ing) => {
        if (selectedIngredientCategory === 'Custom' && !ing.isCustom) return false;
        if (selectedIngredientCategory !== 'All' && selectedIngredientCategory !== 'Custom' && ing.category !== selectedIngredientCategory) {
          return false;
        }
        if (q) {
          return matchesSearchQuery(`${ing.name} ${ing.category}`, q);
        }
        return true;
      });

      filtered.sort((a, b) => {
        if (foodsSortBy === 'name') return a.name.localeCompare(b.name);
        if (foodsSortBy === 'protein') return (b.protein || 0) - (a.protein || 0);
        if (foodsSortBy === 'fiber') return (b.fiber || 0) - (a.fiber || 0);
        if (foodsSortBy === 'cal-asc') return (a.calories || 0) - (b.calories || 0);
        if (foodsSortBy === 'carbs-asc') return (a.carbs || 0) - (b.carbs || 0);
        if (foodsSortBy === 'sugar-asc') return (a.sugar || 0) - (b.sugar || 0);
        if (foodsSortBy === 'salt-asc') return (a.salt || 0) - (b.salt || 0);
        return a.name.localeCompare(b.name);
      });

      const listEl = $('foods-list');
      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="sheet-card"><p class="section-subtitle">No matching ingredients found. Tap "+ Custom Ingredient" to add one.</p></div>';
        return;
      }

      listEl.innerHTML = filtered
        .map(
          (ing) => `
          <article class="food-card">
            <div class="food-card-main">
              <span class="food-card-name">${escapeHtml(ing.name)}</span>
              <span class="food-card-serving">Per 100 ${escapeHtml(ing.unit || 'g')} · ${escapeHtml(ing.category)}</span>
              <div class="food-card-macros">${Math.round(ing.calories)} kcal · ${ing.protein}g P · ${ing.carbs}g C · ${ing.sugar}g Sugars · ${ing.fat}g F · ${ing.salt}g Salt</div>
            </div>
            <div class="food-card-actions">
              <button type="button" class="btn btn-soft btn-sm" data-open-ingredient-id="${escapeHtml(ing.id)}">+ Log</button>
            </div>
          </article>
        `
        )
        .join('');
      return;
    }

    // Recipes mode
    const allFoods = getAllFoods();
    const customCount = (state.customFoods || []).length;
    if (customBtn) customBtn.textContent = '+ Custom Recipe';
    if (searchInput) searchInput.placeholder = 'Search 2,182 recipes (English or Ελληνικά, e.g., αυγολέμονο)...';
    $('foods-count-subtitle').textContent =
      customCount > 0
        ? `${USDA_FOODS.length.toLocaleString()} customizable recipes + ${customCount} custom · ${getAllIngredients().length} ingredients DB`
        : `${USDA_FOODS.length.toLocaleString()} customizable recipes · ${getAllIngredients().length} ingredients DB`;

    const chips = ['All', 'Favorites', ...(customCount > 0 ? ['Custom'] : []), ...USDA_CATEGORIES.slice(1)];
    $('foods-category-chips').innerHTML = chips
      .map(
        (cat) => `
      <button type="button" class="cat-chip ${selectedFoodCategory === cat ? 'is-active' : ''}" data-food-cat="${escapeHtml(cat)}">
        ${escapeHtml(cat)}
      </button>
    `
      )
      .join('');

    const q = foodsSearchQuery.trim();
    const favSet = new Set(state.favorites || []);

    let filtered = allFoods.filter((f) => {
      if (selectedFoodCategory === 'Favorites' && !favSet.has(f.id)) return false;
      if (selectedFoodCategory === 'Custom' && !f.isCustom) return false;
      if (
        selectedFoodCategory !== 'All' &&
        selectedFoodCategory !== 'Favorites' &&
        selectedFoodCategory !== 'Custom' &&
        f.category !== selectedFoodCategory
      ) {
        return false;
      }
      if (q) {
        return matchesSearchQuery(`${f.name} ${f.category} ${f.prompt || ''}`, q);
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (foodsSortBy === 'name') return a.name.localeCompare(b.name);
      if (foodsSortBy === 'protein') return (b.protein || 0) - (a.protein || 0);
      if (foodsSortBy === 'fiber') return (b.fiber || 0) - (a.fiber || 0);
      if (foodsSortBy === 'cal-asc') return (a.calories || 0) - (b.calories || 0);
      if (foodsSortBy === 'carbs-asc') return (a.carbs || 0) - (b.carbs || 0);
      if (foodsSortBy === 'sugar-asc') return (a.sugar || 0) - (b.sugar || 0);
      if (foodsSortBy === 'salt-asc') return getFoodSaltGrams(a) - getFoodSaltGrams(b);
      return a.name.localeCompare(b.name);
    });

    const listEl = $('foods-list');
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="sheet-card"><p class="section-subtitle">No matching recipes found. Try a different term or add a Custom Food.</p></div>';
      return;
    }

    const visible = filtered.slice(0, foodsRenderLimit);
    const cardsHtml = visible
      .map((baseFood) => {
        const isFav = favSet.has(baseFood.id);
        const hasCustomDefault = Boolean(state.defaultRecipes?.[baseFood.id]?.length);
        const f = getEffectiveFoodForLog(baseFood);
        const saltVal = getFoodSaltGrams(f).toFixed(1);
        return `
          <article class="food-card">
            <div class="food-card-main">
              <span class="food-card-name">${escapeHtml(f.name)}</span>
              <span class="food-card-serving">${escapeHtml(f.serving)} · ${escapeHtml(f.category)}${hasCustomDefault ? ' · Custom Default' : ''}</span>
              <div class="food-card-macros">${Math.round(f.calories)} kcal · ${f.protein}g P · ${f.carbs}g C · ${f.sugar}g Sugars · ${f.fat}g F · ${saltVal}g Salt</div>
            </div>
            <div class="food-card-actions">
              <button type="button" class="star-btn ${isFav ? 'is-fav' : ''}" data-toggle-fav="${escapeHtml(baseFood.id)}" aria-label="Favorite ${escapeHtml(f.name)}">${isFav ? '★' : '☆'}</button>
              <button type="button" class="btn btn-soft btn-sm" data-open-food-id="${escapeHtml(baseFood.id)}">+ Log</button>
            </div>
          </article>
        `;
      })
      .join('');

    const remaining = filtered.length - visible.length;
    const moreBtnHtml =
      remaining > 0
        ? `<div class="load-more-wrap"><button type="button" class="btn btn-soft" data-load-more-foods="1">Show ${Math.min(80, remaining)} more (showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()})</button></div>`
        : '';

    listEl.innerHTML = cardsHtml + moreBtnHtml;
  }

  /* ==================== MODALS: OPEN / CLOSE ==================== */
  let lockedScrollY = null;

  function lockBackgroundScroll() {
    if (lockedScrollY !== null) return;
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    document.body.style.top = `-${lockedScrollY}px`;
  }

  function unlockBackgroundScroll() {
    if (lockedScrollY === null) return;
    const restoreY = lockedScrollY;
    lockedScrollY = null;
    const htmlEl = document.documentElement;
    const prevBehavior = htmlEl.style.scrollBehavior;
    htmlEl.style.scrollBehavior = 'auto';
    htmlEl.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, restoreY);
    requestAnimationFrame(() => {
      htmlEl.style.scrollBehavior = prevBehavior;
    });
  }

  // Prevent iOS Safari rubber-band scrolling on dimmed backdrop / modal headers & footers
  document.addEventListener(
    'touchmove',
    (e) => {
      if (lockedScrollY === null) return;
      const scrollable = e.target.closest('.modal-body, .recipe-picker-list, .scan-results-list');
      if (!scrollable || scrollable.scrollHeight <= scrollable.clientHeight + 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = false;
    lockBackgroundScroll();
    const body = el.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
  }

  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    if (id === 'scan-modal') {
      stopBarcodeCamera();
    }
    if (id === 'food-log-modal') editingEntryId = null;
    el.hidden = true;
    const anyOpen = [...document.querySelectorAll('.modal-backdrop')].some((m) => !m.hidden);
    if (!anyOpen) unlockBackgroundScroll();
  }

  /* ==================== FOOD / RECIPE CUSTOMIZATION MODAL ==================== */
  function getEffectiveModalFood() {
    if (!activeModalFood) return null;
    return buildFoodFromRecipeItems(
      activeModalFood,
      activeRecipeItems,
      state.customIngredients,
      activeRecipeOriginalItems
    );
  }

  function openFoodLogModal(foodId, mealOverride, existingEntry = null, servingsOverride = null) {
    const food = findFoodById(foodId) || existingEntry?.snapshot;
    if (!food) return;
    activeModalFood = food;
    editingEntryId = existingEntry ? existingEntry.id : null;
    recipePickerQuery = '';

    activeRecipeOriginalItems = getOriginalRecipeItems(food);
    if (existingEntry?.snapshot?.recipeItems?.length) {
      activeRecipeItems = cloneRecipeItems(existingEntry.snapshot.recipeItems);
    } else if (state.defaultRecipes?.[food.id]?.length) {
      activeRecipeItems = cloneRecipeItems(state.defaultRecipes[food.id]);
    } else {
      activeRecipeItems = cloneRecipeItems(activeRecipeOriginalItems);
    }

    $('food-modal-category').textContent = food.isCustom ? 'Custom Food' : `${food.category}`;
    $('food-modal-title').textContent = food.name;
    $('log-meal-select').value = existingEntry
      ? existingEntry.meal
      : mealOverride || pendingMealTarget || guessDefaultMeal();
    const servVal = existingEntry
      ? String(existingEntry.servings || 1)
      : servingsOverride
        ? String(servingsOverride)
        : '1';
    $('log-servings-input').value = servVal;
    $('recipe-ing-search').value = '';
    $('food-modal-submit-btn').textContent = editingEntryId ? 'Save Changes' : 'Add to Day';

    document.querySelectorAll('.preset-mult-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.mult === servVal);
    });

    renderRecipeEditor();
    updateFoodModalPreview();
    updateFoodModalFavButton();
    openModal('food-log-modal');
  }

  function updateFoodModalFavButton() {
    if (!activeModalFood) return;
    const isFav = (state.favorites || []).includes(activeModalFood.id);
    $('food-modal-fav-btn').textContent = isFav ? '★ Favorited' : '☆ Favorite';
  }

  function renderRecipeEditor() {
    if (!activeModalFood) return;
    const totals = computeRecipeTotals(activeRecipeItems, state.customIngredients);
    const changeSummary = summarizeRecipeChanges(
      activeRecipeOriginalItems,
      activeRecipeItems,
      state.customIngredients
    );
    const hasCustomDefault = Boolean(state.defaultRecipes?.[activeModalFood.id]?.length);

    $('recipe-total-weight').textContent = `${totals.totalAmount} g`;
    $('reset-recipe-btn').hidden = !changeSummary && !hasCustomDefault;

    // Saved presets for this recipe
    const savedList = state.savedRecipes?.[activeModalFood.id] || [];
    const savedWrap = $('recipe-saved-wrap');
    if (savedList.length > 0) {
      savedWrap.hidden = false;
      $('recipe-saved-list').innerHTML = savedList
        .map(
          (preset) => `
          <span class="ing-pill-saved-group">
            <button type="button" class="ing-pill ing-pill-saved" data-apply-recipe-preset="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</button>
            <button type="button" class="ing-pill-saved-del" data-delete-recipe-preset="${escapeHtml(preset.id)}" aria-label="Delete preset">&times;</button>
          </span>
        `
        )
        .join('');
    } else {
      savedWrap.hidden = true;
      $('recipe-saved-list').innerHTML = '';
    }

    // Active editable ingredient rows
    const listEl = $('recipe-ingredients-list');
    if (activeRecipeItems.length === 0) {
      listEl.innerHTML =
        '<p class="section-subtitle" style="margin:2px 0;">No ingredients left — add ingredients below from the Ingredients DB.</p>';
    } else {
      listEl.innerHTML = activeRecipeItems
        .map((item, idx) => {
          const ing = resolveIngredient(item, state.customIngredients);
          if (!ing) return '';
          const unit = ing.unit || 'g';
          const amt = Number(item.amount) || 0;
          const ratio = amt / 100;
          const kcal = Math.round((Number(ing.calories) || 0) * ratio);
          const p = ((Number(ing.protein) || 0) * ratio).toFixed(1);
          const c = ((Number(ing.carbs) || 0) * ratio).toFixed(1);
          const sug = ((Number(ing.sugar) || 0) * ratio).toFixed(1);
          const salt = ((Number(ing.salt) || 0) * ratio).toFixed(2);
          const step = item.ingredientId === 'table-salt' || amt < 5 ? 0.5 : amt <= 25 ? 5 : 10;
          return `
            <div class="recipe-ing-row">
              <div class="recipe-ing-top">
                <div class="recipe-ing-info">
                  <span class="recipe-ing-name">${escapeHtml(ing.name)}</span>
                  <span class="recipe-ing-macros">${kcal} kcal · ${p}g P · ${c}g C · ${sug}g Sugars · ${salt}g Salt</span>
                </div>
                <button type="button" class="ing-remove-btn" data-ing-remove-idx="${idx}" aria-label="Remove ${escapeHtml(ing.name)}">&times;</button>
              </div>
              <div class="recipe-ing-controls">
                <div class="qty-stepper">
                  <button type="button" class="qty-step-btn" data-ing-step-idx="${idx}" data-ing-step-delta="${-step}" aria-label="Decrease amount">&minus;</button>
                  <input type="number" class="qty-input" data-ing-qty-idx="${idx}" min="0" max="2000" step="any" value="${amt}" aria-label="${escapeHtml(ing.name)} amount" />
                  <button type="button" class="qty-step-btn" data-ing-step-idx="${idx}" data-ing-step-delta="${step}" aria-label="Increase amount">+</button>
                  <span class="qty-unit">${escapeHtml(unit)}</span>
                </div>
                <span class="entry-meta">${Math.round(ing.calories)} kcal / 100${escapeHtml(unit)}</span>
              </div>
            </div>
          `;
        })
        .join('');
    }

    renderRecipePickerList();
  }

  function renderRecipePickerList() {
    const pickerEl = $('recipe-ing-picker-list');
    if (!pickerEl) return;
    const q = recipePickerQuery.trim();
    const allIngs = getAllIngredients();
    const popularIds = [
      'olive-oil',
      'feta-cheese',
      'chicken-breast',
      'whole-egg',
      'carrots',
      'tomato',
      'avocado',
      'tzatziki',
      'lemon-juice',
      'fresh-dill',
      'white-rice-cooked',
      'table-salt',
    ];

    let matches;
    if (q) {
      matches = allIngs
        .filter((ing) => matchesSearchQuery(`${ing.name} ${ing.category}`, q))
        .slice(0, 12);
    } else {
      const existingSet = new Set(activeRecipeItems.map((it) => it.ingredientId));
      matches = popularIds
        .map((id) => findIngredientById(id))
        .filter((ing) => ing && !existingSet.has(ing.id))
        .slice(0, 6);
    }

    if (matches.length === 0) {
      pickerEl.innerHTML =
        '<p class="section-subtitle" style="margin:2px 0;">No ingredient matched. Tap "+ New Ingredient" above to add it to the Ingredients DB.</p>';
      return;
    }

    pickerEl.innerHTML = matches
      .map((ing) => {
        const unit = ing.unit || 'g';
        return `
          <div class="picker-ing-row">
            <div class="recipe-ing-info">
              <span class="recipe-ing-name">${escapeHtml(ing.name)}</span>
              <span class="recipe-ing-macros">${Math.round(ing.calories)} kcal · ${ing.protein}g P · ${ing.carbs}g C · ${ing.sugar}g Sugars · ${ing.salt}g Salt / 100${escapeHtml(unit)}</span>
            </div>
            <div class="picker-ing-add-wrap">
              <input type="number" class="picker-qty-input" data-picker-qty-for="${escapeHtml(ing.id)}" min="0.5" max="1000" step="any" value="${ing.defaultAmount || 50}" aria-label="Amount in ${escapeHtml(unit)}" />
              <span class="qty-unit">${escapeHtml(unit)}</span>
              <button type="button" class="btn btn-soft btn-xs" data-picker-add-ing="${escapeHtml(ing.id)}">+ Add</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function addIngredientToActiveRecipe(ingredientId, customAmount) {
    const ing = findIngredientById(ingredientId);
    if (!ing) return;
    const amt = Math.max(0.5, Number(customAmount) || ing.defaultAmount || 50);
    const existing = activeRecipeItems.find((it) => it.ingredientId === ing.id);
    if (existing) {
      existing.amount = Number((Number(existing.amount) + amt).toFixed(1));
    } else {
      activeRecipeItems.push({ ingredientId: ing.id, amount: amt });
    }
    recipePickerQuery = '';
    if ($('recipe-ing-search')) $('recipe-ing-search').value = '';
    renderRecipeEditor();
    updateFoodModalPreview();
    showToast(`Added ${ing.name} (${amt} ${ing.unit || 'g'})`);
  }

  function saveAsDefaultRecipe() {
    if (!activeModalFood) return;
    if (!state.defaultRecipes) state.defaultRecipes = {};
    state.defaultRecipes[activeModalFood.id] = cloneRecipeItems(activeRecipeItems);
    invalidateRecipeCaches(activeModalFood.id);
    persist();
    renderRecipeEditor();
    if (activeTab === 'foods') renderFoodsLibrary();
    showToast(`Saved default recipe for ${activeModalFood.name}`);
  }

  function saveRecipePreset() {
    if (!activeModalFood) return;
    if (!state.savedRecipes) state.savedRecipes = {};
    if (!Array.isArray(state.savedRecipes[activeModalFood.id])) {
      state.savedRecipes[activeModalFood.id] = [];
    }
    const summary = summarizeRecipeChanges(
      activeRecipeOriginalItems,
      activeRecipeItems,
      state.customIngredients
    );
    const existingList = state.savedRecipes[activeModalFood.id];
    const label = summary || `Custom Version #${existingList.length + 1}`;
    existingList.unshift({
      id: makeId('rec'),
      label,
      items: cloneRecipeItems(activeRecipeItems),
    });
    persist();
    renderRecipeEditor();
    showToast(`Saved preset: ${label}`);
  }

  function resetCurrentRecipe() {
    if (!activeModalFood) return;
    if (state.defaultRecipes && state.defaultRecipes[activeModalFood.id]) {
      delete state.defaultRecipes[activeModalFood.id];
    }
    invalidateRecipeCaches(activeModalFood.id);
    activeRecipeItems = cloneRecipeItems(activeRecipeOriginalItems);
    persist();
    renderRecipeEditor();
    updateFoodModalPreview();
    if (activeTab === 'foods') renderFoodsLibrary();
    showToast('Reset to original recipe');
  }

  function updateFoodModalPreview() {
    if (!activeModalFood) return;
    const mult = Math.max(0.1, Number($('log-servings-input').value) || 1);
    const f = getEffectiveModalFood();
    if (!f) return;

    $('food-modal-desc').textContent = f.description || '';
    $('food-modal-serving').textContent = f.serving;

    $('food-modal-macro-preview').innerHTML = `
      <div class="modal-macro-cell"><strong>${Math.round(f.calories * mult)}</strong><span>kcal</span></div>
      <div class="modal-macro-cell"><strong>${(f.protein * mult).toFixed(1)} g</strong><span>Protein</span></div>
      <div class="modal-macro-cell"><strong>${(f.carbs * mult).toFixed(1)} g</strong><span>Carbs</span></div>
      <div class="modal-macro-cell"><strong>${(f.fat * mult).toFixed(1)} g</strong><span>Fat</span></div>
    `;

    $('food-modal-macro-extra').innerHTML = `
      <div class="modal-macro-extra-cell"><strong>${((f.sugar || 0) * mult).toFixed(1)} g</strong><span>Sugars</span></div>
      <div class="modal-macro-extra-cell"><strong>${(getFoodSaltGrams(f) * mult).toFixed(2)} g</strong><span>Salt</span></div>
      <div class="modal-macro-extra-cell"><strong>${((f.fiber || 0) * mult).toFixed(1)} g</strong><span>Fiber</span></div>
    `;
  }

  /* ==================== ON-DEVICE SIGLIP PHOTO SCAN MODAL ==================== */
  function setScanMode(mode) {
    scanModalMode = mode === 'barcode' ? 'barcode' : 'photo';
    stopBarcodeCamera();
    $('scan-mode-photo-btn')?.classList.toggle('is-active', scanModalMode === 'photo');
    $('scan-mode-barcode-btn')?.classList.toggle('is-active', scanModalMode === 'barcode');
    if ($('scan-photo-section')) $('scan-photo-section').hidden = scanModalMode !== 'photo';
    if ($('scan-barcode-section')) $('scan-barcode-section').hidden = scanModalMode !== 'barcode';
  }

  function openScanModal() {
    $('scan-meal-select').value = pendingMealTarget || guessDefaultMeal();
    const st = window.EuLogVision.getStatus();
    $('siglip-status-badge').textContent =
      st.status === 'ready'
        ? `SigLIP Vision Ready (${st.device.toUpperCase()})`
        : `SigLIP Vision (q4 · ${USDA_FOODS.length} Foods)`;
    setScanMode(scanModalMode);
    document.querySelectorAll('[data-scan-portion]').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.scanPortion) === activeScanPortion);
    });
    openModal('scan-modal');
  }

  function renderScanResults() {
    if (!lastScanOutput || !Array.isArray(lastScanOutput.results)) return;
    const output = lastScanOutput;
    const mult = Number(activeScanPortion) || 1;
    const multBadge = mult === 1 ? '' : `${mult}× · `;
    const maxScore = Math.max(1e-9, ...output.results.map((r) => r.score));
    $('scan-results-list').innerHTML = output.results
      .map(({ food: rawFood, score }, idx) => {
        const food = getEffectiveFoodForLog(rawFood);
        const relPct = Math.max(18, Math.min(100, Math.round((score / maxScore) * 100)));
        const dispPct =
          output.engine === 'siglip'
            ? `${Math.round(score * 100)}% match`
            : `${Math.round(score * 100)}% visual`;
        const kcal = Math.round((food.calories || 0) * mult);
        const p = ((food.protein || 0) * mult).toFixed(1);
        const c = ((food.carbs || 0) * mult).toFixed(1);
        const sug = ((food.sugar || 0) * mult).toFixed(1);
        const salt = (getFoodSaltGrams(food) * mult).toFixed(1);
        return `
          <div class="scan-result-row">
            <div class="scan-result-info">
              <div class="scan-result-top">
                <strong>${escapeHtml(food.name)}</strong>
                <span class="entry-meta">${idx === 0 ? '★ ' : ''}${dispPct} · ${kcal} kcal</span>
              </div>
              <span class="entry-meta">${multBadge}${escapeHtml(food.serving)} · ${p}g P · ${c}g C · ${sug}g Sug · ${salt}g Salt</span>
              <div class="scan-conf-bar"><div class="scan-conf-fill" style="width:${relPct}%"></div></div>
            </div>
            <div class="scan-row-actions">
              <button type="button" class="btn btn-soft btn-xs" data-scan-custom-id="${escapeHtml(rawFood.id)}">Edit</button>
              <button type="button" class="btn btn-primary btn-xs" data-scan-log-id="${escapeHtml(rawFood.id)}">+ Log</button>
            </div>
          </div>
        `;
      })
      .join('');
    $('scan-results-section').hidden = false;
  }

  async function analyzePhotoSource(source) {
    const progWrap = $('scan-progress-wrap');
    const progBar = $('scan-progress-bar');
    const progText = $('scan-progress-text');
    const progPct = $('scan-progress-pct');
    progWrap.hidden = false;
    progBar.style.width = '5%';
    progText.textContent = 'Preparing compact photo frame…';
    progPct.textContent = '5%';
    $('scan-results-section').hidden = true;

    try {
      const output = await window.EuLogVision.recognizeFoodPhoto(source, USDA_FOODS, ({ pct, text }) => {
        progBar.style.width = `${pct}%`;
        progText.textContent = text;
        progPct.textContent = `${pct}%`;
      });

      if (output.previewUrl) {
        const preview = $('scan-preview-img');
        preview.src = output.previewUrl;
        preview.hidden = false;
        $('scan-empty-prompt').hidden = true;
      }

      $('siglip-status-badge').textContent =
        output.engine === 'siglip'
          ? `SigLIP (${output.device.toUpperCase()}) · ${(output.elapsedMs / 1000).toFixed(1)}s`
          : 'Offline Visual Quick-Match';

      $('scan-engine-note').textContent =
        output.engine === 'siglip'
          ? `Matched across all ${output.totalFoods || USDA_FOODS.length} recipes`
          : 'Connect once to cache 60 MB SigLIP Vision weights';

      lastScanOutput = output;
      renderScanResults();
    } catch (err) {
      console.error('Photo scan failed:', err);
      progText.textContent = 'Could not read that photo — try Live Camera or another image';
      progPct.textContent = '';
      showToast('Could not read photo — please try again');
    }
  }

  function handlePhotoFile(file) {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      showToast('Please select a valid image file');
      return;
    }
    analyzePhotoSource(file);
  }

  /* ==================== EU BARCODE SCANNER (OPEN FOOD FACTS + OFFLINE CACHE) ==================== */
  function stopBarcodeCamera() {
    if (barcodeScanTimer) {
      clearInterval(barcodeScanTimer);
      barcodeScanTimer = null;
    }
    if (barcodeCameraStream) {
      for (const track of barcodeCameraStream.getTracks()) track.stop();
      barcodeCameraStream = null;
    }
    const video = $('barcode-live-video');
    if (video) {
      video.srcObject = null;
    }
    if ($('barcode-viewport')) $('barcode-viewport').hidden = true;
    if ($('barcode-empty-prompt')) $('barcode-empty-prompt').hidden = false;
    if ($('barcode-start-cam-btn')) $('barcode-start-cam-btn').hidden = false;
    if ($('barcode-photo-label')) $('barcode-photo-label').hidden = false;
    if ($('barcode-stop-cam-btn')) $('barcode-stop-cam-btn').hidden = true;
  }

  async function startBarcodeCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Live camera unavailable — use Scan Barcode Photo or type the EAN-13 below');
      return;
    }
    try {
      stopBarcodeCamera();
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback for older devices rejecting ideal resolution constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      }

      barcodeCameraStream = stream;
      const video = $('barcode-live-video');
      video.srcObject = stream;
      if ($('barcode-viewport')) $('barcode-viewport').hidden = false;
      $('barcode-empty-prompt').hidden = true;
      $('barcode-start-cam-btn').hidden = true;
      if ($('barcode-photo-label')) $('barcode-photo-label').hidden = true;
      $('barcode-stop-cam-btn').hidden = false;
      await video.play().catch(() => {});

      const nativeDetector =
        'BarcodeDetector' in window
          ? new window.BarcodeDetector({
              formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
            })
          : null;
      const jsScanner = window.EuLogBarcode || null;

      let scanning = false;
      let lastCandidate = '';
      let candidateStreak = 0;

      const onDecoded = (rawCode) => {
        const code = String(rawCode || '').replace(/[^\d]/g, '').trim();
        if (code.length < 6) return;
        stopBarcodeCamera();
        if (navigator.vibrate) navigator.vibrate(40);
        if ($('barcode-manual-input')) $('barcode-manual-input').value = code;
        lookupBarcode(code);
      };

      barcodeScanTimer = setInterval(async () => {
        if (scanning || !video || video.readyState < 2) return;
        scanning = true;
        try {
          // 1. Native BarcodeDetector fast-path (Chrome/Android/Edge)
          if (nativeDetector) {
            try {
              const hits = await nativeDetector.detect(video);
              if (hits && hits.length > 0 && hits[0].rawValue) {
                onDecoded(hits[0].rawValue);
                return;
              }
            } catch {
              // fall through to built-in cross-browser JS decoder
            }
          }

          // 2. Built-in pure-JS EAN-13 / EAN-8 / UPC-A scanner (iOS Safari, Firefox & fallback)
          if (jsScanner) {
            const hit = jsScanner.decodeFromVideo(video);
            if (hit && hit.code) {
              if (hit.confidence >= 3) {
                onDecoded(hit.code);
                return;
              }
              if (hit.code === lastCandidate) {
                candidateStreak += 1;
              } else {
                lastCandidate = hit.code;
                candidateStreak = 1;
              }
              if (candidateStreak >= 2) {
                onDecoded(hit.code);
                return;
              }
            }
          }
        } finally {
          scanning = false;
        }
      }, 180);
    } catch (err) {
      console.warn('Barcode camera failed:', err);
      stopBarcodeCamera();
      showToast('Camera permission blocked — try Scan Barcode Photo or enter the number below');
    }
  }

  async function handleBarcodePhotoFile(file) {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      showToast('Please choose a barcode photo');
      return;
    }
    const card = $('barcode-result-card');
    if (card) {
      card.hidden = false;
      card.innerHTML = '<p class="section-subtitle" style="margin:0;">Scanning barcode from photo…</p>';
    }
    try {
      const hit = window.EuLogBarcode ? await window.EuLogBarcode.decodeFromFile(file) : null;
      if (hit && hit.code) {
        if ($('barcode-manual-input')) $('barcode-manual-input').value = hit.code;
        if (navigator.vibrate) navigator.vibrate(40);
        showToast(`Detected barcode ${hit.code}`);
        await lookupBarcode(hit.code);
      } else {
        if (card) {
          card.innerHTML =
            '<p class="section-subtitle" style="margin:0;">Could not read the barcode lines from that photo. Hold the barcode flat in good lighting (or type the EAN-13 number below).</p>';
        }
        showToast('No barcode detected in photo — try closer & sharper');
      }
    } catch (err) {
      console.warn('Barcode photo decode error:', err);
      if (card) card.hidden = true;
      showToast('Could not read barcode photo');
    }
  }

  function renderBarcodeResult(product, sourceNote = '') {
    const card = $('barcode-result-card');
    if (!card) return;
    if (!product) {
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    activeBarcodeProduct = product;
    const unit = product.unit || 'g';
    const defAmt = product.defaultAmount || 100;
    card.innerHTML = `
      <div class="subrecipe-head">
        <div>
          <strong style="font-size:0.95rem;">${escapeHtml(product.name)}</strong>
          <span class="subrecipe-hint">${escapeHtml(product.brand || 'EU Packaged Product')} · EAN ${escapeHtml(product.barcode)}${sourceNote ? ` · ${escapeHtml(sourceNote)}` : ''}</span>
        </div>
      </div>
      <div class="modal-macro-strip">
        <div class="modal-macro-cell"><strong>${Math.round(product.calories)}</strong><span>kcal / 100${escapeHtml(unit)}</span></div>
        <div class="modal-macro-cell"><strong>${product.protein} g</strong><span>Protein</span></div>
        <div class="modal-macro-cell"><strong>${product.carbs} g</strong><span>Carbs</span></div>
        <div class="modal-macro-cell"><strong>${product.fat} g</strong><span>Fat</span></div>
      </div>
      <div class="modal-macro-extra">
        <div class="modal-macro-extra-cell"><strong>${product.sugar} g</strong><span>Sugars</span></div>
        <div class="modal-macro-extra-cell"><strong>${product.salt} g</strong><span>Salt</span></div>
        <div class="modal-macro-extra-cell"><strong>${product.fiber} g</strong><span>Fiber</span></div>
      </div>
      <div class="barcode-portion-row">
        <label for="barcode-portion-input" class="field-label" style="margin:0;">Portion to log:</label>
        <div class="qty-stepper">
          <input id="barcode-portion-input" type="number" class="qty-input" min="1" max="2000" step="any" value="${defAmt}" />
          <span class="qty-unit">${escapeHtml(unit)}</span>
        </div>
      </div>
      <div class="barcode-actions-row">
        <button type="button" class="btn btn-primary btn-sm" data-barcode-log="1">+ Log Portion</button>
        <button type="button" class="btn btn-soft btn-sm" data-barcode-save-ing="1">Save to Ingredients DB</button>
      </div>
    `;
    card.hidden = false;
  }

  async function lookupBarcode(rawCode) {
    const code = String(rawCode || '').replace(/[^\d]/g, '').trim();
    const card = $('barcode-result-card');
    if (code.length < 6) {
      showToast('Enter a valid barcode (6–14 digits)');
      return;
    }

    // 1. Offline-first: check local barcode cache
    if (state.barcodeCache && state.barcodeCache[code]) {
      renderBarcodeResult(state.barcodeCache[code], 'Offline Cache');
      showToast(`Found cached barcode ${code}`);
      return;
    }

    card.hidden = false;
    card.innerHTML = '<p class="section-subtitle" style="margin:0;">Looking up EU nutrition label via Open Food Facts…</p>';

    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,product_name_el,generic_name,brands,serving_size,quantity,nutriments`;
      const resp = await fetch(url);
      if (!resp.ok && resp.status !== 404) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const prod = data?.product;
      if (!prod || data.status === 0) {
        card.innerHTML = `
          <p class="section-subtitle" style="margin:0;">Barcode <strong>${escapeHtml(code)}</strong> not found in Open Food Facts. You can add it manually to your Ingredients DB.</p>
          <button type="button" class="btn btn-soft btn-sm" data-barcode-manual-add="1">+ Add Manually to Ingredients DB</button>
        `;
        return;
      }

      const n = prod.nutriments || {};
      const kcal = Number(n['energy-kcal_100g'] ?? (n.energy_100g ? Number(n.energy_100g) / 4.184 : 0)) || 0;
      const protein = Number(n.proteins_100g) || 0;
      const carbs = Number(n.carbohydrates_100g) || 0;
      const sugar = Number(n.sugars_100g) || 0;
      const fat = Number(n.fat_100g) || 0;
      const fiber = Number(n.fiber_100g) || 0;
      const salt =
        n.salt_100g != null
          ? Number(n.salt_100g)
          : n.sodium_100g != null
            ? Number(n.sodium_100g) * 2.5
            : 0;
      const isLiquid = /\b(ml|cl|l)\b/i.test(`${prod.quantity || ''} ${prod.serving_size || ''}`);
      const parsedServing = parseFloat(String(prod.serving_size || '').match(/(\d+(?:\.\d+)?)\s*(g|ml)/i)?.[1] || '100');
      const resolvedName =
        prod.product_name ||
        prod.product_name_en ||
        prod.product_name_el ||
        prod.generic_name ||
        `Product ${code}`;

      const normalized = {
        barcode: code,
        name: String(resolvedName).trim(),
        brand: String(prod.brands || '').split(',')[0].trim(),
        unit: isLiquid ? 'ml' : 'g',
        defaultAmount: Math.max(5, Math.round(parsedServing || 100)),
        calories: Number(kcal.toFixed(1)),
        protein: Number(protein.toFixed(1)),
        carbs: Number(carbs.toFixed(1)),
        sugar: Number(sugar.toFixed(1)),
        fat: Number(fat.toFixed(1)),
        salt: Number(salt.toFixed(2)),
        fiber: Number(fiber.toFixed(1)),
      };

      if (!state.barcodeCache) state.barcodeCache = {};
      state.barcodeCache[code] = normalized;
      persist();
      renderBarcodeResult(normalized, 'Open Food Facts EU');
    } catch (err) {
      console.warn('Barcode lookup failed:', err);
      card.innerHTML = `
        <p class="section-subtitle" style="margin:0;">Offline or unable to reach Open Food Facts right now. Previously scanned barcodes work offline, or you can add this item to your Ingredients DB.</p>
        <button type="button" class="btn btn-soft btn-sm" data-barcode-manual-add="1">+ Add Manually to Ingredients DB</button>
      `;
    }
  }

  function logActiveBarcodeProduct() {
    if (!activeBarcodeProduct) return;
    const p = activeBarcodeProduct;
    const amt = Math.max(1, Number($('barcode-portion-input')?.value) || p.defaultAmount || 100);
    const ratio = amt / 100;
    const meal = $('scan-meal-select')?.value || pendingMealTarget || guessDefaultMeal();
    const foodObj = {
      id: `ean:${p.barcode}`,
      name: p.brand ? `${p.name} (${p.brand})` : p.name,
      category: 'Packaged (EU)',
      serving: `${amt} ${p.unit || 'g'}`,
      grams: amt,
      calories: Math.round(p.calories * ratio),
      protein: Number((p.protein * ratio).toFixed(1)),
      carbs: Number((p.carbs * ratio).toFixed(1)),
      fat: Number((p.fat * ratio).toFixed(1)),
      fiber: Number((p.fiber * ratio).toFixed(1)),
      sugar: Number((p.sugar * ratio).toFixed(1)),
      salt: Number((p.salt * ratio).toFixed(2)),
      description: `${p.name}${p.brand ? ` (${p.brand})` : ''} — EU barcode ${p.barcode} (${amt} ${p.unit || 'g'}). Macros: Protein ${(p.protein * ratio).toFixed(1)} g · Carbs ${(p.carbs * ratio).toFixed(1)} g · Sugars ${(p.sugar * ratio).toFixed(1)} g · Fat ${(p.fat * ratio).toFixed(1)} g · Salt ${(p.salt * ratio).toFixed(2)} g.`,
      nutrients: { sodium: Math.round(((p.salt * ratio) / 2.5) * 1000) },
    };
    logFoodEntry(foodObj, meal, 1, selectedDateKey);
  }

  function saveActiveBarcodeToIngredients() {
    if (!activeBarcodeProduct) return;
    const p = activeBarcodeProduct;
    const ingId = `ean-${p.barcode}`;
    if (!Array.isArray(state.customIngredients)) state.customIngredients = [];
    const exists = state.customIngredients.find((i) => i.id === ingId);
    const entry = {
      id: ingId,
      name: p.brand ? `${p.name} (${p.brand})` : p.name,
      category: 'Oils & Sauces',
      unit: p.unit || 'g',
      defaultAmount: p.defaultAmount || 100,
      calories: p.calories,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      sugar: p.sugar,
      salt: p.salt,
      fiber: p.fiber,
      nutrients: { sodium: Math.round((p.salt / 2.5) * 1000) },
      isCustom: true,
    };
    if (exists) {
      Object.assign(exists, entry);
    } else {
      state.customIngredients.unshift(entry);
    }
    invalidateRecipeCaches();
    persist();
    if (activeTab === 'foods') renderFoodsLibrary();
    showToast(`Saved ${entry.name} to Ingredients DB (offline ready)`);
  }

  /* ==================== CUSTOM SUPPLEMENT MODAL ==================== */
  function buildSuppNutrientInputs() {
    $('supp-nutrient-inputs').innerHTML = VITAL_NUTRIENTS.map(
      (n) => `
      <label class="nutrient-input-row">
        <span>${escapeHtml(n.short)} (${n.unit})</span>
        <input type="number" class="text-input" data-supp-nut="${n.key}" min="0" step="any" placeholder="0" />
      </label>
    `
    ).join('');
  }

  /* ==================== CREATE CUSTOM RECIPE BUILDER ==================== */
  function openCustomFoodModal() {
    $('custom-food-form').reset();
    customFoodMode = 'ingredients';
    customFoodItems = [];
    customFoodPickerQuery = '';
    if ($('cf-ing-search')) $('cf-ing-search').value = '';
    renderCustomFoodBuilder();
    openModal('custom-food-modal');
  }

  function renderCustomFoodBuilder() {
    const isIngMode = customFoodMode === 'ingredients';
    $('cf-mode-ingredients-btn')?.classList.toggle('is-active', isIngMode);
    $('cf-mode-manual-btn')?.classList.toggle('is-active', !isIngMode);
    if ($('cf-ingredients-section')) $('cf-ingredients-section').hidden = !isIngMode;
    if ($('cf-manual-section')) $('cf-manual-section').hidden = isIngMode;

    if (!isIngMode) return;

    const totals = computeRecipeTotals(customFoodItems, state.customIngredients);
    if ($('cf-builder-weight')) $('cf-builder-weight').textContent = `${totals.totalAmount} g`;

    if ($('cf-builder-macros')) {
      $('cf-builder-macros').innerHTML = `
        <div class="modal-macro-cell"><strong>${totals.calories}</strong><span>kcal</span></div>
        <div class="modal-macro-cell"><strong>${totals.protein.toFixed(1)} g</strong><span>Protein</span></div>
        <div class="modal-macro-cell"><strong>${totals.carbs.toFixed(1)} g</strong><span>Carbs</span></div>
        <div class="modal-macro-cell"><strong>${totals.fat.toFixed(1)} g</strong><span>Fat</span></div>
      `;
    }
    if ($('cf-builder-extra')) {
      $('cf-builder-extra').innerHTML = `
        <div class="modal-macro-extra-cell"><strong>${totals.sugar.toFixed(1)} g</strong><span>Sugars</span></div>
        <div class="modal-macro-extra-cell"><strong>${totals.salt.toFixed(2)} g</strong><span>Salt</span></div>
        <div class="modal-macro-extra-cell"><strong>${totals.fiber.toFixed(1)} g</strong><span>Fiber</span></div>
      `;
    }

    const listEl = $('cf-ingredients-list');
    if (listEl) {
      if (customFoodItems.length === 0) {
        listEl.innerHTML =
          '<p class="section-subtitle" style="margin:2px 0;">No ingredients added yet — pick ingredients below to build your recipe.</p>';
      } else {
        listEl.innerHTML = customFoodItems
          .map((item, idx) => {
            const ing = resolveIngredient(item, state.customIngredients);
            if (!ing) return '';
            const unit = ing.unit || 'g';
            const amt = Number(item.amount) || 0;
            const ratio = amt / 100;
            const kcal = Math.round((Number(ing.calories) || 0) * ratio);
            const p = ((Number(ing.protein) || 0) * ratio).toFixed(1);
            const c = ((Number(ing.carbs) || 0) * ratio).toFixed(1);
            const sug = ((Number(ing.sugar) || 0) * ratio).toFixed(1);
            const salt = ((Number(ing.salt) || 0) * ratio).toFixed(2);
            const step = item.ingredientId === 'table-salt' || amt < 5 ? 0.5 : amt <= 25 ? 5 : 10;
            return `
              <div class="recipe-ing-row">
                <div class="recipe-ing-top">
                  <div class="recipe-ing-info">
                    <span class="recipe-ing-name">${escapeHtml(ing.name)}</span>
                    <span class="recipe-ing-macros">${kcal} kcal · ${p}g P · ${c}g C · ${sug}g Sugars · ${salt}g Salt</span>
                  </div>
                  <button type="button" class="ing-remove-btn" data-cf-remove-idx="${idx}" aria-label="Remove ${escapeHtml(ing.name)}">&times;</button>
                </div>
                <div class="recipe-ing-controls">
                  <div class="qty-stepper">
                    <button type="button" class="qty-step-btn" data-cf-step-idx="${idx}" data-cf-step-delta="${-step}" aria-label="Decrease amount">&minus;</button>
                    <input type="number" class="qty-input" data-cf-qty-idx="${idx}" min="0" max="2000" step="any" value="${amt}" aria-label="${escapeHtml(ing.name)} amount" />
                    <button type="button" class="qty-step-btn" data-cf-step-idx="${idx}" data-cf-step-delta="${step}" aria-label="Increase amount">+</button>
                    <span class="qty-unit">${escapeHtml(unit)}</span>
                  </div>
                  <span class="entry-meta">${Math.round(ing.calories)} kcal / 100${escapeHtml(unit)}</span>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    renderCustomFoodPickerList();
  }

  function renderCustomFoodPickerList() {
    const pickerEl = $('cf-ing-picker-list');
    if (!pickerEl) return;
    const q = customFoodPickerQuery.trim();
    const allIngs = getAllIngredients();
    const starterIds = [
      'chicken-breast',
      'white-rice-cooked',
      'whole-egg',
      'greek-yogurt-2',
      'olive-oil',
      'feta-cheese',
      'tomato',
      'rolled-oats',
    ];

    let matches;
    if (q) {
      matches = allIngs
        .filter((ing) => matchesSearchQuery(`${ing.name} ${ing.category}`, q))
        .slice(0, 12);
    } else {
      const existingSet = new Set(customFoodItems.map((it) => it.ingredientId));
      matches = starterIds
        .map((id) => findIngredientById(id))
        .filter((ing) => ing && !existingSet.has(ing.id))
        .slice(0, 6);
    }

    if (matches.length === 0) {
      pickerEl.innerHTML =
        '<p class="section-subtitle" style="margin:2px 0;">No ingredient matched. Tap "+ New Ingredient" above to add it.</p>';
      return;
    }

    pickerEl.innerHTML = matches
      .map((ing) => {
        const unit = ing.unit || 'g';
        return `
          <div class="picker-ing-row">
            <div class="recipe-ing-info">
              <span class="recipe-ing-name">${escapeHtml(ing.name)}</span>
              <span class="recipe-ing-macros">${Math.round(ing.calories)} kcal · ${ing.protein}g P · ${ing.carbs}g C · ${ing.sugar}g Sugars · ${ing.salt}g Salt / 100${escapeHtml(unit)}</span>
            </div>
            <div class="picker-ing-add-wrap">
              <input type="number" class="picker-qty-input" data-cf-picker-qty-for="${escapeHtml(ing.id)}" min="0.5" max="1000" step="any" value="${ing.defaultAmount || 50}" aria-label="Amount in ${escapeHtml(unit)}" />
              <span class="qty-unit">${escapeHtml(unit)}</span>
              <button type="button" class="btn btn-soft btn-xs" data-cf-picker-add-ing="${escapeHtml(ing.id)}">+ Add</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function addIngredientToCustomRecipe(ingredientId, customAmount) {
    const ing = findIngredientById(ingredientId);
    if (!ing) return;
    const amt = Math.max(0.5, Number(customAmount) || ing.defaultAmount || 50);
    const existing = customFoodItems.find((it) => it.ingredientId === ing.id);
    if (existing) {
      existing.amount = Number((Number(existing.amount) + amt).toFixed(1));
    } else {
      customFoodItems.push({ ingredientId: ing.id, amount: amt });
    }
    customFoodPickerQuery = '';
    if ($('cf-ing-search')) $('cf-ing-search').value = '';
    renderCustomFoodBuilder();
    showToast(`Added ${ing.name} (${amt} ${ing.unit || 'g'})`);
  }

  function adjustWater(deltaMl) {
    if (!state.waterLogs) state.waterLogs = {};
    const cur = Math.max(0, Number(state.waterLogs[selectedDateKey]) || 0);
    const next = Math.max(0, Math.min(12000, cur + deltaMl));
    if (next === 0) delete state.waterLogs[selectedDateKey];
    else state.waterLogs[selectedDateKey] = next;
    persist();
    renderToday();
    showToast(`Hydration: ${next.toLocaleString()} ml (${(next / 1000).toFixed(2)} L)`);
  }

  /* ==================== SETTINGS MODAL & METRIC CALCULATOR ==================== */
  function calculateAndApplyMetricGoals() {
    const sex = $('calc-sex')?.value === 'female' ? 'female' : 'male';
    const age = Math.max(14, Math.min(100, Number($('calc-age')?.value) || 28));
    const heightCm = Math.max(120, Math.min(230, Number($('calc-height')?.value) || 178));
    const weightKg = Math.max(35, Math.min(220, Number($('calc-weight')?.value) || 75));
    const activity = Math.max(1.2, Math.min(2.0, Number($('calc-activity')?.value) || 1.55));
    const objective = $('calc-objective')?.value || 'maintain';

    const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
    let targetKcal = Math.round((bmr * activity) / 50) * 50;
    if (objective === 'cut') targetKcal = Math.max(1200, targetKcal - 400);
    else if (objective === 'bulk') targetKcal += 250;

    const proteinPerKg = objective === 'cut' ? 2.0 : 1.8;
    const proteinG = Math.round((weightKg * proteinPerKg) / 5) * 5;
    const fatG = Math.round(((targetKcal * 0.27) / 9) / 5) * 5;
    const carbsG = Math.max(50, Math.round(((targetKcal - proteinG * 4 - fatG * 9) / 4) / 5) * 5);
    const sugarG = Math.min(50, Math.max(25, Math.round(((targetKcal * 0.09) / 4) / 5) * 5));
    const waterMl = Math.max(1800, Math.min(4500, Math.round((weightKg * 35) / 100) * 100));

    $('setting-cal-goal').value = targetKcal;
    $('setting-protein-goal').value = proteinG;
    $('setting-carbs-goal').value = carbsG;
    $('setting-fat-goal').value = fatG;
    if ($('setting-sugar-goal')) $('setting-sugar-goal').value = sugarG;
    if ($('setting-salt-goal')) $('setting-salt-goal').value = 5;
    if ($('setting-water-goal')) $('setting-water-goal').value = waterMl;

    state.settings.bodyMetrics = {
      sex,
      age,
      heightCm,
      weightKg,
      activity: String(activity),
      objective,
    };
    showToast(`Calculated: ${targetKcal.toLocaleString()} kcal · ${proteinG}g P · ${waterMl.toLocaleString()} ml water`);
  }

  function openSettingsModal() {
    $('setting-dv-profile').value = state.settings.dvProfile || 'standard';
    $('setting-cal-goal').value = state.settings.calorieGoal || 2000;
    $('setting-protein-goal').value = state.settings.proteinGoal || 110;
    $('setting-carbs-goal').value = state.settings.carbsGoal || 225;
    $('setting-fat-goal').value = state.settings.fatGoal || 65;
    if ($('setting-sugar-goal')) $('setting-sugar-goal').value = state.settings.sugarGoal || 50;
    if ($('setting-salt-goal')) $('setting-salt-goal').value = state.settings.saltGoal || 5;
    if ($('setting-water-goal')) $('setting-water-goal').value = state.settings.waterGoal || 2500;

    const bm = state.settings.bodyMetrics || {};
    if ($('calc-sex')) $('calc-sex').value = bm.sex || 'male';
    if ($('calc-age')) $('calc-age').value = bm.age || 28;
    if ($('calc-height')) $('calc-height').value = bm.heightCm || 178;
    if ($('calc-weight')) $('calc-weight').value = bm.weightKg || 75;
    if ($('calc-activity')) $('calc-activity').value = bm.activity || '1.55';
    if ($('calc-objective')) $('calc-objective').value = bm.objective || 'maintain';

    const st = window.EuLogVision.getStatus();
    $('preload-siglip-status').textContent = st.status === 'ready' ? `Cached (${st.device.toUpperCase()})` : '';
    applyTheme(state.settings.theme);
    openModal('settings-modal');
  }

  /* ==================== EVENT WIRING ==================== */
  function bindEvents() {
    // Navigation tabs (desktop & mobile)
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Header actions
    $('theme-toggle-btn').addEventListener('click', cycleTheme);
    $('open-scan-btn').addEventListener('click', openScanModal);
    $('quick-scan-btn').addEventListener('click', openScanModal);
    $('open-settings-btn').addEventListener('click', openSettingsModal);

    // Date navigation
    $('prev-day-btn').addEventListener('click', () => {
      selectedDateKey = shiftDateKey(selectedDateKey, -1);
      renderToday();
    });
    $('next-day-btn').addEventListener('click', () => {
      selectedDateKey = shiftDateKey(selectedDateKey, 1);
      renderToday();
    });
    $('jump-today-btn').addEventListener('click', () => {
      selectedDateKey = todayKey();
      renderToday();
    });

    // Touch swipe on date masthead
    let touchStartX = 0;
    $('swipe-date-zone').addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );
    $('swipe-date-zone').addEventListener(
      'touchend',
      (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 48) {
          selectedDateKey = shiftDateKey(selectedDateKey, dx > 0 ? -1 : 1);
          renderToday();
        }
      },
      { passive: true }
    );

    // Today quick actions
    $('quick-add-food-btn').addEventListener('click', () => {
      pendingMealTarget = guessDefaultMeal();
      switchTab('foods');
      $('foods-search-input').focus();
    });
    $('copy-yesterday-btn').addEventListener('click', copyPreviousDayMeals);
    $('goto-supps-btn').addEventListener('click', () => switchTab('supplements'));

    // Daily notes save
    let noteTimer = null;
    $('daily-notes-input').addEventListener('input', (e) => {
      const val = e.target.value;
      $('daily-notes-status').textContent = 'Saving…';
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        if (val.trim()) state.dailyNotes[selectedDateKey] = val;
        else delete state.dailyNotes[selectedDateKey];
        persist();
        $('daily-notes-status').textContent = 'Saved';
      }, 320);
    });

    // Supplements tab actions
    $('mark-all-supps-btn').addEventListener('click', () => {
      state.supplementLogs[selectedDateKey] = state.supplements.map((s) => s.id);
      persist();
      renderSupplements();
      showToast('Marked all supplements taken');
    });
    $('open-add-supp-btn').addEventListener('click', () => {
      $('custom-supp-form').reset();
      openModal('supp-modal');
    });

    $('custom-supp-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('supp-name-input').value.trim();
      const dose = $('supp-dose-input').value.trim();
      if (!name || !dose) return;

      const nutrients = {};
      document.querySelectorAll('[data-supp-nut]').forEach((inp) => {
        const v = Number(inp.value);
        if (v > 0) nutrients[inp.dataset.suppNut] = v;
      });

      state.supplements.push({
        id: makeId('supp'),
        name,
        dose,
        timing: $('supp-timing-select').value,
        notes: $('supp-notes-input').value.trim(),
        nutrients,
      });
      persist();
      closeModal('supp-modal');
      renderSupplements();
      showToast(`Added ${name} to stack`);
    });

    // Weekly controls
    $('prev-week-btn').addEventListener('click', () => {
      weeklyEndKey = shiftDateKey(weeklyEndKey, -7);
      renderWeekly();
    });
    $('next-week-btn').addEventListener('click', () => {
      weeklyEndKey = shiftDateKey(weeklyEndKey, 7);
      renderWeekly();
    });
    $('this-week-btn').addEventListener('click', () => {
      weeklyEndKey = todayKey();
      renderWeekly();
    });
    $('source-both-btn').addEventListener('click', () => {
      state.settings.includeSuppsInWeekly = true;
      persist();
      renderWeekly();
    });
    $('source-food-btn').addEventListener('click', () => {
      state.settings.includeSuppsInWeekly = false;
      persist();
      renderWeekly();
    });

    // Foods search & sort (debounced 75ms for smooth mobile typing across 2,154+ foods)
    $('foods-search-input').addEventListener('input', (e) => {
      foodsSearchQuery = e.target.value;
      foodsRenderLimit = 80;
      clearTimeout(foodsSearchTimer);
      if (!foodsSearchQuery.trim()) {
        renderFoodsLibrary();
        return;
      }
      foodsSearchTimer = setTimeout(renderFoodsLibrary, 75);
    });
    $('foods-sort-select').addEventListener('change', (e) => {
      foodsSortBy = e.target.value;
      foodsRenderLimit = 80;
      renderFoodsLibrary();
    });
    $('open-custom-food-btn').addEventListener('click', () => {
      if (foodsLibraryMode === 'ingredients') {
        $('custom-ingredient-form').reset();
        openModal('custom-ingredient-modal');
      } else {
        openCustomFoodModal();
      }
    });

    $('open-new-ing-from-recipe-btn').addEventListener('click', () => {
      $('custom-ingredient-form').reset();
      openModal('custom-ingredient-modal');
    });

    $('open-new-ing-from-cf-btn')?.addEventListener('click', () => {
      $('custom-ingredient-form').reset();
      openModal('custom-ingredient-modal');
    });

    $('cf-ing-search')?.addEventListener('input', (e) => {
      customFoodPickerQuery = e.target.value;
      renderCustomFoodPickerList();
    });

    $('cf-ingredients-list')?.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-cf-qty-idx]');
      if (!inp) return;
      const idx = Number(inp.dataset.cfQtyIdx);
      if (!Number.isInteger(idx) || !customFoodItems[idx]) return;
      const val = Math.max(0, Number(inp.value) || 0);
      customFoodItems[idx].amount = val;
      const ing = resolveIngredient(customFoodItems[idx], state.customIngredients);
      const row = inp.closest('.recipe-ing-row');
      if (ing && row) {
        const ratio = val / 100;
        const macEl = row.querySelector('.recipe-ing-macros');
        if (macEl) {
          macEl.textContent = `${Math.round((Number(ing.calories) || 0) * ratio)} kcal · ${((Number(ing.protein) || 0) * ratio).toFixed(1)}g P · ${((Number(ing.carbs) || 0) * ratio).toFixed(1)}g C · ${((Number(ing.sugar) || 0) * ratio).toFixed(1)}g Sugars · ${((Number(ing.salt) || 0) * ratio).toFixed(2)}g Salt`;
        }
      }
      const totals = computeRecipeTotals(customFoodItems, state.customIngredients);
      if ($('cf-builder-weight')) $('cf-builder-weight').textContent = `${totals.totalAmount} g`;
      if ($('cf-builder-macros')) {
        $('cf-builder-macros').innerHTML = `
          <div class="modal-macro-cell"><strong>${totals.calories}</strong><span>kcal</span></div>
          <div class="modal-macro-cell"><strong>${totals.protein.toFixed(1)} g</strong><span>Protein</span></div>
          <div class="modal-macro-cell"><strong>${totals.carbs.toFixed(1)} g</strong><span>Carbs</span></div>
          <div class="modal-macro-cell"><strong>${totals.fat.toFixed(1)} g</strong><span>Fat</span></div>
        `;
      }
      if ($('cf-builder-extra')) {
        $('cf-builder-extra').innerHTML = `
          <div class="modal-macro-extra-cell"><strong>${totals.sugar.toFixed(1)} g</strong><span>Sugars</span></div>
          <div class="modal-macro-extra-cell"><strong>${totals.salt.toFixed(2)} g</strong><span>Salt</span></div>
          <div class="modal-macro-extra-cell"><strong>${totals.fiber.toFixed(1)} g</strong><span>Fiber</span></div>
        `;
      }
    });

    $('custom-food-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('cf-name').value.trim();
      if (!name) return;

      if (customFoodMode === 'ingredients') {
        if (customFoodItems.length === 0) {
          showToast('Add at least one ingredient from the DB');
          return;
        }
        const shell = {
          id: makeId('cfood'),
          name,
          category: 'Custom',
          serving: '1 recipe',
          grams: 100,
          description: `${name} — custom recipe built from ingredients.`,
          prompt: name.toLowerCase(),
          colorHint: 'brown',
          isCustom: true,
        };
        const built = buildFoodFromRecipeItems(
          shell,
          customFoodItems,
          state.customIngredients,
          customFoodItems
        );
        const storedCustom = {
          ...built,
          recipeItems: cloneRecipeItems(customFoodItems),
        };
        state.customFoods.unshift(storedCustom);
        persist();
        closeModal('custom-food-modal');
        logFoodEntry(storedCustom, pendingMealTarget || guessDefaultMeal(), 1, selectedDateKey);
        if (activeTab === 'foods') renderFoodsLibrary();
        return;
      }

      const serving = $('cf-serving').value.trim() || '1 serving (100 g)';
      const saltVal = Number($('cf-salt').value) || 0;
      const customFood = {
        id: makeId('cfood'),
        name,
        category: 'Custom',
        serving,
        grams: 100,
        calories: Number($('cf-calories').value) || 0,
        protein: Number($('cf-protein').value) || 0,
        carbs: Number($('cf-carbs').value) || 0,
        fat: Number($('cf-fat').value) || 0,
        fiber: Number($('cf-fiber').value) || 0,
        sugar: Number($('cf-sugar').value) || 0,
        salt: saltVal,
        description: `${name} — custom recipe (${serving}).`,
        nutrients: { sodium: Math.round((saltVal / 2.5) * 1000) },
        prompt: name.toLowerCase(),
        colorHint: 'brown',
        isCustom: true,
      };
      state.customFoods.unshift(customFood);
      persist();
      closeModal('custom-food-modal');
      logFoodEntry(getEffectiveFoodForLog(customFood), pendingMealTarget || guessDefaultMeal(), 1, selectedDateKey);
      if (activeTab === 'foods') renderFoodsLibrary();
    });

    $('custom-ingredient-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('ci-name').value.trim();
      if (!name) return;
      const saltVal = Number($('ci-salt').value) || 0;
      const newIng = {
        id: makeId('cing'),
        name,
        category: $('ci-category').value || 'Vegetables',
        unit: $('ci-unit').value === 'ml' ? 'ml' : 'g',
        defaultAmount: Math.max(1, Number($('ci-default-amount').value) || 50),
        calories: Number($('ci-calories').value) || 0,
        protein: Number($('ci-protein').value) || 0,
        carbs: Number($('ci-carbs').value) || 0,
        fat: Number($('ci-fat').value) || 0,
        sugar: Number($('ci-sugar').value) || 0,
        salt: saltVal,
        fiber: Number($('ci-fiber').value) || 0,
        nutrients: { sodium: Math.round((saltVal / 2.5) * 1000) },
        isCustom: true,
      };
      if (!Array.isArray(state.customIngredients)) state.customIngredients = [];
      state.customIngredients.unshift(newIng);
      invalidateRecipeCaches();
      persist();
      closeModal('custom-ingredient-modal');

      if (!$('food-log-modal').hidden && activeModalFood) {
        addIngredientToActiveRecipe(newIng.id, newIng.defaultAmount);
      } else if (!$('custom-food-modal').hidden && customFoodMode === 'ingredients') {
        addIngredientToCustomRecipe(newIng.id, newIng.defaultAmount);
      } else {
        if (activeTab === 'foods') renderFoodsLibrary();
        showToast(`Added ${name} to Ingredients DB`);
      }
    });

    // Food / Recipe modal controls
    $('log-servings-input').addEventListener('input', () => {
      const val = $('log-servings-input').value;
      document.querySelectorAll('.preset-mult-btn').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.mult === val);
      });
      updateFoodModalPreview();
    });
    document.querySelectorAll('.preset-mult-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('log-servings-input').value = btn.dataset.mult;
        document.querySelectorAll('.preset-mult-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        updateFoodModalPreview();
      });
    });
    $('save-default-recipe-btn').addEventListener('click', saveAsDefaultRecipe);
    $('save-preset-recipe-btn').addEventListener('click', saveRecipePreset);
    $('reset-recipe-btn').addEventListener('click', resetCurrentRecipe);

    $('recipe-ing-search').addEventListener('input', (e) => {
      recipePickerQuery = e.target.value;
      renderRecipePickerList();
    });

    $('recipe-ingredients-list').addEventListener('input', (e) => {
      const inp = e.target.closest('[data-ing-qty-idx]');
      if (!inp) return;
      const idx = Number(inp.dataset.ingQtyIdx);
      if (!Number.isInteger(idx) || !activeRecipeItems[idx]) return;
      const val = Math.max(0, Number(inp.value) || 0);
      activeRecipeItems[idx].amount = val;
      const ing = resolveIngredient(activeRecipeItems[idx], state.customIngredients);
      const row = inp.closest('.recipe-ing-row');
      if (ing && row) {
        const ratio = val / 100;
        const macEl = row.querySelector('.recipe-ing-macros');
        if (macEl) {
          macEl.textContent = `${Math.round((Number(ing.calories) || 0) * ratio)} kcal · ${((Number(ing.protein) || 0) * ratio).toFixed(1)}g P · ${((Number(ing.carbs) || 0) * ratio).toFixed(1)}g C · ${((Number(ing.sugar) || 0) * ratio).toFixed(1)}g Sugars · ${((Number(ing.salt) || 0) * ratio).toFixed(2)}g Salt`;
        }
      }
      const totals = computeRecipeTotals(activeRecipeItems, state.customIngredients);
      $('recipe-total-weight').textContent = `${totals.totalAmount} g`;
      const changeSummary = summarizeRecipeChanges(
        activeRecipeOriginalItems,
        activeRecipeItems,
        state.customIngredients
      );
      $('reset-recipe-btn').hidden = !changeSummary && !state.defaultRecipes?.[activeModalFood?.id]?.length;
      updateFoodModalPreview();
    });

    $('food-modal-fav-btn').addEventListener('click', () => {
      if (!activeModalFood) return;
      toggleFavorite(activeModalFood.id);
      updateFoodModalFavButton();
    });
    $('food-modal-submit-btn').addEventListener('click', () => {
      if (!activeModalFood) return;
      const meal = $('log-meal-select').value;
      const servings = Math.max(0.1, Number($('log-servings-input').value) || 1);
      const effectiveFood = getEffectiveModalFood();
      pendingMealTarget = meal;

      if (editingEntryId) {
        const list = state.foodLogs[selectedDateKey] || [];
        const entry = list.find((item) => item.id === editingEntryId);
        if (entry && effectiveFood) {
          entry.meal = MEALS.includes(meal) ? meal : entry.meal;
          entry.servings = servings;
          entry.snapshot = {
            id: effectiveFood.id,
            name: effectiveFood.name,
            category: effectiveFood.category,
            serving: effectiveFood.serving,
            description: effectiveFood.description || '',
            calories: effectiveFood.calories,
            protein: effectiveFood.protein,
            carbs: effectiveFood.carbs,
            fat: effectiveFood.fat,
            fiber: effectiveFood.fiber,
            sugar: effectiveFood.sugar || 0,
            salt: getFoodSaltGrams(effectiveFood),
            nutrients: { ...(effectiveFood.nutrients || {}) },
            recipeItems: cloneRecipeItems(effectiveFood.recipeItems || []),
            recipeSummary: effectiveFood.recipeSummary || '',
          };
          persist();
          if (activeTab === 'today') renderToday();
          if (activeTab === 'weekly') renderWeekly();
          showToast(`Updated ${effectiveFood.name}`);
        }
      } else {
        logFoodEntry(effectiveFood, meal, servings, selectedDateKey);
      }

      editingEntryId = null;
      closeModal('food-log-modal');
    });

    // SigLIP photo scan input & drag/drop
    $('scan-gallery-input').addEventListener('change', (e) => {
      if (e.target.files?.[0]) handlePhotoFile(e.target.files[0]);
      e.target.value = '';
    });

    const dz = $('scan-dropzone');
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('is-dragover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('is-dragover');
      if (e.dataTransfer?.files?.[0]) handlePhotoFile(e.dataTransfer.files[0]);
    });

    $('scan-manual-fallback-btn').addEventListener('click', () => {
      closeModal('scan-modal');
      switchTab('foods');
      $('foods-search-input').focus();
    });

    $('scan-quick-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const box = $('scan-quick-results');
      clearTimeout(scanSearchTimer);
      if (!q) {
        box.hidden = true;
        box.innerHTML = '';
        return;
      }
      scanSearchTimer = setTimeout(() => {
        const hits = getAllFoods()
          .filter((f) => matchesSearchQuery(`${f.name} ${f.category} ${f.prompt || ''}`, q))
          .slice(0, 8);
        if (hits.length === 0) {
          box.innerHTML = '<p class="section-subtitle">No matching recipes found.</p>';
        } else {
          box.innerHTML = hits
            .map((rawFood) => {
              const food = getEffectiveFoodForLog(rawFood);
              return `
          <div class="scan-result-row">
            <div class="scan-result-info">
              <div class="scan-result-top">
                <strong>${escapeHtml(food.name)}</strong>
                <span class="entry-meta">${Math.round(food.calories)} kcal</span>
              </div>
              <span class="entry-meta">${escapeHtml(food.serving)} · ${food.protein}g P · ${food.carbs}g C · ${food.sugar}g Sug · ${getFoodSaltGrams(food).toFixed(1)}g Salt</span>
            </div>
            <div class="scan-row-actions">
              <button type="button" class="btn btn-soft btn-xs" data-scan-custom-id="${escapeHtml(rawFood.id)}">Edit</button>
              <button type="button" class="btn btn-primary btn-xs" data-scan-log-id="${escapeHtml(rawFood.id)}">+ Log</button>
            </div>
          </div>
        `;
            })
            .join('');
        }
        box.hidden = false;
      }, 75);
    });

    // EU Barcode scanner listeners
    $('barcode-start-cam-btn')?.addEventListener('click', startBarcodeCamera);
    $('barcode-stop-cam-btn')?.addEventListener('click', stopBarcodeCamera);
    $('barcode-photo-input')?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) handleBarcodePhotoFile(e.target.files[0]);
      e.target.value = '';
    });
    $('barcode-lookup-btn')?.addEventListener('click', () => {
      lookupBarcode($('barcode-manual-input')?.value);
    });
    $('barcode-manual-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lookupBarcode(e.target.value);
      }
    });

    // Settings modal controls & Metric Goal Calculator
    $('calc-goals-btn')?.addEventListener('click', calculateAndApplyMetricGoals);
    document.querySelectorAll('[data-set-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.setTheme);
        persist();
      });
    });
    $('save-settings-btn').addEventListener('click', () => {
      state.settings.dvProfile = $('setting-dv-profile').value;
      state.settings.calorieGoal = Math.max(800, Number($('setting-cal-goal').value) || 2000);
      state.settings.proteinGoal = Math.max(20, Number($('setting-protein-goal').value) || 110);
      state.settings.carbsGoal = Math.max(20, Number($('setting-carbs-goal').value) || 225);
      state.settings.fatGoal = Math.max(15, Number($('setting-fat-goal').value) || 65);
      if ($('setting-sugar-goal')) {
        state.settings.sugarGoal = Math.max(10, Number($('setting-sugar-goal').value) || 50);
      }
      if ($('setting-salt-goal')) {
        state.settings.saltGoal = Math.max(1, Number($('setting-salt-goal').value) || 5);
      }
      if ($('setting-water-goal')) {
        state.settings.waterGoal = Math.max(1000, Number($('setting-water-goal').value) || 2500);
      }
      if ($('calc-weight')) {
        state.settings.bodyMetrics = {
          sex: $('calc-sex')?.value === 'female' ? 'female' : 'male',
          age: Math.max(14, Number($('calc-age')?.value) || 28),
          heightCm: Math.max(120, Number($('calc-height')?.value) || 178),
          weightKg: Math.max(35, Number($('calc-weight')?.value) || 75),
          activity: String($('calc-activity')?.value || '1.55'),
          objective: String($('calc-objective')?.value || 'maintain'),
        };
      }
      persist();
      closeModal('settings-modal');
      renderToday();
      if (activeTab === 'weekly') renderWeekly();
      showToast('Goals saved');
    });

    $('preload-siglip-btn').addEventListener('click', async () => {
      const btn = $('preload-siglip-btn');
      const statusEl = $('preload-siglip-status');
      btn.disabled = true;
      try {
        await window.EuLogVision.ensureModelLoaded(({ text }) => {
          statusEl.textContent = text;
        });
        statusEl.textContent = 'SigLIP cached on device!';
        showToast('SigLIP model cached locally');
      } catch {
        statusEl.textContent = 'Could not reach Hugging Face CDN right now';
      } finally {
        btn.disabled = false;
      }
    });

    $('export-json-btn').addEventListener('click', () => {
      exportJsonBackup(state);
      showToast('Exported EuLog JSON backup');
    });
    $('export-csv-btn').addEventListener('click', () => {
      exportCsvLogs(state, findFoodById);
      showToast('Exported EuLog CSV log');
    });
    $('import-json-input').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed !== 'object' || !parsed.foodLogs) {
            throw new Error('Invalid backup format');
          }
          state = { ...createInitialState(), ...parsed };
          invalidateRecipeCaches();
          persist();
          applyTheme(state.settings.theme);
          closeModal('settings-modal');
          renderToday();
          showToast('Backup restored successfully');
        } catch {
          showToast('Invalid JSON backup file');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('reset-data-btn').addEventListener('click', () => {
      if (!confirm('Reset all locally saved EuLog meals, supplements, and goals?')) return;
      state = createInitialState();
      invalidateRecipeCaches();
      persist();
      applyTheme(state.settings.theme);
      closeModal('settings-modal');
      switchTab('today');
      showToast('Local data reset');
    });

    // Global delegated clicks
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close-modal]');
      if (closeBtn) {
        closeModal(closeBtn.dataset.closeModal);
        return;
      }

      // Clicking dark backdrop closes modal
      if (e.target.classList.contains('modal-backdrop')) {
        closeModal(e.target.id);
        return;
      }

      const modeBtn = e.target.closest('[data-foods-mode]');
      if (modeBtn) {
        foodsLibraryMode = modeBtn.dataset.foodsMode === 'ingredients' ? 'ingredients' : 'recipes';
        foodsRenderLimit = 80;
        renderFoodsLibrary();
        return;
      }

      const cfModeBtn = e.target.closest('[data-cf-mode]');
      if (cfModeBtn) {
        customFoodMode = cfModeBtn.dataset.cfMode === 'manual' ? 'manual' : 'ingredients';
        renderCustomFoodBuilder();
        return;
      }

      const cfRemoveBtn = e.target.closest('[data-cf-remove-idx]');
      if (cfRemoveBtn) {
        const idx = Number(cfRemoveBtn.dataset.cfRemoveIdx);
        if (Number.isInteger(idx) && customFoodItems[idx]) {
          customFoodItems.splice(idx, 1);
          renderCustomFoodBuilder();
        }
        return;
      }

      const cfStepBtn = e.target.closest('[data-cf-step-idx]');
      if (cfStepBtn) {
        const idx = Number(cfStepBtn.dataset.cfStepIdx);
        const delta = Number(cfStepBtn.dataset.cfStepDelta) || 0;
        if (Number.isInteger(idx) && customFoodItems[idx]) {
          customFoodItems[idx].amount = Math.max(
            0,
            Number(((Number(customFoodItems[idx].amount) || 0) + delta).toFixed(1))
          );
          renderCustomFoodBuilder();
        }
        return;
      }

      const cfPickerAddBtn = e.target.closest('[data-cf-picker-add-ing]');
      if (cfPickerAddBtn) {
        const ingId = cfPickerAddBtn.dataset.cfPickerAddIng;
        const qtyInput = document.querySelector(`[data-cf-picker-qty-for="${CSS.escape(ingId)}"]`);
        const qty = qtyInput ? Number(qtyInput.value) : null;
        addIngredientToCustomRecipe(ingId, qty);
        return;
      }

      const toggleSupp = e.target.closest('[data-toggle-supp]');
      if (toggleSupp) {
        toggleSupplement(toggleSupp.dataset.toggleSupp);
        return;
      }

      const removeSupp = e.target.closest('[data-remove-supp]');
      if (removeSupp) {
        const id = removeSupp.dataset.removeSupp;
        state.supplements = state.supplements.filter((s) => s.id !== id);
        persist();
        renderSupplements();
        showToast('Removed supplement from stack');
        return;
      }

      const addPreset = e.target.closest('[data-add-preset]');
      if (addPreset) {
        const preset = SUPPLEMENT_PRESETS.find((p) => p.presetId === addPreset.dataset.addPreset);
        if (preset) {
          state.supplements.push({
            id: makeId('supp'),
            name: preset.name,
            dose: preset.dose,
            timing: preset.timing,
            notes: preset.notes,
            ...(preset.calories ? { calories: preset.calories } : {}),
            ...(preset.protein ? { protein: preset.protein } : {}),
            ...(preset.carbs ? { carbs: preset.carbs } : {}),
            ...(preset.fat ? { fat: preset.fat } : {}),
            ...(preset.fiber ? { fiber: preset.fiber } : {}),
            nutrients: { ...(preset.nutrients || {}) },
          });
          persist();
          renderSupplements();
          showToast(`Added ${preset.name}`);
        }
        return;
      }

      const addMealBtn = e.target.closest('[data-add-for-meal]');
      if (addMealBtn) {
        pendingMealTarget = addMealBtn.dataset.addForMeal;
        switchTab('foods');
        $('foods-search-input').focus();
        return;
      }

      const delEntry = e.target.closest('[data-delete-entry]');
      if (delEntry) {
        deleteFoodEntry(delEntry.dataset.deleteEntry);
        return;
      }

      const editEntryBtn = e.target.closest('[data-edit-entry]');
      if (editEntryBtn) {
        e.stopPropagation();
        const entry = (state.foodLogs[selectedDateKey] || []).find((x) => x.id === editEntryBtn.dataset.editEntry);
        if (entry) openFoodLogModal(entry.foodId, entry.meal, entry);
        return;
      }

      const toggleEntry = e.target.closest('[data-toggle-entry-desc]');
      if (toggleEntry) {
        const eid = toggleEntry.dataset.toggleEntryDesc;
        expandedEntryId = expandedEntryId === eid ? null : eid;
        renderToday();
        return;
      }

      // Recipe editor ingredient controls
      const removeIngBtn = e.target.closest('[data-ing-remove-idx]');
      if (removeIngBtn) {
        const idx = Number(removeIngBtn.dataset.ingRemoveIdx);
        if (Number.isInteger(idx) && activeRecipeItems[idx]) {
          const ing = resolveIngredient(activeRecipeItems[idx], state.customIngredients);
          activeRecipeItems.splice(idx, 1);
          renderRecipeEditor();
          updateFoodModalPreview();
          if (ing) showToast(`Removed ${ing.name}`);
        }
        return;
      }

      const stepIngBtn = e.target.closest('[data-ing-step-idx]');
      if (stepIngBtn) {
        const idx = Number(stepIngBtn.dataset.ingStepIdx);
        const delta = Number(stepIngBtn.dataset.ingStepDelta) || 0;
        if (Number.isInteger(idx) && activeRecipeItems[idx]) {
          const next = Math.max(0, Number(((Number(activeRecipeItems[idx].amount) || 0) + delta).toFixed(1)));
          activeRecipeItems[idx].amount = next;
          renderRecipeEditor();
          updateFoodModalPreview();
        }
        return;
      }

      const pickerAddBtn = e.target.closest('[data-picker-add-ing]');
      if (pickerAddBtn) {
        const ingId = pickerAddBtn.dataset.pickerAddIng;
        const qtyInput = document.querySelector(`[data-picker-qty-for="${CSS.escape(ingId)}"]`);
        const qty = qtyInput ? Number(qtyInput.value) : null;
        addIngredientToActiveRecipe(ingId, qty);
        return;
      }

      const applyPresetBtn = e.target.closest('[data-apply-recipe-preset]');
      if (applyPresetBtn && activeModalFood) {
        const presetId = applyPresetBtn.dataset.applyRecipePreset;
        const preset = (state.savedRecipes?.[activeModalFood.id] || []).find((p) => p.id === presetId);
        if (preset) {
          activeRecipeItems = cloneRecipeItems(preset.items);
          renderRecipeEditor();
          updateFoodModalPreview();
          showToast(`Applied: ${preset.label}`);
        }
        return;
      }

      const delPresetBtn = e.target.closest('[data-delete-recipe-preset]');
      if (delPresetBtn && activeModalFood) {
        const presetId = delPresetBtn.dataset.deleteRecipePreset;
        if (state.savedRecipes?.[activeModalFood.id]) {
          state.savedRecipes[activeModalFood.id] = state.savedRecipes[activeModalFood.id].filter(
            (p) => p.id !== presetId
          );
          if (state.savedRecipes[activeModalFood.id].length === 0) {
            delete state.savedRecipes[activeModalFood.id];
          }
          persist();
          renderRecipeEditor();
          showToast('Deleted recipe preset');
        }
        return;
      }

      const openIng = e.target.closest('[data-open-ingredient-id]');
      if (openIng) {
        e.stopPropagation();
        openFoodLogModal(`ing:${openIng.dataset.openIngredientId}`);
        return;
      }

      const openFood = e.target.closest('[data-open-food-id]');
      if (openFood) {
        e.stopPropagation();
        openFoodLogModal(openFood.dataset.openFoodId);
        return;
      }

      const toggleFavBtn = e.target.closest('[data-toggle-fav]');
      if (toggleFavBtn) {
        toggleFavorite(toggleFavBtn.dataset.toggleFav);
        return;
      }

      const loadMore = e.target.closest('[data-load-more-foods]');
      if (loadMore) {
        foodsRenderLimit += 80;
        renderFoodsLibrary();
        return;
      }

      const foodCat = e.target.closest('[data-food-cat]');
      if (foodCat) {
        selectedFoodCategory = foodCat.dataset.foodCat;
        foodsRenderLimit = 80;
        renderFoodsLibrary();
        return;
      }

      const ingCat = e.target.closest('[data-ing-cat]');
      if (ingCat) {
        selectedIngredientCategory = ingCat.dataset.ingCat;
        renderFoodsLibrary();
        return;
      }

      const waterBtn = e.target.closest('[data-water-delta]');
      if (waterBtn) {
        adjustWater(Number(waterBtn.dataset.waterDelta) || 0);
        return;
      }

      const quickLogBtn = e.target.closest('[data-quick-log-food-id]');
      if (quickLogBtn) {
        e.stopPropagation();
        const foodId = quickLogBtn.dataset.quickLogFoodId;
        const serv = Math.max(0.1, Number(quickLogBtn.dataset.quickLogServings) || 1);
        const raw = findFoodById(foodId);
        const meal = pendingMealTarget || guessDefaultMeal();
        if (raw) {
          logFoodEntry(getEffectiveFoodForLog(raw), meal, serv, selectedDateKey);
          renderRecentFoods();
        }
        return;
      }

      const scanModeBtn = e.target.closest('[data-scan-mode]');
      if (scanModeBtn) {
        setScanMode(scanModeBtn.dataset.scanMode);
        return;
      }

      const portionBtn = e.target.closest('[data-scan-portion]');
      if (portionBtn) {
        activeScanPortion = Number(portionBtn.dataset.scanPortion) || 1;
        document.querySelectorAll('[data-scan-portion]').forEach((b) => {
          b.classList.toggle('is-active', b === portionBtn);
        });
        renderScanResults();
        return;
      }

      const bcLogBtn = e.target.closest('[data-barcode-log]');
      if (bcLogBtn) {
        logActiveBarcodeProduct();
        bcLogBtn.textContent = '✓ Logged';
        return;
      }

      const bcSaveIngBtn = e.target.closest('[data-barcode-save-ing]');
      if (bcSaveIngBtn) {
        saveActiveBarcodeToIngredients();
        bcSaveIngBtn.textContent = '✓ Saved to DB';
        return;
      }

      const bcManualBtn = e.target.closest('[data-barcode-manual-add]');
      if (bcManualBtn) {
        closeModal('scan-modal');
        $('custom-ingredient-form').reset();
        openModal('custom-ingredient-modal');
        return;
      }

      const scanCustomBtn = e.target.closest('[data-scan-custom-id]');
      if (scanCustomBtn) {
        const foodId = scanCustomBtn.dataset.scanCustomId;
        const meal = $('scan-meal-select').value;
        closeModal('scan-modal');
        openFoodLogModal(foodId, meal, null, activeScanPortion);
        return;
      }

      const scanLogBtn = e.target.closest('[data-scan-log-id]');
      if (scanLogBtn) {
        const rawFood = findFoodById(scanLogBtn.dataset.scanLogId);
        const meal = $('scan-meal-select').value;
        if (rawFood) {
          logFoodEntry(getEffectiveFoodForLog(rawFood), meal, activeScanPortion, selectedDateKey);
          scanLogBtn.textContent = '✓ Logged';
          scanLogBtn.classList.remove('btn-primary');
          scanLogBtn.classList.add('btn-logged');
        }
        return;
      }

      const expandNut = e.target.closest('[data-expand-nutrient]');
      if (expandNut) {
        const key = expandNut.dataset.expandNutrient;
        expandedNutrientKey = expandedNutrientKey === key ? null : key;
        renderWeekly();
      }
    });

    // Escape closes active modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop:not([hidden])').forEach((m) => closeModal(m.id));
      }
    });

    // PWA Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      $('install-banner').hidden = false;
    });
    $('install-app-btn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('install-banner').hidden = true;
    });
    $('dismiss-install-btn').addEventListener('click', () => {
      $('install-banner').hidden = true;
    });
  }

  function toggleFavorite(foodId) {
    const set = new Set(state.favorites || []);
    if (set.has(foodId)) set.delete(foodId);
    else set.add(foodId);
    state.favorites = [...set];
    persist();
    if (activeTab === 'foods') renderFoodsLibrary();
  }

  /* ==================== SERVICE WORKER ==================== */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('EuLog SW registration skipped:', err);
      });
    }
  }

  /* ==================== BOOT ==================== */
  function init() {
    buildSuppNutrientInputs();
    applyTheme(state.settings.theme);
    bindEvents();
    renderToday();
    registerServiceWorker();
  }

  init();
})();
