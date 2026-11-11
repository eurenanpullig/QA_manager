Cypress.Commands.add('loginByUi', (email, password = 'Admin@123') => {
  cy.visit('/');
  cy.get('[data-testid="login-email-input"]').clear().type(email);
  cy.get('[data-testid="login-password-input"]').clear().type(password);
  cy.get('[data-testid="login-submit-btn"]').click();
  cy.get('[data-testid="user-role-badge"]', { timeout: 10000 }).should('be.visible');
});

Cypress.Commands.add('quickLoginRole', (roleTestId) => {
  cy.visit('/');
  cy.get(`[data-testid="${roleTestId}"]`).click();
  cy.get('[data-testid="login-submit-btn"]').click();
  cy.get('[data-testid="user-role-badge"]', { timeout: 10000 }).should('be.visible');
});
