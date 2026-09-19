/* ==========================================================================
   Princess & Paladin — shared Firebase config
   /assets/pp-firebase.js

   One copy of the project config, used by every page that talks to
   Firestore. Load it right after the firebase-app-compat.js /
   firebase-firestore-compat.js CDN tags and before any script that does
   `firebase.initializeApp(...)`.

   This key is the public client config Firebase expects to ship to the
   browser — access control lives in Firestore security rules, not in
   keeping this value secret.
   ========================================================================== */
window.PPFirebaseConfig = {
  apiKey: "AIzaSyAdNZBoh1pH80-ZFBbOlcrlsLdMi3D62Wg",
  authDomain: "princess-paladin.firebaseapp.com",
  projectId: "princess-paladin",
  storageBucket: "princess-paladin.firebasestorage.app",
  messagingSenderId: "282931655557",
  appId: "1:282931655557:web:cae6ccd23f32cb9be54aec",
  measurementId: "G-E5K2NMCR3Y"
};
