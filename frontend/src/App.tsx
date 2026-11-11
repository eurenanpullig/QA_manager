import React, { useState } from 'react';

import { AppShell } from './components/AppShell.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import './styles/tokens.css';

export const App: React.FC = () => {
  const [activeNavId, setActiveNavId] = useState('hierarchy');

  return (
    <ThemeProvider>
      <AppShell
        navItems={[
          { id: 'hierarchy', label: 'Hierarquia & Cenários' },
          { id: 'suites', label: 'Suítes & Execuções' },
          { id: 'audit', label: 'Auditoria & Relatórios PDF' },
        ]}
        activeNavId={activeNavId}
        onSelectNav={setActiveNavId}
      >
        <section className="gt-card">
          <h1 style={{ marginTop: 0 }}>Fundação Visual Material Design (Step 3.1)</h1>
          <p>
            Layout Mobile First com zero cantos de 90° (<code>border-radius &gt;= 8px</code>),
            suporte a temas Dark/Light (WCAG 2.1 AA) e escala tipográfica dinâmica no elemento raiz{' '}
            <code>html</code>.
          </p>
        </section>
      </AppShell>
    </ThemeProvider>
  );
};
