const admin = require('firebase-admin');

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: "examflow-mihaid" });

const db = admin.firestore();

async function genereazaConturi() {
  try {
    // 1. Creează Profesor
    const prof = await admin.auth().createUser({
      email: 'profesor@test.com',
      password: 'password123',
    });
    await admin.auth().setCustomUserClaims(prof.uid, { role: 'professor' });
    
    // Creăm profilul în Firestore
    await db.collection('users').doc(prof.uid).set({
      email: 'profesor@test.com',
      numeComplet: 'Profesor Test',
      role: 'professor'
    });
    console.log('✅ Profesor creat în Auth și Firestore');

    // 2. Creează Student
    const stud = await admin.auth().createUser({
      email: 'student@test.com',
      password: 'password123',
    });
    await admin.auth().setCustomUserClaims(stud.uid, { role: 'student' });
    
    // Creăm profilul în Firestore
    await db.collection('users').doc(stud.uid).set({
      email: 'student@test.com',
      numeComplet: 'Student Test',
      grupa: '331',
      role: 'student'
    });
    console.log('✅ Student creat în Auth și Firestore');

    process.exit(0);
  } catch (error) {
    console.error('❌ Eroare:', error.message);
    process.exit(1);
  }
}

genereazaConturi();