/* ============================================================
   CALENDAR WIDGET BEHAVIOR — calendar.js
   ============================================================
   WHAT THIS FILE CONTROLS:
   Drawing the month grid, coloring each day over/under target,
   marking today, showing the little over-target marker dots,
   handling clicking a day, and moving to the previous/next month.

   DEPENDS ON OTHER FILES:
     - shared/app-data-and-settings.js for: today, dailyHistory,
       dailyMacroHistory, MACRO_TARGETS, macroColors, calendarViewDate,
       getMonthName(), toLocalDateStr(), calendarOverMacros (up to 4
       macros to show an over-target marker dot for — user-choosable
       in Settings, defaults to just carbs — each rendered in that
       macro's own configured color from macroColors)
     - clicking a day opens the date-picker popup, whose functions
       (updateDatePickerInfo, etc.) live in dashboard/dashboard.js
       — that file must be loaded for day-clicks to work. Confirming
       a date switch there (switchToDate()) reassigns `today` and
       re-renders the dashboard, which re-renders this calendar and
       the This Week chart together, so picking a day here stays in
       sync with the rest of the app.

   TWO DIFFERENT "TODAY" CONCEPTS ON EACH DAY BOX:
     - .today (existing class) = the day currently SELECTED/VIEWED
       (the `today` variable) — shown with the outline/glow.
     - .real-today (new class) = the REAL calendar date right now,
       computed fresh from the clock every render, independent of
       whatever's selected — shown with accent-colored, extra-bold
       day-number text. A day can carry both classes at once (outline
       + accent text) when the real current date is also the one
       selected.

   OVER-TARGET MARKER DOTS:
     Up to 4 macros can be watched at once (calendarOverMacros in
     shared/app-data-and-settings.js, set via checkboxes in Settings).
     Each day box gets one small "carb-marker" dot per watched macro
     that's over its target that day, colored with that macro's own
     configured color (macroColors) via an inline style — the CSS
     class itself (.carb-marker in calendar.css) no longer hardcodes
     one fixed color, since it can now represent any of the 5 macros
     depending on what's picked. The Calendar legend below the grid
     mirrors the same dots/colors, laid out as a 2-column grid (see
     #calLegendOverLabel in calendar.css) so it always matches what's
     actually showing on the days above — with a special case for
     exactly 3 picks, where the 3rd item is centered under the first
     row (.centered-last) instead of sitting alone on the left.

   SAFE TO REWORK ALONE?
   Yes, together with calendar/calendar.css and the marked Calendar
   HTML block in index.html.
   ============================================================ */

// ============================================================
//  CALENDAR
// ============================================================
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    document.getElementById('calendarMonthLabel').innerText = getMonthName(month) + ' ' + year;

    // getDay() is Sunday-first (0=Sun..6=Sat), but the header row below is
    // Monday-first, so it has to be converted to a Monday-first blank-cell
    // count — otherwise every date in the month lands one weekday column
    // too far to the right (e.g. a month starting on Tuesday needs 1 blank
    // cell, not 2; a month starting on Sunday needs 6, not 0).
    const firstRaw = new Date(year, month, 1).getDay();
    const first = firstRaw === 0 ? 6 : firstRaw - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const cap = m => m.charAt(0).toUpperCase() + m.slice(1);

    // The real, unchanging current date — always gets the accent-colored
    // day-number text below, regardless of which date is selected/viewed.
    const realToday = toLocalDateStr(new Date());

    // Which macros the over-target marker dots below watch (up to 4, each
    // in its own macro color) — user-choosable in Settings
    // (calendarOverMacros), defaulting to just carbs. Keeping the legend
    // in sync with whatever's currently chosen, one colored dot per macro,
    // instead of a single fixed "carbs over" label. Laid out as a 2-column
    // grid (see #calLegendOverLabel in calendar.css) so up to 4 picks sit
    // in two neat rows of two instead of wrapping into a ragged row; when
    // exactly 3 are picked, the 3rd/last one gets .centered-last so it
    // sits centered under the first row instead of stranded on the left.
    const overMacros = (calendarOverMacros && calendarOverMacros.length) ? calendarOverMacros : ['carbs'];
    const legendLabel = document.getElementById('calLegendOverLabel');
    if (legendLabel) {
        legendLabel.innerHTML = overMacros.map((m, idx) => {
            const isLoneThird = overMacros.length === 3 && idx === 2;
            return `<span${isLoneThird ? ' class="centered-last"' : ''}><span class="dot carb-dot" style="background:${macroColors[m]};"></span>${cap(m)} over</span>`;
        }).join('');
    }

    days.forEach(d => {
        const h = document.createElement('div');
        h.style.cssText =
            'font-size:0.5rem; color:var(--text-muted); text-align:center; font-weight:700; padding-bottom:2px;';
        h.innerText = d;
        grid.appendChild(h);
    });

    for (let i = 0; i < first; i++) {
        const d = document.createElement('div');
        d.className = 'cal-day';
        d.innerText = '';
        grid.appendChild(d);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const kcal = dailyHistory[dateStr] || 0;

        // Make sure this day's full macro history is available — still
        // computes ALL six macro totals regardless of which are currently
        // watched, so switching which macros are picked in Settings never
        // needs a re-scan of anything.
        if (!dailyMacroHistory[dateStr]) {
            const log = JSON.parse(localStorage.getItem('dailyLog_' + dateStr)) || [];
            if (log.length > 0) {
                dailyMacroHistory[dateStr] = {
                    calories: log.reduce((s, i) => s + (i.kcal || 0), 0),
                    protein: log.reduce((s, i) => s + (i.protein || 0), 0),
                    carbs: log.reduce((s, i) => s + (i.carbs || 0), 0),
                    fat: log.reduce((s, i) => s + (i.fat || 0), 0),
                    fiber: log.reduce((s, i) => s + (i.fiber || 0), 0),
                    sugar: log.reduce((s, i) => s + (i.sugar || 0), 0)
                };
                localStorage.setItem('dailyMacroHistory', JSON.stringify(dailyMacroHistory));
            }
        }
        const dayMacros = dailyMacroHistory[dateStr];

        // One marker dot per selected-and-over macro, each in that macro's
        // own configured color instead of a single generic dot.
        const markers = overMacros
            .filter(m => dayMacros && (dayMacros[m] || 0) > MACRO_TARGETS[m])
            .map(m => `<span class="carb-marker" style="color:${macroColors[m]};" title="${cap(m)} exceeded target (${Math.round(dayMacros[m])}g / ${MACRO_TARGETS[m]}g)">⬤</span>`)
            .join('');

        const div = document.createElement('div');
        div.className = 'cal-day';
        if (kcal > MACRO_TARGETS.calories) div.classList.add('over');
        else if (kcal > 0) div.classList.add('under');
        if (dateStr === today) div.classList.add('today');
        if (dateStr === realToday) div.classList.add('real-today');
        div.innerHTML =
            `<span class="day-num">${d}</span>${kcal>0?`<span class="day-kcal">${Math.round(kcal)}</span>`:''}${markers}`;
        div.onclick = () => onDateClick(dateStr);
        grid.appendChild(div);
    }
}

function onDateClick(dateStr) {
    document.getElementById('datePickerInput').value = dateStr;
    updateDatePickerInfo();
    document.getElementById('datePickerModal').classList.add('show');
}

function changeMonth(delta) {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
    renderCalendar();
}