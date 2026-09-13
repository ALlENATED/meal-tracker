/* ============================================================
   SHARED APP DATA & SETTINGS — app-data-and-settings.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     - the app's live data: today's food log, history, weight log,
       saved meals, and all the little "what's currently selected/
       being edited" tracking variables used while a popup is open
     - loading/saving everything to the browser's storage
     - MACRO_TARGETS — the daily calorie/protein/carbs/fat/fiber/
       sugar goals — user-editable via the Settings popup's "Daily
       Targets" fields (updateMacroTarget()); everything that shows
       "X of Y" against a target (the calorie donut, macro progress
       bars, weekly chart target line, calendar over-target markers)
       just reads this same object
     - the color/theme settings (macro colors, chart under/over
       colors, the Weight chart's line color, accent color, calorie
       donut color, dark/light mode), which macros the Calendar
       widget's over-target markers watch (calendarOverMacros, up to
       4 at once), and the Settings popup that lets the user change
       them — including painting each color button in that popup
       with the color it's currently set to (setColorSwatch()), so
       the chosen color is visible right on the button
     - small helper functions used all over the app: parseAmount(),
       getWeekDates(), formatDate(), getMonthName()
     - switching between tabs (Dashboard / Ingredients / Saved Meals
       / Weight Track)
     - the window-resize handler that keeps every chart on the page
       (Dashboard's weekly chart & donut, plus the weight charts)
       sized correctly

   DEPENDS ON:
     - food-database/ingredient-list.js must be loaded before this
       file (loadSettings() reads/writes the CATEGORIES list defined
       there).

   USED BY EVERY OTHER FILE:
     Nearly every other file in this app calls functions defined
     here — saveState(), formatDate(), parseAmount(), etc. — and
     reads/writes the shared data variables below (dailyLog,
     weightLog, savedMeals, macroColors, donutMainColor,
     and so on). If you rename any of the
     variable or function names in this file, you will likely need
     to update several other files too.

   SAFE TO REWORK ALONE?
     Good for: changing the Settings popup's fields/layout, changing
     what gets saved, tweaking the color-picker behavior, changing
     how dark/light mode is applied.
     NOT the place for: styling one specific widget (that's each
     widget's own file) — this file is about data and app-wide
     behavior, not any one widget's appearance.
   ============================================================ */

// ============================================================
//  STATE
// ============================================================
// Was a fixed `const` — now `let` and user-editable (see updateMacroTarget()
// and the "Daily Targets" section in the Settings popup) so these numbers
// are just the built-in defaults for anyone who hasn't set their own yet.
let MACRO_TARGETS = { calories: 2200, protein: 150, carbs: 220, fat: 70, fiber: 30, sugar: 50 };
let today = toLocalDateStr(new Date());
let dailyLog = JSON.parse(localStorage.getItem('dailyLog_' + today)) || [];
let dailyHistory = JSON.parse(localStorage.getItem('dailyHistory')) || {};
let dailyMacroHistory = JSON.parse(localStorage.getItem('dailyMacroHistory')) || {};
let weightLog = JSON.parse(localStorage.getItem('weightLog')) || [];
let savedMeals = JSON.parse(localStorage.getItem('savedMeals')) || [];
let selectedIngredient = null;
let calendarViewDate = new Date();
let selectedMealIcon = '🍽️';
let editingMealIndex = null;
let editingIngredientIndex = null;
let tempMealItems = [];
let selectedMealIngredient = null;
let editingCategoryIndex = null;
let ingredientSelection = new Set();
let selectedIngredientForMeal = null;
let mealPictureDataURL = null;

let userAccentColor = '#2d7aff';

let macroColors = {
    protein: '#e74c3c',
    carbs: '#f39c12',
    fat: '#f1c40f',
    fiber: '#2ecc71',
    sugar: '#9b59b6'
};
let chartColors = {
    under: '#a8e6cf',
    over: '#f5a3a3'
};
let glowColor = '#ff6b6b';
let donutRemainingColor = '#dce3ec';
let donutMainColor = '#2d7aff';
// The Weight chart's line/fill color (both the small Dashboard widget and
// the full Weight Track tab chart — see weight-tracking/weight-tracking.js)
let weightLineColor = '#614ccd';
// Which macros the little Calendar widget marks with an "over target" dot
// (calendar/calendar.js), each shown in that macro's own color — up to 4
// at once, user-choosable in Settings via toggleCalendarOverMacro() below.
// Every entry must be one of MACRO_TARGETS' keys: protein, carbs, fat,
// fiber, sugar.
let calendarOverMacros = ['carbs'];

function loadSettings() {
    const saved = localStorage.getItem('tracker_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.macroTargets) Object.assign(MACRO_TARGETS, parsed.macroTargets);
            if (parsed.macroColors) Object.assign(macroColors, parsed.macroColors);
            if (parsed.chartColors) Object.assign(chartColors, parsed.chartColors);
            if (parsed.glowColor) glowColor = parsed.glowColor;
            if (parsed.donutRemainingColor) donutRemainingColor = parsed.donutRemainingColor;
            if (parsed.donutMainColor) donutMainColor = parsed.donutMainColor;
            if (parsed.weightLineColor) weightLineColor = parsed.weightLineColor;
            if (parsed.userAccentColor) userAccentColor = parsed.userAccentColor;
            // calendarOverMacros replaces the old single-macro
            // calendarOverMacro setting — read the old field too so anyone
            // who already had a macro picked doesn't lose that choice.
            if (Array.isArray(parsed.calendarOverMacros)) calendarOverMacros = parsed.calendarOverMacros;
            else if (parsed.calendarOverMacro) calendarOverMacros = [parsed.calendarOverMacro];
        } catch (e) {}
    }
    const catData = localStorage.getItem('tracker_categories');
    if (catData) {
        try {
            const parsed = JSON.parse(catData);
            if (parsed.length > 0) {
                CATEGORIES = parsed;
                CATEGORY_MAP = {};
                CATEGORIES.forEach(c => CATEGORY_MAP[c.name] = c);
            }
        } catch (e) {}
    }
    loadIngredients();
    dailyMacroHistory = JSON.parse(localStorage.getItem('dailyMacroHistory')) || {};
    applyColors();
    applyAccentToBody(userAccentColor);
    document.getElementById('accentPicker').value = userAccentColor;
}

function saveCategories() {
    localStorage.setItem('tracker_categories', JSON.stringify(CATEGORIES));
    CATEGORY_MAP = {};
    CATEGORIES.forEach(c => CATEGORY_MAP[c.name] = c);
}

// ============================================================
//  SAVING THE INGREDIENT LIST
// ============================================================
//  Keeps the user's own ingredient changes (foods they added,
//  edited, deleted, or moved to another category) between visits.
//
//  It deliberately MERGES rather than just overwriting, so that
//  if someone later updates the built-in food list in
//  food-database/ingredient-list.js (e.g. asks an AI to add 50 new
//  foods and swaps that file in), those new foods still show up
//  instead of being hidden by the older saved copy.
//
//  Rules used when the app starts:
//    - a food the user added or edited  -> their version is kept
//    - a food the user deleted          -> stays deleted, even if
//                                          it's still in the built-in file
//    - a food that is new in the built-in file -> gets added in
// ============================================================

// names of built-in foods the user has deleted (so they don't come back)
let deletedBuiltInIngredients = JSON.parse(localStorage.getItem('tracker_deleted_builtins')) || [];

function saveIngredients() {
    localStorage.setItem('tracker_ingredients', JSON.stringify(INGREDIENTS));
    localStorage.setItem('tracker_deleted_builtins', JSON.stringify(deletedBuiltInIngredients));
}

function loadIngredients() {
    const raw = localStorage.getItem('tracker_ingredients');
    if (!raw) return; // first time ever - just keep the built-in list as it is

    let saved;
    try {
        saved = JSON.parse(raw);
    } catch (e) {
        return; // saved data unreadable - fall back to the built-in list
    }
    if (!Array.isArray(saved) || saved.length === 0) return;

    const savedNames = new Set(saved.map(i => i.name));
    const deleted = new Set(deletedBuiltInIngredients);

    // start from the user's own list...
    const merged = saved.slice();
    // ...then pull in anything that's new in the built-in food list
    INGREDIENTS.forEach(item => {
        if (!savedNames.has(item.name) && !deleted.has(item.name)) merged.push(item);
    });

    INGREDIENTS = merged;
}

// called when the user deletes a food, so it doesn't reappear later
function rememberDeletedIngredient(name) {
    if (name && !deletedBuiltInIngredients.includes(name)) deletedBuiltInIngredients.push(name);
}

// called when the user adds a food back under a name they'd deleted before
function forgetDeletedIngredient(name) {
    const i = deletedBuiltInIngredients.indexOf(name);
    if (i !== -1) deletedBuiltInIngredients.splice(i, 1);
}

function applyColors() {
    document.documentElement.style.setProperty('--protein-color', macroColors.protein);
    document.documentElement.style.setProperty('--carbs-color', macroColors.carbs);
    document.documentElement.style.setProperty('--fat-color', macroColors.fat);
    document.documentElement.style.setProperty('--fiber-color', macroColors.fiber);
    document.documentElement.style.setProperty('--sugar-color', macroColors.sugar);
    document.documentElement.style.setProperty('--under-chart', chartColors.under);
    document.documentElement.style.setProperty('--over-chart', chartColors.over);
    document.documentElement.style.setProperty('--donut-remaining', donutRemainingColor);
    document.body.style.setProperty('--glow-color', glowColor, 'important');
}

function applyAccentToBody(color) {
    if (!color) color = userAccentColor;
    userAccentColor = color;
    document.body.style.setProperty('--accent', color, 'important');
    document.getElementById('accentPicker').value = color;
    document.querySelectorAll('.logo i').forEach(el => el.style.color = color);
    // The "Add ingredient" button (in the Save/Edit Meal popup) no longer has
    // its own configurable color — it always matches whatever the accent is,
    // updated live right here whenever the accent changes.
    document.documentElement.style.setProperty('--add-btn-bg', color);
}

function saveSettings() {
    localStorage.setItem('tracker_settings', JSON.stringify({
        macroTargets: MACRO_TARGETS,
        macroColors,
        chartColors,
        glowColor,
        donutRemainingColor,
        donutMainColor,
        weightLineColor,
        userAccentColor,
        calendarOverMacros
    }));
    saveCategories();
    localStorage.setItem('dailyMacroHistory', JSON.stringify(dailyMacroHistory));
}

// ============================================================
//  HELPERS
// ============================================================
function saveState() {
    const total = dailyLog.reduce((s, i) => s + (i.kcal || 0), 0);
    dailyHistory[today] = total;
    localStorage.setItem('dailyLog_' + today, JSON.stringify(dailyLog));
    localStorage.setItem('dailyHistory', JSON.stringify(dailyHistory));
    localStorage.setItem('weightLog', JSON.stringify(weightLog));
    localStorage.setItem('savedMeals', JSON.stringify(savedMeals));
    localStorage.setItem('dailyMacroHistory', JSON.stringify(dailyMacroHistory));
    saveIngredients();
    saveSettings();
}

function parseAmount(ing, amount, unit) {
    if (unit === 'pc') {
        return {
            kcal: ing.kcal * amount,
            protein: ing.protein * amount,
            carbs: ing.carbs * amount,
            fat: ing.fat * amount,
            fiber: ing.fiber * amount,
            sugar: ing.sugar * amount
        };
    }
    const f = amount / 100;
    return {
        kcal: ing.kcal * f,
        protein: ing.protein * f,
        carbs: ing.carbs * f,
        fat: ing.fat * f,
        fiber: ing.fiber * f,
        sugar: ing.sugar * f
    };
}

// Turns a Date object into a 'YYYY-MM-DD' key using its LOCAL calendar
// fields (year/month/day) instead of Date's own toISOString(), which
// converts through UTC first. For anyone not at UTC+0, that UTC round-trip
// can silently roll the date back (or forward) by a day depending on the
// current time of day — which was the cause of the weekly chart/"today"
// occasionally landing on the wrong date. Anywhere a Date object needs to
// become a stored/compared date-string, use this instead of
// `.toISOString().slice(0, 10)`. (This function declaration is hoisted, so
// it's safe to use even from code above it in this file, like `today`.)
function toLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getWeekDates() {
    const d = new Date();
    // Monday-start offset: getDay() is 0=Sunday..6=Saturday, so Sunday
    // needs to go BACK 6 days to reach that week's Monday, not forward 1
    // (the old "- d.getDay() + 1" landed on next week's Monday whenever
    // today was a Sunday).
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    const arr = [];
    for (let i = 0; i < 7; i++) { const dd = new Date(d);
        dd.setDate(dd.getDate() + i);
        arr.push(toLocalDateStr(dd)); }
    return arr;
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getMonthName(m) {
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
        'November', 'December'
    ][m];
}

// ============================================================
//  WINDOW RESIZE HANDLER
//  (keeps charts from other files — dashboard's weekly/donut chart,
//  weight-tracking's mini/full weight charts — correctly sized)
// ============================================================
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        if (window.weeklyInstance) {
            window.weeklyInstance.resize();
        }
        if (window.donutInstance) {
            window.donutInstance.resize();
        }
        if (window.weightMiniInstance) {
            window.weightMiniInstance.resize();
        }
        if (window.weightFullInstance) {
            window.weightFullInstance.resize();
        }
    }, 150);
});

// ============================================================
//  TABS
// ============================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

    if (tabId === 'ingredients') renderIngredients(document.getElementById('ingredientSearch').value || '');
    if (tabId === 'saved') renderSavedMeals();
    if (tabId === 'weight') renderWeightTab();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ============================================================
//  THEME / ACCENT
// ============================================================
function setTheme(mode) {
    document.body.classList.toggle('dark', mode === 'dark');
    document.getElementById('lightIcon').classList.toggle('active', mode === 'light');
    document.getElementById('darkIcon').classList.toggle('active', mode === 'dark');
    applyAccentToBody(userAccentColor);
    applyColors();
    renderDashboard();
}

function setAccent(color) {
    userAccentColor = color;
    applyAccentToBody(color);
    saveSettings();
    renderDashboard();
}

// ============================================================
//  SETTINGS POPUP
// ============================================================
// setColorSwatch() paints a color-picker <input type="color">'s own
// background with the color it currently holds, using "important" so
// it always shows no matter what other styling is loaded — this is
// what makes each Settings color button visibly display the color
// that's actually chosen/on the site, instead of just a plain button.
function setColorSwatch(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('background-color', color, 'important');
}

function openSettingsModal() {
    document.getElementById('targetCalories').value = MACRO_TARGETS.calories;
    document.getElementById('targetProtein').value = MACRO_TARGETS.protein;
    document.getElementById('targetCarbs').value = MACRO_TARGETS.carbs;
    document.getElementById('targetFat').value = MACRO_TARGETS.fat;
    document.getElementById('targetFiber').value = MACRO_TARGETS.fiber;
    document.getElementById('targetSugar').value = MACRO_TARGETS.sugar;
    document.getElementById('colorProtein').value = macroColors.protein;
    setColorSwatch('colorProtein', macroColors.protein);
    document.getElementById('colorCarbs').value = macroColors.carbs;
    setColorSwatch('colorCarbs', macroColors.carbs);
    document.getElementById('colorFat').value = macroColors.fat;
    setColorSwatch('colorFat', macroColors.fat);
    document.getElementById('colorFiber').value = macroColors.fiber;
    setColorSwatch('colorFiber', macroColors.fiber);
    document.getElementById('colorSugar').value = macroColors.sugar;
    setColorSwatch('colorSugar', macroColors.sugar);
    document.getElementById('colorUnderChart').value = chartColors.under;
    setColorSwatch('colorUnderChart', chartColors.under);
    document.getElementById('colorOverChart').value = chartColors.over;
    setColorSwatch('colorOverChart', chartColors.over);
    document.getElementById('colorGlow').value = glowColor;
    setColorSwatch('colorGlow', glowColor);
    document.getElementById('colorDonutRemaining').value = donutRemainingColor;
    setColorSwatch('colorDonutRemaining', donutRemainingColor);
    document.getElementById('colorDonutMain').value = donutMainColor;
    setColorSwatch('colorDonutMain', donutMainColor);
    document.getElementById('colorWeightLine').value = weightLineColor;
    setColorSwatch('colorWeightLine', weightLineColor);
    ['protein', 'carbs', 'fat', 'fiber', 'sugar'].forEach(m => {
        const cb = document.getElementById('calOverMacro_' + m);
        if (cb) cb.checked = calendarOverMacros.includes(m);
    });
    renderCategorySettings();
    document.getElementById('settingsModal').classList.add('show');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('show');
}

function renderCategorySettings() {
    const container = document.getElementById('categoryIconSettings');
    container.innerHTML = CATEGORIES.map((cat, idx) =>
        `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-light);">
            <span><span style="font-size:1.1rem;">${cat.icon||'📁'}</span> ${cat.name}</span>
            <button onclick="openEditCategoryModal('${cat.name}')" style="background:none; border:none; cursor:pointer; color:var(--text-muted); padding:4px 8px; border-radius:8px; transition:0.15s;"><i class="fas fa-edit"></i></button>
        </div>`
    ).join('');
    container.innerHTML +=
        `<button onclick="openAddCategoryModal()" style="background:var(--bg-input); border:1px solid var(--border-light); border-radius:30px; padding:6px 16px; margin-top:8px; cursor:pointer; color:var(--text-primary); font-weight:500; transition:0.15s;"><i class="fas fa-plus"></i> Add Category</button>`;
}

// Daily calorie/macro targets, set in the Settings popup's "Daily Targets"
// section. Every other place that reads MACRO_TARGETS (the calorie donut,
// the macro progress bars, the weekly chart's target line/over-limit
// coloring, the calendar's over-target markers) just reads this same
// object, so updating it here and re-rendering is all that's needed.
// Guards against an empty/zero/negative/non-numeric value — which would
// otherwise divide-by-zero in the macro progress-bar math elsewhere — by
// simply ignoring the edit and resetting the field back to the current
// real value instead of saving something broken.
function updateMacroTarget(key, value) {
    const num = parseFloat(value);
    const input = document.getElementById('target' + key.charAt(0).toUpperCase() + key.slice(1));
    if (!isFinite(num) || num <= 0) {
        if (input) input.value = MACRO_TARGETS[key];
        return;
    }
    MACRO_TARGETS[key] = num;
    saveSettings();
    renderDashboard();
    renderCalendar();
}

function updateMacroColor(macro, color) {
    macroColors[macro] = color;
    setColorSwatch(`color${macro.charAt(0).toUpperCase()+macro.slice(1)}`, color);
    applyColors();
    saveSettings();
    renderDashboard();
}

function updateChartColor(type, color) {
    chartColors[type] = color;
    setColorSwatch(`color${type.charAt(0).toUpperCase()+type.slice(1)}Chart`, color);
    applyColors();
    saveSettings();
    renderDashboard();
}

function updateGlowColor(color) {
    glowColor = color;
    document.body.style.setProperty('--glow-color', color, 'important');
    setColorSwatch('colorGlow', color);
    saveSettings();
    renderDashboard();
}

function updateDonutRemainingColor(color) {
    donutRemainingColor = color;
    setColorSwatch('colorDonutRemaining', color);
    applyColors();
    saveSettings();
    renderDashboard();
}

function updateDonutMainColor(color) {
    donutMainColor = color;
    setColorSwatch('colorDonutMain', color);
    saveSettings();
    renderDashboard();
}

function updateWeightLineColor(color) {
    weightLineColor = color;
    setColorSwatch('colorWeightLine', color);
    saveSettings();
    renderWeightChart();
    renderWeightDisplay();
    // Re-renders the full Weight Track tab's chart too, regardless of
    // which tab is showing.
    renderWeightTabChart();
}

// Which macros the Calendar widget's over-target marker dots watch — see
// calendarOverMacros up in STATE and calendar/calendar.js for how each one
// gets its own colored dot (and how the legend lays them out as a 2x2
// grid). Capped at 4 at once: checking a 5th box just un-checks itself
// again instead of bumping an existing pick off the list, so the user
// always has to make room on purpose first.
function toggleCalendarOverMacro(macro, checked) {
    const idx = calendarOverMacros.indexOf(macro);
    if (checked) {
        if (idx === -1) {
            if (calendarOverMacros.length >= 4) {
                const cb = document.getElementById('calOverMacro_' + macro);
                if (cb) cb.checked = false;
                return;
            }
            calendarOverMacros.push(macro);
        }
    } else if (idx !== -1) {
        calendarOverMacros.splice(idx, 1);
    }
    saveSettings();
    renderCalendar();
}

function openMacroColorPicker(macro) {
    openSettingsModal();
    const input = document.getElementById(`color${macro.charAt(0).toUpperCase()+macro.slice(1)}`);
    if (input) input.focus();
}