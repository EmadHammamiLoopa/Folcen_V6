import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: Cypress.env('APP_BASE') || 'http://localhost:8100',
    supportFile: false,
    specPattern: 'cypress/e2e/**/*.cy.{js,ts}'
  },
  video: false
});
