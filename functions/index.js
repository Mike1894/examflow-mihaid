const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { FieldValue } = require('firebase-admin/firestore');

// ============================================
// INIȚIALIZARE FIREBASE ADMIN
// ============================================

admin.initializeApp();
const db = admin.firestore();

// Setări globale: regiune și concurență
setGlobalOptions({
  region: 'europe-west1',
  maxInstances: 10,
});

// ============================================
// FUNCȚIA 1: inscrieStudentLaSlot
// HTTPS Callable cu tranzacție atomică
// Previne race conditions la înscrieri concurente
// ============================================

exports.inscrieStudentLaSlot = onCall(async (request) => {
  // 1. Verificare autentificare
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Trebuie să fii autentificat pentru a te înscrie la examen.'
    );
  }

  // 2. Verificare rol
  if (request.auth.token.role !== 'student') {
    throw new HttpsError(
      'permission-denied',
      'Doar studenții se pot înscrie la examene.'
    );
  }

  // 3. Validare input
  const { slotId } = request.data;
  if (!slotId || typeof slotId !== 'string') {
    throw new HttpsError(
      'invalid-argument',
      'Parametrul slotId este obligatoriu și trebuie să fie un string.'
    );
  }

  const studentId = request.auth.uid;
  const slotRef = db.collection('sesiuni_sloturi').doc(slotId);
  const inscriereRef = slotRef.collection('inscrieri_studenti').doc(studentId);

  try {
    // 4. Tranzacție atomică (read-modify-write)
    const rezultat = await db.runTransaction(async (transaction) => {
      // Citire slot
      const slotDoc = await transaction.get(slotRef);

      if (!slotDoc.exists) {
        throw new HttpsError(
          'not-found',
          'Slotul de examen nu există.'
        );
      }

      const slotData = slotDoc.data();

      // Verificare status: slotul închis nu mai acceptă înscrieri
      if (slotData.status === 'closed') {
        throw new HttpsError(
          'failed-precondition',
          'Înscrierile pentru acest examen au fost închise.'
        );
      }

      // Verificare capacitate
      if (slotData.locuriOcupate >= slotData.capacitateTotala) {
        throw new HttpsError(
          'resource-exhausted',
          'Slotul este complet. Toate locurile au fost ocupate.'
        );
      }

      // Verificare dacă studentul nu este deja înscris
      const inscriereExistenta = await transaction.get(inscriereRef);
      if (inscriereExistenta.exists) {
        throw new HttpsError(
          'already-exists',
          'Ești deja înscris la acest examen.'
        );
      }

      // Citire date student din colecția users (pentru denormalizare)
      const studentDoc = await transaction.get(
        db.collection('users').doc(studentId)
      );

      if (!studentDoc.exists) {
        throw new HttpsError(
          'not-found',
          'Profilul tău de student nu a fost găsit.'
        );
      }

      const studentData = studentDoc.data();

      // Operații atomice de scriere

      // Incrementare contor locuri ocupate
      transaction.update(slotRef, {
        locuriOcupate: FieldValue.increment(1),
      });

      // Creare document de înscriere (cu date denormalizate)
      transaction.set(inscriereRef, {
        studentId: studentId,
        numeComplet: studentData.numeComplet,
        email: studentData.email,
        grupa: studentData.grupa || null,
        dataInscriere: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        slotId: slotId,
        locuriRamase: slotData.capacitateTotala - slotData.locuriOcupate - 1,
      };
    });

    logger.info('Înscriere reușită', { studentId, slotId });
    return rezultat;

  } catch (error) {
    console.error('🔥 EROARE REALĂ PRINSĂ:', error.message);
    console.error('🔥 STACK TRACE:', error.stack);
    
    // În loc de instanceof, verificăm dacă are un cod specific de Firebase (ex: 'not-found')
    if (error.code) {
      throw new HttpsError(error.code, error.message);
    }
    
    // Dacă e o eroare de sistem, o dăm cu tot cu mesaj spre frontend ca să o citim
    throw new HttpsError(
      'internal',
      'Eroare internă: ' + error.message
    );
  }
});

// ============================================
// FUNCȚIA 2: inchideSesiuniProgramat
// Scheduled Function: rulează zilnic la miezul nopții
// Blochează sloturile aflate la exact 7 zile de examen
// ============================================

exports.inchideSesiuniProgramat = onSchedule(
  {
    schedule: '0 0 * * *', // zilnic la 00:00
    timeZone: 'Europe/Bucharest',
    region: 'europe-west1',
  },
  async (event) => {
    logger.info('Pornit job de închidere automată a sesiunilor');

    try {
      // Calculează intervalul: exact 7 zile de la momentul curent
      const acum = new Date();
      const peste7Zile = new Date(acum);
      peste7Zile.setDate(peste7Zile.getDate() + 7);

      // Construim un interval [start, end] pentru a captura toate sloturile
      // programate în ziua aflată la 7 zile distanță
      const startZi = new Date(peste7Zile);
      startZi.setHours(0, 0, 0, 0);

      const finalZi = new Date(peste7Zile);
      finalZi.setHours(23, 59, 59, 999);

      // Interogare: sloturi neînchise programate în acea zi
      const snapshot = await db
        .collection('sesiuni_sloturi')
        .where('dataExamen', '>=', admin.firestore.Timestamp.fromDate(startZi))
        .where('dataExamen', '<=', admin.firestore.Timestamp.fromDate(finalZi))
        .where('status', '==', 'open')
        .get();

      if (snapshot.empty) {
        logger.info('Nu există sloturi de închis astăzi.');
        return;
      }

      // Folosim batch pentru actualizări atomice
      // Firestore permite max 500 operații per batch
      const batchSize = 500;
      let batch = db.batch();
      let operatiiInBatch = 0;
      let totalInchise = 0;

      for (const doc of snapshot.docs) {
        batch.update(doc.ref, {
          status: 'closed',
          isLocked: true,
          dataInchidere: FieldValue.serverTimestamp(),
        });
        operatiiInBatch++;
        totalInchise++;

        // Commit periodic dacă atingem limita batch-ului
        if (operatiiInBatch === batchSize) {
          await batch.commit();
          batch = db.batch();
          operatiiInBatch = 0;
        }
      }

      // Commit pentru ultimul batch (dacă a rămas ceva)
      if (operatiiInBatch > 0) {
        await batch.commit();
      }

      logger.info('Sloturi închise cu succes', {
        total: totalInchise,
        dataExamen: peste7Zile.toISOString(),
      });

    } catch (error) {
      logger.error('Eroare la închiderea programată a sesiunilor', error);
      throw error;
    }
  }
);

// ============================================
// FUNCȚIA 3: setCustomUserRole
// HTTPS Callable - Helper pentru seed-ul testelor E2E
// Atașează custom claims (role) la cont
// ATENȚIE: în producție, această funcție trebuie protejată
// (admin only) sau eliminată complet
// ============================================

exports.setCustomUserRole = onCall(async (request) => {
  // Validare input
  const { uid, role } = request.data;

  if (!uid || typeof uid !== 'string') {
    throw new HttpsError(
      'invalid-argument',
      'Parametrul uid este obligatoriu.'
    );
  }

  if (!role || (role !== 'professor' && role !== 'student')) {
    throw new HttpsError(
      'invalid-argument',
      'Parametrul role trebuie să fie "professor" sau "student".'
    );
  }

  // În mediul de emulator (folosit pentru testele E2E), nu cerem autentificare
  // În producție, doar utilizatorii cu role=admin pot apela această funcție
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

  if (!isEmulator) {
    if (!request.auth || request.auth.token.role !== 'admin') {
      throw new HttpsError(
        'permission-denied',
        'Doar administratorii pot atribui roluri.'
      );
    }
  }

  try {
    // Setare custom claim (rolul devine parte din JWT)
    await admin.auth().setCustomUserClaims(uid, { role: role });

    logger.info('Rol atribuit', { uid, role });

    return {
      success: true,
      uid: uid,
      role: role,
      message: `Rolul "${role}" a fost atribuit utilizatorului ${uid}. ` +
               'Token-ul JWT va reflecta această schimbare la următoarea reautentificare.',
    };

  } catch (error) {
    logger.error('Eroare la setarea custom claim', { uid, role, error });
    throw new HttpsError(
      'internal',
      'Nu am putut atribui rolul. Verifică dacă uid-ul este valid.'
    );
  }
});