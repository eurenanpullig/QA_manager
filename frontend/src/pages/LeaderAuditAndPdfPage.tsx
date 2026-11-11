import { jsPDF } from 'jspdf';
import React, { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../hooks/useAuth.js';
import { apiClient, ApiClientError } from '../services/apiClient.js';

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Erro inesperado na comunicação com o servidor.';
}

interface ExecutionRecord {
  id: string;
  scenario_id: string;
  scenario_version_id: string;
  suite_run_id: string | null;
  status: 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';
  duration_ms: number;
  rationale: string | null;
  executed_by: string;
  executed_at: string;
  scenario_title?: string;
  active_evidence_count?: number;
  total_evidence_count?: number;
}

interface EvidenceRecord {
  id: string;
  execution_id: string;
  file_path: string;
  file_type: string;
  file_size_bytes: number;
  is_active: boolean;
  comment_audit: string | null;
  created_by: string;
  created_at: string;
}

interface ProjectNode {
  id: string;
  name: string;
  description: string | null;
}

interface ModuleStats {
  moduleName: string;
  scenarioCount: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
}

const MIN_AUDIT_COMMENT_LENGTH = 70;

export const LeaderAuditAndPdfPage: React.FC = () => {
  const { user } = useAuth();
  const isLeader = user?.role === 'LIDER_TESTES';

  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>('');
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [evidences, setEvidences] = useState<EvidenceRecord[]>([]);

  // Replacement form state (LIDER_TESTES only)
  const [uploadedReplacement, setUploadedReplacement] = useState<{
    file_path: string;
    file_type: string;
    file_size_bytes: number;
    original_name: string;
  } | null>(null);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [commentAudit, setCommentAudit] = useState<string>('');
  const [submittingAudit, setSubmittingAudit] = useState<boolean>(false);

  // PDF Report Generator State
  const [projects, setProjects] = useState<ProjectNode[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [reportScope, setReportScope] = useState<string>('Suíte Completa de Homologação');
  const [pdfGeneratedSummary, setPdfGeneratedSummary] = useState<string | null>(null);

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const loadExecutionDetails = useCallback(async (execId: string): Promise<void> => {
    if (!execId) return;
    try {
      const res = await apiClient.get<{
        execution: ExecutionRecord;
        evidences: EvidenceRecord[];
      }>(`/tests/executions/${execId}`);
      setSelectedExecution(res.data.execution);
      setEvidences(res.data.evidences);
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    }
  }, []);

  const loadInitialData = useCallback(async (): Promise<void> => {
    setErrorBanner(null);
    try {
      const [execRes, projRes] = await Promise.all([
        apiClient.get<{ executions: ExecutionRecord[] }>('/tests/executions?limit=50'),
        apiClient.get<{ projects: ProjectNode[] }>('/projects'),
      ]);

      const execList = execRes.data.executions;
      setExecutions(execList);

      const projList = projRes.data.projects;
      setProjects(projList);
      if (projList[0]) {
        setSelectedProjectId(projList[0].id);
      }

      const savedExecId = window.localStorage.getItem('gt_last_execution_id');
      const targetId =
        savedExecId && execList.some((e) => e.id === savedExecId)
          ? savedExecId
          : (execList[0]?.id ?? '');

      if (targetId) {
        setSelectedExecutionId(targetId);
        await loadExecutionDetails(targetId);
      }
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    }
  }, [loadExecutionDetails]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const handleSelectExecution = async (execId: string): Promise<void> => {
    setSelectedExecutionId(execId);
    setSuccessBanner(null);
    setErrorBanner(null);
    await loadExecutionDetails(execId);
  };

  const handleUploadReplacementFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setErrorBanner(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiClient.post<{
        file: {
          filename: string;
          originalName: string;
          mimeType: string;
          sizeBytes: number;
          filePath: string;
        };
      }>('/storage/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadedReplacement({
        file_path: res.data.file.filePath,
        file_type: res.data.file.mimeType,
        file_size_bytes: res.data.file.sizeBytes,
        original_name: res.data.file.originalName,
      });
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const trimmedAuditLength = commentAudit.trim().length;
  const canSubmitAudit =
    isLeader &&
    Boolean(selectedExecutionId) &&
    Boolean(uploadedReplacement) &&
    trimmedAuditLength >= MIN_AUDIT_COMMENT_LENGTH &&
    !submittingAudit &&
    !uploadingFile;

  const handleSupersedeEvidence = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canSubmitAudit || !uploadedReplacement) return;

    setSubmittingAudit(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const res = await apiClient.patch<{
        execution: ExecutionRecord;
        deactivatedCount: number;
        newEvidence: EvidenceRecord;
        auditTrail: EvidenceRecord[];
      }>(`/tests/executions/${selectedExecutionId}/evidences`, {
        file_path: uploadedReplacement.file_path,
        file_type: uploadedReplacement.file_type,
        file_size_bytes: uploadedReplacement.file_size_bytes,
        comment_audit: commentAudit.trim(),
      });

      setSelectedExecution(res.data.execution);
      setEvidences(res.data.auditTrail);
      setUploadedReplacement(null);
      setCommentAudit('');
      setSuccessBanner(
        `Evidência substituída com sucesso! ${res.data.deactivatedCount} evidência(s) anterior(es) arquivada(s) com trilha de auditoria intacta.`,
      );
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setSubmittingAudit(false);
    }
  };

  // [3.6.4] Client-Side PDF Export with jsPDF
  const handleGeneratePdfReport = (): void => {
    const project = projects.find((p) => p.id === selectedProjectId);
    const projectName = project?.name ?? 'Projeto Corporativo QA';
    const generatedAt = new Date().toLocaleString('pt-BR');

    const totalExecs = executions.length;
    const passedCount = executions.filter((e) => e.status === 'PASSED').length;
    const failedCount = executions.filter((e) => e.status === 'FAILED').length;
    const blockedCount = executions.filter((e) => e.status === 'BLOCKED').length;
    const skippedCount = executions.filter((e) => e.status === 'SKIPPED').length;
    const passRate = totalExecs > 0 ? Math.round((passedCount / totalExecs) * 100) : 100;
    const failRate = totalExecs > 0 ? Math.round((failedCount / totalExecs) * 100) : 0;

    // Group statistics for PDF summary
    const moduleStats: ModuleStats[] = [
      {
        moduleName: 'Execuções Consolidadas do Escopo',
        scenarioCount: totalExecs,
        passed: passedCount,
        failed: failedCount,
        blocked: blockedCount,
        skipped: skippedCount,
      },
    ];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Standardized Header
    doc.setFillColor(37, 99, 235);
    doc.rect(14, 14, 182, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('RELATORIO EXECUTIVO DE QUALIDADE (GESTOR DE TESTES)', 20, 25);
    doc.setFontSize(10);
    doc.text(`Projeto: ${projectName} | Escopo: ${reportScope}`, 20, 33);
    doc.text(`Data/Hora de Geracao: ${generatedAt}`, 20, 38);

    // Consolidated Metrics Section
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.text('1. Volumetria Total e Taxas Consolidadas', 14, 52);

    doc.setFontSize(10);
    doc.text(`Total de Execucoes Auditadas: ${totalExecs}`, 14, 60);
    doc.text(`Taxa de Sucesso (PASSED): ${passRate}% (${passedCount})`, 14, 66);
    doc.text(`Taxa de Falha (FAILED): ${failRate}% (${failedCount})`, 14, 72);
    doc.text(
      `Bloqueados (BLOCKED): ${blockedCount} | Ignorados (SKIPPED): ${skippedCount}`,
      14,
      78,
    );

    // Visual Progress Bar in PDF
    doc.setFillColor(226, 232, 240);
    doc.rect(14, 84, 182, 8, 'F');
    const greenWidth = Math.max(0, Math.min(182, Math.round((passRate / 100) * 182)));
    if (greenWidth > 0) {
      doc.setFillColor(22, 163, 74);
      doc.rect(14, 84, greenWidth, 8, 'F');
    }

    // Module Breakdown
    doc.setFontSize(13);
    doc.text('2. Detalhamento por Modulo e Trilha de Execucao', 14, 105);

    let currentY = 113;
    for (const mod of moduleStats) {
      doc.setFontSize(10);
      doc.text(
        `- ${mod.moduleName}: ${mod.scenarioCount} execucoes (PASSED: ${mod.passed}, FAILED: ${mod.failed}, BLOCKED: ${mod.blocked})`,
        16,
        currentY,
      );
      currentY += 8;
    }

    doc.save('relatorio-gestor-testes.pdf');
    setPdfGeneratedSummary(
      `PDF gerado no cliente para "${projectName}" (${reportScope}) em ${generatedAt} — Sucesso: ${passRate}% | Total: ${totalExecs} execuções.`,
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Client-side PDF Generator */}
      <section className="gt-card" data-testid="pdf-report-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
              Auditoria de Evidências & Exportação Executiva PDF
            </h2>
            <p
              style={{
                margin: '0.25rem 0 0',
                fontSize: '0.875rem',
                color: 'var(--gt-text-secondary)',
              }}
            >
              Substituição auditada exclusiva para Líder de Testes e geração de relatórios
              executivos no navegador (Client-Side jsPDF).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="gt-input"
              style={{ width: 'auto' }}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              data-testid="pdf-project-select"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              className="gt-input"
              style={{ width: '220px' }}
              value={reportScope}
              onChange={(e) => setReportScope(e.target.value)}
              placeholder="Escopo do relatório"
              data-testid="pdf-scope-input"
            />

            <button
              type="button"
              className="gt-btn gt-btn-primary"
              onClick={handleGeneratePdfReport}
              data-testid="export-pdf-btn"
            >
              Exportar Relatório PDF
            </button>
          </div>
        </div>

        {pdfGeneratedSummary ? (
          <div
            role="status"
            data-testid="pdf-generated-banner"
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--gt-radius-sm)',
              backgroundColor: 'rgba(22, 163, 74, 0.12)',
              color: 'var(--gt-success)',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            {pdfGeneratedSummary}
          </div>
        ) : null}
      </section>

      {errorBanner ? (
        <div
          role="alert"
          data-testid="audit-error-banner"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--gt-radius-sm)',
            backgroundColor: 'rgba(220, 38, 38, 0.12)',
            color: 'var(--gt-danger)',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {errorBanner}
        </div>
      ) : null}

      {successBanner ? (
        <div
          role="status"
          data-testid="audit-success-banner"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--gt-radius-sm)',
            backgroundColor: 'rgba(22, 163, 74, 0.12)',
            color: 'var(--gt-success)',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {successBanner}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Execution Selector & Audit Timeline */}
        <section
          className="gt-card"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label
              htmlFor="audit-execution-select"
              style={{ fontWeight: 600, fontSize: '0.875rem' }}
            >
              Selecionar Execução Imutável para Inspeção / Auditoria
            </label>
            <select
              id="audit-execution-select"
              className="gt-input"
              value={selectedExecutionId}
              onChange={(e) => void handleSelectExecution(e.target.value)}
              data-testid="audit-execution-select"
            >
              <option value="">-- Selecione uma execução --</option>
              {executions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  [{ex.status}] {ex.scenario_title ?? ex.scenario_id} —{' '}
                  {new Date(ex.executed_at).toLocaleString('pt-BR')}
                </option>
              ))}
            </select>
          </div>

          {selectedExecution ? (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--gt-radius-sm)',
                backgroundColor: 'var(--gt-bg-surface-elevated)',
                border: '1px solid var(--gt-border)',
                fontSize: '0.8125rem',
              }}
              data-testid="selected-execution-summary"
            >
              <div>
                <strong>ID da Execução:</strong> <code>{selectedExecution.id}</code>
              </div>
              <div style={{ marginTop: '0.25rem' }}>
                <strong>Status Imutável:</strong>{' '}
                <span className="gt-badge" data-testid="selected-execution-status">
                  {selectedExecution.status}
                </span>
              </div>
              {selectedExecution.rationale ? (
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Justificativa Original:</strong> {selectedExecution.rationale}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* [3.6.3] Visual Audit Timeline */}
          <div data-testid="audit-evidence-timeline">
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>
              Linha do Tempo de Evidências ({evidences.length})
            </h3>

            {evidences.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gt-text-secondary)' }}>
                Nenhuma evidência anexada a esta execução.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {evidences.map((ev) => (
                  <div
                    key={ev.id}
                    data-testid={`timeline-evidence-${ev.is_active ? 'active' : 'archived'}`}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--gt-radius-sm)',
                      border: ev.is_active
                        ? '2px solid var(--gt-success)'
                        : '1px dashed var(--gt-border)',
                      backgroundColor: ev.is_active
                        ? 'rgba(22, 163, 74, 0.06)'
                        : 'var(--gt-bg-surface-elevated)',
                      opacity: ev.is_active ? 1 : 0.78,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span
                        className="gt-badge"
                        style={{
                          backgroundColor: ev.is_active
                            ? 'rgba(22, 163, 74, 0.16)'
                            : 'rgba(100, 116, 139, 0.2)',
                          color: ev.is_active ? 'var(--gt-success)' : 'var(--gt-text-secondary)',
                        }}
                      >
                        {ev.is_active ? 'EVIDÊNCIA ATIVA' : 'ARQUIVADA (SUBSTITUÍDA)'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gt-text-secondary)' }}>
                        {new Date(ev.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem', fontWeight: 600 }}>
                      Arquivo: <code>{ev.file_path}</code> ({ev.file_type},{' '}
                      {Math.max(1, Math.round(ev.file_size_bytes / 1024))} KB)
                    </div>

                    {ev.comment_audit ? (
                      <div
                        data-testid="timeline-audit-comment"
                        style={{
                          marginTop: '0.45rem',
                          padding: '0.5rem',
                          borderRadius: 'var(--gt-radius-sm)',
                          backgroundColor: 'var(--gt-bg-surface)',
                          border: '1px solid var(--gt-border)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <strong>Parecer de Auditoria do Líder:</strong> {ev.comment_audit}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: [3.6.1 & 3.6.2] Leader-Only Evidence Superseding Form */}
        <section className="gt-card" data-testid="leader-audit-panel">
          <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>
            Substituição Auditada de Evidência (Exclusivo LIDER_TESTES)
          </h3>

          {!isLeader ? (
            <div
              role="note"
              data-testid="leader-only-lock-notice"
              style={{
                padding: '1rem',
                borderRadius: 'var(--gt-radius-sm)',
                backgroundColor: 'var(--gt-bg-surface-elevated)',
                border: '1px solid var(--gt-border)',
                color: 'var(--gt-text-secondary)',
                fontSize: '0.875rem',
              }}
            >
              Seu perfil atual (<strong>{user?.role}</strong>) possui permissão de leitura da trilha
              de auditoria e exportação de PDF. Apenas o perfil <strong>LIDER_TESTES</strong> pode
              substituir evidências mantendo o status original da execução inalterado.
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSupersedeEvidence(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
              data-testid="leader-supersede-form"
            >
              <div>
                <label
                  htmlFor="leader-evidence-file-input"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    marginBottom: '0.35rem',
                  }}
                >
                  1. Novo Arquivo de Evidência Substituta *
                </label>
                <input
                  id="leader-evidence-file-input"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.mp4,.webm,.txt,.log,.json"
                  onChange={(e) => void handleUploadReplacementFile(e)}
                  disabled={uploadingFile || !selectedExecutionId}
                  data-testid="leader-evidence-file-input"
                />
                {uploadedReplacement ? (
                  <div
                    data-testid="leader-uploaded-file-pill"
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.45rem 0.7rem',
                      borderRadius: 'var(--gt-radius-sm)',
                      backgroundColor: 'rgba(22, 163, 74, 0.12)',
                      color: 'var(--gt-success)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    Arquivo pronto: {uploadedReplacement.original_name} (
                    {uploadedReplacement.file_path})
                  </div>
                ) : null}
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.35rem',
                  }}
                >
                  <label
                    htmlFor="leader-audit-comment-input"
                    style={{ fontWeight: 600, fontSize: '0.875rem' }}
                  >
                    2. Justificativa de Auditoria (`comment_audit` mín. {MIN_AUDIT_COMMENT_LENGTH}{' '}
                    caracteres) *
                  </label>
                  <span
                    data-testid="leader-audit-char-counter"
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color:
                        trimmedAuditLength >= MIN_AUDIT_COMMENT_LENGTH
                          ? 'var(--gt-success)'
                          : 'var(--gt-danger)',
                    }}
                  >
                    {trimmedAuditLength} / {MIN_AUDIT_COMMENT_LENGTH} caracteres
                  </span>
                </div>
                <textarea
                  id="leader-audit-comment-input"
                  className="gt-input"
                  rows={4}
                  value={commentAudit}
                  onChange={(e) => setCommentAudit(e.target.value)}
                  placeholder="Descreva detalhadamente o motivo técnico/regulatório da substituição da evidência (mínimo 70 caracteres)..."
                  data-testid="leader-audit-comment-input"
                />
              </div>

              <button
                type="submit"
                className="gt-btn gt-btn-primary"
                disabled={!canSubmitAudit}
                data-testid="leader-supersede-submit-btn"
              >
                {submittingAudit
                  ? 'Registrando Substituição Auditada...'
                  : 'Substituir Evidência e Arquivar Anterior'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
