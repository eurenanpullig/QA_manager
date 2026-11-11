import React from 'react';

import { useAuth } from '../hooks/useAuth.js';

import type { UserRole } from '../contexts/AuthContext.js';

export interface GuardedRouteProps {
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const GuardedRoute: React.FC<GuardedRouteProps> = ({ allowedRoles, fallback, children }) => {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <>
        {fallback ?? (
          <div className="gt-card" data-testid="rbac-denied-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="gt-badge gt-badge-danger">403 RBAC</span>
              <strong>Acesso Restrito ao Perfil</strong>
            </div>
            <p style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>
              Seu perfil atual (<code>{user.role}</code>) não possui permissão na matriz RBAC para
              acessar ou modificar este módulo. Perfis autorizados:{' '}
              <code>{allowedRoles.join(', ')}</code>.
            </p>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
};
