// [3.7.3] Spec E2E 2: Verificar trava de justificativa curta (< 70 caracteres) ao marcar como BLOCKED
describe('E2E 02 - Governança de Execução: Trava de Mínimo 70 Caracteres para BLOCKED/SKIPPED', () => {
  it('Deve manter o botão de submissão desabilitado quando a justificativa de BLOCKED possuir menos de 70 caracteres e liberar ao atingir >= 70 caracteres', () => {
    // 1. Login com perfil Analista QA
    cy.loginByUi('qa@gestortestes.local', 'Admin@123');
    cy.get('[data-testid="user-role-badge"]').should('contain.text', 'QA');

    // 2. Acessar Suítes & Execuções e iniciar uma suíte existente
    cy.get('[data-testid="nav-suites"]').first().click();
    cy.get('[data-testid="suites-orchestrator-page"]').should('be.visible');

    // Caso não exista suíte para o projeto selecionado, cria uma rapidamente
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid^="run-suite-btn-"]').length === 0) {
        cy.get('[data-testid="suite-name-input"]').clear().type('Suíte Validação Bloqueio QA');
        cy.get('[data-testid^="suite-scenario-checkbox-"] input[type="checkbox"]')
          .first()
          .check({ force: true });
        cy.get('[data-testid="create-suite-btn"]').click();
      }
    });

    cy.get('[data-testid^="run-suite-btn-"]').first().click();
    cy.get('[data-testid="active-suite-run-panel"]').should('be.visible');
    cy.get('[data-testid="open-exec-modal-btn-0"]').click();
    cy.get('[data-testid="execution-modal"]').should('be.visible');

    // 3. Selecionar status BLOCKED
    cy.get('[data-testid="select-status-BLOCKED"]').click();

    // 4. Digitar justificativa curta (< 70 caracteres) e verificar bloqueio do botão
    const shortRationale = 'Ambiente de homologação indisponível por erro 502.'; // 50 chars
    cy.get('[data-testid="exec-rationale-textarea"]').clear().type(shortRationale);
    cy.get('[data-testid="rationale-char-counter"]').should(
      'contain.text',
      `${shortRationale.length} / 70`,
    );
    cy.get('[data-testid="submit-execution-btn"]').should('be.disabled');

    // 5. Completar justificativa com >= 70 caracteres e confirmar habilitação e gravação
    const validRationale =
      'Ambiente de homologação indisponível devido à queda do serviço de mensageria RabbitMQ no cluster interno de staging.';
    cy.get('[data-testid="exec-rationale-textarea"]').clear().type(validRationale);
    cy.get('[data-testid="rationale-char-counter"]').should(
      'contain.text',
      `${validRationale.length} / 70`,
    );
    cy.get('[data-testid="submit-execution-btn"]').should('not.be.disabled').click();

    cy.get('[data-testid="suites-success-banner"]').should(
      'contain.text',
      'Execução imutável registrada (BLOCKED)',
    );
  });
});
