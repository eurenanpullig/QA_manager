// [3.7.2] Spec E2E 1: Login -> Criar Projeto -> Escrever Cenário Gherkin -> Executar com Upload de Imagem
describe('E2E 01 - Fluxo Completo: Login, Projeto, Cenário Gherkin e Execução com Evidência', () => {
  it('Deve autenticar como Líder, criar um Projeto, cadastrar Cenário Gherkin e registrar Execução PASSED com upload de imagem', () => {
    const uniqueSuffix = Date.now().toString().slice(-5);
    const projectName = `Projeto E2E Cypress ${uniqueSuffix}`;
    const scenarioTitle = `Cenário E2E Checkout ${uniqueSuffix}`;
    const suiteName = `Suíte E2E ${uniqueSuffix}`;

    // 1. Login via UI (HttpOnly Cookie session)
    cy.loginByUi('lider@gestortestes.local', 'Admin@123');
    cy.get('[data-testid="user-role-badge"]').should('contain.text', 'LIDER_TESTES');

    // 2. Criar Projeto Raiz na tela de Hierarquia
    cy.get('[data-testid="new-project-name-input"]').clear().type(projectName);
    cy.get('[data-testid="new-project-desc-input"]')
      .clear()
      .type('Projeto automatizado criado pelo Cypress E2E');
    cy.get('[data-testid="create-project-submit-btn"]').click();
    cy.get('[data-testid="hierarchy-status-msg"]').should('contain.text', projectName);

    // 3. Navegar para o Editor Gherkin & Versões e criar novo cenário BDD
    cy.get('[data-testid="nav-gherkin"]').first().click();
    cy.get('[data-testid="gherkin-editor-page"]').should('be.visible');

    cy.get('[data-testid="scenario-title-input"]').clear().type(scenarioTitle);
    cy.get('[data-testid="scenario-gherkin-textarea"]')
      .clear()
      .type(
        `Feature: Checkout Corporativo E2E\n  Scenario: ${scenarioTitle}\n    Given que o cliente possui itens validos no carrinho\n    When confirma o pagamento via PIX\n    Then o pedido muda para status APROVADO`,
      );
    cy.get('[data-testid="save-scenario-btn"]').click();
    cy.get('[data-testid="gherkin-save-feedback"]').should('contain.text', 'v1');

    // 4. Navegar para Suítes & Execuções, montar suíte e iniciar bateria
    cy.get('[data-testid="nav-suites"]').first().click();
    cy.get('[data-testid="suites-orchestrator-page"]').should('be.visible');

    cy.get('[data-testid="suite-name-input"]').clear().type(suiteName);
    cy.contains('label', scenarioTitle).find('input[type="checkbox"]').check({ force: true });
    cy.get('[data-testid="create-suite-btn"]').click();
    cy.get('[data-testid="suites-success-banner"]').should('contain.text', suiteName);

    // Iniciar execução da suíte recém-criada
    cy.contains('[data-testid^="suite-item-"]', suiteName)
      .find('[data-testid^="run-suite-btn-"]')
      .click();

    cy.get('[data-testid="active-suite-run-panel"]').should('be.visible');
    cy.get('[data-testid="open-exec-modal-btn-0"]').click();
    cy.get('[data-testid="execution-modal"]').should('be.visible');

    // 5. Verificar que PASSED exige upload de evidência antes de liberar o botão
    cy.get('[data-testid="select-status-PASSED"]').click();
    cy.get('[data-testid="submit-execution-btn"]').should('be.disabled');

    // Simular seleção de imagem PNG válida em memória
    const pngBytes = Cypress.Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    cy.get('[data-testid="evidence-file-input"]').selectFile(
      {
        contents: pngBytes,
        fileName: 'evidencia-e2e-passed.png',
        mimeType: 'image/png',
        lastModified: Date.now(),
      },
      { force: true },
    );

    cy.get('[data-testid="uploaded-evidences-list"]').should('be.visible');
    cy.get('[data-testid="submit-execution-btn"]').should('not.be.disabled').click();

    // 6. Confirmar gravação imutável e atualização da pilha
    cy.get('[data-testid="suites-success-banner"]').should(
      'contain.text',
      'Execução imutável registrada (PASSED)',
    );
    cy.get('[data-testid="stack-scenario-status-0"]').should('contain.text', 'PASSED');
    cy.get('[data-testid="suite-stability-badge"]').should('contain.text', 'ESTÁVEL');
  });
});
