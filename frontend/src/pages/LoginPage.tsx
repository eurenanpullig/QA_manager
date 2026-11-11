import React, { useState } from 'react';

import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
import { ApiClientError } from '../services/apiClient.js';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState<number | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockoutDetails, setLockoutDetails] = useState<{
    suspensionLevel?: number;
    lockDurationMinutes?: number;
    suspendedUntil?: string;
    remainingSeconds?: number;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setLockoutDetails(null);

    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
        const fa =
          typeof err.details.failedAttempts === 'number' ? err.details.failedAttempts : null;
        const rem =
          typeof err.details.remainingAttemptsBeforeLockout === 'number'
            ? err.details.remainingAttemptsBeforeLockout
            : null;
        setFailedAttempts(fa);
        setRemainingAttempts(rem);

        if (err.statusCode === 429) {
          setLockoutDetails({
            suspensionLevel:
              typeof err.details.suspensionLevel === 'number'
                ? err.details.suspensionLevel
                : undefined,
            lockDurationMinutes:
              typeof err.details.lockDurationMinutes === 'number'
                ? err.details.lockDurationMinutes
                : undefined,
            suspendedUntil:
              typeof err.details.suspendedUntil === 'string'
                ? err.details.suspendedUntil
                : undefined,
            remainingSeconds:
              typeof err.details.remainingSeconds === 'number'
                ? err.details.remainingSeconds
                : undefined,
          });
        }
      } else {
        setErrorMessage('Falha ao autenticar no servidor.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoUser = (demoEmail: string): void => {
    setEmail(demoEmail);
    setPassword('Admin@123');
    setErrorMessage(null);
    setLockoutDetails(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.25rem',
      }}
    >
      <div className="gt-card" style={{ width: '100%', maxWidth: '480px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div>
            <span className="gt-badge gt-badge-info">Self-Hosted Intranet</span>
            <h1 style={{ margin: '0.4rem 0 0 0', fontSize: '1.5rem' }}>Gestor de Testes</h1>
          </div>
          <button
            type="button"
            className="gt-btn gt-btn-secondary"
            onClick={toggleTheme}
            data-testid="login-theme-toggle"
          >
            {theme === 'DARK' ? '☀️' : '🌙'}
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          Autenticação corporativa com Cookies <code>HttpOnly</code> e proteção progressiva contra
          força bruta.
        </p>

        {errorMessage ? (
          <div
            data-testid="login-error-alert"
            style={{
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              backgroundColor: lockoutDetails ? 'var(--warning-bg)' : 'var(--danger-bg)',
              border: `1px solid ${lockoutDetails ? 'var(--warning)' : 'var(--danger)'}`,
              color: lockoutDetails ? 'var(--warning)' : 'var(--danger)',
            }}
          >
            <strong>
              {lockoutDetails ? '🔒 Conta Temporariamente Bloqueada' : '⚠️ Erro de Autenticação'}
            </strong>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.9rem' }}>{errorMessage}</p>
            {failedAttempts !== null && remainingAttempts !== null ? (
              <p
                data-testid="login-attempts-counter"
                style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem' }}
              >
                Tentativas falhas: <strong>{failedAttempts}/5</strong> (Restam {remainingAttempts}{' '}
                antes do bloqueio progressivo).
              </p>
            ) : null}
            {lockoutDetails ? (
              <p
                data-testid="login-lockout-banner"
                style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem' }}
              >
                Estágio de Suspensão: <strong>Stage {lockoutDetails.suspensionLevel ?? 1}</strong>
                {lockoutDetails.lockDurationMinutes
                  ? ` (${lockoutDetails.lockDurationMinutes} min)`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
        >
          <div>
            <label
              htmlFor="login-email"
              style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}
            >
              E-mail Corporativo
            </label>
            <input
              id="login-email"
              data-testid="login-email-input"
              type="email"
              className="gt-input"
              placeholder="ex: lider@gestortestes.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}
            >
              Senha
            </label>
            <input
              id="login-password"
              data-testid="login-password-input"
              type="password"
              className="gt-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            data-testid="login-submit-btn"
            className="gt-btn gt-btn-primary"
            disabled={submitting}
            style={{ width: '100%', marginTop: '0.25rem' }}
          >
            {submitting ? 'Autenticando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              display: 'block',
              marginBottom: '0.5rem',
            }}
          >
            Acesso Rápido Homologação (Perfis RBAC):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            <button
              type="button"
              data-testid="quick-login-lider"
              className="gt-btn gt-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              onClick={() => fillDemoUser('lider@gestortestes.local')}
            >
              Líder de Testes
            </button>
            <button
              type="button"
              data-testid="quick-login-qa"
              className="gt-btn gt-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              onClick={() => fillDemoUser('qa@gestortestes.local')}
            >
              Analista QA
            </button>
            <button
              type="button"
              data-testid="quick-login-dev"
              className="gt-btn gt-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              onClick={() => fillDemoUser('dev@gestortestes.local')}
            >
              Desenvolvedor (Read-Only)
            </button>
            <button
              type="button"
              data-testid="quick-login-adm"
              className="gt-btn gt-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              onClick={() => fillDemoUser('admin@gestortestes.local')}
            >
              Administrador (ADM)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
