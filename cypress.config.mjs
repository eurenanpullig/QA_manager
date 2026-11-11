export default {
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'tests/cypress/e2e/**/*.cy.js',
    supportFile: 'tests/cypress/support/e2e.js',
    fixturesFolder: 'tests/cypress/fixtures',
    video: false,
    screenshotOnRunFailure: false,
    viewportWidth: 1366,
    viewportHeight: 850,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
  },
};
