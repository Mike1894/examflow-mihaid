const { defineConfig, devices } = require('@playwright/test');

// ============================================
// CONFIGURAȚIE PLAYWRIGHT
// Optimizată pentru rularea împotriva Firebase Emulator Suite
// ============================================

module.exports = defineConfig({
  // Locația suitei de teste
  testDir: './tests/e2e',

  // Timeout per test
  timeout: 60 * 1000,

  // Timeout pentru expect-uri (relevant pentru waiting-ul Firestore real-time)
  expect: {
    timeout: 10 * 1000,
  },

  // Rulare paralelă (Capitolul 4.4.4 din lucrare)
  fullyParallel: true,

  // Interzicem .only în CI ca să nu uităm teste descomentate
  forbidOnly: !!process.env.CI,

  // Retries: 2 în CI (pentru robustețe), 0 local (feedback rapid)
  retries: process.env.CI ? 2 : 0,

  // Workeri: limitați în CI pentru a nu suprasolicita emulatorul
  workers: process.env.CI ? 2 : undefined,

  // Reportere multiple
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  // Setări globale aplicate tuturor proiectelor
  use: {
    baseURL: 'http://localhost:5173',

    // Captură screenshot doar la eșec
    screenshot: 'only-on-failure',

    // Captură video doar la eșec
    video: 'on',

    // Trace pentru debugging (vizibil în trace viewer)
    trace: 'on-first-retry',
    
    launchOptions: { slowMo: 500 },

    // Timeout pentru acțiuni individuale
    actionTimeout: 15 * 1000,

    // Timeout pentru navigare
    navigationTimeout: 30 * 1000,
  },

  // Proiecte (browsere)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Pentru lucrarea de licență, Chromium este suficient pentru demonstrație.
    // Suportul multi-browser e oricând activabil prin decomentare:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Pornește automat dev server-ul Vite înainte de teste (opțional)
  // Comentat pentru control manual; activează-l dacă vrei full automation
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});