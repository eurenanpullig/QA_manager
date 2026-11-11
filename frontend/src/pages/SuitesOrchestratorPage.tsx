import React, { useCallback, useEffect, useState } from 'react';

import { GherkinHighlightPreview } from '../components/GherkinHighlightPreview.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiClient, ApiClientError } from '../services/apiClient.js';

export type ExecutionStatus = 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';

export interface UploadedEvidenceDto {
  file_path: string;
  file_size_bytes: number;
  file_type: string;
}

export interface SuiteStackScenarioItem {
  scenario_id: string;
  execution_order: number;
  title: string;
  gherkin_text: string;
  version: number;
  latest_scenario_version_id: string;
  execution_status: ExecutionStatus | 'IN_PROGRESS' | 'PENDING';
}

export interface SuiteStabilitySummary {
  totalScenarios: number;
  passedCount: number;
  stabilityRatioPercent: number;
  badge: 'ESTÁVEL' | 'INSTÁVEL';
}

interface SuiteDto {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
}

interface SuiteRunDto {
  id: string;
  suite_id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'INTERRUPTED';
  current_scenario_id: string | null;
}

interface ScenarioOption {
  id: string;
  title: string;
  gherkin_text: string;
  version: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // 30 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_RATIONALE_CHARS = 70;

export const SuitesOrchestratorPage: React.FC = () => {
  const { user } = useAuth();
  const canExecute = user?.role === 'LIDER_TESTES' || user?.role === 'QA';

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [allScenarios, setAllScenarios] = useState<ScenarioOption[]>([]);
  const [suites, setSuites] = useState<SuiteDto[]>([]);

  // Suite builder form
  const [suiteName, setSuiteName] = useState('');
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);

  // Active Suite Run state
  const [activeRun, setActiveRun] = useState<SuiteRunDto | null>(null);
  const [stack, setStack] = useState<SuiteStackScenarioItem[]>([]);
  const [stability, setStability] = useState<SuiteStabilitySummary | null>(null);
  const [lastInterruptedRunId, setLastInterruptedRunId] = useState<string>(() => {
    return localStorage.getItem('gt_last_suite_run_id') ?? '';
  });

  // Execution modal state machine
  const [execModalScenario, setExecModalScenario] = useState<SuiteStackScenarioItem | null>(null);
  const [execStatus, setExecStatus] = useState<ExecutionStatus>('PASSED');
  const [rationale, setRationale] = useState<string>('');
  const [uploadedEvidences, setUploadedEvidences] = useState<UploadedEvidenceDto[]>([]);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [lastExecutionId, setLastExecutionId] = useState<string | null>(() => {
    return localStorage.getItem('gt_last_execution_id');
  });

  const loadInitialData = useCallback(async (): Promise<void> => {
    const [projRes, scRes] = await Promise.all([
      apiClient.get<{ projects: ProjectOption[] }>('/projects'),
      apiClient.get<{ scenarios: ScenarioOption[] }>('/tests/scenarios'),
    ]);
    const projList = projRes.data.projects;
    setProjects(projList);
    setAllScenarios(scRes.data.scenarios);

    const firstProjId = projList[0]?.id ?? '';
    if (!selectedProjectId && firstProjId) {
      setSelectedProjectId(firstProjId);
    }
  }, [selectedProjectId]);

  const loadSuites = useCallback(async (projectId: string): Promise<void> => {
    if (!projectId) {
      return;
    }
    const res = await apiClient.get<{ suites: SuiteDto[] }>(
      `/tests/suites?project_id=${projectId}`,
    );
    setSuites(res.data.suites);
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (selectedProjectId) {
      void loadSuites(selectedProjectId);
    }
  }, [selectedProjectId, loadSuites]);

  const toggleScenarioInSuite = (scenarioId: string): void => {
    setSelectedScenarioIds((prev) =>
      prev.includes(scenarioId) ? prev.filter((id) => id !== scenarioId) : [...prev, scenarioId],
    );
  };

  const handleCreateSuite = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);

    if (!selectedProjectId || !suiteName.trim() || selectedScenarioIds.length === 0) {
      setFeedbackError('Informe o nome da suíte e selecione ao menos 1 cenário.');
      return;
    }

    const res = await apiClient.post<{ suite: SuiteDto }>('/tests/suites', {
      project_id: selectedProjectId,
      name: suiteName.trim(),
      scenario_ids: selectedScenarioIds,
    });
    setSuiteName('');
    setSelectedScenarioIds([]);
    setFeedbackSuccess(`Suíte "${res.data.suite.name}" criada com sucesso.`);
    await loadSuites(selectedProjectId);
  };

  const handleStartSuiteRun = async (suiteId: string): Promise<void> => {
    setFeedbackError(null);
    try {
      const res = await apiClient.post<{
        suiteRun: SuiteRunDto;
        stack: SuiteStackScenarioItem[];
        stability: SuiteStabilitySummary;
      }>(`/tests/suites/${suiteId}/run`);
      setActiveRun(res.data.suiteRun);
      setStack(res.data.stack);
      setStability(res.data.stability);
      setLastInterruptedRunId(res.data.suiteRun.id);
      localStorage.setItem('gt_last_suite_run_id', res.data.suiteRun.id);
    } catch (err) {
      setFeedbackError(err instanceof ApiClientError ? err.message : 'Falha ao iniciar suíte.');
    }
  };

  const handlePauseSuiteRun = async (): Promise<void> => {
    if (!activeRun) {
      return;
    }
    const res = await apiClient.patch<{ suiteRun: SuiteRunDto }>(
      `/tests/suites/runs/${activeRun.id}/status`,
      { status: 'INTERRUPTED' },
    );
    setActiveRun(res.data.suiteRun);
    setFeedbackSuccess(
      'Bateria de testes pausada (INTERRUPTED). Você pode retomá-la a qualquer momento.',
    );
  };

  const handleResumeSuiteRun = async (runIdToResume: string): Promise<void> => {
    if (!runIdToResume) {
      return;
    }
    setFeedbackError(null);
    try {
      const res = await apiClient.get<{
        suiteRun: SuiteRunDto;
        stack: SuiteStackScenarioItem[];
        stability: SuiteStabilitySummary;
      }>(`/tests/suites/runs/${runIdToResume}/resume`);
      setActiveRun(res.data.suiteRun);
      setStack(res.data.stack);
      setStability(res.data.stability);
      setFeedbackSuccess('Bateria de testes retomada a partir do ponto de parada.');
    } catch (err) {
      setFeedbackError(err instanceof ApiClientError ? err.message : 'Falha ao retomar suíte.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setFeedbackError(null);

    // [3.5.3] Client-side size quota validation before sending to storage-service
    const mime = file.type.toLowerCase();
    if (mime.startsWith('image/') && file.size > MAX_IMAGE_BYTES) {
      setFeedbackError('A imagem selecionada excede o limite máximo de 30 MB.');
      return;
    }
    if (mime.startsWith('video/') && file.size > MAX_VIDEO_BYTES) {
      setFeedbackError('O vídeo selecionado excede o limite máximo de 200 MB.');
      return;
    }
    if ((mime.startsWith('text/') || mime === 'application/json') && file.size > MAX_LOG_BYTES) {
      setFeedbackError('O arquivo de log excede o limite máximo de 10 MB.');
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiClient.post<UploadedEvidenceDto>('/storage/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedEvidences((prev) => [...prev, res.data]);
    } catch (err) {
      setFeedbackError(
        err instanceof ApiClientError ? err.message : 'Erro ao enviar arquivo de evidência.',
      );
    } finally {
      setUploadingFile(false);
    }
  };

  const openExecutionModal = (item: SuiteStackScenarioItem): void => {
    setExecModalScenario(item);
    setExecStatus('PASSED');
    setRationale('');
    setUploadedEvidences([]);
    setFeedbackError(null);
  };

  const requiresEvidence = execStatus === 'PASSED' || execStatus === 'FAILED';
  const requiresRationale = execStatus === 'BLOCKED' || execStatus === 'SKIPPED';
  const trimmedRationaleLength = rationale.trim().length;

  const isSubmitExecutionDisabled =
    uploadingFile ||
    (requiresEvidence && uploadedEvidences.length === 0) ||
    (requiresRationale && trimmedRationaleLength < MIN_RATIONALE_CHARS);

  const handleRecordExecution = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!execModalScenario) {
      return;
    }
    setFeedbackError(null);

    try {
      const res = await apiClient.post<{
        execution: { id: string; status: ExecutionStatus };
      }>('/tests/executions', {
        scenario_id: execModalScenario.scenario_id,
        suite_run_id: activeRun?.id ?? null,
        status: execStatus,
        duration_ms: 1200,
        rationale: requiresRationale ? rationale.trim() : null,
        evidences: uploadedEvidences,
      });

      const createdExecId = res.data.execution.id;
      setLastExecutionId(createdExecId);
      localStorage.setItem('gt_last_execution_id', createdExecId);
      setFeedbackSuccess(`Execução imutável registrada (${execStatus}) — ID: ${createdExecId}`);
      setExecModalScenario(null);

      if (activeRun) {
        await handleResumeSuiteRun(activeRun.id);
      }
    } catch (err) {
      setFeedbackError(err instanceof ApiClientError ? err.message : 'Falha ao gravar execução.');
    }
  };

  const completedCount = stack.filter((s) => s.execution_status !== 'PENDING').length;
  const progressPercent = stack.length > 0 ? Math.round((completedCount / stack.length) * 100) : 0;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      data-testid="suites-orchestrator-page"
    >
      {feedbackError ? (
        <div
          className="gt-card"
          data-testid="suites-error-banner"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          <strong>⚠️ {feedbackError}</strong>
        </div>
      ) : null}

      {feedbackSuccess ? (
        <div
          className="gt-card"
          data-testid="suites-success-banner"
          style={{ borderColor: 'var(--success)', color: 'var(--success)' }}
        >
          <strong>✓ {feedbackSuccess}</strong>
        </div>
      ) : null}

      {/* [3.5.1] Dynamic Suite Builder */}
      {canExecute ? (
        <div className="gt-card">
          <h2 style={{ marginTop: 0 }}>Montagem de Suíte Dinâmica de Testes</h2>
          <form
            onSubmit={(e) => void handleCreateSuite(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Projeto
                </label>
                <select
                  data-testid="suite-project-select"
                  className="gt-input"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Nome da Suíte Dinâmica
                </label>
                <input
                  data-testid="suite-name-input"
                  className="gt-input"
                  placeholder="Ex: Suíte Regressiva Release 1.0"
                  value={suiteName}
                  onChange={(e) => setSuiteName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <span style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>
                Selecionar Cenários para a Pilha Sequencial ({selectedScenarioIds.length}{' '}
                selecionado(s)):
              </span>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  maxHeight: '180px',
                  overflowY: 'auto',
                }}
              >
                {allScenarios.map((sc) => {
                  const checked = selectedScenarioIds.includes(sc.id);
                  return (
                    <label
                      key={sc.id}
                      data-testid={`suite-scenario-checkbox-${sc.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScenarioInSuite(sc.id)}
                      />
                      <span>
                        <strong>[v{sc.version}]</strong> {sc.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button type="submit" data-testid="create-suite-btn" className="gt-btn gt-btn-primary">
              + Criar Suíte Dinâmica
            </button>
          </form>
        </div>
      ) : null}

      {/* Suites List & Run/Resume Actions */}
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
          <h3 style={{ margin: 0 }}>Suítes Disponíveis ({suites.length})</h3>
          {lastInterruptedRunId ? (
            <button
              type="button"
              data-testid="resume-last-run-btn"
              className="gt-btn gt-btn-secondary"
              onClick={() => void handleResumeSuiteRun(lastInterruptedRunId)}
            >
              ⏯ Retomar Bateria ({lastInterruptedRunId.slice(0, 8)})
            </button>
          ) : null}
        </div>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.85rem' }}
        >
          {suites.map((suite) => (
            <div
              key={suite.id}
              data-testid={`suite-item-${suite.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <strong>{suite.name}</strong>
              {canExecute ? (
                <button
                  type="button"
                  data-testid={`run-suite-btn-${suite.id}`}
                  className="gt-btn gt-btn-primary"
                  onClick={() => void handleStartSuiteRun(suite.id)}
                >
                  ▶ Executar Bateria
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* [3.5.2, 3.5.4, 3.5.5] Active Suite Execution Stack, Progress Bar & Stability Badge */}
      {activeRun && stability ? (
        <div className="gt-card" data-testid="active-suite-run-panel">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '0.85rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>
                Bateria em Execução — Status: <code>{activeRun.status}</code>
              </h3>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Progresso: {completedCount}/{stack.length} ({progressPercent}%)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span
                data-testid="suite-stability-badge"
                className={`gt-badge ${
                  stability.badge === 'ESTÁVEL' ? 'gt-badge-success' : 'gt-badge-danger'
                }`}
              >
                Selo: {stability.badge} ({stability.stabilityRatioPercent}% PASSED)
              </span>

              {activeRun.status === 'IN_PROGRESS' && canExecute ? (
                <button
                  type="button"
                  data-testid="pause-suite-run-btn"
                  className="gt-btn gt-btn-secondary"
                  onClick={() => void handlePauseSuiteRun()}
                >
                  ⏸ Pausar Bateria
                </button>
              ) : null}
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              height: '12px',
              backgroundColor: 'var(--bg-elevated)',
              overflow: 'hidden',
              marginBottom: '1rem',
              border: '1px solid var(--border-color)',
            }}
          >
            <div
              data-testid="suite-progress-bar"
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {/* Sequential Scenario Stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {stack.map((item, idx) => (
              <div
                key={item.scenario_id}
                data-testid={`stack-scenario-${idx}`}
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <span className="gt-badge gt-badge-info">#{idx + 1}</span>{' '}
                  <strong>{item.title}</strong>{' '}
                  <span className="gt-badge gt-badge-warning">Snapshot v{item.version}</span>{' '}
                  <span
                    data-testid={`stack-scenario-status-${idx}`}
                    className={`gt-badge ${
                      item.execution_status === 'PASSED'
                        ? 'gt-badge-success'
                        : item.execution_status === 'FAILED'
                          ? 'gt-badge-danger'
                          : 'gt-badge-info'
                    }`}
                  >
                    {item.execution_status}
                  </span>
                </div>

                {canExecute ? (
                  <button
                    type="button"
                    data-testid={`open-exec-modal-btn-${idx}`}
                    className="gt-btn gt-btn-primary"
                    onClick={() => openExecutionModal(item)}
                  >
                    Registrar Execução
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* [3.5.3] Execution Recording Modal with State Machine */}
      {execModalScenario ? (
        <div
          className="gt-card"
          data-testid="execution-modal"
          style={{ border: '2px solid var(--primary)' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <h3 style={{ margin: 0 }}>
              Registrar Execução Imutável: {execModalScenario.title} (v{execModalScenario.version})
            </h3>
            <button
              type="button"
              className="gt-btn gt-btn-secondary"
              onClick={() => setExecModalScenario(null)}
            >
              ✕ Fechar
            </button>
          </div>

          <GherkinHighlightPreview gherkinText={execModalScenario.gherkin_text} />

          <form
            onSubmit={(e) => void handleRecordExecution(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}
          >
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                Status do Resultado:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'] as ExecutionStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    data-testid={`select-status-${st}`}
                    className={`gt-btn ${execStatus === st ? 'gt-btn-primary' : 'gt-btn-secondary'}`}
                    onClick={() => setExecStatus(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload Evidences Section */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                Anexar Evidência (Obrigatório para PASSED/FAILED — Imagens ≤ 30MB, Vídeos ≤ 200MB):
              </label>
              <input
                type="file"
                data-testid="evidence-file-input"
                className="gt-input"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/x-matroska,text/plain"
                onChange={(e) => void handleFileUpload(e)}
              />
              {uploadedEvidences.length > 0 ? (
                <div
                  data-testid="uploaded-evidences-list"
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}
                >
                  {uploadedEvidences.map((ev, i) => (
                    <span key={i} className="gt-badge gt-badge-success">
                      📎 {ev.file_path} ({ev.file_size_bytes} bytes)
                    </span>
                  ))}
                </div>
              ) : null}
              {requiresEvidence && uploadedEvidences.length === 0 ? (
                <p
                  data-testid="evidence-mandatory-warning"
                  style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: 'var(--warning)' }}
                >
                  ⚠️ Anexe no mínimo 1 evidência para habilitar a gravação de {execStatus}.
                </p>
              ) : null}
            </div>

            {/* Mandatory Rationale >= 70 chars for BLOCKED or SKIPPED */}
            {requiresRationale ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.3rem',
                  }}
                >
                  <label htmlFor="exec-rationale" style={{ fontWeight: 600 }}>
                    Justificativa Obrigatória ({execStatus}):
                  </label>
                  <span
                    data-testid="rationale-char-counter"
                    className={`gt-badge ${
                      trimmedRationaleLength >= MIN_RATIONALE_CHARS
                        ? 'gt-badge-success'
                        : 'gt-badge-danger'
                    }`}
                  >
                    {trimmedRationaleLength} / {MIN_RATIONALE_CHARS} caracteres mínimos
                  </span>
                </div>
                <textarea
                  id="exec-rationale"
                  data-testid="exec-rationale-textarea"
                  className="gt-input"
                  rows={3}
                  placeholder="Descreva detalhadamente o motivo técnico do bloqueio ou pulo do cenário (mínimo 70 caracteres)..."
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
              </div>
            ) : null}

            <button
              type="submit"
              data-testid="submit-execution-btn"
              className="gt-btn gt-btn-primary"
              disabled={isSubmitExecutionDisabled}
            >
              Gravar Execução Imutável ({execStatus})
            </button>
          </form>
        </div>
      ) : null}

      {lastExecutionId ? (
        <div className="gt-card" data-testid="last-execution-reference">
          <span>Última Execução Gravada ID: </span>
          <code data-testid="last-execution-id-code">{lastExecutionId}</code>
        </div>
      ) : null}
    </div>
  );
};
