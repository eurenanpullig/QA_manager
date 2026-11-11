import React, { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../hooks/useAuth.js';
import { useDeferredOrderSync } from '../hooks/useDeferredOrderSync.js';
import { apiClient } from '../services/apiClient.js';

export interface ScenarioTreeNode {
  id: string;
  feature_id: string;
  title: string;
  gherkin_text: string;
  version: number;
  position: number;
}

export interface FeatureTreeNode {
  id: string;
  page_id: string;
  name: string;
  description: string | null;
  position: number;
  scenarios: ScenarioTreeNode[];
}

export interface PageTreeNode {
  id: string;
  module_id: string;
  name: string;
  description: string | null;
  position: number;
  features: FeatureTreeNode[];
}

export interface ModuleTreeNode {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  position: number;
  pages: PageTreeNode[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
}

export interface ProjectTree extends ProjectSummary {
  modules: ModuleTreeNode[];
}

export interface HierarchyPageProps {
  onSelectFeatureForGherkin?: (feature: {
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  }) => void;
}

export const HierarchyPage: React.FC<HierarchyPageProps> = ({ onSelectFeatureForGherkin }) => {
  const { user } = useAuth();
  const { pendingCount, lastSyncedAt, queueBatchOrder, flushPendingOrder } = useDeferredOrderSync();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [tree, setTree] = useState<ProjectTree | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Mobile drill-down state
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Creation modal / form states
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  const [nodeModal, setNodeModal] = useState<{
    type: 'MODULE' | 'PAGE' | 'FEATURE';
    parentId: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canMutateProjectRoot = user?.role === 'LIDER_TESTES';
  const canMutateHierarchy = user?.role === 'LIDER_TESTES' || user?.role === 'QA';

  const loadProjects = useCallback(async (): Promise<void> => {
    const res = await apiClient.get<{ projects: ProjectSummary[] }>('/projects');
    const list = res.data.projects;
    setProjects(list);
    if (list.length > 0 && !selectedProjectId) {
      setSelectedProjectId(list[0].id);
    }
  }, [selectedProjectId]);

  const loadTree = useCallback(async (projectId: string): Promise<void> => {
    if (!projectId) {
      setTree(null);
      return;
    }
    const res = await apiClient.get<{ tree: ProjectTree }>(`/projects/${projectId}/tree`);
    setTree(res.data.tree);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      void loadTree(selectedProjectId);
    }
  }, [selectedProjectId, loadTree]);

  const handleCreateProject = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      return;
    }
    const res = await apiClient.post<{ project: ProjectSummary }>('/projects', {
      name: newProjectName.trim(),
      description: newProjectDesc.trim() || null,
    });
    setNewProjectName('');
    setNewProjectDesc('');
    setStatusMessage(`Projeto "${res.data.project.name}" criado com sucesso.`);
    await loadProjects();
    setSelectedProjectId(res.data.project.id);
  };

  const handleDeleteProject = async (projectId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}`);
    setStatusMessage('Projeto removido (Soft Delete).');
    setSelectedProjectId('');
    await loadProjects();
  };

  const handleCreateChildNode = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!nodeModal || !newNodeName.trim() || !selectedProjectId) {
      return;
    }

    if (nodeModal.type === 'MODULE') {
      await apiClient.post('/projects/modules', {
        project_id: nodeModal.parentId,
        name: newNodeName.trim(),
        position: tree?.modules.length ?? 0,
      });
    } else if (nodeModal.type === 'PAGE') {
      await apiClient.post('/projects/pages', {
        module_id: nodeModal.parentId,
        name: newNodeName.trim(),
        position: 0,
      });
    } else if (nodeModal.type === 'FEATURE') {
      await apiClient.post('/projects/features', {
        page_id: nodeModal.parentId,
        name: newNodeName.trim(),
        position: 0,
      });
    }

    setNewNodeName('');
    setNodeModal(null);
    setStatusMessage('Item adicionado na árvore hierárquica.');
    await loadTree(selectedProjectId);
  };

  const handleSoftDeleteNode = async (
    type: 'MODULE' | 'PAGE' | 'FEATURE',
    id: string,
  ): Promise<void> => {
    const endpoint =
      type === 'MODULE'
        ? `/projects/modules/${id}`
        : type === 'PAGE'
          ? `/projects/pages/${id}`
          : `/projects/features/${id}`;
    await apiClient.delete(endpoint);
    if (selectedProjectId) {
      await loadTree(selectedProjectId);
    }
  };

  const reorderModules = (fromIndex: number, toIndex: number): void => {
    if (!tree || fromIndex === toIndex || toIndex < 0 || toIndex >= tree.modules.length) {
      return;
    }
    const copy = [...tree.modules];
    const [moved] = copy.splice(fromIndex, 1);
    if (!moved) {
      return;
    }
    copy.splice(toIndex, 0, moved);

    const updatedModules = copy.map((m, idx) => ({ ...m, position: idx }));
    setTree({ ...tree, modules: updatedModules });

    queueBatchOrder(
      updatedModules.map((m) => ({
        entity_type: 'MODULE',
        id: m.id,
        position: m.position,
      })),
    );
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      data-testid="hierarchy-page"
    >
      {/* Deferred Drag-and-Drop Sync Status Bar */}
      <div
        className="gt-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <strong>
            Hierarquia Funcional de 4 Níveis (Projeto → Módulo → Página → Funcionalidade)
          </strong>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Motor Drag-and-Drop com Persistência Diferida (Buffer 5 min, <code>beforeunload</code> e
            renovação de token).
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span
            className={`gt-badge ${pendingCount > 0 ? 'gt-badge-warning' : 'gt-badge-success'}`}
            data-testid="dnd-buffer-badge"
          >
            {pendingCount > 0
              ? `Buffer Pendente: ${pendingCount} item(ns)`
              : 'Ordenação Sincronizada'}
          </span>
          {pendingCount > 0 && canMutateHierarchy ? (
            <button
              type="button"
              data-testid="dnd-flush-now-btn"
              className="gt-btn gt-btn-primary"
              onClick={() => void flushPendingOrder()}
            >
              Sincronizar Agora
            </button>
          ) : null}
          {lastSyncedAt ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Último sync: {new Date(lastSyncedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <div className="gt-badge gt-badge-info" data-testid="hierarchy-status-msg">
          {statusMessage}
        </div>
      ) : null}

      {/* Level 1: Project Selection & Creation (LIDER_TESTES only) */}
      <div className="gt-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: canMutateProjectRoot ? '1rem' : 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <label htmlFor="project-select" style={{ fontWeight: 600 }}>
              Projeto Ativo:
            </label>
            <select
              id="project-select"
              data-testid="project-select"
              className="gt-input"
              style={{ maxWidth: '360px' }}
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSelectedModuleId(null);
                setSelectedPageId(null);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {canMutateProjectRoot && selectedProjectId ? (
            <button
              type="button"
              data-testid="delete-project-btn"
              className="gt-btn gt-btn-danger"
              onClick={() => void handleDeleteProject(selectedProjectId)}
            >
              Excluir Projeto (Soft Delete)
            </button>
          ) : null}
        </div>

        {canMutateProjectRoot ? (
          <form
            onSubmit={(e) => void handleCreateProject(e)}
            data-testid="create-project-form"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <input
              data-testid="new-project-name-input"
              className="gt-input"
              placeholder="Nome do Novo Projeto (Exclusivo Líder)"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              required
            />
            <input
              data-testid="new-project-desc-input"
              className="gt-input"
              placeholder="Descrição do escopo"
              value={newProjectDesc}
              onChange={(e) => setNewProjectDesc(e.target.value)}
            />
            <button
              type="submit"
              data-testid="create-project-submit-btn"
              className="gt-btn gt-btn-primary"
            >
              + Criar Projeto Raiz
            </button>
          </form>
        ) : null}
      </div>

      {/* Modal/Inline Creator for Module / Page / Feature */}
      {nodeModal ? (
        <div className="gt-card" data-testid="hierarchy-node-modal">
          <h3 style={{ marginTop: 0 }}>Adicionar {nodeModal.type}</h3>
          <form
            onSubmit={(e) => void handleCreateChildNode(e)}
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}
          >
            <input
              data-testid="node-modal-name-input"
              className="gt-input"
              style={{ flex: 1 }}
              placeholder={`Nome do ${nodeModal.type}`}
              value={newNodeName}
              onChange={(e) => setNewNodeName(e.target.value)}
              required
            />
            <button
              type="submit"
              data-testid="node-modal-save-btn"
              className="gt-btn gt-btn-primary"
            >
              Salvar
            </button>
            <button
              type="button"
              className="gt-btn gt-btn-secondary"
              onClick={() => setNodeModal(null)}
            >
              Cancelar
            </button>
          </form>
        </div>
      ) : null}

      {/* Breadcrumb Navigation for Mobile Stacked Drill-Down */}
      {tree ? (
        <div className="gt-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span className="gt-badge gt-badge-info">📁 {tree.name}</span>
              {selectedModuleId ? (
                <button
                  type="button"
                  className="gt-btn gt-btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    setSelectedModuleId(null);
                    setSelectedPageId(null);
                  }}
                >
                  ← Todos os Módulos
                </button>
              ) : null}
              {selectedPageId ? (
                <button
                  type="button"
                  className="gt-btn gt-btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => setSelectedPageId(null)}
                >
                  ← Páginas
                </button>
              ) : null}
            </div>

            {canMutateHierarchy ? (
              <button
                type="button"
                data-testid="add-module-btn"
                className="gt-btn gt-btn-primary"
                onClick={() => setNodeModal({ type: 'MODULE', parentId: tree.id })}
              >
                + Novo Módulo
              </button>
            ) : null}
          </div>

          {/* Expandable Desktop Tree & Draggable Modules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {tree.modules.map((mod, modIdx) => (
              <div
                key={mod.id}
                data-testid={`module-node-${mod.id}`}
                draggable={canMutateHierarchy}
                onDragStart={() => setDraggedId(mod.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggedId) {
                    return;
                  }
                  const fromIdx = tree.modules.findIndex((m) => m.id === draggedId);
                  reorderModules(fromIdx, modIdx);
                  setDraggedId(null);
                }}
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="gt-badge gt-badge-info">Módulo #{mod.position + 1}</span>
                    <strong>{mod.name}</strong>
                  </div>

                  {canMutateHierarchy ? (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        data-testid={`move-up-module-${modIdx}`}
                        className="gt-btn gt-btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                        disabled={modIdx === 0}
                        onClick={() => reorderModules(modIdx, modIdx - 1)}
                      >
                        ↑ Subir
                      </button>
                      <button
                        type="button"
                        data-testid={`move-down-module-${modIdx}`}
                        className="gt-btn gt-btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                        disabled={modIdx === tree.modules.length - 1}
                        onClick={() => reorderModules(modIdx, modIdx + 1)}
                      >
                        ↓ Descer
                      </button>
                      <button
                        type="button"
                        data-testid={`add-page-btn-${mod.id}`}
                        className="gt-btn gt-btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => setNodeModal({ type: 'PAGE', parentId: mod.id })}
                      >
                        + Página
                      </button>
                      <button
                        type="button"
                        className="gt-btn gt-btn-danger"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => void handleSoftDeleteNode('MODULE', mod.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Pages inside Module */}
                <div
                  style={{
                    marginTop: '0.75rem',
                    paddingLeft: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                  }}
                >
                  {mod.pages.map((pg) => (
                    <div
                      key={pg.id}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div>
                          <span className="gt-badge gt-badge-success">Página</span>{' '}
                          <strong>{pg.name}</strong>
                        </div>
                        {canMutateHierarchy ? (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              data-testid={`add-feature-btn-${pg.id}`}
                              className="gt-btn gt-btn-secondary"
                              style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                              onClick={() => setNodeModal({ type: 'FEATURE', parentId: pg.id })}
                            >
                              + Funcionalidade
                            </button>
                            <button
                              type="button"
                              className="gt-btn gt-btn-danger"
                              style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                              onClick={() => void handleSoftDeleteNode('PAGE', pg.id)}
                            >
                              Excluir
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* Features inside Page */}
                      <div
                        style={{
                          marginTop: '0.6rem',
                          paddingLeft: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.45rem',
                        }}
                      >
                        {pg.features.map((feat) => (
                          <div
                            key={feat.id}
                            style={{
                              padding: '0.6rem 0.85rem',
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
                              <span className="gt-badge gt-badge-warning">Funcionalidade</span>{' '}
                              <strong>{feat.name}</strong>{' '}
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                ({feat.scenarios.length} cenário(s) Gherkin)
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              {onSelectFeatureForGherkin ? (
                                <button
                                  type="button"
                                  data-testid={`open-gherkin-editor-${feat.id}`}
                                  className="gt-btn gt-btn-primary"
                                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                                  onClick={() =>
                                    onSelectFeatureForGherkin({
                                      id: feat.id,
                                      name: feat.name,
                                      projectId: tree.id,
                                      projectName: tree.name,
                                    })
                                  }
                                >
                                  Abrir Editor Gherkin ({feat.scenarios.length})
                                </button>
                              ) : null}
                              {canMutateHierarchy ? (
                                <button
                                  type="button"
                                  className="gt-btn gt-btn-danger"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                                  onClick={() => void handleSoftDeleteNode('FEATURE', feat.id)}
                                >
                                  Excluir
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
