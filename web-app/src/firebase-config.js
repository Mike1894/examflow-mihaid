import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// ============================================
// CONFIGURAȚIE FIREBASE
// În producție, aceste valori vin din variabile de mediu Vite (import.meta.env)
// Pentru emulator, valorile pot fi placeholder, dar trebuie să existe
// ============================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'examflow-mihaid.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'examflow-mihaid',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'examflow-mihaid.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000000000',
};

// Inițializare aplicație Firebase
const app = initializeApp(firebaseConfig);

// Servicii exportate
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');

// ============================================
// CONECTARE LA FIREBASE EMULATOR SUITE
// Activă exclusiv dacă rulăm pe localhost
// ============================================

const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (isLocalhost) {
  console.info('[Firebase] Detectat localhost → conectare la Emulator Suite');

  // Auth emulator (port 9099)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

  // Firestore emulator (port 8080)
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  // Functions emulator (port 5001)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);

  console.info('[Firebase] Emulator Suite conectat: Auth=9099, Firestore=8080, Functions=5001');
}

export default app;