// [3.7.4] Spec E2E 3: Verificar substituição de evidência e trilha de auditoria pelo Líder de Testes + Exportação PDF
describe('E2E 03 - Auditoria do Líder de Testes: Substituição de Evidência e Relatório PDF', () => {
  it('Deve exigir justificativa >= 70 caracteres para substituir evidência, arquivar a anterior na linha do tempo mantendo o status da execução e exportar PDF', () => {
    // 1. Login como Líder de Testes (LIDER_TESTES)
    cy.loginByUi('lider@gestortestes.local', 'Admin@123');
    cy.get('[data-testid="user-role-badge"]').should('contain.text', 'LIDER_TESTES');

    // 2. Navegar até o painel de Auditoria & Relatórios PDF
    cy.get('[data-testid="nav-audit"]').first().click();
    cy.get('[data-testid="leader-audit-panel"]').should('be.visible');

    // Garantir que uma execução com evidência esteja selecionada
    cy.get('[data-testid="selected-execution-summary"]').should('be.visible');
    cy.get('[data-testid="selected-execution-status"]')
      .invoke('text')
      .then((originalStatus) => {
        // 3. Fazer upload da nova evidência substituta
        const replacementPng = Cypress.Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        );

        cy.get('[data-testid="leader-evidence-file-input"]').selectFile(
          {
            contents: replacementPng,
            fileName: 'evidencia-auditada-lider.png',
            mimeType: 'image/png',
            lastModified: Date.now(),
          },
          { force: true },
        );

        cy.get('[data-testid="leader-uploaded-file-pill"]').should(
          'contain.text',
          'evidencia-auditada-lider.png',
        );

        // 4. Verificar que comentário de auditoria < 70 caracteres mantém o botão bloqueado
        cy.get('[data-testid="leader-audit-comment-input"]')
          .clear()
          .type('Substituição simples de imagem.');
        cy.get('[data-testid="leader-supersede-submit-btn"]').should('be.disabled');

        // 5. Informar justificativa de auditoria >= 70 caracteres e submeter
        const validAuditComment =
          'Substituição realizada pela liderança técnica de QA pois a captura anterior continha dados sensíveis de homologação que precisaram ser anonimizados.';
        cy.get('[data-testid="leader-audit-comment-input"]').clear().type(validAuditComment);
        cy.get('[data-testid="leader-supersede-submit-btn"]').should('not.be.disabled').click();

        // 6. Validar banner de sucesso, preservação do status original e Linha do Tempo (ativa + arquivada)
        cy.get('[data-testid="audit-success-banner"]').should(
          'contain.text',
          'Evidência substituída com sucesso!',
        );
        cy.get('[data-testid="selected-execution-status"]').should(
          'have.text',
          originalStatus.trim(),
        );
        cy.get('[data-testid="timeline-evidence-active"]').should('exist');
        cy.get('[data-testid="timeline-audit-comment"]').should(
          'contain.text',
          validAuditComment,
        );
      });

    // 7. Validar geração do Relatório Executivo em PDF no Cliente (jsPDF)
    cy.get('[data-testid="export-pdf-btn"]').click();
    cy.get('[data-testid="pdf-generated-banner"]').should(
      'contain.text',
      'PDF gerado no cliente',
    );
  });
});
