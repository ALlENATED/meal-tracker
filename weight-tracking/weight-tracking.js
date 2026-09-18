/* ============================================================
   WEIGHT TRACKING BEHAVIOR — weight-tracking.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     - the small weight widget on the Dashboard tab: its mini
       sparkline chart and the "current weight + trend" display,
       and its "+ log" button
     - the TWO pills in that display: "since last weigh-in" (which
       existed already) and "total lost" (#weightTotalDisplay, added
       beside it). Neither has a colour of its own — the since-last
       pill is filled with the Weekly Chart's under/over colours
       (chartColors) and the total pill with the Weight chart's line
       colour (weightLineColor), so the pickers already in Settings
       drive all three and no new picker was needed. Tapping the
       total pill switches it between counting from your first
       weigh-in and from your heaviest (toggleWeightTotalBasis()).
     - the full Weight Track tab: the list of every entry, editing
       or deleting an entry, and the full-size weight chart

   DEPENDS ON OTHER FILES:
     - shared/app-data-and-settings.js for: weightLog, today,
       formatDate(), weightLineColor (the user's chosen color for both
       weight charts below, set via the "Weight Chart Line Color" picker
       in Settings), chartColors (the Weekly Chart's under/over colors,
       reused by the since-last pill), weightTotalBasis + saveSettings()
       (which baseline the total pill counts from, and persisting it)
     - dashboard/dashboard.js calls renderWeightChart() and
       renderWeightDisplay() (both defined here) every time the
       dashboard refreshes, and this file's addWeight()/addWeightFromTab()
       call renderDashboard() (defined in dashboard/dashboard.js) —
       both files need to be loaded together.

   SAFE TO REWORK ALONE?
   Yes, together with weight-tracking/weight-tracking.css and the
   marked HTML blocks for the small Weight widget (Dashboard tab)
   and the Weight Track tab in index.html.
   ============================================================ */

// ============================================================
//  WEIGHT DISPLAY (compact overlay on the Dashboard widget)
// ============================================================
// Relative luminance, per the WCAG formula — used only by pillInk() below.
function pillLuminance(hex) {
    const h = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return 1;
    const ch = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
    const f = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2]);
}

// Dark or white text for a pill filled with `hex`, whichever actually reads
// better on it. This has to be computed rather than fixed: the Weekly Chart's
// default colours are pale pastels (dark text needed) while the Weight line
// colour defaults to a deep purple (white text needed), and both are free for
// the user to change to anything in Settings.
function pillInk(hex) {
    const L = pillLuminance(hex);
    const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return contrast(L, pillLuminance('#1a2639')) >= contrast(L, 1) ? '#1a2639' : '#ffffff';
}

// Paints a pill as a filled block of `color`, or clears the fill so it falls
// back to the plain --bg-input pill defined in weight-tracking.css.
function paintPill(el, color) {
    if (color) {
        el.classList.add('filled');
        el.style.background = color;
        el.style.color = pillInk(color);
    } else {
        el.classList.remove('filled');
        el.style.background = '';
        el.style.color = '';
    }
}

function renderWeightDisplay() {
    const display = document.getElementById('currentWeightDisplay');
    const trendEl = document.getElementById('weightTrendDisplay');
    const totalEl = document.getElementById('weightTotalDisplay');

    if (weightLog.length === 0) {
        display.innerHTML = '-- <span class="unit">kg</span>';
        trendEl.className = 'trend neutral';
        trendEl.innerHTML = '<span class="arrow">—</span> no data';
        paintPill(trendEl, null);
        if (totalEl) totalEl.style.display = 'none';
        return;
    }
    const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    display.innerHTML = `${latest.weight.toFixed(1)} <span class="unit">kg</span>`;

    // ---- since last weigh-in (the pill that was already here) ----
    // Now filled with the Weekly Chart's own colours instead of carrying its
    // own: a loss uses the under/on-target colour, a gain uses the over-target
    // colour, so it reads as the same language as the weekly bars and needs no
    // colour picker of its own. "Stable" stays the plain unfilled pill, since
    // it's neither under nor over.
    if (sorted.length >= 2) {
        const prev = sorted[sorted.length - 2];
        const diff = latest.weight - prev.weight;
        if (Math.abs(diff) < 0.05) {
            trendEl.className = 'trend neutral';
            trendEl.innerHTML = `<span class="arrow">—</span> stable`;
            paintPill(trendEl, null);
        } else if (diff < 0) {
            trendEl.className = 'trend down';
            trendEl.innerHTML = `<span class="arrow">↓</span> ${Math.abs(diff).toFixed(1)} kg`;
            paintPill(trendEl, chartColors.under);
        } else {
            trendEl.className = 'trend up';
            trendEl.innerHTML = `<span class="arrow">↑</span> ${diff.toFixed(1)} kg`;
            paintPill(trendEl, chartColors.over);
        }
    } else {
        trendEl.className = 'trend neutral';
        trendEl.innerHTML = '<span class="arrow">—</span> first entry';
        paintPill(trendEl, null);
    }

    // ---- total lost ----
    // Hidden below two weigh-ins: with one entry the baseline IS the latest
    // reading, so the only honest number is 0.0, which is just noise.
    if (!totalEl) return;
    if (sorted.length < 2) {
        totalEl.style.display = 'none';
        return;
    }
    const weights = sorted.map(e => e.weight);
    const baseline = weightTotalBasis === 'peak'
        ? Math.max(...weights)
        : weights[0];
    const delta = latest.weight - baseline;      // negative = lost
    const basisWord = weightTotalBasis === 'peak' ? 'since peak' : 'since start';

    totalEl.style.display = '';
    totalEl.title = `Total ${delta > 0 ? 'gained' : 'lost'} ${basisWord} `
        + `(${baseline.toFixed(1)} kg) — tap to count from `
        + (weightTotalBasis === 'peak' ? 'your first weigh-in instead' : 'your highest weigh-in instead');

    if (Math.abs(delta) < 0.05) {
        totalEl.innerHTML = '<span class="lbl">Σ</span> level';
    } else {
        const sign = delta > 0 ? '+' : '';
        totalEl.innerHTML = `<span class="lbl">Σ</span> ${sign}${Math.abs(delta).toFixed(1)} kg`;
    }
    // Always the Weight chart's line colour, whichever direction it went —
    // this pill is an identity ("your weight line, in total"), not a verdict,
    // so it doesn't switch colour the way the since-last pill does.
    paintPill(totalEl, weightLineColor);
}

// Tapping the total pill flips what it counts back to and remembers the
// choice in tracker_settings (see weightTotalBasis in
// shared/app-data-and-settings.js).
function toggleWeightTotalBasis() {
    weightTotalBasis = weightTotalBasis === 'peak' ? 'first' : 'peak';
    saveSettings();
    renderWeightDisplay();
}

// ============================================================
//  WEIGHT CHART - Aesthetic line chart for dashboard (no harsh lines)
//  NOTE: this now renders at a fixed height set by the box's own CSS
//  (.chart-box .weight-chart-wrap in weight-tracking.css, 76px — picked
//  using the chart-settings-playground tool) instead of deriving its
//  height from aspectRatio, which is why maintainAspectRatio is false
//  below — see the "SIZING, READ THIS BEFORE CHANGING" comment on that
//  CSS rule for why both have to agree. The last point on the line stays
//  visible (via the pointRadius callback below) so the current reading
//  has a clear marker at the end of the curve, while every earlier point
//  stays hidden until hovered. Line/fill color comes from weightLineColor
//  (shared/app-data-and-settings.js), the "Weight Chart Line Color"
//  picker in Settings — not hardcoded here.
// ============================================================
function renderWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (window.weightMiniInstance) window.weightMiniInstance.destroy();

    if (weightLog.length === 0) {
        window.weightMiniInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: ['no data'], datasets: [{ data: [0] }] },
            options: {
                devicePixelRatio: window.devicePixelRatio || 2,
                plugins: { legend: { display: false } },
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { display: false },
                    x: { display: false }
                }
            }
        });
        return;
    }
    const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const labels = sorted.slice(-14).map(w => w.date.slice(5));
    const data = sorted.slice(-14).map(w => w.weight);

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 76);
    // Alpha appended as a 2-digit hex suffix on the user's chosen line
    // color, same trick already used for chartColors.over in
    // dashboard/dashboard.js's weeklyExtrasPlugin, instead of converting
    // to rgba().
    gradient.addColorStop(0, weightLineColor + '40');
    gradient.addColorStop(1, weightLineColor + '05');

    window.weightMiniInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'kg',
                data,
                borderColor: weightLineColor,
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointRadius: (context) => context.dataIndex === (context.dataset.data.length - 1) ? 3.5 : 0,
                pointHoverRadius: 4,
                pointBackgroundColor: weightLineColor,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1.5,
                borderWidth: 2.2,
            }]
        },
        options: {
            devicePixelRatio: window.devicePixelRatio || 2,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.raw + ' kg';
                        }
                    },
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: { size: 9, weight: '600' },
                    bodyFont: { size: 8 },
                    cornerRadius: 6,
                    padding: 6,
                }
            },
            scales: {
                y: { display: false },
                x: { display: false }
            },
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'nearest'
            },
            animation: {
                duration: 400,
                easing: 'easeOutQuart'
            }
        }
    });
}

// ============================================================
//  WEIGHT TAB - Full aesthetic chart (crisp, soft, no harsh lines)
//  Uses the same weightLineColor as the small Dashboard widget's chart
//  above, so the line reads as the same "Weight" color everywhere in
//  the app rather than two different teals.
// ============================================================
function renderWeightTabChart() {
    const ctx = document.getElementById('weightFullChart');
    if (window.weightFullInstance) window.weightFullInstance.destroy();

    if (weightLog.length === 0) {
        window.weightFullInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: ['no data'], datasets: [{ data: [0] }] },
            options: {
                devicePixelRatio: window.devicePixelRatio || 2,
                plugins: { legend: { display: false } },
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.4,
                scales: {
                    y: { display: false },
                    x: { display: false }
                }
            }
        });
        return;
    }
    const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const labels = sorted.map(w => w.date.slice(5));
    const data = sorted.map(w => w.weight);

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, weightLineColor + '33');
    gradient.addColorStop(1, weightLineColor + '03');

    window.weightFullInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'kg',
                data,
                borderColor: weightLineColor,
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: weightLineColor,
                pointRadius: 3.5,
                pointHoverRadius: 7,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                borderWidth: 2.5,
            }]
        },
        options: {
            devicePixelRatio: window.devicePixelRatio || 2,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.raw + ' kg';
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
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'var(--chart-grid)',
                        drawBorder: false,
                        lineWidth: 0.5,
                    },
                    ticks: {
                        font: { size: 9, weight: '500', family: 'Inter' },
                        color: 'var(--text-muted)',
                        padding: 4,
                        maxTicksLimit: 6,
                    },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 8, weight: '500', family: 'Inter' },
                        color: 'var(--text-muted)',
                        padding: 4,
                        maxTicksLimit: 12,
                    },
                    border: { display: false }
                }
            },
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.4,
            animation: {
                duration: 500,
                easing: 'easeOutQuart'
            },
            interaction: {
                intersect: false,
                mode: 'nearest'
            }
        }
    });
}

// ============================================================
//  WEIGHT TAB - Full render with log button
// ============================================================
function renderWeightTab() {
    const list = document.getElementById('weightList');
    if (weightLog.length === 0) {
        list.innerHTML =
            '<div style="color:var(--text-muted); font-style:italic; padding:8px 0;">No weight entries yet.</div>';
    } else {
        list.innerHTML = [...weightLog].sort((a, b) => a.date.localeCompare(b.date)).map((w, idx) =>
            `<div class="entry">
                <span>${formatDate(w.date)}</span>
                <div style="display:flex; align-items:center; gap:12px;">
                    <span>${w.weight} kg</span>
                    <div class="entry-actions">
                        <button onclick="editWeightEntry(${idx})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteWeightEntry(${idx})" title="Delete"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </div>`
        ).join('');
    }

    renderWeightTabChart();
}

function editWeightEntry(idx) {
    const entry = weightLog[idx];
    if (!entry) return;
    const newWeight = prompt('Enter new weight in kg:', entry.weight);
    if (newWeight === null) return;
    const w = parseFloat(newWeight);
    if (isNaN(w) || w <= 0) return;
    weightLog[idx].weight = w;
    localStorage.setItem('weightLog', JSON.stringify(weightLog));
    renderWeightTab();
    renderDashboard();
}

function deleteWeightEntry(idx) {
    if (!confirm('Delete this weight entry?')) return;
    weightLog.splice(idx, 1);
    localStorage.setItem('weightLog', JSON.stringify(weightLog));
    renderWeightTab();
    renderDashboard();
}

function addWeight() {
    const w = prompt('Enter weight in kg:', '70');
    if (!w) return;
    const val = parseFloat(w);
    if (isNaN(val) || val <= 0) return;
    weightLog.push({ date: today, weight: val });
    localStorage.setItem('weightLog', JSON.stringify(weightLog));
    renderDashboard();
    renderWeightTab();
}

// Weight log button in Weight Track tab
function addWeightFromTab() {
    const w = prompt('Enter weight in kg:', '70');
    if (!w) return;
    const val = parseFloat(w);
    if (isNaN(val) || val <= 0) return;
    weightLog.push({ date: today, weight: val });
    localStorage.setItem('weightLog', JSON.stringify(weightLog));
    renderDashboard();
    renderWeightTab();
}