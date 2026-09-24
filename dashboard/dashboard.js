/* ============================================================
   DASHBOARD BEHAVIOR — dashboard.js
   ============================================================
   WHAT THIS FILE CONTROLS (Dashboard tab only):
     - renderDashboard(): the big function that fills in the calorie
       donut (with the macro-breakdown donut for protein/carbs/fat/
       fiber nested inside its hollow), the macro bars, today's food
       log list, and the Weekly Chart, every time something changes
     - editing/deleting an item from today's food log
     - "End day" and the "Add for date" popup (switching which day
       you're logging food for, or deleting a whole day's log)
     - the "Add food" popup: searching ingredients, picking one,
       loading a saved meal into today's log, and adding it. Its
       camera button hands off to food-scanner/food-scanner.js
       instead (openScanModal('log')) — that's what fills in
       selectedIngredient + this popup's fields when a scan is used
     - per-item macro breakdown (the small round button on each
       standalone food) and multi-select totals (the checkboxes +
       #selectionTotalBar) in today's food log — see SELECTION +
       PER-ITEM MACROS below

   NOTE ON THE CALORIE DONUT:
     The "Consumed" slice is a light-to-dark linear gradient instead
     of a flat fill. Both ends of that gradient are derived from the
     single donutMainColor the user already picks in Settings (see
     shared/app-data-and-settings.js for that state and the
     updateDonutMainColor() function behind that picker) — a
     lightened version of donutMainColor at one end (via the local
     lightenHex() helper right above where the chart is built),
     fading to donutMainColor itself at the other — so there's no
     second color picker to manage; the one existing swatch still
     recolors the whole arc. (An earlier attempt at this used a conic
     gradient and got removed for looking wrong — this is a plain
     canvas linear gradient across the chart's own area instead, a
     scriptable backgroundColor() same as the macro donut's sugar-
     fade gradient below uses.) It's drawn with a rounded corner on
     BOTH ends — except once today's calories reach or pass the
     target, when it switches to fully square corners (a complete
     circle shouldn't have a dangling rounded cap). The "Remaining"
     slice is always fully transparent; the plain-colored ring you
     see behind it is CSS (.donut-track in dashboard.css), not
     Chart.js — that keeps it perfectly seamless no matter how the
     rounded "Consumed" arc is shaped.

   NOTE ON THE MACRO-BREAKDOWN DONUT:
     Slice size is mostly proportional to real logged grams, but every
     present macro is also guaranteed a small minimum slice of the ring
     (floorFraction below, 2% of the full ring) so a macro that's only
     1g next to a 90g macro still reads as a visible, nicely-proportioned
     sliver instead of vanishing into a sub-pixel line. Above that floor,
     real proportions still show through clearly — the ring space left
     over after every present macro takes its guaranteed 2% share is
     handed out in proportion to each macro's own real grams
     (remainingBudget below), so a bigger macro still visibly dominates a
     smaller one, it just no longer dominates it down to nothing. A macro
     that rounds to 0g (the same rounding used for the numbers in the
     bars above) is fully excluded from the chart's data (not just drawn
     at size 0) so it never shows a stray sliver or eats a gap for a
     macro that isn't there (macroPresent below) — only macros that
     display as 1g or more get a slice at all. The gap between slices is
     inserted as its own small transparent data segment (gapSize) rather
     than using Chart.js's pixel-based "spacing" option — that keeps
     every gap the exact same fixed proportion of the ring regardless of
     the chart's rendered size (browser width) or how many/which macros
     are present that day. gapSize is a fixed 1.5% of the full ring per
     gap and floorFraction is 2% of the full ring per macro — tune those
     two numbers if the gaps or the minimum slice size ever need to look
     thicker/thinner again. None of this changes the actual numbers shown
     in the bars above.
     Sugar does NOT get a slice of its own here — it's a sub-amount of
     Carbs, not a separate macro next to it — instead the Carbs slice's
     own color fades into the Sugar color (macroColors.sugar) across
     whatever fraction of that arc represents how much of those carbs
     are sugar (sugarFraction below), using the canvas conic-gradient
     API. That gradient's exact start/end angles are worked out by hand
     (macroAngles) rather than read off the live chart, because Chart.js
     resolves a slice's backgroundColor before it assigns that slice's
     real on-screen angles — reading them from the chart mid-render
     would always be one render behind. Browsers without conic-gradient
     support (very old Safari) just get a flat Carbs color with no
     gradient — a harmless fallback, not a broken chart.

   NOTE ON THE WEEKLY CHART:
     Bars are packed close together with rounded (14px) corners. There
     are NO axis gridlines and no y-axis numbers
     at all (kept deliberately bare/clean) — instead, a small inline
     Chart.js plugin (weeklyExtrasPlugin, defined right where the
     chart is built) paints a soft red tint above the daily calorie
     target (MACRO_TARGETS.calories) that fades in gradually from
     nothing right at the target line to a bit stronger near the top
     of the chart, so "over" days visually poke into a shaded zone
     instead of needing a hard line across the chart — plus a thin,
     always-visible soft red line drawn exactly at that target value,
     and a subtle baseline drawn along the bottom of the chart where
     the bars start. The target line's height is capped rather than
     purely data-driven — see the chartMax comment further down — so
     one extreme over-target day can't push it down near the bottom.

     There is no separate badge/oval floating above each bar anymore —
     each column shows its own exact kcal number printed directly onto
     itself (drawn by that same weeklyExtrasPlugin, in its
     afterDatasetsDraw), inside a solid, darker "cap" zone painted at
     the very top ~18px of the bar (a darker, more saturated version
     of that bar's own under/over color, via the local darkenHex()
     helper — see barBadgeColors) so the white number stays readable.
     Below that solid cap, the column eases back into the same
     gradient it always had (its own base color fading toward ~33%
     opacity near the baseline) — both the solid cap and that fade are
     built together in the dataset's own scriptable "backgroundColor"
     function, no extra library involved, just the canvas gradient
     API. The number is ALWAYS printed inside the bar now (13px down
     from its top, in white — topPad in afterDatasetsDraw below), a
     placement picked over the old auto-switching behavior via an
     interactive preview trying a few modes and offsets side by side.
     The only case that still falls back to printing the number just
     above the bar instead, in the theme's normal text color, is a bar
     too short to physically hold an 11px number without it being cut
     off (minFitHeight, in afterDatasetsDraw below — a floor, not a
     style choice) — a near-zero-kcal day, in practice. A bar that's visually
     capped/flush against the chart's ceiling (an extreme over-target
     day — see chartMax) has its top clamped to chartArea.top wherever
     this file reads bar.y, so its solid cap and number both stay fully
     inside the visible chart instead of being drawn off the top edge.
     Today no longer gets an
     outline — only its x-axis label is drawn in the accent color, so
     "today" still stands out at a glance without a border around the
     bar itself. Every OTHER day's weekday label uses the theme's own
     normal text color for the current mode — there's no separate
     custom color for it anymore, it's meant to read as plain text
     like everything else, with only the accent color reserved for
     what's actually highlighted. Both colors are resolved once via
     getComputedStyle right before the chart is built (textPrimaryColor/
     textMutedColor further down) instead of being handed to Chart.js as
     raw 'var(--...)' strings — a canvas fillStyle/strokeStyle can't
     actually resolve a CSS custom property, so passing the string
     directly silently did nothing, which was why today's highlight
     wasn't showing up. The chart is also
     intentionally taller and its axis labels bigger/bolder than a
     plain default bar chart would be — its actual height comes from
     the fixed "height" set on .chart-box.weekly-chart-box in
     dashboard.css (see the sizing comment there), not from an
     aspectRatio option: maintainAspectRatio is deliberately false
     below so Chart.js always measures that real box on resize instead
     of computing its own height, which is what keeps this chart sharp
     no matter how narrow the browser window gets — if this chart ever
     needs to be taller/shorter again, resize it by changing that CSS
     height, not by re-adding an aspectRatio here. The x-axis labels
     are short weekday names (Mon, Tue...) computed from the same date
     strings getWeekDates() already returns — that helper itself is
     untouched.

   DEPENDS ON OTHER FILES:
     - food-database/ingredient-list.js for INGREDIENTS, CATEGORIES
     - shared/app-data-and-settings.js for the shared data (dailyLog,
       today, MACRO_TARGETS, macroColors, chartColors,
       donutMainColor...), saveState(), formatDate(),
       getWeekDates(), parseAmount()
     - calls renderCalendar() (defined in calendar/calendar.js) and
       renderWeightChart() / renderWeightDisplay() (defined in
       weight-tracking/weight-tracking.js) at the end of every
       dashboard refresh, and renderModalSavedMeals() (also in this
       file) to keep the Add Food popup's saved-meal list current.
       All of those files must be loaded on the page for this file
       to work fully.

   WANT TO MOVE THE WEIGHT OR CALENDAR WIDGET, NOT RESTYLE THIS FILE?
     Weight now sits in the left column, directly under the Weekly
     Chart (sized to match it); Calendar sits in the right column,
     directly under Today's food, at that column's full width. Both
     columns are controlled by .dash-grid / .dash-col in
     dashboard/dashboard.css — edit that if you want to reorder or
     resize them, not this file.
   ============================================================ */

// ============================================================
//  SELECTION + PER-ITEM MACROS (today's food log)
// ============================================================
// Which standalone dailyLog indices are currently checked, to show a
// combined total (see #selectionTotalBar below). This is intentionally
// throwaway UI state, not saved anywhere — it's cleared at the top of
// every renderDashboard() call (right before the log is rebuilt) rather
// than carried across add/edit/delete/day-switch, since any of those
// can shift dailyLog's indices out from under it. Only standalone items
// (not items inside a saved-meal group) get a checkbox/macro button.
let selectedLogIndices = new Set();

// ============================================================
//  RENDER: DASHBOARD
// ============================================================
function renderDashboard() {
    const total = dailyLog.reduce((s, i) => s + (i.kcal || 0), 0);
    const p = dailyLog.reduce((s, i) => s + (i.protein || 0), 0);
    const c = dailyLog.reduce((s, i) => s + (i.carbs || 0), 0);
    const f = dailyLog.reduce((s, i) => s + (i.fat || 0), 0);
    const fib = dailyLog.reduce((s, i) => s + (i.fiber || 0), 0);
    const sug = dailyLog.reduce((s, i) => s + (i.sugar || 0), 0);

    dailyMacroHistory[today] = { calories: total, protein: p, carbs: c, fat: f, fiber: fib, sugar: sug };
    // Today's kcal total has to be refreshed HERE, next to dailyMacroHistory
    // above, and not only in saveState(). The Weekly Chart and the Calendar
    // both read dailyHistory[date] (see "const weekKcal = week.map(...)"
    // further down, and renderCalendar() in calendar/calendar.js) — but
    // saveState() runs at the very END of this function, after both of those
    // have already been drawn. So adding food used to redraw them from the
    // PREVIOUS render's number, and today's bar only caught up on the next
    // render (switching day, reopening the tab). Writing it here means
    // everything below reads the current log. saveState() still writes the
    // same value to localStorage at the end; setting it twice is harmless.
    dailyHistory[today] = total;

    const remaining = Math.max(0, MACRO_TARGETS.calories - total);
    document.getElementById('calConsumed').innerText = Math.round(total);
    document.getElementById('calRemainBadge').innerText = Math.round(remaining) + ' left';
    document.getElementById('calTarget').innerText = MACRO_TARGETS.calories;

    document.getElementById('pVal').innerText = Math.round(p);
    document.getElementById('cVal').innerText = Math.round(c);
    document.getElementById('fVal').innerText = Math.round(f);
    document.getElementById('fibVal').innerText = Math.round(fib);
    document.getElementById('sVal').innerText = Math.round(sug);

    // The little "/150g" etc. next to each macro's number — these used to
    // be hardcoded straight into index.html and never actually updated,
    // which is why editing a macro target in Settings looked like it did
    // nothing on the dashboard (the bar's fill height WAS changing behind
    // the scenes, but this number sat frozen the whole time).
    document.getElementById('pTargetVal').innerText = MACRO_TARGETS.protein;
    document.getElementById('cTargetVal').innerText = MACRO_TARGETS.carbs;
    document.getElementById('fTargetVal').innerText = MACRO_TARGETS.fat;
    document.getElementById('fibTargetVal').innerText = MACRO_TARGETS.fiber;
    document.getElementById('sTargetVal').innerText = MACRO_TARGETS.sugar;

    // percentages are based on the ROUNDED gram amounts (the same
    // numbers shown next to each bar) instead of the raw totals — a
    // trace amount like 0.3g that displays as "0" would otherwise
    // still paint a tiny sliver of visible fill in the bar
    const pPct = Math.min(100, (Math.round(p) / MACRO_TARGETS.protein) * 100);
    const cPct = Math.min(100, (Math.round(c) / MACRO_TARGETS.carbs) * 100);
    const fPct = Math.min(100, (Math.round(f) / MACRO_TARGETS.fat) * 100);
    const fibPct = Math.min(100, (Math.round(fib) / MACRO_TARGETS.fiber) * 100);
    const sPct = Math.min(100, (Math.round(sug) / MACRO_TARGETS.sugar) * 100);

    // Bars fill upward (vertical) now instead of left-to-right, so this
    // sets height instead of width. The over-limit glow is a fixed
    // "breathing outline" that hugs the whole bar shape (see .fill-glow/
    // .fill-glow.active in dashboard.css) — its look lives entirely in
    // CSS now, so this just toggles the class, nothing more.
    function setBar(elId, glowId, pct, color) {
        const el = document.getElementById(elId);
        const glow = document.getElementById(glowId);
        el.style.height = Math.max(0, pct) + '%';
        el.style.background = color;
        if (pct >= 100 && (elId === 'cBarH' || elId === 'fBarH')) {
            glow.classList.add('active');
        } else {
            glow.classList.remove('active');
        }
    }

    setBar('pBarH', 'pGlow', pPct, macroColors.protein);
    setBar('cBarH', 'cGlow', cPct, macroColors.carbs);
    setBar('fBarH', 'fGlow', fPct, macroColors.fat);
    setBar('fibBarH', 'fibGlow', fibPct, macroColors.fiber);
    setBar('sBarH', 'sGlow', sPct, macroColors.sugar);

    // Outer donut: calories consumed vs. remaining. The "Remaining" slice is
    // rendered fully transparent — the visible track behind it is a plain
    // CSS ring (.donut-track in dashboard.css), so the two never show a
    // seam/gap where the page background could peek through.
    const donut = document.getElementById('donutChart');
    if (window.donutInstance) window.donutInstance.destroy();

    const consumed = Math.min(total, MACRO_TARGETS.calories);
    const rem = Math.max(0, MACRO_TARGETS.calories - total);

    // Rounded corner on both ends of the "Consumed" slice — except once
    // calories are at or over target, when it becomes a fully square,
    // fully closed ring (no dangling rounded cap on a complete circle).
    const isCalorieFull = total >= MACRO_TARGETS.calories;
    const consumedRadius = isCalorieFull
        ? 0
        : { outerStart: 9, innerStart: 9, outerEnd: 9, innerEnd: 9 };

    // Lightens a hex color by a flat amount per channel — mirrors the
    // existing darkenHex() helper used further down for the Weekly Chart,
    // just adding instead of subtracting. Used below to derive the
    // gradient's light end from the single donutMainColor Settings swatch.
    function lightenHex(hex, amt) {
        const h = hex.replace('#', '');
        const num = parseInt(h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h, 16);
        const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amt));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amt));
        const b = Math.max(0, Math.min(255, (num & 255) + amt));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    window.donutInstance = new Chart(donut, {
        type: 'doughnut',
        data: {
            labels: ['Consumed', 'Remaining'],
            datasets: [{
                data: [consumed, rem],
                backgroundColor: (context) => {
                    if (context.dataIndex !== 0) return 'transparent';
                    const chartCtx = context.chart.ctx;
                    const area = context.chart.chartArea;
                    if (area && chartCtx.createLinearGradient) {
                        const gradient = chartCtx.createLinearGradient(area.left, area.top, area.right, area.bottom);
                        gradient.addColorStop(0, lightenHex(donutMainColor, 40));
                        gradient.addColorStop(1, donutMainColor);
                        return gradient;
                    }
                    return donutMainColor;
                },
                borderWidth: 0,
                borderRadius: [consumedRadius, 0],
                spacing: 0,
            }]
        },
        options: {
            // Thickened from 78% to 76%, then to 75% (a bigger hole = a
            // thinner ring, so lower is thicker) to match .donut-track's
            // own border width in dashboard.css — the two must move
            // together or the "remaining" CSS ring and the "consumed"
            // Chart.js arc stop lining up. The 76% -> 75% nudge (along with
            // .donut-track's border going very slightly thicker to match)
            // is a deliberate small overlap margin: a <canvas> circle and a
            // plain CSS border-radius circle each rasterize/anti-alias
            // independently, so at some sizes a razor-exact 1:1 match left
            // a hairline sliver of the card's background peeking through
            // right at the seam between them. Making both a hair thicker
            // than the bare minimum means they always fully cover each
            // other's edge instead of just barely touching it.
            cutout: '75%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            // No click/hover behavior is wired up for this chart, so turn
            // off Chart.js's pointer handling entirely — this is what was
            // producing the hover effect (tooltip + slight highlight on
            // the slice under the cursor).
            events: [],
            responsive: true,
            // Was `true` — with no explicit aspectRatio set, that let
            // Chart.js compute its own internal drawing height from a
            // generic default ratio instead of the canvas's actual
            // (perfectly square) CSS box, which is what let the drawn
            // ring drift out of sync with the CSS .donut-track behind it,
            // especially once the donut got bigger and the drift became
            // visible. `false` makes Chart.js just use the real,
            // CSS-driven box (same fix already used for weightChart in
            // weight-tracking.js) so the two rings always share the exact
            // same math.
            maintainAspectRatio: false,
        }
    });

    // Inner donut: macro breakdown (protein / carbs / fat / fiber), nested
    // inside the calorie donut's hollow. Any macro that rounds to 0g (the
    // same rounding used for the numbers in the bars above) is filtered out
    // of macroPresent entirely (not just given a 0-size slice), so it never
    // appears in the ring and never eats a gap segment of its own — only a
    // macro that displays as 1g or more gets a slice. Every macro that IS
    // present is also guaranteed a minimum 2% slice of the full ring
    // (floorFraction below) so a tiny-but-real amount (1g next to 90g, say)
    // never renders as an invisible sliver; real proportions still show
    // through above that floor via remainingBudget below. The numbers in the
    // bars above always show the real, unmodified gram amounts regardless of
    // what's drawn here.
    //
    // The gap between slices is inserted as its own small transparent data
    // segment (gapSize) rather than using Chart.js's pixel-based "spacing"
    // option, so the gap is always the same fixed proportion of the ring —
    // it no longer grows or shrinks depending on the chart's rendered size
    // (browser width) or on how much of each macro was logged.
    const macroDonut = document.getElementById('macroDonutChart');
    if (window.macroDonutInstance) window.macroDonutInstance.destroy();

    const macroAll = [
        { raw: p, color: macroColors.protein, label: 'Protein' },
        { raw: c, color: macroColors.carbs, label: 'Carbs' },
        { raw: f, color: macroColors.fat, label: 'Fat' },
        { raw: fib, color: macroColors.fiber, label: 'Fiber' },
    ];
    // Only a macro that displays as 1g or more (same rounding as the bars
    // above) gets a slice — a true 0g, or an amount that itself rounds down
    // to 0g, is excluded entirely rather than drawn as a stray sliver.
    const macroPresent = macroAll.filter(m => Math.round(m.raw) >= 1);
    const macroValues = macroPresent.map(m => m.raw);

    // gapSize and floorFraction are both expressed directly as a fraction of
    // the FULL ring (not of the raw gram total) so the two combine cleanly:
    // every present macro gets floorFraction (2%) guaranteed, every gap
    // between slices gets gapSize (0.6%), and whatever's left over
    // (remainingBudget) is handed out to each macro in proportion to its own
    // real grams — so a macro that's actually bigger than another still
    // visibly dominates it, just never all the way down to an invisible
    // sliver.
    // Narrowed back down from 3% to 0.6% of the ring per gap — 3% read as
    // too much empty space between segments.
    const gapSize = 0.006;
    const floorFraction = 0.02;
    const macroDisplay = [];
    const macroDisplayColors = [];
    const macroDisplayLabels = [];
    if (macroValues.length > 0) {
        const rawTotal = macroValues.reduce((s, v) => s + v, 0);
        const macroBudget = 1 - gapSize * macroValues.length;
        const remainingBudget = Math.max(0, macroBudget - floorFraction * macroValues.length);
        macroValues.forEach((v, idx) => {
            const share = floorFraction + (v / rawTotal) * remainingBudget;
            macroDisplay.push(share);
            macroDisplayColors.push(macroPresent[idx].color);
            macroDisplayLabels.push(macroPresent[idx].label);
            macroDisplay.push(gapSize);
            macroDisplayColors.push('transparent');
            macroDisplayLabels.push('');
        });
    }

    // Sugar doesn't get its own slice (it's a sub-amount of Carbs, not a
    // separate macro alongside it) — instead the Carbs slice's own color
    // fades into the Sugar color across whatever portion of that arc
    // represents how much of those carbs are sugar. Chart.js resolves a
    // slice's backgroundColor BEFORE it assigns that slice's real angles
    // to its element, so the angles needed to build the gradient are
    // worked out by hand here (mirroring Chart.js's own doughnut layout:
    // starts at 12 o'clock, goes clockwise, proportional to each value out
    // of the whole dataset) rather than read off the chart mid-render.
    const macroDisplayTotal = macroDisplay.reduce((s, v) => s + v, 0);
    let macroCumulative = 0;
    const macroAngles = macroDisplay.map(v => {
        const start = -Math.PI / 2 + (macroCumulative / macroDisplayTotal) * Math.PI * 2;
        macroCumulative += v;
        const end = -Math.PI / 2 + (macroCumulative / macroDisplayTotal) * Math.PI * 2;
        return { start, end };
    });
    const carbsIndex = macroDisplayLabels.indexOf('Carbs');

    window.macroDonutInstance = new Chart(macroDonut, {
        type: 'doughnut',
        data: {
            labels: macroDisplayLabels,
            datasets: [{
                data: macroDisplay,
                backgroundColor: (context) => {
                    const idx = context.dataIndex;
                    const base = macroDisplayColors[idx];
                    if (idx === carbsIndex && sug > 0 && c > 0) {
                        const chartCtx = context.chart.ctx;
                        const area = context.chart.chartArea;
                        if (area && chartCtx.createConicGradient) {
                            const cx = (area.left + area.right) / 2;
                            const cy = (area.top + area.bottom) / 2;
                            const { start, end } = macroAngles[idx];
                            const span = end - start;
                            const sugarFraction = Math.min(1, sug / c);
                            const fadeStart = Math.max(0, Math.min(1, ((1 - sugarFraction) * span) / (Math.PI * 2)));
                            const fadeEnd = Math.max(fadeStart, Math.min(1, span / (Math.PI * 2)));
                            const gradient = chartCtx.createConicGradient(start, cx, cy);
                            gradient.addColorStop(0, base);
                            gradient.addColorStop(fadeStart, base);
                            gradient.addColorStop(fadeEnd, macroColors.sugar);
                            return gradient;
                        }
                    }
                    return base;
                },
                borderWidth: 0,
                // the invisible transparent "gap" segments don't need any
                // corner rounding of their own (they're not seen) — giving
                // them the same radius as the real macro segments was
                // what made the gaps look uneven, since Chart.js rounds
                // each segment relative to its own (very thin) arc; only
                // the visible macro segments get rounded now, so every
                // gap ends up the same clean width. Bumped from 4px to 6px
                // for more visibly rounded segment ends.
                borderRadius: macroDisplayColors.map(c => c === 'transparent' ? 0 : 6),
                spacing: 0,
            }]
        },
        options: {
            cutout: '80%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            // Same fix as #donutChart above — disables the hover
            // tooltip/highlight, which isn't used for anything here.
            events: [],
            responsive: true,
            // See the matching note on #donutChart's own options above —
            // same fix, same reason (keeps this ring's real drawn size
            // locked to its actual square CSS box instead of a computed
            // aspect-ratio guess).
            maintainAspectRatio: false,
        }
    });

    // Today's food log
    // selectedLogIndices always starts empty on a fresh render — see the
    // comment on its declaration above.
    selectedLogIndices.clear();
    const logDiv = document.getElementById('todayLog');
    if (dailyLog.length === 0) {
        logDiv.innerHTML =
            '<div class="empty">Nothing logged yet — tap "Add food" to start tracking today.</div>';
    } else {
        const groups = {};
        const standalone = [];
        dailyLog.forEach((item, idx) => {
            if (item.mealId) {
                if (!groups[item.mealId]) groups[item.mealId] = [];
                groups[item.mealId].push({ ...item, idx });
            } else {
                standalone.push({ ...item, idx });
            }
        });

        let html = '';
        standalone.forEach(item => {
            html += `<div class="item">
                <div class="item-main">
                    <div class="sel-check" onclick="toggleItemSelect(${item.idx}, this)" title="Select for total">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <span>${item.name} (${item.amount||''}${item.unit||''})</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>${Math.round(item.kcal)} kcal</span>
                    <button class="macro-expand-btn" onclick="toggleItemMacros(this)" title="Show macros"><i class="fas fa-chevron-down"></i></button>
                    <div class="item-actions">
                        <button onclick="editFoodItem(${item.idx})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteFoodItem(${item.idx})" title="Delete"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </div>
            <div class="macro-detail-row">
                <span class="macro-pill"><span class="dot protein"></span>P ${(item.protein||0).toFixed(1)}g</span>
                <span class="macro-pill"><span class="dot carbs"></span>C ${(item.carbs||0).toFixed(1)}g</span>
                <span class="macro-pill"><span class="dot fat"></span>F ${(item.fat||0).toFixed(1)}g</span>
                <span class="macro-pill"><span class="dot fiber"></span>Fi ${(item.fiber||0).toFixed(1)}g</span>
                <span class="macro-pill"><span class="dot sugar"></span>S ${(item.sugar||0).toFixed(1)}g</span>
            </div>`;
        });

        for (const [mealId, items] of Object.entries(groups)) {
            const mealName = items[0].mealName || 'Meal';
            const mealIcon = items[0].mealIcon || '🍽️';
            const totalKcal = items.reduce((s, i) => s + i.kcal, 0);
            const itemsHtml = items.map(item =>
                `${item.name} (${item.amount||''}${item.unit||''})`).join(', ');
            html += `<div class="meal-group" style="border-left-color:var(--accent);">
                <div class="meal-header">
                    <span>${mealIcon} ${mealName}</span>
                    <span>${Math.round(totalKcal)} kcal <button class="toggle-items" onclick="toggleMealItems(this)"><i class="fas fa-chevron-down"></i></button></span>
                </div>
                <div class="meal-items">${itemsHtml}</div>
            </div>`;
        }
        logDiv.innerHTML = html;
    }
    document.getElementById('logCount').innerText = dailyLog.length + ' items';
    // Always resets #selectionTotalBar back to its closed/zero state,
    // matching selectedLogIndices being cleared above.
    updateSelectionBar();

    document.getElementById('dashDate').innerText = formatDate(today);

    // ============================================================
    //  WEEKLY CHART - Soft, clean, columns closer together
    //  (thin gradient bars + soft fading target zone + target line +
    //  baseline + a merged kcal badge on each bar + "today" callout —
    //  see the "NOTE ON THE WEEKLY CHART" comment at the top of this
    //  file for how weeklyExtrasPlugin below fits together)
    // ============================================================
    const week = getWeekDates();
    const weekKcal = week.map(d => dailyHistory[d] || 0);
    const wc = document.getElementById('weeklyChart');
    if (window.weeklyInstance) window.weeklyInstance.destroy();

    const underColor = chartColors.under || '#a8e6cf';
    const overColor = chartColors.over || '#f5a3a3';

    // Column width/spacing, named here (instead of only as literals on the
    // dataset further down) so the borderRadius function below can compute
    // each bar's actual rendered pixel width using the exact same numbers
    // Chart.js itself uses to size the bars.
    const BAR_PERCENTAGE = 0.76;
    const CATEGORY_PERCENTAGE = 1;
    // Top-corner roundness is capped at this many px at most — see the
    // borderRadius function below for why it's also capped by the bar's
    // own rendered width.
    const BAR_TOP_RADIUS_MAX = 23;

    const barColors = weekKcal.map(v => {
        const isOver = v > MACRO_TARGETS.calories;
        return isOver ? overColor : underColor;
    });

    const weekLabels = week.map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }));
    const todayIndex = week.indexOf(today);
    // A canvas 2D context's fillStyle/strokeStyle can't actually resolve a
    // CSS custom property string like 'var(--text-primary)' — that only
    // works inside real CSS, not a plain string handed to canvas. Passing
    // it straight through (as this used to) silently fails and canvas just
    // keeps whatever color was already set, which was why "today" never
    // actually turned accent-colored: the assignment was being ignored.
    // Instead, resolve the CURRENT theme's real colors once up front with
    // getComputedStyle (this naturally picks up light vs. dark mode based
    // on whatever's on <body> right now) and hand Chart.js/the plugin
    // actual color values below.
    const bodyStyles = getComputedStyle(document.body);
    const textPrimaryColor = bodyStyles.getPropertyValue('--text-primary').trim() || '#1a2639';
    const textMutedColor = bodyStyles.getPropertyValue('--text-muted').trim() || '#6b7f94';
    // Target-line placement, capped so an extreme day can't push it down
    // near the bottom: a normal week (nothing wildly over target) still
    // gets a little extra headroom above its tallest bar (target * 1.4, or
    // tallest * 1.05 if that's bigger) so nothing touches the very top of
    // the chart. But once the tallest bar would go past softCap (target *
    // 1.8), the axis simply stops growing there — the target line then
    // always sits at a fixed, clearly-visible height (1 / 1.8 of the way
    // up) no matter how far over target that outlier day actually was.
    // That one outlier bar gets visually capped/flush against the top of
    // the chart as a result (scales.y uses a hard `max` below, not just a
    // suggestion) — its real kcal number is still shown correctly by the
    // plugin further down, only the bar's drawn HEIGHT is capped.
    const tallestBarKcal = Math.max(0, ...weekKcal);
    const softCap = MACRO_TARGETS.calories * 1.8;
    const chartMax = tallestBarKcal <= softCap
        ? Math.max(MACRO_TARGETS.calories * 1.4, tallestBarKcal * 1.05)
        : softCap;

    // a darker, more saturated version of the same under/over color the
    // user picked in Settings — used as the SOLID zone painted at the very
    // top of each column (where the kcal number is now printed directly
    // onto the bar — see the dataset's backgroundColor below), so the
    // white number stays readable no matter what pastel shade the bar
    // itself is using. (Kept the name barBadgeColors even though there's
    // no separate floating badge shape anymore — it's still exactly the
    // same "readable text color for this bar" list, just used differently.)
    function darkenHex(hex, amt) {
        const h = hex.replace('#', '');
        const num = parseInt(h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h, 16);
        const r = Math.max(0, Math.min(255, ((num >> 16) & 255) - amt));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 255) - amt));
        const b = Math.max(0, Math.min(255, (num & 255) - amt));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    const barBadgeColors = weekKcal.map(v => {
        const isOver = v > MACRO_TARGETS.calories;
        return darkenHex(isOver ? overColor : underColor, 55);
    });

    const weeklyExtrasPlugin = {
        id: 'weeklyExtras',
        beforeDatasetsDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            if (!chartArea) return;

            // soft red zone above the daily calorie target — fades in
            // from nothing right at the target line to a bit stronger
            // near the top of the chart, instead of a hard line
            const targetY = scales.y.getPixelForValue(MACRO_TARGETS.calories);
            if (targetY > chartArea.top) {
                ctx.save();
                const zoneGradient = ctx.createLinearGradient(0, targetY, 0, chartArea.top);
                zoneGradient.addColorStop(0, overColor + '00');
                zoneGradient.addColorStop(1, overColor + '38');
                ctx.fillStyle = zoneGradient;
                ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, targetY - chartArea.top);
                ctx.restore();
            }

            // a thin, always-visible soft line right at the calorie limit
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 1.25;
            ctx.strokeStyle = overColor + '80';
            ctx.moveTo(chartArea.left, targetY);
            ctx.lineTo(chartArea.right, targetY);
            ctx.stroke();
            ctx.restore();

            // a subtle baseline where the bars start
            const baseY = scales.y.getPixelForValue(0);
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = textMutedColor;
            ctx.moveTo(chartArea.left, baseY);
            ctx.lineTo(chartArea.right, baseY);
            ctx.stroke();
            ctx.restore();
        },
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            ctx.save();

            // kcal number, printed directly onto the column itself — no
            // separate floating oval/badge shape anymore, just the column
            // with its number in it. It sits inside the solid-colored zone
            // painted at the top of the bar (see the dataset's
            // backgroundColor below), which is what keeps the white text
            // readable no matter what pastel shade the bar's own color is.
            // A bar that's visually capped at the chart's ceiling (an
            // extreme over-target day — see chartMax above) has its top
            // clamped to chartArea.top here too, so its real kcal number
            // still prints just inside the visible chart instead of being
            // drawn off the top edge.
            //
            // ALWAYS drawn inside the bar now, topPad px down from its top —
            // this used to switch to printing the number ABOVE the bar once
            // it got short, but that "auto" behavior got replaced after
            // trying a few placement modes (always inside / always above /
            // centered / the old auto-switch) side by side in an interactive
            // preview and landing on "always inside" with this offset. The
            // one case that still falls back to sitting just above the bar
            // (in the theme's normal text color) is a bar too short to
            // physically hold an 11px number without it being cut off —
            // minFitHeight below is that floor, not a style choice.
            const meta = chart.getDatasetMeta(0);
            ctx.font = '700 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            const topPad = 13;
            const bottomPad = 4;
            // Below this height, even the smallest legal topPad/bottomPad
            // clamp below would push the number past the bar's own bottom
            // edge — so this is topPad + bottomPad (plus a hair of margin),
            // not a stylistic threshold like the old minInsideHeight was.
            const minFitHeight = topPad + bottomPad + 1;
            meta.data.forEach((bar, i) => {
                const val = weekKcal[i];
                if (val <= 0) return;
                const label = String(Math.round(val));
                const barTop = Math.max(bar.y, chartArea.top);
                const barHeight = Math.max(0, bar.base - barTop);
                if (barHeight >= minFitHeight) {
                    // Inside the bar's own solid cap zone, in white, clamped
                    // so it never spills above the bar's top or below its
                    // baseline.
                    const textY = Math.max(barTop + topPad, Math.min(barTop + topPad + 4, bar.base - bottomPad));
                    ctx.fillStyle = '#fff';
                    ctx.fillText(label, bar.x, textY);
                } else {
                    // Too short to hold the number without crowding it —
                    // print it just above the bar instead, in the theme's
                    // normal text color (so it reads against the chart's
                    // plain background in both light and dark mode, unlike
                    // white text would). Clamped so it can't be drawn off
                    // the chart's top edge on an especially short bar right
                    // near the ceiling.
                    const textY = Math.max(chartArea.top + 8, barTop - 4);
                    ctx.fillStyle = textPrimaryColor;
                    ctx.fillText(label, bar.x, textY);
                }
            });

            ctx.restore();
        }
    };

    window.weeklyInstance = new Chart(wc, {
        type: 'bar',
        data: {
            labels: weekLabels,
            datasets: [{
                label: 'kcal',
                data: weekKcal,
                backgroundColor: (context) => {
                    const { chart, dataIndex } = context;
                    const { ctx, chartArea, scales } = chart;
                    if (!chartArea) return barColors[dataIndex];
                    const base = barColors[dataIndex];
                    // Solid (darker) zone at the very top of the column —
                    // where the kcal number is now printed straight onto the
                    // bar instead of a separate floating oval — fading down
                    // into the same look the bar always had (base color
                    // easing toward ~33% opacity near the baseline). Built
                    // from the y-SCALE's own pixel mapping (scales.y) rather
                    // than the bar element's own x/y/base — Chart.js resolves
                    // a bar's backgroundColor before it assigns that bar's
                    // final on-screen position for THIS render, so reading
                    // the element itself here would be one render behind
                    // (the scale's pixel mapping is already final by this
                    // point, so it isn't). A bar that's visually capped at
                    // the chart's ceiling (see chartMax above) has its top
                    // clamped to chartArea.top, so the solid zone — and the
                    // number printed in it — always stays inside the chart.
                    const barTop = Math.max(scales.y.getPixelForValue(weekKcal[dataIndex]), chartArea.top);
                    const barBottom = scales.y.getPixelForValue(0);
                    const barHeight = Math.max(0, barBottom - barTop);
                    const solidZone = Math.min(18, barHeight);
                    const solidFraction = barHeight > 0 ? solidZone / barHeight : 0;
                    const gradient = ctx.createLinearGradient(0, barTop, 0, barBottom);
                    gradient.addColorStop(0, barBadgeColors[dataIndex]);
                    gradient.addColorStop(Math.min(1, solidFraction), barBadgeColors[dataIndex]);
                    gradient.addColorStop(1, base + '55');
                    return gradient;
                },
                // Flat bottom, rounded top only, instead of a fully-rounded
                // pill on all four corners. borderSkipped: 'bottom' tells
                // Chart.js that edge is already flat/square, so it doesn't
                // try to draw a border there either.
                //
                // The top radius is capped at BOTH a fixed max
                // (BAR_TOP_RADIUS_MAX) AND a fraction of the bar's own
                // rendered pixel width, so it can never look distorted —
                // like a squashed pill instead of a rounded rectangle — at
                // narrow browser widths where each column gets thin. Width
                // is worked out from the chart area and category count (the
                // same numbers Chart.js itself uses via BAR_PERCENTAGE/
                // CATEGORY_PERCENTAGE above) instead of reading the bar
                // element directly — Chart.js resolves borderRadius before
                // a bar's own element is final for this render, so reading
                // the element here would be one render behind.
                borderRadius: (context) => {
                    const { chart } = context;
                    const { chartArea } = chart;
                    if (!chartArea) return { topLeft: BAR_TOP_RADIUS_MAX, topRight: BAR_TOP_RADIUS_MAX, bottomLeft: 0, bottomRight: 0 };
                    const categoryWidth = (chartArea.right - chartArea.left) / weekKcal.length;
                    const barWidth = categoryWidth * CATEGORY_PERCENTAGE * BAR_PERCENTAGE;
                    const r = Math.min(BAR_TOP_RADIUS_MAX, barWidth * 0.4);
                    return { topLeft: r, topRight: r, bottomLeft: 0, bottomRight: 0 };
                },
                borderSkipped: 'bottom',
                barPercentage: BAR_PERCENTAGE,
                categoryPercentage: CATEGORY_PERCENTAGE,
            }]
        },
        plugins: [weeklyExtrasPlugin],
        options: {
            devicePixelRatio: window.devicePixelRatio || 2,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.raw + ' kcal';
                        }
                    },
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: { size: 10, weight: '600' },
                    bodyFont: { size: 9 },
                    cornerRadius: 8,
                    padding: 8,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                }
            },
            layout: {
                // less top padding needed now that the kcal number is
                // printed directly onto each column instead of a separate
                // badge overlapping above the bar — just a little breathing
                // room so a capped/flush bar doesn't touch the very edge
                padding: { top: 10 }
            },
            scales: {
                y: {
                    display: false,
                    beginAtZero: true,
                    // a hard `max` (not just a suggestion) so the axis
                    // never grows past chartMax — that's what keeps the
                    // target line's height fixed even on a week with an
                    // extreme over-target day (see chartMax above)
                    max: chartMax,
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10, weight: '700', family: 'Inter' },
                        // non-today labels use the theme's own normal text
                        // color for this mode (resolved above into
                        // textPrimaryColor, same as everything else in the
                        // app) so they read as plain text, not a separately-
                        // customizable color; the current day's label always
                        // stays the accent color (userAccentColor, the same
                        // live value the picker in the top bar sets)
                        color: (context) => context.index === todayIndex ? userAccentColor : textPrimaryColor,
                        padding: 6,
                    },
                    border: { display: false }
                }
            },
            responsive: true,
            // maintainAspectRatio is OFF on purpose: with it on, Chart.js
            // derives this chart's height from its own aspectRatio number
            // instead of the canvas's actual rendered box, which can drift
            // out of sync with the fixed height set on .weekly-chart-box in
            // dashboard.css as the window is resized — that drift is what
            // was making this chart look increasingly blurry/pixelated the
            // narrower the browser got. With it off, Chart.js measures the
            // real box (see the sizing comment on .chart-box.weekly-chart-box
            // in dashboard.css) on every resize, so the chart's resolution
            // always matches what's actually on screen.
            maintainAspectRatio: false,
            animation: {
                duration: 500,
                easing: 'easeOutQuart'
            },
        }
    });

    renderCalendar();
    renderWeightChart();
    renderWeightDisplay();
    saveState();
    renderModalSavedMeals();
}

function toggleMealItems(btn) {
    const items = btn.closest('.meal-group').querySelector('.meal-items');
    items.classList.toggle('show');
    btn.querySelector('i').classList.toggle('fa-chevron-down');
    btn.querySelector('i').classList.toggle('fa-chevron-up');
}

// ============================================================
//  TODAY'S FOOD ACTIONS
// ============================================================

// Toggles the little round macro-breakdown button on a standalone food
// row (see the .macro-expand-btn markup in renderDashboard() above).
// Same icon-swap pattern as toggleMealItems() above it, just targeting
// the .macro-detail-row that immediately follows this item in the DOM
// instead of a .meal-items block.
function toggleItemMacros(btn) {
    btn.classList.toggle('open');
    btn.querySelector('i').classList.toggle('fa-chevron-down');
    btn.querySelector('i').classList.toggle('fa-chevron-up');
    const detailRow = btn.closest('.item').nextElementSibling;
    if (detailRow) detailRow.classList.toggle('show');
}

// Checks/unchecks one standalone item for the combined total in
// #selectionTotalBar. checkboxEl is the clicked .sel-check div itself
// (passed as `this` from the inline onclick), so its own .item ancestor
// gets the highlighted "selected" look without a separate DOM lookup.
function toggleItemSelect(idx, checkboxEl) {
    if (selectedLogIndices.has(idx)) {
        selectedLogIndices.delete(idx);
    } else {
        selectedLogIndices.add(idx);
    }
    checkboxEl.closest('.item').classList.toggle('selected');
    updateSelectionBar();
}

// Unchecks every selected item and closes #selectionTotalBar. Bound to
// the "Clear" link inside the bar itself.
function clearLogSelection() {
    selectedLogIndices.clear();
    document.querySelectorAll('#todayLog .item.selected').forEach(el => el.classList.remove('selected'));
    updateSelectionBar();
}

// Recomputes the combined kcal + macro totals for whatever's currently
// in selectedLogIndices and shows/hides #selectionTotalBar accordingly.
// #selectionTotalBar is a normal (non-overlay) flex sibling of #todayLog
// inside .food-card's flex column — see the SELECTION TOTAL BAR comment
// in dashboard.css — so opening it here shrinks #todayLog to make room
// instead of floating on top of it and covering an item.
function updateSelectionBar() {
    const bar = document.getElementById('selectionTotalBar');
    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
    selectedLogIndices.forEach(idx => {
        const item = dailyLog[idx];
        if (!item) return;
        totals.kcal += item.kcal || 0;
        totals.protein += item.protein || 0;
        totals.carbs += item.carbs || 0;
        totals.fat += item.fat || 0;
        totals.fiber += item.fiber || 0;
        totals.sugar += item.sugar || 0;
    });
    document.getElementById('selCount').innerText = selectedLogIndices.size;
    document.getElementById('selKcal').innerText = Math.round(totals.kcal);
    document.getElementById('selMacros').innerHTML = selectedLogIndices.size > 0 ? `
        <span class="macro-pill"><span class="dot protein"></span>P ${totals.protein.toFixed(1)}g</span>
        <span class="macro-pill"><span class="dot carbs"></span>C ${totals.carbs.toFixed(1)}g</span>
        <span class="macro-pill"><span class="dot fat"></span>F ${totals.fat.toFixed(1)}g</span>
        <span class="macro-pill"><span class="dot fiber"></span>Fi ${totals.fiber.toFixed(1)}g</span>
        <span class="macro-pill"><span class="dot sugar"></span>S ${totals.sugar.toFixed(1)}g</span>
    ` : '';
    bar.classList.toggle('show', selectedLogIndices.size > 0);
}

function editFoodItem(idx) {
    const item = dailyLog[idx];
    if (!item) return;

    // A logged cooked-portion entry (see the COOKED PORTION FEATURE block
    // below) isn't a real ingredient, so it can't go through the regular
    // "look it up in INGREDIENTS and rescale" path below — reopen the same
    // portion popup instead, using the raw totals/cooked weight already
    // saved on the entry itself, and update it in place on confirm.
    if (item.isRecipePortion) {
        openPortionModal({
            rawTotals: item.recipeRawTotals,
            cookedWeight: item.recipeCookedWeight,
            mealName: item.name,
            mealIcon: item.mealIcon,
            editingLogIdx: idx,
            initialAmount: item.amount,
            initialUnit: item.unit
        });
        return;
    }

    const newAmount = prompt('Enter new amount:', item.amount);
    if (newAmount === null) return;
    const newUnit = prompt('Enter new unit (g/ml/tbsp/tsp/pc):', item.unit || 'g');
    if (newUnit === null) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;
    const ing = INGREDIENTS.find(i => i.name === item.name);
    if (!ing) return;
    const macros = parseAmount(ing, amount, newUnit);
    dailyLog[idx] = { ...item, amount, unit: newUnit, ...macros };
    renderDashboard();
}

function deleteFoodItem(idx) {
    if (!confirm('Remove this item from today\'s log?')) return;
    dailyLog.splice(idx, 1);
    renderDashboard();
}

// ============================================================
//  END DAY / DATE PICKER
// ============================================================
function endDay() {
    if (dailyLog.length === 0) {
        if (!confirm('No food logged today. End day anyway?')) return;
    }
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().slice(0, 10);
    today = newDate;
    dailyLog = JSON.parse(localStorage.getItem('dailyLog_' + today)) || [];
    renderDashboard();
}

function openDatePickerModal() {
    document.getElementById('datePickerInput').value = today;
    updateDatePickerInfo();
    document.getElementById('datePickerModal').classList.add('show');
}

function closeDatePickerModal() {
    document.getElementById('datePickerModal').classList.remove('show');
}

function updateDatePickerInfo() {
    const date = document.getElementById('datePickerInput').value;
    if (!date) return;
    const log = JSON.parse(localStorage.getItem('dailyLog_' + date)) || [];
    const total = log.reduce((s, i) => s + (i.kcal || 0), 0);
    document.getElementById('datePickerKcal').innerText = Math.round(total) + ' kcal';
    document.getElementById('datePickerItemCount').innerText = log.length + ' items';
}

document.getElementById('datePickerInput').addEventListener('change', updateDatePickerInfo);

function switchToDate() {
    const date = document.getElementById('datePickerInput').value;
    if (!date) return;
    today = date;
    dailyLog = JSON.parse(localStorage.getItem('dailyLog_' + today)) || [];
    closeDatePickerModal();
    renderDashboard();
}

function addFoodForDate() {
    const date = document.getElementById('datePickerInput').value;
    if (!date) return;
    today = date;
    dailyLog = JSON.parse(localStorage.getItem('dailyLog_' + today)) || [];
    closeDatePickerModal();
    openAddFoodModal();
}

function deleteDateLog() {
    const date = document.getElementById('datePickerInput').value;
    if (!date) return;
    if (!confirm(`Delete all food entries for ${formatDate(date)}?`)) return;
    localStorage.removeItem('dailyLog_' + date);
    dailyHistory[date] = 0;
    delete dailyMacroHistory[date];
    localStorage.setItem('dailyHistory', JSON.stringify(dailyHistory));
    localStorage.setItem('dailyMacroHistory', JSON.stringify(dailyMacroHistory));
    if (date === today) {
        dailyLog = [];
        renderDashboard();
    }
    updateDatePickerInfo();
    renderCalendar();
    closeDatePickerModal();
    alert('Day deleted successfully!');
}

// ============================================================
//  ACTIONS
// ============================================================
function resetToday() {
    if (!confirm('Reset today\'s log?')) return;
    dailyLog = [];
    localStorage.removeItem('dailyLog_' + today);
    renderDashboard();
    renderCalendar();
}

// ============================================================
//  MODAL: Add Food
// ============================================================
function openAddFoodModal() {
    document.getElementById('addFoodModal').classList.add('show');
    document.getElementById('ingredientSearchInput').value = '';
    document.getElementById('modalAmount').value = 100;
    document.getElementById('modalUnit').value = 'g';
    selectedIngredient = null;
    document.getElementById('dropdownList').classList.remove('show');
    // Only the typed search resets on open — which meal-group sections are
    // expanded is left as-is, same reasoning as dropdownExpandedCategories
    // above (re-opening this popup to load a second meal from the group you
    // just used shouldn't collapse it again).
    const smSearch = document.getElementById('modalSavedMealsSearch');
    if (smSearch) smSearch.value = '';
    renderModalSavedMeals();
}

function closeAddFoodModal() {
    document.getElementById('addFoodModal').classList.remove('show');
    document.getElementById('dropdownList').classList.remove('show');
}

function showDropdown() {
    const search = document.getElementById('ingredientSearchInput').value;
    renderDropdown(search);
    document.getElementById('dropdownList').classList.add('show');
}

function filterDropdown() {
    const search = document.getElementById('ingredientSearchInput').value;
    renderDropdown(search);
    document.getElementById('dropdownList').classList.add('show');
}

// Which categories are currently expanded in the Add Food dropdown, keyed
// by category name — persists for as long as the page is open (not reset
// each time the modal opens), so re-opening "Add food" to log a second
// item from the same category you just used doesn't collapse it again.
// Only meaningful while the search box is EMPTY: with a search typed in,
// every category that has a match is always shown expanded regardless of
// this, since the point of typing a search is to jump straight to
// results, not to browse category by category.
let dropdownExpandedCategories = {};

function toggleDropdownCategory(catName) {
    dropdownExpandedCategories[catName] = !dropdownExpandedCategories[catName];
    renderDropdown(document.getElementById('ingredientSearchInput').value);
}

function renderDropdown(search) {
    const list = document.getElementById('dropdownList');
    const filtered = INGREDIENTS.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase())
    );
    if (filtered.length === 0) {
        list.innerHTML = `<div class="no-results">No ingredients found</div>`;
        return;
    }

    const grouped = {};
    filtered.forEach(i => {
        if (!grouped[i.category]) grouped[i.category] = [];
        grouped[i.category].push(i);
    });

    // While searching, every matching category is shown open (there's no
    // point browsing category-by-category once you're already typing a
    // name) — only an EMPTY search box uses the collapsed/expand-on-click
    // behavior below, which is what makes scanning the full ~200-ingredient
    // list bearable: category headers with a count up front, items only
    // once you actually click into that category.
    const isSearching = search.trim().length > 0;

    let html = '';
    let count = 0;
    for (const cat of CATEGORIES) {
        const items = grouped[cat.name];
        if (!items) continue;
        const isOpen = isSearching || !!dropdownExpandedCategories[cat.name];
        html += `<div class="category-header" onclick="toggleDropdownCategory('${cat.name}')">
            ${categoryIconHtml(cat)}
            <span class="cat-name">${cat.name}</span>
            <span class="cat-count">${items.length}</span>
            <i class="fas ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} cat-chevron"></i>
        </div>`;
        if (isOpen) {
            items.forEach(i => {
                if (count < 60) {
                    html += `<div class="item" onclick="selectIngredient('${i.name}')">
                        <span>${i.name}</span>
                        <span class="kcal-badge">${i.kcal} kcal / ${i.unit || '100g'}</span>
                    </div>`;
                    count++;
                }
            });
        }
    }
    if (filtered.length > 60 && count >= 60) {
        html += `<div class="no-results" style="font-size:0.7rem;">+ ${filtered.length - 60} more — narrow your search to see them</div>`;
    }
    list.innerHTML = html;
}

function selectIngredient(name) {
    selectedIngredient = INGREDIENTS.find(i => i.name === name);
    document.getElementById('ingredientSearchInput').value = name;
    document.getElementById('dropdownList').classList.remove('show');
    if (selectedIngredient && selectedIngredient.unit) {
        document.getElementById('modalUnit').value = selectedIngredient.unit;
    }
}

// Which meal-group sections are expanded in the "Load saved meal" browse
// view here — same collapsed-by-default idea as dropdownExpandedCategories
// above, and persists across re-opening Add Food for the same reason.
// Keyed by group id, plus the fixed key '__ungrouped' for meals with no
// group.
let modalSavedMealsExpandedGroups = {};

function toggleModalSavedMealsGroup(key) {
    const currentlyOpen = modalSavedMealsExpandedGroups[key] !== false;
    modalSavedMealsExpandedGroups[key] = !currentlyOpen;
    renderModalSavedMeals();
}

function renderModalSavedMeals() {
    const container = document.getElementById('modalSavedMealsGrid');
    const searchInput = document.getElementById('modalSavedMealsSearch');
    const search = (searchInput ? searchInput.value : '').trim().toLowerCase();

    if (savedMeals.length === 0) {
        container.innerHTML = '<span style="font-size:0.7rem; color:var(--text-muted);">No saved meals yet</span>';
        return;
    }

    const smButtonHtml = (m, idx) => {
        const totalKcal = m.items.reduce((s, i) => s + i.kcal, 0);
        const icon = m.icon || '🍽️';
        return `<button onclick="loadSavedMealFromModal(${idx})">${icon} ${m.name} (${Math.round(totalKcal)} kcal)</button>`;
    };

    // Typing a name shows a flat, matching-only list regardless of group —
    // the whole point of typing is to jump straight to a meal. Clearing
    // the search goes back to the grouped browse view below.
    if (search) {
        const filtered = savedMeals
            .map((m, idx) => ({ m, idx }))
            .filter(({ m }) => m.name.toLowerCase().includes(search));
        container.innerHTML = filtered.length === 0
            ? '<span style="font-size:0.7rem; color:var(--text-muted);">No matching meals</span>'
            : `<div class="sm-grid">${filtered.map(({ m, idx }) => smButtonHtml(m, idx)).join('')}</div>`;
        return;
    }

    // Browse view: one collapsible section per meal group (in the order
    // they were created), plus a final "Ungrouped" section — same
    // collapsed-by-default pattern as the ingredient dropdown above, so
    // scanning this picker doesn't mean scrolling past every saved meal
    // at once.
    const byGroup = {};
    savedMeals.forEach((m, idx) => {
        const key = m.groupId || '__ungrouped';
        (byGroup[key] = byGroup[key] || []).push(idx);
    });

    let html = '';
    const renderSection = (key, label, icon) => {
        const idxs = byGroup[key];
        if (!idxs) return;
        // Defaults to OPEN (unlike the ingredient dropdown's collapse-by-
        // default) — the point of this picker is quick access to meals you
        // already have, so hiding them behind a closed header by default
        // would work against that. Only explicitly collapsing a section
        // (toggleModalSavedMealsGroup) closes it, and that choice persists
        // across re-opening this popup.
        const isOpen = modalSavedMealsExpandedGroups[key] !== false;
        html += `<div class="sm-group-header" onclick="toggleModalSavedMealsGroup('${key}')">
            <span>${icon}</span>
            <span>${label}</span>
            <span class="grp-count">${idxs.length}</span>
            <i class="fas ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} grp-chevron"></i>
        </div>`;
        if (isOpen) {
            html += `<div class="sm-grid">${idxs.map(idx => smButtonHtml(savedMeals[idx], idx)).join('')}</div>`;
        }
    };
    mealGroups.forEach(g => renderSection(g.id, g.name, g.icon || '🍽️'));
    renderSection('__ungrouped', 'Ungrouped', '🍽️');

    container.innerHTML = html || '<span style="font-size:0.7rem; color:var(--text-muted);">No saved meals yet</span>';
}

function loadSavedMealFromModal(idx) {
    const meal = savedMeals[idx];
    if (!meal) return;

    // A meal with a "Total cooked weight" set (Save/Edit Meal popup) asks
    // for a portion size and scales the macros down instead of logging the
    // whole recipe — see the COOKED PORTION FEATURE block below. Any other
    // meal keeps working exactly like before: logged instantly, in full.
    if (meal.cookedWeight && meal.cookedWeight > 0) {
        openPortionModalForMeal(idx);
        return;
    }

    const mealId = 'meal_' + Date.now() + '_' + idx;
    meal.items.forEach(item => {
        dailyLog.push({
            ...item,
            mealId: mealId,
            mealName: meal.name,
            mealIcon: meal.icon || '🍽️'
        });
    });

    closeAddFoodModal();
    renderDashboard();
    renderCalendar();
    scrollFoodLogToBottom();
}

// ============================================================
//  COOKED PORTION FEATURE
// ============================================================
// For a saved meal you cook as a batch (raw ingredients that shrink/
// change down to some final cooked weight) and then eat a portion of —
// see the "Total cooked weight" field in the Save/Edit Meal popup
// (saved-meals.js/index.html). Tapping such a meal from Add Food opens
// #portionModal instead of logging the whole thing: you enter how many
// grams of the COOKED dish you're actually eating, and it works out what
// fraction of the whole batch that is, then scales the RAW ingredient
// totals by that same fraction — exactly the math you'd do by hand
// (e.g. 150g portion of a 380g cooked batch = 39.5% of it, so you get
// 39.5% of the raw macros). Only one combined log entry is created for
// the portion (not one per original ingredient) since once everything's
// mixed and cooked together, splitting the portion back out per
// ingredient wouldn't mean anything.
//
// portionModalState holds whichever meal/log-entry is currently open in
// the popup: { rawTotals, cookedWeight, mealName, mealIcon,
// editingLogIdx, initialAmount, lastScaled }. editingLogIdx is null for a
// fresh "log a new portion" (loadSavedMealFromModal/
// openPortionModalForMeal) and set to a dailyLog index when re-opened
// from editFoodItem() to change an already-logged portion's size.
let portionModalState = null;

function openPortionModalForMeal(mealIdx) {
    const meal = savedMeals[mealIdx];
    if (!meal) return;
    const rawTotals = meal.items.reduce((s, i) => ({
        kcal: s.kcal + (i.kcal || 0),
        protein: s.protein + (i.protein || 0),
        carbs: s.carbs + (i.carbs || 0),
        fat: s.fat + (i.fat || 0),
        fiber: s.fiber + (i.fiber || 0),
        sugar: s.sugar + (i.sugar || 0)
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 });

    openPortionModal({
        rawTotals,
        cookedWeight: meal.cookedWeight,
        mealName: meal.name,
        mealIcon: meal.icon || '🍽️',
        editingLogIdx: null,
        initialAmount: '',
        initialUnit: 'g'
    });
}

function openPortionModal(state) {
    portionModalState = state;
    const editing = state.editingLogIdx !== null && state.editingLogIdx !== undefined;
    document.getElementById('portionModalTitle').innerText = editing ? 'Edit Portion' : 'Log a Portion';
    document.getElementById('portionConfirmBtn').innerHTML = editing
        ? '<i class="fas fa-check"></i> Save Changes'
        : '<i class="fas fa-check"></i> Add to Today\'s Log';
    document.getElementById('portionMealName').innerText = (state.mealIcon || '🍽️') + ' ' + state.mealName;
    document.getElementById('portionRawCal').innerText = Math.round(state.rawTotals.kcal) + ' kcal';
    document.getElementById('portionRawProtein').innerText = state.rawTotals.protein.toFixed(1) + 'g';
    document.getElementById('portionRawCarbs').innerText = state.rawTotals.carbs.toFixed(1) + 'g';
    document.getElementById('portionRawFat').innerText = state.rawTotals.fat.toFixed(1) + 'g';
    document.getElementById('portionRawFiber').innerText = state.rawTotals.fiber.toFixed(1) + 'g';
    document.getElementById('portionRawSugar').innerText = state.rawTotals.sugar.toFixed(1) + 'g';
    document.getElementById('portionCookedWeight').innerText = state.cookedWeight + 'g';
    document.getElementById('portionAmountInput').value = state.initialAmount || '';
    document.getElementById('portionUnitInput').value = state.initialUnit || 'g';
    updatePortionPreview();
    document.getElementById('portionModal').classList.add('show');
}

function closePortionModal() {
    document.getElementById('portionModal').classList.remove('show');
    portionModalState = null;
}

function updatePortionPreview() {
    if (!portionModalState) return;
    const amount = parseFloat(document.getElementById('portionAmountInput').value);
    const unit = document.getElementById('portionUnitInput').value;
    const { rawTotals, cookedWeight } = portionModalState;
    const valid = isFinite(amount) && amount > 0 && cookedWeight > 0;
    // g and ml are treated as equal here (same as everywhere else in this
    // app — see parseAmount()'s comment), so the fraction math is identical
    // either way; only the displayed unit label changes.
    const fraction = valid ? (amount / cookedWeight) : 0;

    document.getElementById('portionFractionLine').innerText = valid
        ? `${amount}${unit} ÷ ${cookedWeight}g = ${(fraction * 100).toFixed(1)}% of the meal`
        : 'Enter your portion to see the math.';

    const scaled = {
        kcal: rawTotals.kcal * fraction,
        protein: rawTotals.protein * fraction,
        carbs: rawTotals.carbs * fraction,
        fat: rawTotals.fat * fraction,
        fiber: rawTotals.fiber * fraction,
        sugar: rawTotals.sugar * fraction
    };
    document.getElementById('portionOutCal').innerText = Math.round(scaled.kcal) + ' kcal';
    document.getElementById('portionOutProtein').innerText = scaled.protein.toFixed(1) + 'g';
    document.getElementById('portionOutCarbs').innerText = scaled.carbs.toFixed(1) + 'g';
    document.getElementById('portionOutFat').innerText = scaled.fat.toFixed(1) + 'g';
    document.getElementById('portionOutFiber').innerText = scaled.fiber.toFixed(1) + 'g';
    document.getElementById('portionOutSugar').innerText = scaled.sugar.toFixed(1) + 'g';

    portionModalState.lastScaled = scaled;
}

function confirmPortionLog() {
    if (!portionModalState) return;
    const amount = parseFloat(document.getElementById('portionAmountInput').value);
    if (!isFinite(amount) || amount <= 0) {
        alert('Please enter a valid portion amount.');
        return;
    }
    updatePortionPreview();
    const unit = document.getElementById('portionUnitInput').value;
    const { mealName, mealIcon, cookedWeight, rawTotals, editingLogIdx, lastScaled } = portionModalState;
    const entry = {
        name: mealName,
        mealIcon: mealIcon || '🍽️',
        amount,
        unit,
        kcal: lastScaled.kcal,
        protein: lastScaled.protein,
        carbs: lastScaled.carbs,
        fat: lastScaled.fat,
        fiber: lastScaled.fiber,
        sugar: lastScaled.sugar,
        // Kept on the entry itself (not looked up from savedMeals again
        // later) so editing this portion afterward — see editFoodItem() —
        // still works correctly even if the original saved meal is later
        // renamed, edited, or deleted.
        isRecipePortion: true,
        recipeCookedWeight: cookedWeight,
        recipeRawTotals: rawTotals
    };

    const isNew = editingLogIdx === null || editingLogIdx === undefined;
    if (isNew) {
        dailyLog.push(entry);
    } else {
        dailyLog[editingLogIdx] = entry;
    }

    closePortionModal();
    closeAddFoodModal();
    renderDashboard();
    renderCalendar();
    if (isNew) scrollFoodLogToBottom();
}

document.getElementById('portionModal')?.addEventListener('click', function (e) {
    if (e.target === this) closePortionModal();
});

function addFoodFromModal() {
    if (!selectedIngredient) {
        alert('Please select an ingredient from the dropdown.');
        return;
    }
    const amount = parseFloat(document.getElementById('modalAmount').value) || 0;
    if (amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }
    const unit = document.getElementById('modalUnit').value;
    const macros = parseAmount(selectedIngredient, amount, unit);
    dailyLog.push({ name: selectedIngredient.name, ...macros, amount, unit });
    closeAddFoodModal();
    renderDashboard();
    renderCalendar();
    scrollFoodLogToBottom();
}

// Scrolls Today's food log (#todayLog, which scrolls internally — see
// .food-log in dashboard.css) down to whatever was just added, instead of
// leaving the list scrolled wherever it happened to be and making you
// scroll down yourself to see it. Only called right after something is
// actually ADDED (here, loadSavedMealFromModal, and confirmPortionLog) —
// never from inside renderDashboard() itself, so deleting an item, editing
// one, or any unrelated re-render doesn't yank your scroll position
// around. The rAF wait is just to let the newly-rendered items actually
// exist in the DOM (renderDashboard() just replaced #todayLog's innerHTML)
// before measuring scrollHeight.
function scrollFoodLogToBottom() {
    requestAnimationFrame(function () {
        const log = document.getElementById('todayLog');
        if (log) log.scrollTop = log.scrollHeight;
    });
}

document.getElementById('addFoodModal').addEventListener('click', function(e) {
    if (e.target === this) closeAddFoodModal();
});