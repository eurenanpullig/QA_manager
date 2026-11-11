import React, { useState } from 'react';

import { useTheme } from '../hooks/useTheme.js';

export interface NavItem {
  id: string;
  label: string;
  badge?: string;
}

export interface AppShellProps {
  title?: string;
  navItems: NavItem[];
  activeNavId: string;
  onSelectNav: (id: string) => void;
  userSummary?: {
    name: string;
    role: string;
  } | null;
  onLogout?: () => void;
  onPersistPreferences?: (theme: 'LIGHT' | 'DARK', fontScalePercent: number) => void;
  children: React.ReactNode;
}

const FONT_SCALE_OPTIONS = [80, 90, 100, 110, 120, 135, 150];

export const AppShell: React.FC<AppShellProps> = ({
  title = 'Gestor de Testes',
  navItems,
  activeNavId,
  onSelectNav,
  userSummary,
  onLogout,
  onPersistPreferences,
  children,
}) => {
  const { theme, fontScalePercent, toggleTheme, setFontScalePercent } = useTheme();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleToggleTheme = (): void => {
    const nextTheme = theme === 'DARK' ? 'LIGHT' : 'DARK';
    toggleTheme();
    if (onPersistPreferences) {
      onPersistPreferences(nextTheme, fontScalePercent);
    }
  };

  const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const nextScale = Number(e.target.value);
    setFontScalePercent(nextScale);
    if (onPersistPreferences) {
      onPersistPreferences(theme, nextScale);
    }
  };

  const renderNavLinks = (closeOnSelect: boolean): React.ReactNode =>
    navItems.map((item) => {
      const isActive = item.id === activeNavId;
      return (
        <button
          key={item.id}
          type="button"
          data-testid={`nav-${item.id}`}
          onClick={() => {
            onSelectNav(item.id);
            if (closeOnSelect) {
              setMobileDrawerOpen(false);
            }
          }}
          className={`gt-btn ${isActive ? 'gt-btn-primary' : 'gt-btn-secondary'}`}
          style={{ width: '100%', justifyContent: 'space-between' }}
        >
          <span>{item.label}</span>
          {item.badge ? <span className="gt-badge gt-badge-info">{item.badge}</span> : null}
        </button>
      );
    });

  return (
    <div className="gt-app-shell" data-testid="app-shell">
      <header className="gt-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="gt-btn gt-btn-secondary"
            data-testid="mobile-drawer-toggle"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            aria-label="Alternar menu lateral"
          >
            ☰ Menu
          </button>
          <strong style={{ fontSize: '1.15rem' }}>{title}</strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <label
            htmlFor="font-scale-select"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
            }}
          >
            <span>Escala:</span>
            <select
              id="font-scale-select"
              data-testid="font-scale-select"
              className="gt-input"
              style={{ width: 'auto', padding: '0.35rem 0.6rem' }}
              value={fontScalePercent}
              onChange={handleScaleChange}
            >
              {FONT_SCALE_OPTIONS.map((scale) => (
                <option key={scale} value={scale}>
                  {scale}%
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            data-testid="theme-toggle-btn"
            className="gt-btn gt-btn-secondary"
            onClick={handleToggleTheme}
          >
            {theme === 'DARK' ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
          </button>

          {userSummary ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="gt-badge gt-badge-info" data-testid="user-role-badge">
                {userSummary.name} ({userSummary.role})
              </span>
              {onLogout ? (
                <button
                  type="button"
                  data-testid="logout-btn"
                  className="gt-btn gt-btn-danger"
                  onClick={onLogout}
                >
                  Sair
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {mobileDrawerOpen ? (
        <div
          className="gt-drawer-backdrop"
          data-testid="mobile-drawer-backdrop"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <aside
            className="gt-sidebar-mobile"
            onClick={(e) => e.stopPropagation()}
            aria-label="Navegação Mobile"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <strong>Navegação</strong>
              <button
                type="button"
                className="gt-btn gt-btn-secondary"
                onClick={() => setMobileDrawerOpen(false)}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {renderNavLinks(true)}
            </div>
          </aside>
        </div>
      ) : null}

      <div className="gt-layout-body">
        <aside className="gt-sidebar gt-sidebar-desktop" aria-label="Navegação Principal">
          {renderNavLinks(false)}
        </aside>
        <main className="gt-main-content">{children}</main>
      </div>
    </div>
  );
};
