/* ============================================================
   FIREBASE CONFIG — firebase-config.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     The connection details for YOUR free Firebase project — the
     cloud service that stores your data so it's the same on your
     phone and your PC, and safe even if a device is lost or breaks.

   YOU MUST EDIT THIS FILE before the app will work.
     1. Follow SETUP.md to create a free Firebase project (about
        5 minutes, no credit card needed).
     2. Firebase will show you a block of code containing values
        like apiKey, authDomain, projectId, etc.
     3. Replace the placeholder values below with YOUR OWN values
        from that block — keep the quotes, just swap what's inside
        them.

   This file is just plain settings, not a secret to protect like a
   password — it's normal and expected for these values to be
   visible in a browser's page source (that's how every Firebase
   web app works). What actually keeps your data private is the
   Firestore security rules you'll paste in during setup (see
   SETUP.md), which only let YOUR signed-in account read or write
   YOUR data.
   ============================================================ */

const FIREBASE_CONFIG = {
    apiKey: "PASTE_YOUR_API_KEY_HERE",
    authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",
    projectId: "PASTE_YOUR_PROJECT_ID_HERE",
    storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE",
    messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID_HERE",
    appId: "PASTE_YOUR_APP_ID_HERE"
};
