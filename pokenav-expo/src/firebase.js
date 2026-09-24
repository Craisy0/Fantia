import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig, FIREBASE_ENABLED } from './firebaseConfig';

let app = null;
let db = null;

if (FIREBASE_ENABLED) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { db, FIREBASE_ENABLED };
