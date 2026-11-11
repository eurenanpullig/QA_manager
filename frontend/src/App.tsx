import React, { useState } from 'react';

import { AppShell } from './components/AppShell.js';
import { GuardedRoute } from './components/GuardedRoute.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import { useAuth } from './hooks/useAuth.js';
import { AdminUsersPage } from './pages/AdminUsersPage.js';
import { GherkinEditorPage } from './pages/GherkinEditorPage.js';
import { HierarchyPage } from './pages/HierarchyPage.js';
import { LeaderAuditAndPdfPage } from './pages/LeaderAuditAndPdfPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { SuitesOrchestratorPage } from './pages/SuitesOrchestratorPage.js';
import './styles/tokens.css';

const AuthenticatedWorkspace: React.FC = () => {
  const { user, loading, logout, savePreferences } = useAuth();
  const [activeNavId, setActiveNavId] = useState<string>('hierarchy');
  const [selectedFeatureForGherkin, setSelectedFeatureForGherkin] = useState<{
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  } | null>(null);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }} data-testid="auth-loading">
        Carregando sessão segura...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const navItems = [
    { id: 'hierarchy', label: 'Hierarquia Funcional' },
    { id: 'gherkin', label: 'Editor Gherkin & Versões' },
    { id: 'suites', label: 'Suítes & Execuções' },
    { id: 'audit', label: 'Auditoria & Relatórios PDF', badge: 'Líder' },
    ...(user.role === 'ADM'
      ? [{ id: 'admin-users', label: 'Gestão de Usuários', badge: 'ADM' }]
      : []),
  ];

  return (
    <AppShell
      navItems={navItems}
      activeNavId={activeNavId}
      onSelectNav={setActiveNavId}
      userSummary={{ name: user.name, role: user.role }}
      onLogout={() => void logout()}
      onPersistPreferences={(theme, scale) => void savePreferences(theme, scale)}
    >
      {activeNavId === 'hierarchy' ? (
        <HierarchyPage
          onSelectFeatureForGherkin={(feat) => {
            setSelectedFeatureForGherkin(feat);
            setActiveNavId('gherkin');
          }}
        />
      ) : null}

      {activeNavId === 'gherkin' ? (
        <GherkinEditorPage initialFeature={selectedFeatureForGherkin} />
      ) : null}

      {activeNavId === 'suites' ? <SuitesOrchestratorPage /> : null}

      {activeNavId === 'admin-users' ? (
        <GuardedRoute allowedRoles={['ADM']}>
          <AdminUsersPage />
        </GuardedRoute>
      ) : null}

      {activeNavId === 'audit' ? <LeaderAuditAndPdfPage /> : null}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthenticatedWorkspace />
      </AuthProvider>
    </ThemeProvider>
  );
};
