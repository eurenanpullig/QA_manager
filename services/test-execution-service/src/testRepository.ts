import { MIN_AUDIT_COMMENT_LENGTH, MIN_RATIONALE_LENGTH, pool } from './db.js';
import { AppError } from './errors.js';

import type {
  EvidenceRecord,
  ExecutionRecord,
  ExecutionStatus,
  ScenarioRecord,
  ScenarioVersionRecord,
  SuiteRecord,
  SuiteRunRecord,
  SuiteRunStatus,
} from './db.js';

export interface EvidenceInput {
  file_path: string;
  file_type: string;
  file_size_bytes: number;
}

export interface SuiteStackScenarioItem {
  scenario_id: string;
  execution_order: number;
  title: string;
  gherkin_text: string;
  version: number;
  latest_scenario_version_id: string;
  execution_status: ExecutionStatus | 'PENDING';
}

export interface SuiteStabilitySummary {
  totalScenarios: number;
  passedCount: number;
  stabilityRatioPercent: number;
  badge: 'ESTÁVEL' | 'INSTÁVEL';
}

export class TestExecutionRepository {
  // ===========================================================================
  // [2.5.1] Scenarios & Atomic Gherkin Version Snapshots
  // ===========================================================================
  public async listScenarios(featureId?: string): Promise<ScenarioRecord[]> {
    if (featureId) {
      const res = await pool.query<ScenarioRecord>(
        'SELECT * FROM scenarios WHERE feature_id = $1 AND deleted_at IS NULL ORDER BY position ASC, created_at ASC',
        [featureId],
      );
      return res.rows;
    }
    const res = await pool.query<ScenarioRecord>(
      'SELECT * FROM scenarios WHERE deleted_at IS NULL ORDER BY position ASC, created_at ASC',
    );
    return res.rows;
  }

  public async findScenarioById(id: string): Promise<{
    scenario: ScenarioRecord;
    versions: ScenarioVersionRecord[];
  } | null> {
    const scRes = await pool.query<ScenarioRecord>(
      'SELECT * FROM scenarios WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [id],
    );
    const scenario = scRes.rows[0];
    if (!scenario) {
      return null;
    }

    const verRes = await pool.query<ScenarioVersionRecord>(
      'SELECT * FROM scenario_versions WHERE scenario_id = $1 ORDER BY version_number DESC',
      [id],
    );

    return { scenario, versions: verRes.rows };
  }

  public async createScenario(input: {
    featureId: string;
    title: string;
    gherkinText: string;
    position: number;
    createdBy: string;
  }): Promise<{ scenario: ScenarioRecord; versionSnapshot: ScenarioVersionRecord }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const featCheck = await client.query(
        'SELECT id FROM features WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [input.featureId],
      );
      if (featCheck.rowCount === 0) {
        throw new AppError(404, 'Parent feature not found or soft-deleted.', {
          feature_id: input.featureId,
        });
      }

      const scRes = await client.query<ScenarioRecord>(
        `INSERT INTO scenarios (feature_id, title, gherkin_text, version, position, created_by)
         VALUES ($1, $2, $3, 1, $4, $5)
         RETURNING *`,
        [input.featureId, input.title, input.gherkinText, input.position, input.createdBy],
      );
      const scenario = scRes.rows[0];
      if (!scenario) {
        throw new Error('Failed to insert scenario.');
      }

      const verRes = await client.query<ScenarioVersionRecord>(
        `INSERT INTO scenario_versions (scenario_id, version_number, gherkin_text, changed_by)
         VALUES ($1, 1, $2, $3)
         RETURNING *`,
        [scenario.id, input.gherkinText, input.createdBy],
      );
      const versionSnapshot = verRes.rows[0];
      if (!versionSnapshot) {
        throw new Error('Failed to insert initial scenario version snapshot.');
      }

      await client.query('COMMIT');
      return { scenario, versionSnapshot };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async updateScenario(
    scenarioId: string,
    input: {
      title?: string;
      gherkinText?: string;
      position?: number;
      changedBy: string;
    },
  ): Promise<{
    scenario: ScenarioRecord;
    versionSnapshot: ScenarioVersionRecord | null;
  }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentRes = await client.query<ScenarioRecord>(
        'SELECT * FROM scenarios WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [scenarioId],
      );
      const current = currentRes.rows[0];
      if (!current) {
        throw new AppError(404, 'Scenario not found or soft-deleted.', { id: scenarioId });
      }

      const gherkinMutated =
        input.gherkinText !== undefined && input.gherkinText.trim() !== current.gherkin_text.trim();
      const nextVersion = gherkinMutated ? current.version + 1 : current.version;
      const nextGherkin =
        input.gherkinText !== undefined ? input.gherkinText.trim() : current.gherkin_text;

      const updatedRes = await client.query<ScenarioRecord>(
        `UPDATE scenarios
         SET title = COALESCE($2, title),
             gherkin_text = $3,
             version = $4,
             position = COALESCE($5, position),
             updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [scenarioId, input.title ?? null, nextGherkin, nextVersion, input.position ?? null],
      );
      const updated = updatedRes.rows[0];
      if (!updated) {
        throw new Error('Failed to update scenario.');
      }

      let versionSnapshot: ScenarioVersionRecord | null = null;
      if (gherkinMutated) {
        const verRes = await client.query<ScenarioVersionRecord>(
          `INSERT INTO scenario_versions (scenario_id, version_number, gherkin_text, changed_by)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [scenarioId, nextVersion, nextGherkin, input.changedBy],
        );
        versionSnapshot = verRes.rows[0] ?? null;
      }

      await client.query('COMMIT');
      return { scenario: updated, versionSnapshot };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async softDeleteScenario(scenarioId: string): Promise<boolean> {
    const res = await pool.query(
      'UPDATE scenarios SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [scenarioId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // ===========================================================================
  // [2.5.2] Dynamic Suites CRUD & Sequential Scenario Linking
  // ===========================================================================
  public async listSuites(projectId?: string): Promise<SuiteRecord[]> {
    if (projectId) {
      const res = await pool.query<SuiteRecord>(
        'SELECT * FROM suites WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
        [projectId],
      );
      return res.rows;
    }
    const res = await pool.query<SuiteRecord>(
      'SELECT * FROM suites WHERE deleted_at IS NULL ORDER BY created_at DESC',
    );
    return res.rows;
  }

  public async createSuite(input: {
    projectId: string;
    name: string;
    description: string | null;
    scenarioIds: string[];
    createdBy: string;
  }): Promise<{ suite: SuiteRecord; scenarioCount: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const projCheck = await client.query(
        'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [input.projectId],
      );
      if (projCheck.rowCount === 0) {
        throw new AppError(404, 'Parent project not found or soft-deleted.', {
          project_id: input.projectId,
        });
      }

      const suiteRes = await client.query<SuiteRecord>(
        `INSERT INTO suites (project_id, name, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.projectId, input.name, input.description, input.createdBy],
      );
      const suite = suiteRes.rows[0];
      if (!suite) {
        throw new Error('Failed to create suite.');
      }

      for (let idx = 0; idx < input.scenarioIds.length; idx++) {
        const scenarioId = input.scenarioIds[idx];
        await client.query(
          `INSERT INTO suite_scenarios (suite_id, scenario_id, execution_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (suite_id, scenario_id) DO UPDATE SET execution_order = EXCLUDED.execution_order`,
          [suite.id, scenarioId, idx],
        );
      }

      await client.query('COMMIT');
      return { suite, scenarioCount: input.scenarioIds.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async updateSuiteScenarios(suiteId: string, scenarioIds: string[]): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const suiteCheck = await client.query(
        'SELECT id FROM suites WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [suiteId],
      );
      if (suiteCheck.rowCount === 0) {
        throw new AppError(404, 'Suite not found or soft-deleted.', { suite_id: suiteId });
      }

      await client.query('DELETE FROM suite_scenarios WHERE suite_id = $1', [suiteId]);
      for (let idx = 0; idx < scenarioIds.length; idx++) {
        await client.query(
          `INSERT INTO suite_scenarios (suite_id, scenario_id, execution_order)
           VALUES ($1, $2, $3)`,
          [suiteId, scenarioIds[idx], idx],
        );
      }

      await client.query('UPDATE suites SET updated_at = NOW() WHERE id = $1', [suiteId]);
      await client.query('COMMIT');
      return scenarioIds.length;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // [2.5.3 & 2.5.6] Suite Runs Initialization & Interrupted Run Resume
  // ===========================================================================
  private async buildSuiteRunStack(
    suiteId: string,
    runId: string,
  ): Promise<{
    stack: SuiteStackScenarioItem[];
    pendingStack: SuiteStackScenarioItem[];
    stability: SuiteStabilitySummary;
  }> {
    const rowsRes = await pool.query<{
      scenario_id: string;
      execution_order: number;
      title: string;
      gherkin_text: string;
      version: number;
      latest_scenario_version_id: string;
      execution_status: ExecutionStatus | null;
    }>(
      `SELECT
         ss.scenario_id,
         ss.execution_order,
         s.title,
         s.gherkin_text,
         s.version,
         sv.id AS latest_scenario_version_id,
         ex.status AS execution_status
       FROM suite_scenarios ss
       JOIN scenarios s ON s.id = ss.scenario_id AND s.deleted_at IS NULL
       JOIN scenario_versions sv ON sv.scenario_id = s.id AND sv.version_number = s.version
       LEFT JOIN LATERAL (
         SELECT status
         FROM executions e
         WHERE e.suite_run_id = $2 AND e.scenario_id = s.id
         ORDER BY e.created_at DESC
         LIMIT 1
       ) ex ON TRUE
       WHERE ss.suite_id = $1
       ORDER BY ss.execution_order ASC`,
      [suiteId, runId],
    );

    const stack: SuiteStackScenarioItem[] = rowsRes.rows.map((r) => ({
      scenario_id: r.scenario_id,
      execution_order: r.execution_order,
      title: r.title,
      gherkin_text: r.gherkin_text,
      version: r.version,
      latest_scenario_version_id: r.latest_scenario_version_id,
      execution_status: r.execution_status ?? 'PENDING',
    }));

    const pendingStack = stack.filter(
      (item) => item.execution_status === 'PENDING' || item.execution_status === 'IN_PROGRESS',
    );

    const totalScenarios = stack.length;
    const passedCount = stack.filter((item) => item.execution_status === 'PASSED').length;
    const stabilityRatioPercent =
      totalScenarios > 0 ? Math.round((passedCount / totalScenarios) * 10000) / 100 : 0;

    return {
      stack,
      pendingStack,
      stability: {
        totalScenarios,
        passedCount,
        stabilityRatioPercent,
        badge: stabilityRatioPercent >= 70 ? 'ESTÁVEL' : 'INSTÁVEL',
      },
    };
  }

  public async initializeSuiteRun(
    suiteId: string,
    executedBy: string,
  ): Promise<{
    suiteRun: SuiteRunRecord;
    stack: SuiteStackScenarioItem[];
    stability: SuiteStabilitySummary;
  }> {
    const suiteCheck = await pool.query<SuiteRecord>(
      'SELECT * FROM suites WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [suiteId],
    );
    if (suiteCheck.rowCount === 0) {
      throw new AppError(404, 'Suite not found or soft-deleted.', { suite_id: suiteId });
    }

    const scenariosRes = await pool.query<{ scenario_id: string }>(
      `SELECT ss.scenario_id
       FROM suite_scenarios ss
       JOIN scenarios s ON s.id = ss.scenario_id AND s.deleted_at IS NULL
       WHERE ss.suite_id = $1
       ORDER BY ss.execution_order ASC`,
      [suiteId],
    );

    if (scenariosRes.rows.length === 0) {
      throw new AppError(
        422,
        'Cannot start a suite run for an empty suite. Link at least one active scenario first.',
        { suite_id: suiteId, scenarioCount: 0 },
      );
    }

    const firstScenarioId = scenariosRes.rows[0]?.scenario_id ?? null;

    const runRes = await pool.query<SuiteRunRecord>(
      `INSERT INTO suite_runs (suite_id, status, current_scenario_id, executed_by)
       VALUES ($1, 'IN_PROGRESS', $2, $3)
       RETURNING *`,
      [suiteId, firstScenarioId, executedBy],
    );
    const suiteRun = runRes.rows[0];
    if (!suiteRun) {
      throw new Error('Failed to initialize suite run.');
    }

    const built = await this.buildSuiteRunStack(suiteId, suiteRun.id);
    return {
      suiteRun,
      stack: built.stack,
      stability: built.stability,
    };
  }

  public async updateSuiteRunStatus(
    runId: string,
    status: SuiteRunStatus,
  ): Promise<SuiteRunRecord> {
    const res = await pool.query<SuiteRunRecord>(
      `UPDATE suite_runs
       SET status = $2::varchar(32),
           finished_at = CASE WHEN $2::varchar(32) = 'COMPLETED' THEN NOW() ELSE finished_at END
       WHERE id = $1
       RETURNING *`,
      [runId, status],
    );
    const updated = res.rows[0];
    if (!updated) {
      throw new AppError(404, 'Suite run not found.', { run_id: runId });
    }
    return updated;
  }

  public async resumeSuiteRun(runId: string): Promise<{
    suiteRun: SuiteRunRecord;
    stack: SuiteStackScenarioItem[];
    pendingStack: SuiteStackScenarioItem[];
    stability: SuiteStabilitySummary;
  }> {
    const runRes = await pool.query<SuiteRunRecord>(
      'SELECT * FROM suite_runs WHERE id = $1 LIMIT 1',
      [runId],
    );
    const existingRun = runRes.rows[0];
    if (!existingRun) {
      throw new AppError(404, 'Suite run not found.', { run_id: runId });
    }

    const built = await this.buildSuiteRunStack(existingRun.suite_id, existingRun.id);
    const nextPendingScenarioId = built.pendingStack[0]?.scenario_id ?? null;
    const nextStatus: SuiteRunStatus = nextPendingScenarioId ? 'IN_PROGRESS' : 'COMPLETED';

    const updatedRunRes = await pool.query<SuiteRunRecord>(
      `UPDATE suite_runs
       SET status = $2::varchar(32),
           current_scenario_id = $3,
           finished_at = CASE WHEN $2::varchar(32) = 'COMPLETED' THEN COALESCE(finished_at, NOW()) ELSE NULL END
       WHERE id = $1
       RETURNING *`,
      [runId, nextStatus, nextPendingScenarioId],
    );

    return {
      suiteRun: updatedRunRes.rows[0] ?? existingRun,
      stack: built.stack,
      pendingStack: built.pendingStack,
      stability: built.stability,
    };
  }

  // ===========================================================================
  // [2.5.4] Immutable Append-Only Executions & Evidence/Rationale Governance
  // ===========================================================================
  public async createExecution(input: {
    scenarioId: string;
    suiteRunId: string | null;
    status: ExecutionStatus;
    durationMs: number;
    rationale: string | null;
    evidences: EvidenceInput[];
    executedBy: string;
  }): Promise<{ execution: ExecutionRecord; evidences: EvidenceRecord[] }> {
    // Business Rule 1: If status in ('PASSED', 'FAILED'), require >= 1 active evidence
    if ((input.status === 'PASSED' || input.status === 'FAILED') && input.evidences.length === 0) {
      throw new AppError(
        422,
        `At least 1 active evidence file is mandatory when recording execution status '${input.status}'.`,
        {
          field: 'evidences',
          status: input.status,
          receivedEvidenceCount: 0,
          requiredMinEvidences: 1,
        },
      );
    }

    // Business Rule 2: If status in ('BLOCKED', 'SKIPPED'), require rationale >= 70 characters
    const trimmedRationale = input.rationale ? input.rationale.trim() : '';
    if (input.status === 'BLOCKED' || input.status === 'SKIPPED') {
      if (trimmedRationale.length < MIN_RATIONALE_LENGTH) {
        throw new AppError(
          422,
          `Rationale must contain at least ${MIN_RATIONALE_LENGTH} characters for status ${input.status}.`,
          {
            field: 'rationale',
            status: input.status,
            receivedLength: trimmedRationale.length,
            requiredLength: MIN_RATIONALE_LENGTH,
          },
        );
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Resolve frozen current scenario_version_id at execution dispatch time
      const scVerRes = await client.query<{
        scenario_id: string;
        scenario_version_id: string;
        version_number: number;
      }>(
        `SELECT s.id AS scenario_id, sv.id AS scenario_version_id, sv.version_number
         FROM scenarios s
         JOIN scenario_versions sv ON sv.scenario_id = s.id AND sv.version_number = s.version
         WHERE s.id = $1 AND s.deleted_at IS NULL
         LIMIT 1`,
        [input.scenarioId],
      );
      const frozenVersion = scVerRes.rows[0];
      if (!frozenVersion) {
        throw new AppError(404, 'Scenario or its active version snapshot not found.', {
          scenario_id: input.scenarioId,
        });
      }

      const execRes = await client.query<ExecutionRecord>(
        `INSERT INTO executions (
           scenario_id,
           scenario_version_id,
           suite_run_id,
           status,
           duration_ms,
           rationale,
           executed_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.scenarioId,
          frozenVersion.scenario_version_id,
          input.suiteRunId,
          input.status,
          input.durationMs,
          trimmedRationale.length > 0 ? trimmedRationale : null,
          input.executedBy,
        ],
      );
      const execution = execRes.rows[0];
      if (!execution) {
        throw new Error('Failed to create immutable execution record.');
      }

      const insertedEvidences: EvidenceRecord[] = [];
      for (const ev of input.evidences) {
        const evRes = await client.query<EvidenceRecord>(
          `INSERT INTO execution_evidences (
             execution_id,
             file_path,
             file_type,
             file_size_bytes,
             is_active,
             created_by
           )
           VALUES ($1, $2, $3, $4, TRUE, $5)
           RETURNING *`,
          [execution.id, ev.file_path, ev.file_type, ev.file_size_bytes, input.executedBy],
        );
        if (evRes.rows[0]) {
          insertedEvidences.push(evRes.rows[0]);
        }
      }

      // If part of a suite_run, advance current_scenario_id pointer or complete suite_run
      if (input.suiteRunId) {
        const nextPendingRes = await client.query<{ scenario_id: string }>(
          `SELECT ss.scenario_id
           FROM suite_scenarios ss
           JOIN suite_runs sr ON sr.suite_id = ss.suite_id
           WHERE sr.id = $1
             AND NOT EXISTS (
               SELECT 1 FROM executions e
               WHERE e.suite_run_id = $1
                 AND e.scenario_id = ss.scenario_id
                 AND e.status IN ('PASSED', 'FAILED', 'BLOCKED', 'SKIPPED')
             )
           ORDER BY ss.execution_order ASC
           LIMIT 1`,
          [input.suiteRunId],
        );

        const nextScenarioId = nextPendingRes.rows[0]?.scenario_id ?? null;
        if (nextScenarioId) {
          await client.query(
            `UPDATE suite_runs
             SET current_scenario_id = $2, status = 'IN_PROGRESS'
             WHERE id = $1`,
            [input.suiteRunId, nextScenarioId],
          );
        } else {
          await client.query(
            `UPDATE suite_runs
             SET current_scenario_id = NULL, status = 'COMPLETED', finished_at = NOW()
             WHERE id = $1`,
            [input.suiteRunId],
          );
        }
      }

      await client.query('COMMIT');
      return { execution, evidences: insertedEvidences };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getExecutionWithEvidences(executionId: string): Promise<{
    execution: ExecutionRecord;
    evidences: EvidenceRecord[];
  } | null> {
    const execRes = await pool.query<ExecutionRecord>(
      'SELECT * FROM executions WHERE id = $1 LIMIT 1',
      [executionId],
    );
    const execution = execRes.rows[0];
    if (!execution) {
      return null;
    }

    const evRes = await pool.query<EvidenceRecord>(
      'SELECT * FROM execution_evidences WHERE execution_id = $1 ORDER BY created_at ASC',
      [executionId],
    );

    return { execution, evidences: evRes.rows };
  }

  public async listRecentExecutions(limit = 50): Promise<
    Array<
      ExecutionRecord & {
        scenario_title: string;
        active_evidence_count: number;
        total_evidence_count: number;
      }
    >
  > {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const res = await pool.query<
      ExecutionRecord & {
        scenario_title: string;
        active_evidence_count: string;
        total_evidence_count: string;
      }
    >(
      `SELECT e.*,
              COALESCE(s.title, 'Cenário') AS scenario_title,
              COUNT(ev.id) FILTER (WHERE ev.is_active = TRUE) AS active_evidence_count,
              COUNT(ev.id) AS total_evidence_count
       FROM executions e
       LEFT JOIN scenarios s ON s.id = e.scenario_id
       LEFT JOIN execution_evidences ev ON ev.execution_id = e.id
       GROUP BY e.id, s.title
       ORDER BY e.executed_at DESC
       LIMIT $1`,
      [safeLimit],
    );

    return res.rows.map((r) => ({
      ...r,
      active_evidence_count: Number(r.active_evidence_count),
      total_evidence_count: Number(r.total_evidence_count),
    }));
  }

  // ===========================================================================
  // [2.5.5] Leader Evidence Superseding & Audit Trail (PATCH /executions/:id/evidences)
  // ===========================================================================
  public async supersedeExecutionEvidence(input: {
    executionId: string;
    oldEvidenceId?: string;
    newEvidence: EvidenceInput;
    commentAudit: string;
    leaderUserId: string;
  }): Promise<{
    execution: ExecutionRecord;
    deactivatedCount: number;
    newEvidence: EvidenceRecord;
    auditTrail: EvidenceRecord[];
  }> {
    const trimmedAudit = input.commentAudit.trim();
    if (trimmedAudit.length < MIN_AUDIT_COMMENT_LENGTH) {
      throw new AppError(
        422,
        `Audit comment (comment_audit) must contain at least ${MIN_AUDIT_COMMENT_LENGTH} characters when superseding execution evidences.`,
        {
          field: 'comment_audit',
          receivedLength: trimmedAudit.length,
          requiredLength: MIN_AUDIT_COMMENT_LENGTH,
        },
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const execRes = await client.query<ExecutionRecord>(
        'SELECT * FROM executions WHERE id = $1 LIMIT 1',
        [input.executionId],
      );
      const execution = execRes.rows[0];
      if (!execution) {
        throw new AppError(404, 'Execution record not found.', {
          execution_id: input.executionId,
        });
      }

      // Deactivate previous evidence(s) while preserving history and recording comment_audit
      let deactivateRes;
      if (input.oldEvidenceId) {
        deactivateRes = await client.query(
          `UPDATE execution_evidences
           SET is_active = FALSE,
               comment_audit = $3
           WHERE execution_id = $1 AND id = $2 AND is_active = TRUE`,
          [input.executionId, input.oldEvidenceId, trimmedAudit],
        );
      } else {
        deactivateRes = await client.query(
          `UPDATE execution_evidences
           SET is_active = FALSE,
               comment_audit = $2
           WHERE execution_id = $1 AND is_active = TRUE`,
          [input.executionId, trimmedAudit],
        );
      }

      // Append new active evidence with the audit rationale
      const newEvRes = await client.query<EvidenceRecord>(
        `INSERT INTO execution_evidences (
           execution_id,
           file_path,
           file_type,
           file_size_bytes,
           is_active,
           comment_audit,
           created_by
         )
         VALUES ($1, $2, $3, $4, TRUE, $5, $6)
         RETURNING *`,
        [
          input.executionId,
          input.newEvidence.file_path,
          input.newEvidence.file_type,
          input.newEvidence.file_size_bytes,
          trimmedAudit,
          input.leaderUserId,
        ],
      );
      const inserted = newEvRes.rows[0];
      if (!inserted) {
        throw new Error('Failed to insert superseded evidence.');
      }

      const trailRes = await client.query<EvidenceRecord>(
        'SELECT * FROM execution_evidences WHERE execution_id = $1 ORDER BY created_at ASC',
        [input.executionId],
      );

      await client.query('COMMIT');
      return {
        execution, // Execution status remains strictly untouched/immutable
        deactivatedCount: deactivateRes.rowCount ?? 0,
        newEvidence: inserted,
        auditTrail: trailRes.rows,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
