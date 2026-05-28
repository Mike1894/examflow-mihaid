// ============================================
// HELPER: Setup utilizatori de test
// Interacționează direct cu Firebase Emulator REST API
// pentru a crea conturi și a atribui custom claims
// (Capitolul 4.3.1 din lucrare)
// ============================================

// Configurație emulatoare (consistent cu firebase-config.js din frontend)
const AUTH_EMULATOR_HOST = 'http://127.0.0.1:9099';
const FUNCTIONS_EMULATOR_HOST = 'http://127.0.0.1:5001';
const FIRESTORE_EMULATOR_HOST = 'http://127.0.0.1:8080';

const PROJECT_ID = 'examflow-mihaid';
const FUNCTIONS_REGION = 'europe-west1';

// Endpoint-uri REST ale emulatorului
const SIGNUP_ENDPOINT =
  `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

const SET_CUSTOM_ROLE_ENDPOINT =
  `${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/${FUNCTIONS_REGION}/setCustomUserRole`;

const FIRESTORE_DOC_ENDPOINT =
  `${FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Creează un utilizator de test în Firebase Auth Emulator
 * și îi atribuie rolul prin Cloud Function-ul nostru
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.role - 'professor' sau 'student'
 * @param {string} [params.numeComplet] - opțional, pentru documentul Firestore
 * @returns {Promise<{uid: string, email: string, password: string, role: string}>}
 */
async function createTestUser({ email, password, role, numeComplet }) {
  // Pasul 1: Sign up prin REST API-ul emulatorului de Auth
  const signupResponse = await fetch(SIGNUP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!signupResponse.ok) {
    const errorBody = await signupResponse.text();
    throw new Error(
      `[authHelper] Sign up eșuat pentru ${email}: ${errorBody}`
    );
  }

  const signupData = await signupResponse.json();
  const uid = signupData.localId;

  // Pasul 2: Atribuire rol prin Cloud Function setCustomUserRole
  // Format așteptat de Cloud Functions v2 HTTPS Callable: { data: {...} }
  const roleResponse = await fetch(SET_CUSTOM_ROLE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: { uid, role },
    }),
  });

  if (!roleResponse.ok) {
    const errorBody = await roleResponse.text();
    throw new Error(
      `[authHelper] Atribuire rol eșuată pentru ${email}: ${errorBody}`
    );
  }

  // Pasul 3: Creează documentul corespunzător în colecția users
  // (necesar pentru denormalizarea din înscriere - Capitolul 3.3.1)
  await seedUserDocument({
    uid,
    email,
    numeComplet: numeComplet || email.split('@')[0],
  });

  return { uid, email, password, role };
}

/**
 * Creează documentul users/{uid} în Firestore
 * prin REST API-ul direct al emulatorului
 */
async function seedUserDocument({ uid, email, numeComplet }) {
  const url = `${FIRESTORE_DOC_ENDPOINT}/users?documentId=${uid}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        email: { stringValue: email },
        numeComplet: { stringValue: numeComplet },
        dataCreare: { timestampValue: new Date().toISOString() },
      },
    }),
  });

  if (!response.ok && response.status !== 409) {
    // 409 = document deja există; e ok la rerulări
    const errorBody = await response.text();
    throw new Error(
      `[authHelper] Eroare creare document user pentru ${email}: ${errorBody}`
    );
  }
}

/**
 * Resetează complet starea Firestore (între teste)
 * Folosește endpoint-ul administrativ al emulatorului
 */
async function clearFirestore() {
  const url =
    `${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  const response = await fetch(url, { method: 'DELETE' });

  if (!response.ok) {
    throw new Error(`[authHelper] Eroare la golirea Firestore: ${response.status}`);
  }
}

/**
 * Resetează complet starea Auth (între teste)
 */
async function clearAuth() {
  const url =
    `${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;

  const response = await fetch(url, { method: 'DELETE' });

  if (!response.ok) {
    throw new Error(`[authHelper] Eroare la golirea Auth: ${response.status}`);
  }
}

/**
 * Generează un email unic per test (evită coliziuni)
 */
function generateTestEmail(prefix = 'test') {
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${random}@examflow.test`;
}

module.exports = {
  createTestUser,
  clearFirestore,
  clearAuth,
  generateTestEmail,
};