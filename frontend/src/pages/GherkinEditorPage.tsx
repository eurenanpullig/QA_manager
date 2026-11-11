import React, { useCallback, useEffect, useState } from 'react';

import { GherkinHighlightPreview } from '../components/GherkinHighlightPreview.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiClient } from '../services/apiClient.js';

export interface ScenarioVersionDto {
  id: string;
  scenario_id: string;
  version_number: number;
  gherkin_text: string;
  changed_by: string;
  created_at: string;
}

export interface ScenarioDto {
  id: string;
  feature_id: string;
  title: string;
  gherkin_text: string;
  version: number;
  position: number;
  created_at: string;
  updated_at: string;
}

interface FeatureOption {
  id: string;
  name: string;
  page_id: string;
}

export interface GherkinEditorPageProps {
  initialFeature?: {
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  } | null;
}

const DEFAULT_GHERKIN_TEMPLATE = `Feature: Autenticação e Controle de Sessão
  Scenario: Login válido com emissão de cookie seguro
    Given que o usuário acessa a tela de login corporativo
    When informa credenciais válidas de QA
    And clica no botão de entrar
    Then o sistema autentica a sessão via HttpOnly Cookie
    And redireciona para o painel do projeto`;

export const GherkinEditorPage: React.FC<GherkinEditorPageProps> = ({ initialFeature }) => {
  const { user } = useAuth();
  const canMutate = user?.role === 'LIDER_TESTES' || user?.role === 'QA';

  const [features, setFeatures] = useState<FeatureOption[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>(initialFeature?.id ?? '');
  const [scenarios, setScenarios] = useState<ScenarioDto[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [versions, setVersions] = useState<ScenarioVersionDto[]>([]);
  const [compareVersionNumber, setCompareVersionNumber] = useState<number | null>(null);

  const [title, setTitle] = useState<string>('');
  const [gherkinText, setGherkinText] = useState<string>(DEFAULT_GHERKIN_TEMPLATE);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadFeatures = useCallback(async (): Promise<void> => {
    const res = await apiClient.get<{ features: FeatureOption[] }>('/projects/features');
    const list = res.data.features;
    setFeatures(list);
    if (!selectedFeatureId && list.length > 0 && list[0]) {
      setSelectedFeatureId(list[0].id);
    }
  }, [selectedFeatureId]);

  const loadScenarios = useCallback(async (featureId: string): Promise<void> => {
    if (!featureId) {
      setScenarios([]);
      return;
    }
    const res = await apiClient.get<{ scenarios: ScenarioDto[] }>(
      `/tests/scenarios?feature_id=${featureId}`,
    );
    setScenarios(res.data.scenarios);
  }, []);

  const loadScenarioDetails = useCallback(async (scenarioId: string): Promise<void> => {
    if (!scenarioId) {
      setVersions([]);
      return;
    }
    const res = await apiClient.get<{
      scenario: ScenarioDto;
      versions: ScenarioVersionDto[];
    }>(`/tests/scenarios/${scenarioId}`);
    setTitle(res.data.scenario.title);
    setGherkinText(res.data.scenario.gherkin_text);
    setVersions(res.data.versions);
    setCompareVersionNumber(res.data.versions[0]?.version_number ?? null);
  }, []);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  useEffect(() => {
    if (initialFeature?.id) {
      setSelectedFeatureId(initialFeature.id);
    }
  }, [initialFeature]);

  useEffect(() => {
    if (selectedFeatureId) {
      void loadScenarios(selectedFeatureId);
    }
  }, [selectedFeatureId, loadScenarios]);

  useEffect(() => {
    if (selectedScenarioId) {
      void loadScenarioDetails(selectedScenarioId);
    }
  }, [selectedScenarioId, loadScenarioDetails]);

  const handleSaveScenario = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedFeatureId || !title.trim() || !gherkinText.trim()) {
      return;
    }

    if (selectedScenarioId) {
      const res = await apiClient.put<{
        scenario: ScenarioDto;
        versionSnapshot: ScenarioVersionDto | null;
      }>(`/tests/scenarios/${selectedScenarioId}`, {
        title: title.trim(),
        gherkin_text: gherkinText,
      });
      setStatusMessage(
        `Cenário atualizado com sucesso (Versão atual: v${res.data.scenario.version}).`,
      );
      await loadScenarios(selectedFeatureId);
      await loadScenarioDetails(selectedScenarioId);
    } else {
      const res = await apiClient.post<{
        scenario: ScenarioDto;
        versionSnapshot: ScenarioVersionDto;
      }>('/tests/scenarios', {
        feature_id: selectedFeatureId,
        title: title.trim(),
        gherkin_text: gherkinText,
        position: scenarios.length,
      });
      setStatusMessage(`Novo cenário criado e snapshot v1 gravado.`);
      await loadScenarios(selectedFeatureId);
      setSelectedScenarioId(res.data.scenario.id);
    }
  };

  const handleStartNewScenario = (): void => {
    setSelectedScenarioId('');
    setTitle('');
    setGherkinText(DEFAULT_GHERKIN_TEMPLATE);
    setVersions([]);
    setCompareVersionNumber(null);
  };

  const comparedVersion = versions.find((v) => v.version_number === compareVersionNumber) ?? null;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      data-testid="gherkin-editor-page"
    >
      <div className="gt-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Editor BDD Gherkin em Tempo Real & Versionamento</h2>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                color: 'var(--text-secondary)',
                fontSize: '0.88rem',
              }}
            >
              Cada alteração no texto Gherkin gera automaticamente um snapshot imutável (
              <code>v1, v2, ...</code>) em <code>scenario_versions</code>.
            </p>
          </div>
          {canMutate ? (
            <button
              type="button"
              data-testid="new-scenario-btn"
              className="gt-btn gt-btn-secondary"
              onClick={handleStartNewScenario}
            >
              + Novo Cenário em Branco
            </button>
          ) : null}
        </div>

        {statusMessage ? (
          <div
            className="gt-badge gt-badge-success"
            data-testid="gherkin-save-feedback"
            style={{ marginTop: '0.75rem' }}
          >
            {statusMessage}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
            marginTop: '1rem',
          }}
        >
          <div>
            <label
              htmlFor="feature-select"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}
            >
              Funcionalidade Vinculada:
            </label>
            <select
              id="feature-select"
              data-testid="gherkin-feature-select"
              className="gt-input"
              value={selectedFeatureId}
              onChange={(e) => {
                setSelectedFeatureId(e.target.value);
                handleStartNewScenario();
              }}
            >
              {features.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="scenario-select"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}
            >
              Cenários da Funcionalidade ({scenarios.length}):
            </label>
            <select
              id="scenario-select"
              data-testid="gherkin-scenario-select"
              className="gt-input"
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
            >
              <option value="">-- Criar Novo Cenário --</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  [v{s.version}] {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Split Editor & Real-Time Syntax Highlighting */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        <form onSubmit={(e) => void handleSaveScenario(e)} className="gt-card">
          <h3 style={{ marginTop: 0 }}>
            {selectedScenarioId ? 'Editar Cenário Gherkin' : 'Criar Novo Cenário Gherkin'}
          </h3>

          <div style={{ marginBottom: '0.75rem' }}>
            <label
              htmlFor="scenario-title"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}
            >
              Título do Cenário
            </label>
            <input
              id="scenario-title"
              data-testid="scenario-title-input"
              className="gt-input"
              placeholder="Ex: Login válido com emissão de cookie HttpOnly"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canMutate}
              required
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label
              htmlFor="scenario-gherkin"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}
            >
              Especificação Gherkin (Feature / Scenario / Given / When / Then / And / Examples)
            </label>
            <textarea
              id="scenario-gherkin"
              data-testid="scenario-gherkin-textarea"
              className="gt-input"
              rows={10}
              style={{ fontFamily: 'monospace' }}
              value={gherkinText}
              onChange={(e) => setGherkinText(e.target.value)}
              disabled={!canMutate}
              required
            />
          </div>

          {canMutate ? (
            <button
              type="submit"
              data-testid="save-scenario-btn"
              className="gt-btn gt-btn-primary"
              style={{ width: '100%' }}
            >
              {selectedScenarioId
                ? 'Salvar Alterações e Gerar Snapshot de Versão'
                : 'Salvar Cenário (Snapshot v1)'}
            </button>
          ) : null}
        </form>

        <div
          className="gt-card"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Preview Sintático Gherkin em Tempo Real</h3>
            <span className="gt-badge gt-badge-info">BDD Live Parser</span>
          </div>
          <GherkinHighlightPreview gherkinText={gherkinText} />
        </div>
      </div>

      {/* Version History & Diff Viewer */}
      {versions.length > 0 ? (
        <div className="gt-card" data-testid="scenario-version-history">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <h3 style={{ margin: 0 }}>
              Histórico Imutável de Versões ({versions.length} snapshot(s))
            </h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {versions.map((ver) => (
                <button
                  key={ver.id}
                  type="button"
                  data-testid={`version-btn-v${ver.version_number}`}
                  className={`gt-btn ${
                    compareVersionNumber === ver.version_number
                      ? 'gt-btn-primary'
                      : 'gt-btn-secondary'
                  }`}
                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={() => setCompareVersionNumber(ver.version_number)}
                >
                  v{ver.version_number} ({new Date(ver.created_at).toLocaleTimeString()})
                </button>
              ))}
            </div>
          </div>

          {comparedVersion ? (
            <div>
              <div
                style={{
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Exibindo Snapshot congelado <strong>v{comparedVersion.version_number}</strong> (ID:{' '}
                <code>{comparedVersion.id}</code>)
              </div>
              <GherkinHighlightPreview gherkinText={comparedVersion.gherkin_text} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
