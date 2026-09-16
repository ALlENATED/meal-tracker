/* ============================================================
   FOOD SCANNER BEHAVIOR — food-scanner.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     - the #scanModal popup: scanning a package's barcode with the
       camera (via the html5-qrcode library, loaded from a CDN only
       when actually needed), looking that barcode up against the
       free Open Food Facts product database, and — if there's no
       match — falling back to photographing the Nutrition Facts
       panel directly and reading it with on-device OCR (Tesseract.js,
       also CDN-loaded on demand), understanding both English and
       Swedish label wording (Energi/Fett/Kolhydrat/Fiber/Protein/
       Socker — Sweden follows the same EU nutrition-label wording
       rules as the rest of the EU, so this is a short, standardized
       term list rather than real translation)
     - two entry points open the SAME popup, set which one via
       openScanModal('log' | 'ingredient'):
         'log'        — the Add Food popup's camera button
                        (dashboard/dashboard.js + index.html). Only
                        logs today's entry.
         'ingredient' — the Add/Edit Ingredient popup's camera button
                        (ingredients/ingredients.js + index.html).
                        Fills in a NEW ingredient for your database.
     - EITHER WAY, this file never itself pushes to dailyLog or
       INGREDIENTS. It only fills in the real, already-existing form
       fields of whichever popup opened it (#ingredientSearchInput /
       #modalAmount / #modalUnit / selectedIngredient for 'log', or
       #ingEditName / #ingEditKcal / etc. for 'ingredient') and closes
       itself — the user still presses that popup's own existing
       "+ Add" / "+ Save" button to actually commit it. This is
       deliberate, not a shortcut: the Add/Edit Ingredient popup is
       also used to EDIT an existing ingredient, and only its own
       saveIngredient() (ingredients.js) knows whether that's the
       case — handing off instead of duplicating that logic here
       means rescanning a package to refresh an ingredient's numbers
       correctly updates that same ingredient instead of risking a
       silent duplicate.

   NEEDS NETWORK: both the barcode lookup and the label-OCR fallback
   require an internet connection (product database + CDN libraries).
   Offline, camera start still works but both paths fail gracefully
   with an on-screen message — nothing here is precached for offline
   use beyond this file itself (see service-worker.js).

   DEPENDS ON OTHER FILES:
     - shared/app-data-and-settings.js for parseAmount() and the
       global `selectedIngredient`
     - dashboard/dashboard.js's own Add Food fields (#modalAmount,
       #modalUnit, #ingredientSearchInput, #dropdownList)
     - ingredients/ingredients.js's own Add/Edit Ingredient fields
       (#ingEditName, #ingEditKcal, #ingEditProtein, #ingEditCarbs,
       #ingEditFat, #ingEditFiber, #ingEditSugar, #ingEditUnit,
       #ingEditCategory) and the global CATEGORIES array
     - food-scanner/food-scanner.css for all of #scanModal's look
     - the #scanModal markup block in index.html (near the end of
       <body>, after the other popups)

   SAFE TO REWORK ALONE?
   Yes — this file only READS globals owned by the other files above
   and WRITES into their existing form fields; it doesn't change how
   any of them work.
   ============================================================ */

// ============================================================
//  LAZY-LOADED LIBRARIES
// ============================================================
// Both libraries are sizeable (barcode decoding + OCR/WASM), so they're
// only fetched the first time they're actually needed, not on every page
// load — most scans never need the OCR path at all.
const SCAN_LIB_URLS = {
    html5qrcode: 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js',
};
const _scanLoadedScripts = {};
function loadScanScript(key) {
    if (_scanLoadedScripts[key]) return _scanLoadedScripts[key];
    _scanLoadedScripts[key] = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = SCAN_LIB_URLS[key];
        s.onload = function () { resolve(); };
        s.onerror = function () {
            delete _scanLoadedScripts[key];
            reject(new Error('Could not load ' + key));
        };
        document.head.appendChild(s);
    });
    return _scanLoadedScripts[key];
}

// ============================================================
//  MODAL STATE
// ============================================================
let scanCtx = 'log';              // 'log' (Add Food) or 'ingredient' (Add/Edit Ingredient)
let scanCurrentScreen = 'barcode'; // 'barcode' | 'label' | 'result'
let scanHtml5QrCode = null;        // Html5Qrcode instance, created once and reused
let scanBarcodeRunning = false;
let scanLabelStream = null;        // MediaStream for the plain-camera label photo step

function openScanModal(fromCtx) {
    scanCtx = fromCtx;
    resetScanModalState();
    document.getElementById('scanModal').classList.add('show');
    showScanScreen('barcode');
    startBarcodeScan();
}

function closeScanModal() {
    stopBarcodeScan();
    stopLabelCamera();
    document.getElementById('scanModal').classList.remove('show');
}

document.addEventListener('DOMContentLoaded', function () {
    const overlay = document.getElementById('scanModal');
    if (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === this) closeScanModal();
        });
    }
});

function resetScanModalState() {
    document.getElementById('scanManualBarcodeInput').value = '';
    setScanBarcodeStatus('Point your camera at the barcode', false);
    document.getElementById('scanLabelBanner').style.display = 'none';
    document.getElementById('scanProductCard').style.display = 'none';
    document.getElementById('scanConfidenceNote').style.display = 'none';
    document.querySelectorAll('#scanScreen_result .form-group').forEach(function (g) {
        g.classList.remove('scan-field-flagged');
    });
    ['scanResName', 'scanResKcal', 'scanResProtein', 'scanResCarbs', 'scanResFat', 'scanResFiber', 'scanResSugar']
        .forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('scanResAmount').value = 100;
    document.getElementById('scanResUnitLog').value = 'g';
    document.getElementById('scanResUnitIngredient').value = 'g';
    document.getElementById('scanComputedHint').textContent = '';

    const video = document.getElementById('scanLabelVideo');
    const canvas = document.getElementById('scanCaptureCanvas');
    video.style.display = 'block';
    canvas.style.display = 'none';
    canvas.classList.remove('captured-preview');
    document.getElementById('scanShutterBtn').disabled = false;

    const isLog = scanCtx === 'log';
    document.getElementById('scanAmountRow').style.display = isLog ? 'flex' : 'none';
    document.getElementById('scanUnitRowIngredient').style.display = isLog ? 'none' : 'flex';
    document.getElementById('scanCategoryGroup').style.display = isLog ? 'none' : 'block';
    document.getElementById('scanCategoryHint').style.display = isLog ? 'none' : 'flex';
    document.getElementById('scanConfirmBtnLabel').textContent = isLog ? "Add to today's log" : 'Save ingredient';
    if (!isLog) populateScanCategorySelect();
}

function showScanScreen(name) {
    scanCurrentScreen = name;
    document.querySelectorAll('.scan-screen').forEach(function (s) { s.classList.remove('show'); });
    document.getElementById('scanScreen_' + name).classList.add('show');
    document.getElementById('scanBackBtn').textContent =
        name === 'label' ? '← Back' : (name === 'result' ? '← Scan again' : '✕ Cancel');
}

function scanGoBack() {
    if (scanCurrentScreen === 'label') {
        stopLabelCamera();
        showScanScreen('barcode');
        startBarcodeScan();
    } else if (scanCurrentScreen === 'result') {
        showScanScreen('barcode');
        startBarcodeScan();
    } else {
        closeScanModal();
    }
}

function setScanBarcodeStatus(text, isError) {
    const el = document.getElementById('scanBarcodeStatusLine');
    el.textContent = text;
    el.classList.toggle('scan-status-error', !!isError);
}

// ============================================================
//  STEP 1 — BARCODE SCAN (html5-qrcode)
// ============================================================
function startBarcodeScan() {
    setScanBarcodeStatus('Loading scanner…', false);
    loadScanScript('html5qrcode').then(function () {
        if (!scanHtml5QrCode) {
            scanHtml5QrCode = new Html5Qrcode('scanBarcodeReader', {
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.QR_CODE,
                ],
                verbose: false,
            });
        }
        setScanBarcodeStatus('Point your camera at the barcode', false);
        return scanHtml5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 260, height: 140 } },
            function (decodedText) { onBarcodeDetected(decodedText); },
            function () { /* per-frame miss — expected constantly while aiming, ignore */ }
        );
    }).then(function () {
        scanBarcodeRunning = true;
    }).catch(function (err) {
        console.warn('Barcode scanner unavailable:', err);
        setScanBarcodeStatus('Camera unavailable — type the barcode number below, or use a label photo.', true);
    });
}

function stopBarcodeScan() {
    if (scanHtml5QrCode && scanBarcodeRunning) {
        scanBarcodeRunning = false;
        scanHtml5QrCode.stop().then(function () {
            try { scanHtml5QrCode.clear(); } catch (e) { /* already cleared */ }
        }).catch(function () { /* wasn't running — fine */ });
    }
}

function manualBarcodeLookup() {
    const val = document.getElementById('scanManualBarcodeInput').value.trim();
    if (!/^\d{6,14}$/.test(val)) {
        alert('Please enter a valid barcode number (digits only).');
        return;
    }
    onBarcodeDetected(val);
}

function onBarcodeDetected(code) {
    stopBarcodeScan();
    setScanBarcodeStatus('Looking up ' + code + '…', false);
    lookupOpenFoodFacts(code);
}

// Open Food Facts: free, no API key, no account needed for read-only
// lookups like this. Production domain only (world.openfoodfacts.org —
// NOT the .net one some of their own docs use as a staging example).
// A browser can't set a custom User-Agent header (browsers block that),
// which their docs ask API clients to send — this is a known, accepted
// limitation of any client-side-only (no backend) integration like this
// app; every failure mode below just falls back to the label-photo scan
// instead of leaving the popup stuck.
function lookupOpenFoodFacts(barcode) {
    const url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(barcode) +
        '.json?fields=product_name,brands,serving_size,nutriments';
    const controller = new AbortController();
    const timeoutId = setTimeout(function () { controller.abort(); }, 9000);

    fetch(url, { signal: controller.signal })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            clearTimeout(timeoutId);
            if (!data || data.status !== 1 || !data.product || !data.product.nutriments) {
                switchToLabelScan('No database match — try the label instead');
                return;
            }
            const p = data.product;
            const n = p.nutriments || {};
            const kcal = (typeof n['energy-kcal_100g'] === 'number') ? n['energy-kcal_100g']
                : (typeof n['energy_100g'] === 'number' ? n['energy_100g'] / 4.184 : null);
            if (kcal == null) {
                switchToLabelScan('Found the product, but no nutrition data — try the label instead');
                return;
            }
            showScanResult({
                name: p.product_name || ('Product ' + barcode),
                brand: p.brands || '',
                source: 'Open Food Facts',
                kcal: scanRound1(kcal),
                protein: scanRound1(n['proteins_100g']),
                carbs: scanRound1(n['carbohydrates_100g']),
                fat: scanRound1(n['fat_100g']),
                fiber: scanRound1(n['fiber_100g']),
                sugar: scanRound1(n['sugars_100g']),
                servingGrams: parseServingGrams(p.serving_size),
                flaggedFields: [],
                matched: true,
            });
        })
        .catch(function (err) {
            clearTimeout(timeoutId);
            console.warn('Open Food Facts lookup failed:', err);
            switchToLabelScan('Could not reach the product database — try the label instead');
        });
}

function scanRound1(v) {
    return (typeof v === 'number' && !isNaN(v)) ? Math.round(v * 10) / 10 : 0;
}

function parseServingGrams(servingSize) {
    if (!servingSize) return null;
    const m = String(servingSize).replace(',', '.').match(/([\d.]+)\s*(g|ml)/i);
    return m ? parseFloat(m[1]) : null;
}

// ============================================================
//  STEP 2 (FALLBACK) — LABEL PHOTO + OCR (Tesseract.js)
// ============================================================
// bannerText: null when the user chose this deliberately ("Photograph
// the label instead" link) vs a message when the barcode step routed
// here automatically (no match / no data / lookup failed).
function switchToLabelScan(bannerText) {
    stopBarcodeScan();
    showScanScreen('label');
    const banner = document.getElementById('scanLabelBanner');
    if (bannerText) {
        document.getElementById('scanLabelBannerText').textContent = bannerText;
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
    startLabelCamera();
}

function startLabelCamera() {
    const video = document.getElementById('scanLabelVideo');
    const canvas = document.getElementById('scanCaptureCanvas');
    video.style.display = 'block';
    canvas.style.display = 'none';
    canvas.classList.remove('captured-preview');
    document.getElementById('scanShutterBtn').disabled = false;
    document.getElementById('scanLabelStatus').textContent = 'Align the Nutrition Facts panel in the frame';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('scanLabelStatus').textContent = 'Camera unavailable on this device.';
        document.getElementById('scanShutterBtn').disabled = true;
        return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function (stream) {
            scanLabelStream = stream;
            video.srcObject = stream;
        })
        .catch(function (err) {
            console.warn('Label camera unavailable:', err);
            document.getElementById('scanLabelStatus').textContent = 'Camera permission denied or unavailable.';
            document.getElementById('scanShutterBtn').disabled = true;
        });
}

function stopLabelCamera() {
    if (scanLabelStream) {
        scanLabelStream.getTracks().forEach(function (t) { t.stop(); });
        scanLabelStream = null;
    }
    const video = document.getElementById('scanLabelVideo');
    if (video) video.srcObject = null;
}

function captureLabel() {
    const video = document.getElementById('scanLabelVideo');
    const canvas = document.getElementById('scanCaptureCanvas');
    if (!video.videoWidth) return; // camera not actually streaming yet

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    stopLabelCamera();
    video.style.display = 'none';
    canvas.style.display = 'block';
    canvas.classList.add('captured-preview');
    document.getElementById('scanShutterBtn').disabled = true;
    document.getElementById('scanLabelStatus').textContent = 'Reading label…';

    let ocrWorker = null;
    loadScanScript('tesseract')
        .then(function () { return Tesseract.createWorker('eng+swe'); })
        .then(function (worker) {
            ocrWorker = worker;
            return worker.recognize(canvas);
        })
        .then(function (result) {
            if (ocrWorker) ocrWorker.terminate();
            const parsed = parseNutritionLabelText(result.data.text || '');
            showScanResult({
                name: '',
                brand: '',
                source: '',
                kcal: parsed.kcal, protein: parsed.protein, carbs: parsed.carbs,
                fat: parsed.fat, fiber: parsed.fiber, sugar: parsed.sugar,
                servingGrams: null,
                flaggedFields: parsed.flagged,
                matched: false,
                bannerText: 'Read from label — please check the values',
            });
        })
        .catch(function (err) {
            if (ocrWorker) { try { ocrWorker.terminate(); } catch (e) { /* ignore */ } }
            console.warn('Label OCR failed:', err);
            document.getElementById('scanLabelStatus').textContent =
                "Couldn't read the label — check your connection and try again.";
            document.getElementById('scanShutterBtn').disabled = false;
            startLabelCamera();
        });
}

// Reads OCR text for the six macros this app tracks. "kcal" is spelled
// the same in Swedish and English, so calories need no keyword at all —
// just the first number directly followed by "kcal" anywhere in the
// text (labels commonly show "1046 kJ / 250 kcal"; this targets the
// kcal figure specifically, not the kJ one beside it). The rest look
// for the first line starting with a known English OR Swedish label
// term — Sweden follows the same EU nutrition-labelling wording as the
// rest of the EU, so this is a short, standardized list, not real
// translation — and take the first number after that term on that line.
// Swedish numbers use a comma as the decimal separator ("9,4" not
// "9.4"), normalized below before parsing. Anything not found is left
// at 0 and flagged so the result screen highlights it for a manual
// double-check rather than silently guessing.
function parseNutritionLabelText(text) {
    const lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    const flagged = [];

    function firstNumber(str) {
        const m = str.match(/(\d+[.,]?\d*)/);
        return m ? parseFloat(m[1].replace(',', '.')) : null;
    }

    let kcal = null;
    const kcalMatch = text.match(/(\d[\d.,]*)\s*kcal/i);
    if (kcalMatch) kcal = parseFloat(kcalMatch[1].replace(',', '.'));
    else flagged.push('kcal');

    const TERMS = {
        protein: /\bprotein\b/i,
        carbs: /\b(kolhydrat\w*|carbohydrate\w*)\b/i,
        fat: /\b(fett|fat)\b/i,
        fiber: /\bfib(?:er|rer|re)\b/i,
        sugar: /\b(sockerarter|socker\w*|sugars?)\b/i,
    };

    const values = {};
    Object.keys(TERMS).forEach(function (key) {
        const re = TERMS[key];
        const line = lines.find(function (l) { return re.test(l); });
        if (!line) { flagged.push(key); values[key] = 0; return; }
        const afterTerm = line.split(re)[1] || '';
        const num = afterTerm && firstNumber(afterTerm) !== null ? firstNumber(afterTerm) : firstNumber(line);
        if (num === null) { flagged.push(key); values[key] = 0; }
        else values[key] = num;
    });

    return {
        kcal: kcal || 0,
        protein: values.protein, carbs: values.carbs, fat: values.fat,
        fiber: values.fiber, sugar: values.sugar,
        flagged: flagged,
    };
}

// ============================================================
//  RESULT SCREEN (shared by both the barcode match and the OCR read)
// ============================================================
const SCAN_FIELD_IDS = {
    kcal: 'scanResKcal', protein: 'scanResProtein', carbs: 'scanResCarbs',
    fat: 'scanResFat', fiber: 'scanResFiber', sugar: 'scanResSugar',
};

function showScanResult(data) {
    document.getElementById('scanResName').value = data.name || '';
    document.getElementById('scanResKcal').value = data.kcal || 0;
    document.getElementById('scanResProtein').value = data.protein || 0;
    document.getElementById('scanResCarbs').value = data.carbs || 0;
    document.getElementById('scanResFat').value = data.fat || 0;
    document.getElementById('scanResFiber').value = data.fiber || 0;
    document.getElementById('scanResSugar').value = data.sugar || 0;

    const banner = document.getElementById('scanResultBanner');
    if (data.matched) {
        banner.className = 'scan-banner';
        banner.innerHTML = '<span class="dot"></span> Barcode matched';
    } else {
        banner.className = 'scan-banner warn';
        banner.innerHTML = '<span class="dot"></span> ' + (data.bannerText || 'Read from label — please check the values');
    }

    const card = document.getElementById('scanProductCard');
    if (data.matched && data.name) {
        card.style.display = 'flex';
        document.getElementById('scanProductName').textContent = data.name;
        document.getElementById('scanProductBrand').textContent = data.brand || '';
        document.getElementById('scanProductSource').textContent = 'via ' + data.source;
    } else {
        card.style.display = 'none';
    }

    document.querySelectorAll('#scanScreen_result .form-group').forEach(function (g) {
        g.classList.remove('scan-field-flagged');
    });
    const note = document.getElementById('scanConfidenceNote');
    if (data.flaggedFields && data.flaggedFields.length) {
        data.flaggedFields.forEach(function (key) {
            const input = document.getElementById(SCAN_FIELD_IDS[key]);
            if (input) input.closest('.form-group').classList.add('scan-field-flagged');
        });
        note.style.display = 'flex';
        note.textContent = '⚠️ Some values were hard to read (' + data.flaggedFields.join(', ') + ') — please double-check before saving.';
    } else {
        note.style.display = 'none';
    }

    if (scanCtx === 'log') {
        document.getElementById('scanResAmount').value = data.servingGrams || 100;
        document.getElementById('scanResUnitLog').value = 'g';
        updateScanComputedHint();
    }

    showScanScreen('result');
}

function readScanFieldsAsIngredient() {
    return {
        name: document.getElementById('scanResName').value.trim() || 'Scanned item',
        kcal: parseFloat(document.getElementById('scanResKcal').value) || 0,
        protein: parseFloat(document.getElementById('scanResProtein').value) || 0,
        carbs: parseFloat(document.getElementById('scanResCarbs').value) || 0,
        fat: parseFloat(document.getElementById('scanResFat').value) || 0,
        fiber: parseFloat(document.getElementById('scanResFiber').value) || 0,
        sugar: parseFloat(document.getElementById('scanResSugar').value) || 0,
        unit: 'g',
    };
}

// Live "= X kcal for this amount" hint under the macro fields while
// logging (ctx 'log' only) — reuses parseAmount() (shared/app-data-
// and-settings.js) exactly as a normal ingredient would, since these
// per-100g fields + this amount/unit are scaled the same way.
function updateScanComputedHint() {
    const hint = document.getElementById('scanComputedHint');
    if (!hint) return;
    if (scanCtx !== 'log') { hint.textContent = ''; return; }
    const amount = parseFloat(document.getElementById('scanResAmount').value) || 0;
    const unit = document.getElementById('scanResUnitLog').value;
    if (amount <= 0) { hint.textContent = ''; return; }
    const macros = parseAmount(readScanFieldsAsIngredient(), amount, unit);
    hint.textContent = '= ' + Math.round(macros.kcal) + ' kcal for this amount';
}

function populateScanCategorySelect() {
    const sel = document.getElementById('scanResCategory');
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a category…';
    sel.appendChild(placeholder);
    (typeof CATEGORIES !== 'undefined' ? CATEGORIES : []).forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = (c.icon || '📁') + ' ' + c.name;
        sel.appendChild(opt);
    });
}

// Hands the scanned/read values to whichever real popup opened the
// scanner, then closes — see the big comment at the top of this file
// for why this doesn't add/save anything itself.
function confirmScanResult() {
    const ing = readScanFieldsAsIngredient();
    if (scanCtx === 'log') {
        document.getElementById('ingredientSearchInput').value = ing.name;
        selectedIngredient = {
            name: ing.name, kcal: ing.kcal, protein: ing.protein, carbs: ing.carbs,
            fat: ing.fat, fiber: ing.fiber, sugar: ing.sugar, unit: 'g',
        };
        document.getElementById('modalAmount').value = document.getElementById('scanResAmount').value || 100;
        document.getElementById('modalUnit').value = document.getElementById('scanResUnitLog').value || 'g';
        document.getElementById('dropdownList').classList.remove('show');
    } else {
        document.getElementById('ingEditName').value = ing.name;
        document.getElementById('ingEditKcal').value = ing.kcal;
        document.getElementById('ingEditProtein').value = ing.protein;
        document.getElementById('ingEditCarbs').value = ing.carbs;
        document.getElementById('ingEditFat').value = ing.fat;
        document.getElementById('ingEditFiber').value = ing.fiber;
        document.getElementById('ingEditSugar').value = ing.sugar;
        document.getElementById('ingEditUnit').value = document.getElementById('scanResUnitIngredient').value || 'g';
        const cat = document.getElementById('scanResCategory').value;
        if (cat) document.getElementById('ingEditCategory').value = cat;
    }
    closeScanModal();
}