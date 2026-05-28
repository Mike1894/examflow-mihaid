const { expect } = require('@playwright/test');

// ============================================
// PAGE OBJECT: Login
// Încapsulează toate interacțiunile cu ecranul de autentificare
// ============================================

class LoginPage {
  constructor(page) {
    this.page = page;

    // Locatori semantici (preferați conform Capitolului 4.4.1 din lucrare)
    // Folosim getByLabel ca primă opțiune și getByTestId ca fallback stabil
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.submitButton = page.getByTestId('login-submit');
    this.errorMessage = page.getByTestId('login-error');
    this.loginScreen = page.getByTestId('login-screen');
  }

  // ============================================
  // ACȚIUNI
  // ============================================

  async goto() {
    await this.page.goto('/');
  }

  async waitForLoaded() {
    await expect(this.loginScreen).toBeVisible();
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async loginAndExpectSuccess(email, password) {
    await this.login(email, password);
    // După login reușit, ecranul de login dispare
    await expect(this.loginScreen).not.toBeVisible({ timeout: 10000 });
  }

  async expectError(messageSubstring = null) {
    await expect(this.errorMessage).toBeVisible();
    if (messageSubstring) {
      await expect(this.errorMessage).toContainText(messageSubstring);
    }
  }
}

module.exports = { LoginPage };