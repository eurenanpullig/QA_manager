import React, { useCallback, useEffect, useState } from 'react';

import { apiClient } from '../services/apiClient.js';

import type { UserRole } from '../contexts/AuthContext.js';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  failed_attempts: number;
  suspended_until: string | null;
  suspension_level: number;
}

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Admin@123');
  const [role, setRole] = useState<UserRole>('QA');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadUsers = useCallback(async (): Promise<void> => {
    const res = await apiClient.get<{ users: ManagedUser[] }>('/auth/users');
    setUsers(res.data.users);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setFeedback(null);
    await apiClient.post('/auth/users', { name, email, password, role });
    setName('');
    setEmail('');
    setFeedback('Usuário provisionado com sucesso.');
    await loadUsers();
  };

  const handleUnlock = async (userId: string): Promise<void> => {
    await apiClient.put(`/auth/users/${userId}`, { unlock_account: true, is_active: true });
    setFeedback('Conta desbloqueada/ativada com sucesso.');
    await loadUsers();
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      data-testid="admin-users-page"
    >
      <div className="gt-card">
        <h2 style={{ marginTop: 0 }}>Provisionamento de Usuários & RBAC (Exclusivo ADM)</h2>
        {feedback ? (
          <div className="gt-badge gt-badge-success" style={{ marginBottom: '0.75rem' }}>
            {feedback}
          </div>
        ) : null}
        <form
          onSubmit={(e) => void handleCreateUser(e)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Nome
            </label>
            <input
              className="gt-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              E-mail
            </label>
            <input
              type="email"
              className="gt-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@gestortestes.local"
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Senha Inicial
            </label>
            <input
              type="password"
              className="gt-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Papel RBAC
            </label>
            <select
              className="gt-input"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="ADM">ADM</option>
              <option value="LIDER_TESTES">LIDER_TESTES</option>
              <option value="QA">QA</option>
              <option value="DEV">DEV</option>
            </select>
          </div>
          <button type="submit" className="gt-btn gt-btn-primary">
            Criar Usuário
          </button>
        </form>
      </div>

      <div className="gt-card">
        <h3 style={{ marginTop: 0 }}>Contas Cadastradas ({users.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {users.map((u) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <strong>{u.name}</strong> ({u.email})
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <span className="gt-badge gt-badge-info">{u.role}</span>
                  <span
                    className={`gt-badge ${u.is_active ? 'gt-badge-success' : 'gt-badge-danger'}`}
                  >
                    {u.is_active ? 'ATIVO' : 'INATIVO'}
                  </span>
                  {u.failed_attempts > 0 || u.suspended_until ? (
                    <span className="gt-badge gt-badge-warning">
                      Falhas: {u.failed_attempts} | Stage {u.suspension_level}
                    </span>
                  ) : null}
                </div>
              </div>
              {u.failed_attempts > 0 || u.suspended_until ? (
                <button
                  type="button"
                  className="gt-btn gt-btn-secondary"
                  onClick={() => void handleUnlock(u.id)}
                >
                  Desbloquear Conta
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
