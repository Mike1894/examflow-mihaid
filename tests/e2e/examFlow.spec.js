const { test, expect, chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');
const {
  createTestUser,
  clearFirestore,
  clearAuth,
  generateTestEmail,
} = require('../helpers/authHelper');

// ============================================
// SETUP/TEARDOWN
// Curățare emulator înainte de fiecare test pentru izolare totală
// (Capitolul 4.2.3 din lucrare)
// ============================================

test.beforeEach(async () => {
  await clearFirestore();
  await clearAuth();
});

// ============================================
// HELPER: Calculează o dată viitoare pentru examen
// Format compatibil cu input type="datetime-local"
// ============================================

function dataExamenViitor(zileInViitor = 30) {
  const data = new Date();
  data.setDate(data.getDate() + zileInViitor);
  data.setHours(10, 0, 0, 0);
  // Format: YYYY-MM-DDTHH:mm
  const pad = (n) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

// ============================================
// TEST 1: PROFESOR HAPPY PATH
// Crearea unui slot de examen de către profesor
// ============================================

test('Profesor: poate crea un slot de examen și îl vede în lista proprie', async ({ page }) => {
  // Setup: creează profesor de test
  const profesor = await createTestUser({
    email: generateTestEmail('prof'),
    password: 'Test1234!',
    role: 'professor',
    numeComplet: 'Prof. Test Ionescu',
  });

  // Inițializare Page Objects
  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);

  // Autentificare
  await loginPage.goto();
  await loginPage.waitForLoaded();
  await loginPage.loginAndExpectSuccess(profesor.email, profesor.password);

  // Verificare context profesor
  await dashboardPage.waitForLoaded();
  await dashboardPage.expectRole('professor');
  await dashboardPage.waitForProfesorView();

  // Acțiune: creare slot
  const slotData = {
    materie: 'Algoritmi și Structuri de Date',
    numeSala: 'Amfiteatru A2',
    capacitate: 10,
    dataExamen: dataExamenViitor(30),
  };

  await dashboardPage.createSlot(slotData);

  // Verificare: feedback de succes
  await dashboardPage.expectSlotCreated();

  // Verificare: slotul apare în lista proprie
  await dashboardPage.expectSlotInList(slotData.materie, slotData.numeSala);

  // Verificare: lista conține exact 1 element
  const numarSloturi = await dashboardPage.getNumarSloturiProfesor();
  expect(numarSloturi).toBe(1);
});

// ============================================
// TEST 2: STUDENT HAPPY PATH
// Înscrierea unui student la un slot existent
// ============================================

test('Student: vede sloturile deschise și se poate înscrie cu succes', async ({ page, browser }) => {
  // Setup: profesor + un slot creat
  const profesor = await createTestUser({
    email: generateTestEmail('prof'),
    password: 'Test1234!',
    role: 'professor',
    numeComplet: 'Prof. Test Popescu',
  });

  const student = await createTestUser({
    email: generateTestEmail('stud'),
    password: 'Test1234!',
    role: 'student',
    numeComplet: 'Student Test Ionescu',
  });

  // Pasul A: profesorul creează slotul într-un context separat
  const profContext = await browser.newContext();
  const profPage = await profContext.newPage();
  const profLogin = new LoginPage(profPage);
  const profDashboard = new DashboardPage(profPage);

  await profLogin.goto();
  await profLogin.loginAndExpectSuccess(profesor.email, profesor.password);
  await profDashboard.waitForProfesorView();
  await profDashboard.createSlot({
    materie: 'Inginerie Software',
    numeSala: 'Amfiteatru B1',
    capacitate: 20,
    dataExamen: dataExamenViitor(45),
  });
  await profDashboard.expectSlotCreated();

  // Închidem contextul profesorului
  await profContext.close();

  // Pasul B: studentul se loghează și se înscrie
  const studentLogin = new LoginPage(page);
  const studentDashboard = new DashboardPage(page);

  await studentLogin.goto();
  await studentLogin.loginAndExpectSuccess(student.email, student.password);
  await studentDashboard.waitForLoaded();
  await studentDashboard.expectRole('student');
  await studentDashboard.waitForStudentView();

  // Așteptăm ca slotul creat de profesor să apară (Firestore real-time)
  const slotCard = page.locator('[data-testid^="slot-card-"]').first();
  await expect(slotCard).toBeVisible({ timeout: 15000 });
  await expect(slotCard).toContainText('Inginerie Software');

  // Extragem ID-ul slotului din atributul data-testid
  const testIdAttr = await slotCard.getAttribute('data-testid');
  const slotId = testIdAttr.replace('slot-card-', '');

  // Verificare: 20 locuri libere înainte de înscriere
  const locuriInitiale = await studentDashboard.getLocuriLibere(slotId);
  expect(locuriInitiale).toBe(20);

  // Acțiune: înscriere
  await studentDashboard.clickInscrieMaCu(slotId);

  // Verificare: feedback de succes
  await studentDashboard.expectInscriereSuccess();

  // Verificare: contorul s-a actualizat în real-time la 19
  await expect.poll(
    async () => await studentDashboard.getLocuriLibere(slotId),
    { timeout: 10000 }
  ).toBe(19);
});

// ============================================
// TEST 3: RACE CONDITION (CRITIC)
// Demonstrează tranzacția atomică din backend
// 5 studenți încearcă simultan să se înscrie pe 1 singur loc
// Așteptăm: exact 1 succes + 4 erori
// (Capitolul 4.3.4 din lucrare)
// ============================================

test('Race Condition: 5 studenți concurenți pe 1 loc → exact 1 succes, 4 erori', async ({ browser }) => {
  // ============================================
  // SETUP: 1 profesor + 1 slot cu capacitate 1 + 5 studenți
  // ============================================

  const profesor = await createTestUser({
    email: generateTestEmail('prof'),
    password: 'Test1234!',
    role: 'professor',
    numeComplet: 'Prof. Race Test',
  });

  // Creăm 5 studenți distincți
  const studenti = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      createTestUser({
        email: generateTestEmail(`stud-${i}`),
        password: 'Test1234!',
        role: 'student',
        numeComplet: `Student Concurent ${i + 1}`,
      })
    )
  );

  // ============================================
  // PASUL A: Profesorul creează slotul cu capacitate = 1
  // ============================================

  const profContext = await browser.newContext();
  const profPage = await profContext.newPage();
  const profLogin = new LoginPage(profPage);
  const profDashboard = new DashboardPage(profPage);

  await profLogin.goto();
  await profLogin.loginAndExpectSuccess(profesor.email, profesor.password);
  await profDashboard.waitForProfesorView();

  const slotMaterie = 'Examen Concurență';
  await profDashboard.createSlot({
    materie: slotMaterie,
    numeSala: 'Sala Race',
    capacitate: 1, // SINGURUL loc disponibil
    dataExamen: dataExamenViitor(60),
  });
  await profDashboard.expectSlotCreated();

  // Capturăm ID-ul slotului creat pentru a-l folosi în studenți
  const slotProfRow = profPage.locator('[data-testid^="slot-row-"]').first();
  await expect(slotProfRow).toBeVisible();
  const slotIdAttr = await slotProfRow.getAttribute('data-testid');
  const slotId = slotIdAttr.replace('slot-row-', '');

  await profContext.close();

  // ============================================
  // PASUL B: 5 contexte de browser independente
  // (Capitolul 4.3.4: izolare totală între sesiuni concurente)
  // ============================================

  const studentSessions = await Promise.all(
    studenti.map(async (student) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);

      // Autentificare
      await loginPage.goto();
      await loginPage.loginAndExpectSuccess(student.email, student.password);
      await dashboardPage.waitForStudentView();

      // Așteptăm să apară slotul în UI-ul fiecărui student
      await dashboardPage.waitForSlotToAppear(slotId);

      return { context, page, dashboardPage, student };
    })
  );

  // Mic delay de stabilizare după ce toți studenții au sesiunile gata
  // (asigură că Firestore a propagat starea la toți clienții)
  await studentSessions[0].page.waitForTimeout(500);

  // ============================================
  // PASUL C: DECLANȘARE SIMULTANĂ (Promise.all)
  // Toate cele 5 click-uri pleacă în paralel
  // ============================================

  console.log('[Race Test] Declanșare 5 înscrieri simultane...');

  const rezultate = await Promise.all(
    studentSessions.map(async ({ dashboardPage, student }) => {
      try {
        // Click-ul în sine este sincronizat la nivel de Promise.all
        await dashboardPage.clickInscrieMaCu(slotId);

        // Așteptăm feedback (success sau error)
        const tipFeedback = await dashboardPage.waitForAnyFeedback(20000);

        return {
          studentEmail: student.email,
          rezultat: tipFeedback, // 'success' sau 'error'
        };
      } catch (err) {
        // Dacă timeout, considerăm error
        return {
          studentEmail: student.email,
          rezultat: 'error',
          eroare: err.message,
        };
      }
    })
  );

  console.log('[Race Test] Rezultate:', rezultate);

  // ============================================
  // PASUL D: VERIFICĂRI CRITICE
  // ============================================

  const succese = rezultate.filter((r) => r.rezultat === 'success');
  const erori = rezultate.filter((r) => r.rezultat === 'error');

  // Aserțiunea principală: tranzacția atomică din backend a funcționat
  expect(succese).toHaveLength(1);
  expect(erori).toHaveLength(4);

  // Verificare suplimentară: contorul slotului este exact 1 (din 1)
  // Folosim sesiunea oricărui student pentru a vedea starea finală
  const verifyPage = studentSessions[0].page;
  const verifyDashboard = studentSessions[0].dashboardPage;

  await expect.poll(
    async () => await verifyDashboard.getLocuriLibere(slotId),
    {
      timeout: 10000,
      message: 'Contorul de locuri libere trebuie să fie 0 după înscriere',
    }
  ).toBe(0);

  // Cleanup
  await Promise.all(studentSessions.map(({ context }) => context.close()));
});