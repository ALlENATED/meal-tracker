/* ============================================================
   WEIGHT TRACKING BEHAVIOR — weight-tracking.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     - the small weight widget on the Dashboard tab: its mini
       sparkline chart and the "current weight + trend" display,
       and its "+ log" button
     - the full Weight Track tab: the list of every entry, editing
       or deleting an entry, and the full-size weight chart

   DEPENDS ON OTHER FILES:
     - shared/app-data-and-settings.js for: weightLog, today,
       formatDate(), weightLineColor (the user's chosen color for both
       weight charts below, set via the "Weight Chart Line Color" picker
       in Settings)
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
function renderWeightDisplay() {
    const display = document.getElementById('currentWeightDisplay');
    const trendEl = document.getElementById('weightTrendDisplay');
    if (weightLog.length === 0) {
        display.innerHTML = '-- <span class="unit">kg</span>';
        trendEl.className = 'trend neutral';
        trendEl.innerHTML = '<span class="arrow">—</span> no data';
        return;
    }
    const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    display.innerHTML = `${latest.weight.toFixed(1)} <span class="unit">kg</span>`;

    if (sorted.length >= 2) {
        const prev = sorted[sorted.length - 2];
        const diff = latest.weight - prev.weight;
        if (Math.abs(diff) < 0.05) {
            trendEl.className = 'trend neutral';
            trendEl.innerHTML = `<span class="arrow">—</span> stable`;
        } else if (diff < 0) {
            trendEl.className = 'trend down';
            trendEl.innerHTML = `<span class="arrow">↓</span> ${Math.abs(diff).toFixed(1)} kg`;
        } else {
            trendEl.className = 'trend up';
            trendEl.innerHTML = `<span class="arrow">↑</span> ${diff.toFixed(1)} kg`;
        }
    } else {
        trendEl.className = 'trend neutral';
        trendEl.innerHTML = '<span class="arrow">—</span> first entry';
    }
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
