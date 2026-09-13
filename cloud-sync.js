/* ============================================================
   CLOUD SYNC — cloud-sync.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     - the full-screen "Sign in" gate shown before the app is usable
       (#authOverlay in index.html), and the sign-in/create-account
       form inside it
     - the small account panel in the top bar (email + sign-out
       button)
     - keeping every localStorage key this app uses (dailyLog_*,
       dailyHistory, weightLog, savedMeals, tracker_settings,
       tracker_ingredients, tracker_categories, etc.) backed up to
       your own free Firebase project, and pulling it back down on
       any device you sign into — this is what makes your data safe
       even if a phone or PC is lost, and what makes it show up the
       same on both

   HOW THE SYNC ITSELF WORKS (deliberately simple):
     Rather than syncing each piece of data individually, this
     treats the browser's ENTIRE localStorage as one bundle: every
     key/value pair gets copied into a single document in Firestore
     (cloud.firestore, under users/<your account id>), and pulled
     back the same way. That means any new localStorage key this
     app starts using later gets backed up automatically too — you
     never have to update this file when another file adds a new
     saved setting.

     Every time anything is saved locally (adding food, logging
     weight, changing a setting...), a short timer (a few seconds)
     resets; once it goes quiet, everything currently in
     localStorage gets pushed up to Firestore in one go. When you
     sign in on a device, this file compares "when did the cloud
     copy last change" against "when did THIS device last apply a
     cloud copy" — if the cloud copy is newer, it's pulled down and
     the page reloads once to pick it up; if not, this device's
     copy is left alone (it's already current, or has its own
     not-yet-synced changes).

     This is a "last save wins" system, same as most simple
     personal sync tools — it's not built to merge two DEVICES
     edited AT THE SAME TIME while both offline. For one person
     using a phone and a PC (not both at once), that's not a
     real-world concern.

   DEPENDS ON:
     - shared/firebase-config.js must be loaded first (defines
       FIREBASE_CONFIG) — and filled in with your own project's
       values, see SETUP.md.
     - the Firebase compat SDK <script> tags in index.html (app,
       auth, firestore) must be loaded before this file.
     - #authOverlay, #accountPanel, #accountEmail in index.html.

   SAFE TO REWORK ALONE?
     Yes — this file plus its matching HTML block in index.html
     (search for "CLOUD SYNC") and the small .auth-overlay/.auth-*
     rules in shared/theme-and-layout.css is everything involved.
     Nothing here needs any OTHER file to change.
   ============================================================ */

const CloudSync = (function () {
    // Meta key used internally to remember "the last cloud version we know
    // we're in sync with" — deliberately excluded from what gets backed up
    // (it's bookkeeping about the sync itself, not app data).
    const SYNC_META_KEY = '__cloud_sync_last_applied_at';

    let currentUser = null;
    let db = null;
    let applyingRemote = false;
    let pushTimer = null;
    let authMode = 'signin'; // or 'signup'
    let firebaseReady = false;

    // ---- small DOM helpers -------------------------------------------
    function $(id) { return document.getElementById(id); }

    function showAuthOverlay() {
        $('authOverlay').classList.add('show');
    }
    function hideAuthOverlay() {
        $('authOverlay').classList.remove('show');
    }
    function showAuthError(msg) {
        const el = $('authError');
        el.textContent = msg;
        el.style.display = 'block';
    }
    function hideAuthError() {
        const el = $('authError');
        el.style.display = 'none';
        el.textContent = '';
    }
    function setAuthBusy(busy, statusText) {
        $('authSubmitBtn').disabled = busy;
        $('authSubmitBtn').style.opacity = busy ? '0.6' : '1';
        $('authStatus').textContent = busy ? (statusText || 'Working…') : '';
    }
    function setAuthStatus(text) {
        $('authStatus').textContent = text || '';
    }

    function updateAuthFormLabels() {
        const isSignup = authMode === 'signup';
        $('authTitle').textContent = isSignup ? 'Create account' : 'Sign in';
        $('authSubmitBtn').textContent = isSignup ? 'Create account' : 'Sign in';
        $('authToggleText').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
        $('authToggleLink').textContent = isSignup ? 'Sign in' : 'Create one';
    }

    function updateAccountUI(user) {
        const panel = $('accountPanel');
        if (!panel) return;
        if (user) {
            panel.style.display = 'flex';
            $('accountEmail').textContent = user.email || '';
        } else {
            panel.style.display = 'none';
        }
    }

    // ---- reading friendly text out of Firebase's error codes ----------
    function friendlyAuthError(e) {
        const code = e && e.code;
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') return 'Wrong email or password.';
        if (code === 'auth/user-not-found') return 'No account with that email yet — try "Create one" below.';
        if (code === 'auth/email-already-in-use') return 'That email already has an account — sign in instead.';
        if (code === 'auth/invalid-email') return "That doesn't look like a valid email address.";
        if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
        if (code === 'auth/network-request-failed') return 'No internet connection — check your connection and try again.';
        if (code === 'auth/too-many-requests') return 'Too many attempts — please wait a bit and try again.';
        return 'Something went wrong' + (code ? ' (' + code + ')' : '') + '. Please try again.';
    }

    // ---- localStorage <-> Firestore ------------------------------------
    function gatherAllLocalData() {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === SYNC_META_KEY) continue;
            out[key] = localStorage.getItem(key);
        }
        return out;
    }

    function applyRemoteData(dataObj) {
        applyingRemote = true;
        try {
            Object.keys(dataObj || {}).forEach(function (key) {
                if (key === SYNC_META_KEY) return;
                localStorage.setItem(key, dataObj[key]);
            });
        } finally {
            applyingRemote = false;
        }
    }

    function scheduleSync() {
        if (!currentUser || applyingRemote || !firebaseReady) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(pushAll, 2500);
    }

    function pushAll() {
        if (!currentUser || !db) return Promise.resolve();
        const data = gatherAllLocalData();
        return db.collection('users').doc(currentUser.uid).set({
            data: data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
            // Stand-in for the server timestamp we just wrote, so this
            // device recognizes its own push as current next time it
            // compares — see the file-header note on why an approximate
            // client-clock value is good enough here.
            localStorage.setItem(SYNC_META_KEY, String(Date.now()));
        }).catch(function (e) {
            console.error('Cloud sync: push failed', e);
        });
    }

    function resolveSync(user) {
        setAuthStatus('Syncing your data…');
        const docRef = db.collection('users').doc(user.uid);
        docRef.get().then(function (snap) {
            if (snap.exists) {
                const remote = snap.data() || {};
                const remoteMillis = (remote.updatedAt && typeof remote.updatedAt.toMillis === 'function')
                    ? remote.updatedAt.toMillis() : 0;
                const lastApplied = parseInt(localStorage.getItem(SYNC_META_KEY) || '0', 10);
                if (remoteMillis > lastApplied) {
                    applyRemoteData(remote.data || {});
                    localStorage.setItem(SYNC_META_KEY, String(remoteMillis));
                    hideAuthOverlay();
                    location.reload();
                    return;
                }
                hideAuthOverlay();
            } else {
                // brand-new account: back up whatever's already on this
                // device (if anything) instead of leaving the cloud empty.
                pushAll().then(hideAuthOverlay);
            }
        }).catch(function (e) {
            console.error('Cloud sync: initial sync failed', e);
            showAuthError("Signed in, but couldn't reach the sync service. You can keep using the app — it'll sync once you're back online.");
            hideAuthOverlay();
        });
    }

    // ---- auth form ------------------------------------------------------
    function toggleAuthMode() {
        authMode = authMode === 'signin' ? 'signup' : 'signin';
        hideAuthError();
        updateAuthFormLabels();
    }

    function submitAuthForm() {
        const email = ($('authEmail').value || '').trim();
        const password = $('authPassword').value || '';
        hideAuthError();
        if (!email || !password) { showAuthError('Enter an email and password.'); return; }
        if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

        setAuthBusy(true, authMode === 'signup' ? 'Creating your account…' : 'Signing in…');
        const action = authMode === 'signup'
            ? firebase.auth().createUserWithEmailAndPassword(email, password)
            : firebase.auth().signInWithEmailAndPassword(email, password);

        action.catch(function (e) {
            showAuthError(friendlyAuthError(e));
            setAuthBusy(false);
        });
        // on success, onAuthStateChanged (below) takes over
    }

    function signOut() {
        firebase.auth().signOut();
    }

    // ---- wrap localStorage.setItem so EVERY save schedules a cloud push -
    function installStorageHook() {
        const proto = Object.getPrototypeOf(localStorage);
        if (proto.__cloudSyncWrapped) return;
        const originalSetItem = proto.setItem;
        proto.setItem = function (key, value) {
            originalSetItem.call(this, key, value);
            if (this === window.localStorage && key !== SYNC_META_KEY) {
                scheduleSync();
            }
        };
        proto.__cloudSyncWrapped = true;
    }

    // ---- setup-needed state (placeholder config not yet filled in) ------
    function showSetupNeeded() {
        const overlay = $('authOverlay');
        if (!overlay) return;
        overlay.innerHTML =
            '<div class="modal" style="max-width:420px;">' +
            '  <div class="modal-header"><h2><i class="fas fa-cloud-arrow-up"></i> One-time setup needed</h2></div>' +
            '  <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.6;">' +
            '    This app is set up to keep your data safe in the cloud, but it needs a free Firebase project connected first.' +
            '  </p>' +
            '  <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.6;">' +
            '    Open <b>SETUP.md</b> (delivered alongside this app) and follow the steps there, then fill in <b>shared/firebase-config.js</b> with your project\'s values.' +
            '  </p>' +
            '</div>';
        overlay.classList.add('show');
    }

    function isPlaceholderConfig(cfg) {
        return !cfg || !cfg.apiKey || cfg.apiKey.indexOf('PASTE_YOUR') === 0;
    }

    // ---- boot -------------------------------------------------------------
    function init() {
        installStorageHook();

        if (typeof firebase === 'undefined') {
            showAuthOverlay();
            showAuthError("Can't reach the sign-in service right now (no internet, or it's blocked). Reload once you're back online.");
            return;
        }

        if (isPlaceholderConfig(window.FIREBASE_CONFIG)) {
            showSetupNeeded();
            return;
        }

        try {
            firebase.initializeApp(window.FIREBASE_CONFIG);
            db = firebase.firestore();
            firebaseReady = true;
        } catch (e) {
            console.error('Cloud sync: Firebase init failed', e);
            showAuthOverlay();
            showAuthError('Could not start the sync service — double-check shared/firebase-config.js against SETUP.md.');
            return;
        }

        updateAuthFormLabels();

        firebase.auth().onAuthStateChanged(function (user) {
            currentUser = user;
            updateAccountUI(user);
            if (user) {
                resolveSync(user);
            } else {
                showAuthOverlay();
            }
        });

        // makes the app usable offline once it's been loaded once, and is
        // part of what lets a phone/PC browser offer "install this app"
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js').catch(function (e) {
                console.warn('Service worker registration failed (offline install won\'t be available):', e);
            });
        }
    }

    return {
        init: init,
        submitAuthForm: submitAuthForm,
        toggleAuthMode: toggleAuthMode,
        signOut: signOut,
        scheduleSync: scheduleSync
    };
})();

document.addEventListener('DOMContentLoaded', CloudSync.init);
// in case this script runs after DOMContentLoaded already fired (e.g. it's
// placed at the end of body, after the DOM it needs already exists)
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    CloudSync.init();
}
