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

  let state = loadState();
  let activeTab = 'today';
  let selectedDateKey = todayKey();
  let weeklyEndKey = todayKey();
  let selectedFoodCategory = 'All';
  let foodsSearchQuery = '';
  let foodsSortBy = 'name';
  let expandedNutrientKey = null;

  // Modal state
  let activeModalFood = null;
  let pendingMealTarget = guessDefaultMeal();
  let deferredInstallPrompt = null;
  let toastTimer = null;

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

  function findFoodById(id) {
    if (USDA_FOODS_BY_ID[id]) return USDA_FOODS_BY_ID[id];
    return (state.customFoods || []).find((f) => f.id === id) || null;
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
    const valid = ['blush', 'dark', 'paper'].includes(themeName) ? themeName : 'blush';
    state.settings.theme = valid;
    document.documentElement.setAttribute('data-theme', valid);

    const meta = $('theme-color-meta');
    if (meta) {
      meta.content = valid === 'dark' ? '#000000' : valid === 'paper' ? '#f5f1ea' : '#fdf7fa';
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
    const order = ['blush', 'dark', 'paper'];
    const idx = order.indexOf(state.settings.theme);
    const next = order[(idx + 1) % order.length];
    applyTheme(next);
    persist();
    const labels = { blush: 'Blush Light', dark: 'AMOLED Dark', paper: 'Warm Paper' };
    showToast(`Theme: ${labels[next]}`);
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
    setBar('macro-protein-val', 'macro-protein-bar', totals.protein, proteinGoal);
    setBar('macro-carbs-val', 'macro-carbs-bar', totals.carbs, carbsGoal);
    setBar('macro-fat-val', 'macro-fat-bar', totals.fat, fatGoal);
    setBar('macro-fiber-val', 'macro-fiber-bar', totals.fiber, fiberGoal);

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
          ? `<p class="meal-empty">Tap + to log from ${USDA_FOODS.length} USDA foods</p>`
          : `<div class="meal-entries">${mealEntries
              .map((entry) => {
                const food = entry.snapshot || findFoodById(entry.foodId);
                if (!food) return '';
                const mult = Number(entry.servings) || 1;
                const kcal = Math.round((food.calories || 0) * mult);
                const p = Math.round((food.protein || 0) * mult);
                const c = Math.round((food.carbs || 0) * mult);
                const f = Math.round((food.fat || 0) * mult);
                const multStr = mult === 1 ? food.serving : `${mult}× ${food.serving}`;
                return `
                  <div class="entry-row">
                    <div class="entry-main">
                      <span class="entry-name">${escapeHtml(food.name)}</span>
                      <span class="entry-meta">${escapeHtml(multStr)} · ${p}g P · ${c}g C · ${f}g F</span>
                    </div>
                    <div class="entry-right">
                      <span class="entry-cal">${kcal} kcal</span>
                      <button type="button" class="entry-del-btn" data-delete-entry="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(food.name)}">&times;</button>
                    </div>
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
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
        nutrients: { ...(food.nutrients || {}) },
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
        snapshot: entry.snapshot ? { ...entry.snapshot, nutrients: { ...(entry.snapshot.nutrients || {}) } } : undefined,
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

  /* ==================== TAB 4: 153 USDA FOODS LIBRARY ==================== */
  function renderFoodsLibrary() {
    const allFoods = getAllFoods();
    const customCount = (state.customFoods || []).length;
    $('foods-count-subtitle').textContent =
      customCount > 0
        ? `${USDA_FOODS.length} USDA FoodData Central foods + ${customCount} custom foods`
        : `${USDA_FOODS.length} curated USDA FoodData Central foods with full micronutrient profiles`;

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

    const q = foodsSearchQuery.trim().toLowerCase();
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
        const hay = `${f.name} ${f.category} ${f.prompt || ''}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (foodsSortBy === 'name') return a.name.localeCompare(b.name);
      if (foodsSortBy === 'protein') return (b.protein || 0) - (a.protein || 0);
      if (foodsSortBy === 'fiber') return (b.fiber || 0) - (a.fiber || 0);
      if (foodsSortBy === 'cal-asc') return (a.calories || 0) - (b.calories || 0);
      return (b.nutrients?.[foodsSortBy] || 0) - (a.nutrients?.[foodsSortBy] || 0);
    });

    const listEl = $('foods-list');
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="sheet-card"><p class="section-subtitle">No matching foods found. Try a different term or add a Custom Food.</p></div>';
      return;
    }

    listEl.innerHTML = filtered
      .map((f) => {
        const isFav = favSet.has(f.id);
        const sortHighlight =
          !['name', 'protein', 'fiber', 'cal-asc'].includes(foodsSortBy) && f.nutrients?.[foodsSortBy]
            ? ` · <strong>${formatNutrientValue(f.nutrients[foodsSortBy], VITAL_NUTRIENTS.find((v) => v.key === foodsSortBy)?.unit || '')}</strong>`
            : '';
        return `
          <article class="food-card">
            <div class="food-card-main">
              <span class="food-card-name">${escapeHtml(f.name)}</span>
              <span class="food-card-serving">${escapeHtml(f.serving)} · ${escapeHtml(f.category)}</span>
              <div class="food-card-macros">${Math.round(f.calories)} kcal · ${f.protein}g P · ${f.carbs}g C · ${f.fat}g F${sortHighlight}</div>
            </div>
            <div class="food-card-actions">
              <button type="button" class="star-btn ${isFav ? 'is-fav' : ''}" data-toggle-fav="${escapeHtml(f.id)}" aria-label="Favorite ${escapeHtml(f.name)}">${isFav ? '★' : '☆'}</button>
              <button type="button" class="btn btn-soft btn-sm" data-open-food-id="${escapeHtml(f.id)}">+ Log</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  /* ==================== MODALS: OPEN / CLOSE ==================== */
  function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    if (id === 'scan-modal') stopLiveCamera();
    el.hidden = true;
    const anyOpen = [...document.querySelectorAll('.modal-backdrop')].some((m) => !m.hidden);
    if (!anyOpen) document.body.style.overflow = '';
  }

  /* ==================== FOOD LOG DETAIL MODAL ==================== */
  function openFoodLogModal(foodId, mealOverride) {
    const food = findFoodById(foodId);
    if (!food) return;
    activeModalFood = food;

    $('food-modal-category').textContent = food.isCustom ? 'Custom Food' : `USDA · ${food.category}`;
    $('food-modal-title').textContent = food.name;
    $('food-modal-serving').textContent = food.serving;
    $('log-meal-select').value = mealOverride || pendingMealTarget || guessDefaultMeal();
    $('log-servings-input').value = '1';

    document.querySelectorAll('.preset-mult-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.mult === '1');
    });

    updateFoodModalPreview();
    updateFoodModalFavButton();
    openModal('food-log-modal');
  }

  function updateFoodModalFavButton() {
    if (!activeModalFood) return;
    const isFav = (state.favorites || []).includes(activeModalFood.id);
    $('food-modal-fav-btn').textContent = isFav ? '★ Favorited' : '☆ Favorite';
  }

  function updateFoodModalPreview() {
    if (!activeModalFood) return;
    const mult = Math.max(0.1, Number($('log-servings-input').value) || 1);
    const f = activeModalFood;

    $('food-modal-macro-preview').innerHTML = `
      <div class="modal-macro-cell"><strong>${Math.round(f.calories * mult)}</strong><span>kcal</span></div>
      <div class="modal-macro-cell"><strong>${(f.protein * mult).toFixed(1)}g</strong><span>Protein</span></div>
      <div class="modal-macro-cell"><strong>${(f.carbs * mult).toFixed(1)}g</strong><span>Carbs</span></div>
      <div class="modal-macro-cell"><strong>${(f.fat * mult).toFixed(1)}g</strong><span>Fat</span></div>
    `;

    const nuts = f.nutrients || {};
    const badges = VITAL_NUTRIENTS.filter((v) => (nuts[v.key] || 0) * mult > 0)
      .map((v) => `<span class="micro-badge">${escapeHtml(v.short)} ${formatNutrientValue(nuts[v.key] * mult, v.unit)}</span>`)
      .join('');

    $('food-modal-vitals-grid').innerHTML =
      badges || '<span class="section-subtitle">No micronutrient data recorded for this custom item.</span>';
  }

  /* ==================== ON-DEVICE SIGLIP PHOTO SCAN MODAL ==================== */
  let liveCameraStream = null;

  function stopLiveCamera() {
    if (liveCameraStream) {
      for (const track of liveCameraStream.getTracks()) track.stop();
      liveCameraStream = null;
    }
    const video = $('scan-live-video');
    if (video) {
      video.srcObject = null;
      video.hidden = true;
    }
    const liveCtrl = $('scan-live-controls');
    const pickCtrl = $('scan-picker-controls');
    if (liveCtrl) liveCtrl.hidden = true;
    if (pickCtrl) pickCtrl.hidden = false;
  }

  async function startLiveCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Live camera not available — tap Choose Photo instead');
      $('scan-gallery-input')?.click();
      return;
    }
    try {
      stopLiveCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 320, max: 480 },
          height: { ideal: 320, max: 480 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: false,
      });
      liveCameraStream = stream;
      const video = $('scan-live-video');
      video.srcObject = stream;
      video.hidden = false;
      $('scan-preview-img').hidden = true;
      $('scan-empty-prompt').hidden = true;
      $('scan-picker-controls').hidden = true;
      $('scan-live-controls').hidden = false;
      await video.play().catch(() => {});
    } catch (err) {
      console.warn('Live camera permission/open failed:', err);
      showToast('Camera blocked — tap Choose Photo to pick a picture');
    }
  }

  function openScanModal() {
    $('scan-meal-select').value = pendingMealTarget || guessDefaultMeal();
    const st = window.EuLogVision.getStatus();
    $('siglip-status-badge').textContent =
      st.status === 'ready'
        ? `SigLIP Vision Ready (${st.device.toUpperCase()})`
        : `SigLIP Vision (q4 · ${USDA_FOODS.length} Foods)`;
    openModal('scan-modal');
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
          ? `Matched across all ${output.totalFoods || USDA_FOODS.length} USDA foods`
          : 'Connect once to cache 60 MB SigLIP Vision weights';

      const maxScore = Math.max(1e-9, ...output.results.map((r) => r.score));
      $('scan-results-list').innerHTML = output.results
        .map(({ food, score }, idx) => {
          const relPct = Math.max(18, Math.min(100, Math.round((score / maxScore) * 100)));
          const dispPct =
            output.engine === 'siglip'
              ? `${Math.round(score * 100)}% match`
              : `${Math.round(score * 100)}% visual`;
          return `
            <div class="scan-result-row">
              <div class="scan-result-info">
                <div class="scan-result-top">
                  <strong>${escapeHtml(food.name)}</strong>
                  <span class="entry-meta">${idx === 0 ? '★ ' : ''}${dispPct} · ${Math.round(food.calories)} kcal</span>
                </div>
                <span class="entry-meta">${escapeHtml(food.serving)} · ${food.protein}g P · ${food.carbs}g C · ${food.fat}g F</span>
                <div class="scan-conf-bar"><div class="scan-conf-fill" style="width:${relPct}%"></div></div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" data-scan-log-id="${escapeHtml(food.id)}">+ Log</button>
            </div>
          `;
        })
        .join('');

      $('scan-results-section').hidden = false;
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
    stopLiveCamera();
    analyzePhotoSource(file);
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

  /* ==================== SETTINGS MODAL ==================== */
  function openSettingsModal() {
    $('setting-dv-profile').value = state.settings.dvProfile || 'standard';
    $('setting-cal-goal').value = state.settings.calorieGoal || 2000;
    $('setting-protein-goal').value = state.settings.proteinGoal || 110;
    $('setting-carbs-goal').value = state.settings.carbsGoal || 225;
    $('setting-fat-goal').value = state.settings.fatGoal || 65;

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

    // Foods search & sort
    $('foods-search-input').addEventListener('input', (e) => {
      foodsSearchQuery = e.target.value;
      renderFoodsLibrary();
    });
    $('foods-sort-select').addEventListener('change', (e) => {
      foodsSortBy = e.target.value;
      renderFoodsLibrary();
    });
    $('open-custom-food-btn').addEventListener('click', () => {
      $('custom-food-form').reset();
      openModal('custom-food-modal');
    });

    $('custom-food-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('cf-name').value.trim();
      const serving = $('cf-serving').value.trim();
      if (!name || !serving) return;

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
        sugar: 0,
        nutrients: {},
        prompt: name.toLowerCase(),
        colorHint: 'brown',
        isCustom: true,
      };
      state.customFoods.unshift(customFood);
      persist();
      closeModal('custom-food-modal');
      logFoodEntry(customFood, pendingMealTarget || guessDefaultMeal(), 1, selectedDateKey);
      if (activeTab === 'foods') renderFoodsLibrary();
    });

    // Food log modal controls
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
    $('food-modal-fav-btn').addEventListener('click', () => {
      if (!activeModalFood) return;
      toggleFavorite(activeModalFood.id);
      updateFoodModalFavButton();
    });
    $('food-modal-submit-btn').addEventListener('click', () => {
      if (!activeModalFood) return;
      const meal = $('log-meal-select').value;
      const servings = Number($('log-servings-input').value) || 1;
      pendingMealTarget = meal;
      logFoodEntry(activeModalFood, meal, servings, selectedDateKey);
      closeModal('food-log-modal');
    });

    // SigLIP photo scan inputs, in-app live camera & drag/drop
    $('scan-open-cam-btn').addEventListener('click', startLiveCamera);
    $('scan-stop-cam-btn').addEventListener('click', () => {
      stopLiveCamera();
      if (!$('scan-preview-img').src) $('scan-empty-prompt').hidden = false;
    });
    $('scan-capture-btn').addEventListener('click', async () => {
      const video = $('scan-live-video');
      if (!video || video.hidden) return;
      try {
        // Grab tiny 224x224 snapshot and release camera hardware BEFORE SigLIP starts
        const frame = await window.EuLogVision.prepareCompactFrame(video, 224);
        stopLiveCamera();
        const preview = $('scan-preview-img');
        preview.src = frame.previewUrl;
        preview.hidden = false;
        $('scan-empty-prompt').hidden = true;
        analyzePhotoSource(frame);
      } catch (err) {
        stopLiveCamera();
        showToast('Could not capture camera frame — try Choose Photo');
      }
    });
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

    // Settings modal controls
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

      const foodCat = e.target.closest('[data-food-cat]');
      if (foodCat) {
        selectedFoodCategory = foodCat.dataset.foodCat;
        renderFoodsLibrary();
        return;
      }

      const scanLogBtn = e.target.closest('[data-scan-log-id]');
      if (scanLogBtn) {
        const food = findFoodById(scanLogBtn.dataset.scanLogId);
        const meal = $('scan-meal-select').value;
        if (food) {
          logFoodEntry(food, meal, 1, selectedDateKey);
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
