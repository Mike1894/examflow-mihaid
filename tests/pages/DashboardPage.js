const { expect } = require('@playwright/test');

// ============================================
// PAGE OBJECT: Dashboard
// Conține metode pentru ambele roluri (profesor, student)
// Selectorii sunt complet ascunși; testele lucrează doar cu metode de business
// ============================================

class DashboardPage {
  constructor(page) {
    this.page = page;

    // Locatori generali
    this.dashboard = page.getByTestId('dashboard');
    this.userEmail = page.getByTestId('user-email');
    this.userRole = page.getByTestId('user-role');
    this.logoutButton = page.getByTestId('logout-button');

    // Locatori specifici profesorului
    this.profesorView = page.getByTestId('profesor-view');
    this.inputMaterie = page.getByTestId('input-materie');
    this.inputNumeSala = page.getByTestId('input-nume-sala');
    this.inputCapacitate = page.getByTestId('input-capacitate');
    this.inputDataExamen = page.getByTestId('input-data-examen');
    this.btnCreareSlot = page.getByTestId('btn-creare-slot');
    this.listaSloturiProfesor = page.getByTestId('lista-sloturi-profesor');

    // Locatori specifici studentului
    this.studentView = page.getByTestId('student-view');
    this.listaSloturiStudent = page.getByTestId('lista-sloturi-student');

    // Feedback (atât profesor cât și student)
    this.feedbackSuccess = page.getByTestId('feedback-success');
    this.feedbackError = page.getByTestId('feedback-error');
  }

  // ============================================
  // ACȚIUNI GENERALE
  // ============================================

  async waitForLoaded() {
    await expect(this.dashboard).toBeVisible();
  }

  async expectRole(role) {
    await expect(this.userRole).toHaveText(role);
  }

  async logout() {
    await this.logoutButton.click();
  }

  // ============================================
  // ACȚIUNI PROFESOR
  // ============================================

  async waitForProfesorView() {
    await expect(this.profesorView).toBeVisible();
  }

  /**
   * Creează un nou slot de examen
   * @param {Object} slot
   * @param {string} slot.materie
   * @param {string} slot.numeSala
   * @param {number} slot.capacitate
   * @param {string} slot.dataExamen - format ISO local: 'YYYY-MM-DDTHH:mm'
   */
  async createSlot({ materie, numeSala, capacitate, dataExamen }) {
    await this.inputMaterie.fill(materie);
    await this.inputNumeSala.fill(numeSala);
    await this.inputCapacitate.fill(String(capacitate));
    await this.inputDataExamen.fill(dataExamen);
    await this.btnCreareSlot.click();
  }

  async expectSlotCreated() {
    await expect(this.feedbackSuccess).toBeVisible();
    await expect(this.feedbackSuccess).toContainText('succes');
  }

  /**
   * Verifică prezența unui slot în lista profesorului
   * după conținutul textului (materie/sală)
   */
  async expectSlotInList(materie, numeSala) {
    await expect(this.listaSloturiProfesor).toContainText(materie);
    await expect(this.listaSloturiProfesor).toContainText(numeSala);
  }

  async getNumarSloturiProfesor() {
    const items = this.listaSloturiProfesor.locator('li');
    return await items.count();
  }

  // ============================================
  // ACȚIUNI STUDENT
  // ============================================

  async waitForStudentView() {
    await expect(this.studentView).toBeVisible();
  }

  /**
   * Așteaptă ca un slot specific să apară în lista de înscriere
   * (Firestore real-time poate avea mici latențe)
   */
  async waitForSlotToAppear(slotId, timeout = 15000) {
    await expect(this.page.getByTestId(`slot-card-${slotId}`)).toBeVisible({ timeout });
  }

  /**
   * Apasă butonul de înscriere pentru un slot specific
   * Returnează imediat, fără să aștepte feedback-ul
   */
  async clickInscrieMaCu(slotId) {
    await this.page.getByTestId(`btn-inscriere-${slotId}`).click();
  }

  /**
   * Așteaptă feedback de succes pentru înscriere
   */
  async expectInscriereSuccess() {
    await expect(this.feedbackSuccess).toBeVisible();
    await expect(this.feedbackSuccess).toContainText('reușită');
  }

  /**
   * Așteaptă feedback de eroare pentru înscriere
   */
  async expectInscriereError(messageSubstring = null) {
    await expect(this.feedbackError).toBeVisible();
    if (messageSubstring) {
      await expect(this.feedbackError).toContainText(messageSubstring);
    }
  }

  /**
   * Pentru race condition test: așteaptă orice feedback (success SAU error)
   * și returnează tipul rezultatului
   */
  async waitForAnyFeedback(timeout = 15000) {
    const successLocator = this.feedbackSuccess;
    const errorLocator = this.feedbackError;

    // Race între apariția success și error
    const result = await Promise.race([
      successLocator.waitFor({ state: 'visible', timeout }).then(() => 'success'),
      errorLocator.waitFor({ state: 'visible', timeout }).then(() => 'error'),
    ]);

    return result;
  }

  /**
   * Returnează numărul de locuri libere afișat pentru un slot
   */
  async getLocuriLibere(slotId) {
    const text = await this.page.getByTestId(`slot-locuri-${slotId}`).textContent();
    // Format: "Locuri libere: 9/10"
    const match = text.match(/(\d+)\/\d+/);
    return match ? parseInt(match[1], 10) : null;
  }
}

module.exports = { DashboardPage };