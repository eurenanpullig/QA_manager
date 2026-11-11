import express from 'express';

import { AppError, buildRfcError } from './errors.js';
import { TestExecutionRepository } from './testRepository.js';

import type { ExecutionStatus, SuiteRunStatus, UserRole } from './db.js';
import type { EvidenceInput } from './testRepository.js';
import type { NextFunction, Request, Response } from 'express';

export const SERVICE_NAME = 'test-execution-service';

const PORT = Number(process.env.PORT ?? process.env.TEST_EXECUTION_SERVICE_PORT ?? 5003);
const VALID_ROLES = new Set<UserRole>(['ADM', 'LIDER_TESTES', 'QA', 'DEV']);
const VALID_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'SKIPPED',
]);

const repo = new TestExecutionRepository();
const app = express();

app.use(express.json());

function getUserContext(req: Request): { userId: string; userRole: UserRole } {
  const userId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];

  if (
    typeof userId !== 'string' ||
    typeof userRole !== 'string' ||
    !VALID_ROLES.has(userRole as UserRole)
  ) {
    throw new AppError(401, 'Missing or invalid authenticated user context headers.');
  }

  return { userId, userRole: userRole as UserRole };
}

function requireTestExecutionOrMutationRole(req: Request): {
  userId: string;
  userRole: UserRole;
} {
  const ctx = getUserContext(req);
  if (ctx.userRole !== 'LIDER_TESTES' && ctx.userRole !== 'QA') {
    throw new AppError(
      403,
      'Access denied. Only LIDER_TESTES and QA roles can create/edit scenarios, manage suites, or record test executions.',
      {
        allowedRoles: ['LIDER_TESTES', 'QA'],
        currentRole: ctx.userRole,
      },
    );
  }
  return ctx;
}

function requireLeaderRole(req: Request): { userId: string; userRole: UserRole } {
  const ctx = getUserContext(req);
  if (ctx.userRole !== 'LIDER_TESTES') {
    throw new AppError(
      403,
      'Access denied. Only LIDER_TESTES is authorized to supersede execution evidences.',
      {
        requiredRole: 'LIDER_TESTES',
        currentRole: ctx.userRole,
      },
    );
  }
  return ctx;
}

// Healthcheck
app.get(['/health', '/api/v1/tests/health'], (_req: Request, res: Response) => {
  res.status(200).json({ service: SERVICE_NAME, status: 'UP' });
});

// =============================================================================
// [2.5.1] Scenarios & Gherkin Version Snapshots
// =============================================================================
app.get('/api/v1/tests/scenarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const featureId =
      typeof req.query.feature_id === 'string' ? req.query.feature_id.trim() : undefined;
    const scenarios = await repo.listScenarios(featureId);
    res.status(200).json({ scenarios });
  } catch (err) {
    next(err);
  }
});

app.get('/api/v1/tests/scenarios/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const id = req.params.id ?? '';
    const found = await repo.findScenarioById(id);
    if (!found) {
      throw new AppError(404, 'Scenario not found or soft-deleted.', { id });
    }
    res.status(200).json(found);
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/tests/scenarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = requireTestExecutionOrMutationRole(req);
    const body = req.body as {
      feature_id?: unknown;
      title?: unknown;
      gherkin_text?: unknown;
      position?: unknown;
    };

    const featureId = typeof body.feature_id === 'string' ? body.feature_id.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const gherkinText = typeof body.gherkin_text === 'string' ? body.gherkin_text.trim() : '';
    const position = body.position !== undefined ? Number(body.position) : 0;

    if (!featureId || !title || !gherkinText) {
      throw new AppError(422, 'Required fields: feature_id, title, and gherkin_text.');
    }

    const created = await repo.createScenario({
      featureId,
      title,
      gherkinText,
      position: Number.isInteger(position) && position >= 0 ? position : 0,
      createdBy: userId,
    });

    res.status(201).json({
      message: 'Scenario created and initial Gherkin version snapshot recorded.',
      scenario: created.scenario,
      versionSnapshot: created.versionSnapshot,
    });
  } catch (err) {
    next(err);
  }
});

app.put('/api/v1/tests/scenarios/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = requireTestExecutionOrMutationRole(req);
    const id = req.params.id ?? '';
    const body = req.body as {
      title?: unknown;
      gherkin_text?: unknown;
      position?: unknown;
    };

    const updated = await repo.updateScenario(id, {
      title: typeof body.title === 'string' ? body.title.trim() : undefined,
      gherkinText: typeof body.gherkin_text === 'string' ? body.gherkin_text.trim() : undefined,
      position: typeof body.position === 'number' ? body.position : undefined,
      changedBy: userId,
    });

    res.status(200).json({
      message: updated.versionSnapshot
        ? 'Scenario updated and new Gherkin version snapshot appended.'
        : 'Scenario metadata updated.',
      scenario: updated.scenario,
      versionSnapshot: updated.versionSnapshot,
    });
  } catch (err) {
    next(err);
  }
});

app.delete(
  '/api/v1/tests/scenarios/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireTestExecutionOrMutationRole(req);
      const id = req.params.id ?? '';
      const deleted = await repo.softDeleteScenario(id);
      if (!deleted) {
        throw new AppError(404, 'Scenario not found or already soft-deleted.', { id });
      }
      res.status(200).json({ message: 'Scenario soft-deleted successfully.' });
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// [2.5.2] Dynamic Suites CRUD & Scenario Linking
// =============================================================================
app.get('/api/v1/tests/suites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const projectId =
      typeof req.query.project_id === 'string' ? req.query.project_id.trim() : undefined;
    const suites = await repo.listSuites(projectId);
    res.status(200).json({ suites });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/tests/suites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = requireTestExecutionOrMutationRole(req);
    const body = req.body as {
      project_id?: unknown;
      name?: unknown;
      description?: unknown;
      scenario_ids?: unknown;
    };

    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const scenarioIds = Array.isArray(body.scenario_ids)
      ? body.scenario_ids.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      : [];

    if (!projectId || !name) {
      throw new AppError(422, 'Required fields: project_id and name.');
    }

    const created = await repo.createSuite({
      projectId,
      name,
      description,
      scenarioIds,
      createdBy: userId,
    });

    res.status(201).json({
      message: 'Suite created successfully.',
      suite: created.suite,
      scenarioCount: created.scenarioCount,
    });
  } catch (err) {
    next(err);
  }
});

app.put(
  '/api/v1/tests/suites/:id/scenarios',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireTestExecutionOrMutationRole(req);
      const suiteId = req.params.id ?? '';
      const body = req.body as { scenario_ids?: unknown };

      if (!Array.isArray(body.scenario_ids)) {
        throw new AppError(422, 'scenario_ids array is required.');
      }

      const scenarioIds = body.scenario_ids.filter(
        (id): id is string => typeof id === 'string' && id.trim() !== '',
      );
      const count = await repo.updateSuiteScenarios(suiteId, scenarioIds);

      res.status(200).json({
        message: 'Suite scenarios updated sequentially.',
        scenarioCount: count,
      });
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// [2.5.3 & 2.5.6] Suite Runs & Interrupted Run Resume
// =============================================================================
app.post(
  '/api/v1/tests/suites/:id/run',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = requireTestExecutionOrMutationRole(req);
      const suiteId = req.params.id ?? '';
      const initialized = await repo.initializeSuiteRun(suiteId, userId);

      res.status(201).json({
        message: 'Suite run initialized successfully.',
        suiteRun: initialized.suiteRun,
        stack: initialized.stack,
        stability: initialized.stability,
      });
    } catch (err) {
      next(err);
    }
  },
);

app.patch(
  '/api/v1/tests/suites/runs/:run_id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireTestExecutionOrMutationRole(req);
      const runId = req.params.run_id ?? '';
      const body = req.body as { status?: unknown };
      const status = typeof body.status === 'string' ? (body.status as SuiteRunStatus) : undefined;

      if (status !== 'IN_PROGRESS' && status !== 'INTERRUPTED' && status !== 'COMPLETED') {
        throw new AppError(422, 'status must be IN_PROGRESS, INTERRUPTED, or COMPLETED.');
      }

      const updated = await repo.updateSuiteRunStatus(runId, status);
      res.status(200).json({
        message: `Suite run marked as ${status}.`,
        suiteRun: updated,
      });
    } catch (err) {
      next(err);
    }
  },
);

const handleResumeSuiteRun = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    getUserContext(req);
    const runId = req.params.run_id ?? '';
    const resumed = await repo.resumeSuiteRun(runId);

    res.status(200).json({
      message: 'Suite run state and pending scenario stack retrieved.',
      suiteRun: resumed.suiteRun,
      stack: resumed.stack,
      pendingStack: resumed.pendingStack,
      stability: resumed.stability,
    });
  } catch (err) {
    next(err);
  }
};

app.get('/api/v1/tests/suites/runs/:run_id/resume', handleResumeSuiteRun);
app.post('/api/v1/tests/suites/runs/:run_id/resume', handleResumeSuiteRun);

// =============================================================================
// [2.5.4] Immutable Append-Only Test Executions
// =============================================================================
app.get('/api/v1/tests/executions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const executions = await repo.listRecentExecutions(Number.isFinite(limit) ? limit : 50);
    res.status(200).json({ executions });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/tests/executions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = requireTestExecutionOrMutationRole(req);
    const body = req.body as {
      scenario_id?: unknown;
      suite_run_id?: unknown;
      status?: unknown;
      duration_ms?: unknown;
      rationale?: unknown;
      evidences?: unknown;
    };

    const scenarioId = typeof body.scenario_id === 'string' ? body.scenario_id.trim() : '';
    const suiteRunId = typeof body.suite_run_id === 'string' ? body.suite_run_id.trim() : null;
    const status =
      typeof body.status === 'string' ? (body.status.toUpperCase() as ExecutionStatus) : undefined;
    const durationMs = body.duration_ms !== undefined ? Number(body.duration_ms) : 0;
    const rationale = typeof body.rationale === 'string' ? body.rationale : null;

    if (!scenarioId || !status || !VALID_EXECUTION_STATUSES.has(status)) {
      throw new AppError(
        422,
        'Required fields: scenario_id and valid status (IN_PROGRESS | PASSED | FAILED | BLOCKED | SKIPPED).',
      );
    }

    const rawEvidences = Array.isArray(body.evidences) ? body.evidences : [];
    const evidences: EvidenceInput[] = [];

    for (const item of rawEvidences) {
      const ev = item as {
        file_path?: unknown;
        file_type?: unknown;
        file_size_bytes?: unknown;
      };
      if (
        typeof ev.file_path !== 'string' ||
        typeof ev.file_type !== 'string' ||
        typeof ev.file_size_bytes !== 'number'
      ) {
        throw new AppError(
          422,
          'Each evidence item must contain file_path, file_type, and numeric file_size_bytes.',
        );
      }
      evidences.push({
        file_path: ev.file_path,
        file_type: ev.file_type,
        file_size_bytes: ev.file_size_bytes,
      });
    }

    const created = await repo.createExecution({
      scenarioId,
      suiteRunId,
      status,
      durationMs: Number.isInteger(durationMs) && durationMs >= 0 ? durationMs : 0,
      rationale,
      evidences,
      executedBy: userId,
    });

    res.status(201).json({
      message: 'Immutable test execution recorded successfully.',
      execution: created.execution,
      evidences: created.evidences,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/v1/tests/executions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const id = req.params.id ?? '';
    const found = await repo.getExecutionWithEvidences(id);
    if (!found) {
      throw new AppError(404, 'Execution not found.', { id });
    }
    res.status(200).json(found);
  } catch (err) {
    next(err);
  }
});

// Strictly forbid mutating or deleting past executions (Append-only ledger)
app.put('/api/v1/tests/executions/:id', (_req: Request, _res: Response, next: NextFunction) => {
  next(
    new AppError(
      405,
      'Execution records are immutable and append-only. Past execution status cannot be altered.',
    ),
  );
});

app.delete('/api/v1/tests/executions/:id', (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(403, 'Hard or soft deletion of test execution records is strictly forbidden.'));
});

// =============================================================================
// [2.5.5] Leader Evidence Superseding & Audit Trail
// =============================================================================
app.patch(
  '/api/v1/tests/executions/:id/evidences',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = requireLeaderRole(req);
      const executionId = req.params.id ?? '';
      const body = req.body as {
        old_evidence_id?: unknown;
        file_path?: unknown;
        file_type?: unknown;
        file_size_bytes?: unknown;
        comment_audit?: unknown;
      };

      const filePath = typeof body.file_path === 'string' ? body.file_path.trim() : '';
      const fileType = typeof body.file_type === 'string' ? body.file_type.trim() : '';
      const fileSizeBytes = Number(body.file_size_bytes);
      const commentAudit = typeof body.comment_audit === 'string' ? body.comment_audit : '';
      const oldEvidenceId =
        typeof body.old_evidence_id === 'string' ? body.old_evidence_id.trim() : undefined;

      if (!filePath || !fileType || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
        throw new AppError(
          422,
          'Required fields for evidence replacement: file_path, file_type, file_size_bytes, and comment_audit (>= 70 chars).',
        );
      }

      const result = await repo.supersedeExecutionEvidence({
        executionId,
        oldEvidenceId,
        newEvidence: {
          file_path: filePath,
          file_type: fileType,
          file_size_bytes: fileSizeBytes,
        },
        commentAudit,
        leaderUserId: userId,
      });

      res.status(200).json({
        message:
          'Execution evidence superseded with full audit trail. Original execution status remains unchanged.',
        execution: result.execution,
        deactivatedCount: result.deactivatedCount,
        newEvidence: result.newEvidence,
        auditTrail: result.auditTrail,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Global RFC Error Handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildRfcError(err.statusCode, err.message, err.details));
    return;
  }

  const fallbackMessage =
    err instanceof Error ? err.message : 'An unexpected error occurred in test-execution-service.';
  res.status(500).json(buildRfcError(500, fallbackMessage, { path: req.originalUrl }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.info(`[${SERVICE_NAME}] Listening on port ${PORT}`);
});
