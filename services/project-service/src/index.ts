import express from 'express';

import { AppError, buildRfcError } from './errors.js';
import { HierarchyRepository } from './hierarchyRepository.js';

import type { HierarchyEntityType, UserRole } from './db.js';
import type { BatchOrderItem } from './hierarchyRepository.js';
import type { NextFunction, Request, Response } from 'express';

export const SERVICE_NAME = 'project-service';

const PORT = Number(process.env.PORT ?? process.env.PROJECT_SERVICE_PORT ?? 5002);
const VALID_ROLES = new Set<UserRole>(['ADM', 'LIDER_TESTES', 'QA', 'DEV']);
const VALID_ENTITY_TYPES = new Set<HierarchyEntityType>(['MODULE', 'PAGE', 'FEATURE', 'SCENARIO']);

const repo = new HierarchyRepository();
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

/**
 * RBAC Matrix (DSR 1.2):
 * - Project Root Metadata Edit/Delete: LIDER_TESTES only (ADM, QA, DEV -> 403 Forbidden)
 * - Modules / Pages / Features Mutation: LIDER_TESTES and QA only (ADM, DEV -> 403 Forbidden)
 * - Global / Project Visibility (GET): All authenticated roles (ADM, LIDER_TESTES, QA, DEV)
 */
function requireProjectRootMutationRole(req: Request): { userId: string; userRole: UserRole } {
  const ctx = getUserContext(req);
  if (ctx.userRole !== 'LIDER_TESTES') {
    throw new AppError(
      403,
      'Access denied. Only LIDER_TESTES is authorized to create, edit, or delete root projects.',
      {
        requiredRole: 'LIDER_TESTES',
        currentRole: ctx.userRole,
      },
    );
  }
  return ctx;
}

function requireHierarchyMutationRole(req: Request): { userId: string; userRole: UserRole } {
  const ctx = getUserContext(req);
  if (ctx.userRole !== 'LIDER_TESTES' && ctx.userRole !== 'QA') {
    throw new AppError(
      403,
      'Access denied. Only LIDER_TESTES and QA roles are authorized to mutate modules, pages, features, or hierarchy order.',
      {
        allowedRoles: ['LIDER_TESTES', 'QA'],
        currentRole: ctx.userRole,
      },
    );
  }
  return ctx;
}

// Healthcheck
app.get(['/health', '/api/v1/projects/health'], (_req: Request, res: Response) => {
  res.status(200).json({ service: SERVICE_NAME, status: 'UP' });
});

// =============================================================================
// [2.4.1] CRUD for Projects (Root Level - LIDER_TESTES only for mutations)
// =============================================================================
app.get('/api/v1/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const projects = await repo.listProjects();
    res.status(200).json({ projects });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = requireProjectRootMutationRole(req);
    const body = req.body as { name?: unknown; description?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;

    if (!name) {
      throw new AppError(422, 'Project name is required.', { field: 'name' });
    }

    const project = await repo.createProject({ name, description, createdBy: userId });
    res.status(201).json({ message: 'Project created successfully.', project });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// [2.4.4] Batch Drag-and-Drop Sync Order (POST /api/v1/projects/hierarchy/sync-order)
// =============================================================================
app.post(
  '/api/v1/projects/hierarchy/sync-order',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireHierarchyMutationRole(req);
      const body = req.body as { items?: unknown };

      if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new AppError(
          422,
          'Payload must contain a non-empty "items" array of { entity_type, id, position }.',
          { field: 'items' },
        );
      }

      const validatedItems: BatchOrderItem[] = [];
      for (const raw of body.items) {
        const entry = raw as { entity_type?: unknown; id?: unknown; position?: unknown };
        const entityType =
          typeof entry.entity_type === 'string'
            ? (entry.entity_type.toUpperCase() as HierarchyEntityType)
            : undefined;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        const position = Number(entry.position);

        if (
          !entityType ||
          !VALID_ENTITY_TYPES.has(entityType) ||
          !id ||
          !Number.isInteger(position) ||
          position < 0
        ) {
          throw new AppError(
            422,
            'Each item in batch sync must have valid entity_type (MODULE | PAGE | FEATURE | SCENARIO), UUID id, and non-negative integer position.',
            { invalidItem: raw },
          );
        }

        validatedItems.push({ entity_type: entityType, id, position });
      }

      const updatedCount = await repo.syncHierarchyOrder(validatedItems);
      res.status(200).json({
        message: 'Hierarchy positions synchronized transactionally.',
        updatedCount,
      });
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// [2.4.2] CRUD for Modules, Pages, and Features (LIDER_TESTES & QA mutate; DEV/ADM read)
// =============================================================================

// Modules
app.get('/api/v1/projects/modules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const projectId =
      typeof req.query.project_id === 'string' ? req.query.project_id.trim() : undefined;
    const modules = await repo.listModules(projectId);
    res.status(200).json({ modules });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/projects/modules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireHierarchyMutationRole(req);
    const body = req.body as {
      project_id?: unknown;
      name?: unknown;
      description?: unknown;
      position?: unknown;
    };
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const position = body.position !== undefined ? Number(body.position) : 0;

    if (!projectId || !name || !Number.isInteger(position) || position < 0) {
      throw new AppError(422, 'Required fields: project_id, name, and optional integer position.');
    }

    const moduleRecord = await repo.createModule({ projectId, name, description, position });
    res.status(201).json({ message: 'Module created successfully.', module: moduleRecord });
  } catch (err) {
    next(err);
  }
});

app.put('/api/v1/projects/modules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireHierarchyMutationRole(req);
    const id = req.params.id ?? '';
    const body = req.body as { name?: unknown; description?: unknown; position?: unknown };

    const updated = await repo.updateModule(id, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      description:
        body.description === null
          ? null
          : typeof body.description === 'string'
            ? body.description.trim()
            : undefined,
      position: typeof body.position === 'number' ? body.position : undefined,
    });

    if (!updated) {
      throw new AppError(404, 'Module not found or soft-deleted.', { id });
    }

    res.status(200).json({ message: 'Module updated successfully.', module: updated });
  } catch (err) {
    next(err);
  }
});

app.delete(
  '/api/v1/projects/modules/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireHierarchyMutationRole(req);
      const id = req.params.id ?? '';
      const deleted = await repo.softDeleteModule(id);
      if (!deleted) {
        throw new AppError(404, 'Module not found or already soft-deleted.', { id });
      }
      res.status(200).json({ message: 'Module soft-deleted successfully.' });
    } catch (err) {
      next(err);
    }
  },
);

// Pages
app.get('/api/v1/projects/pages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const moduleId =
      typeof req.query.module_id === 'string' ? req.query.module_id.trim() : undefined;
    const pages = await repo.listPages(moduleId);
    res.status(200).json({ pages });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/projects/pages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireHierarchyMutationRole(req);
    const body = req.body as {
      module_id?: unknown;
      name?: unknown;
      description?: unknown;
      position?: unknown;
    };
    const moduleId = typeof body.module_id === 'string' ? body.module_id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const position = body.position !== undefined ? Number(body.position) : 0;

    if (!moduleId || !name || !Number.isInteger(position) || position < 0) {
      throw new AppError(422, 'Required fields: module_id, name, and optional integer position.');
    }

    const pageRecord = await repo.createPage({ moduleId, name, description, position });
    res.status(201).json({ message: 'Page created successfully.', page: pageRecord });
  } catch (err) {
    next(err);
  }
});

app.put('/api/v1/projects/pages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireHierarchyMutationRole(req);
    const id = req.params.id ?? '';
    const body = req.body as { name?: unknown; description?: unknown; position?: unknown };

    const updated = await repo.updatePage(id, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      description:
        body.description === null
          ? null
          : typeof body.description === 'string'
            ? body.description.trim()
            : undefined,
      position: typeof body.position === 'number' ? body.position : undefined,
    });

    if (!updated) {
      throw new AppError(404, 'Page not found or soft-deleted.', { id });
    }

    res.status(200).json({ message: 'Page updated successfully.', page: updated });
  } catch (err) {
    next(err);
  }
});

app.delete(
  '/api/v1/projects/pages/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireHierarchyMutationRole(req);
      const id = req.params.id ?? '';
      const deleted = await repo.softDeletePage(id);
      if (!deleted) {
        throw new AppError(404, 'Page not found or already soft-deleted.', { id });
      }
      res.status(200).json({ message: 'Page soft-deleted successfully.' });
    } catch (err) {
      next(err);
    }
  },
);

// Features
app.get('/api/v1/projects/features', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const pageId = typeof req.query.page_id === 'string' ? req.query.page_id.trim() : undefined;
    const features = await repo.listFeatures(pageId);
    res.status(200).json({ features });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/projects/features', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireHierarchyMutationRole(req);
    const body = req.body as {
      page_id?: unknown;
      name?: unknown;
      description?: unknown;
      position?: unknown;
    };
    const pageId = typeof body.page_id === 'string' ? body.page_id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const position = body.position !== undefined ? Number(body.position) : 0;

    if (!pageId || !name || !Number.isInteger(position) || position < 0) {
      throw new AppError(422, 'Required fields: page_id, name, and optional integer position.');
    }

    const featureRecord = await repo.createFeature({ pageId, name, description, position });
    res.status(201).json({ message: 'Feature created successfully.', feature: featureRecord });
  } catch (err) {
    next(err);
  }
});

app.put(
  '/api/v1/projects/features/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireHierarchyMutationRole(req);
      const id = req.params.id ?? '';
      const body = req.body as { name?: unknown; description?: unknown; position?: unknown };

      const updated = await repo.updateFeature(id, {
        name: typeof body.name === 'string' ? body.name.trim() : undefined,
        description:
          body.description === null
            ? null
            : typeof body.description === 'string'
              ? body.description.trim()
              : undefined,
        position: typeof body.position === 'number' ? body.position : undefined,
      });

      if (!updated) {
        throw new AppError(404, 'Feature not found or soft-deleted.', { id });
      }

      res.status(200).json({ message: 'Feature updated successfully.', feature: updated });
    } catch (err) {
      next(err);
    }
  },
);

app.delete(
  '/api/v1/projects/features/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireHierarchyMutationRole(req);
      const id = req.params.id ?? '';
      const deleted = await repo.softDeleteFeature(id);
      if (!deleted) {
        throw new AppError(404, 'Feature not found or already soft-deleted.', { id });
      }
      res.status(200).json({ message: 'Feature soft-deleted successfully.' });
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// [2.4.5] Aggregated Hierarchy Tree & Single Project Endpoints
// =============================================================================
app.get('/api/v1/projects/:id/tree', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const projectId = req.params.id ?? '';
    const tree = await repo.getFullProjectTree(projectId);
    if (!tree) {
      throw new AppError(404, 'Project not found or soft-deleted.', { id: projectId });
    }
    res.status(200).json({ tree });
  } catch (err) {
    next(err);
  }
});

app.get('/api/v1/projects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    getUserContext(req);
    const id = req.params.id ?? '';
    const project = await repo.findProjectById(id);
    if (!project) {
      throw new AppError(404, 'Project not found or soft-deleted.', { id });
    }
    res.status(200).json({ project });
  } catch (err) {
    next(err);
  }
});

app.put('/api/v1/projects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireProjectRootMutationRole(req);
    const id = req.params.id ?? '';
    const body = req.body as { name?: unknown; description?: unknown };

    const updated = await repo.updateProject(id, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      description:
        body.description === null
          ? null
          : typeof body.description === 'string'
            ? body.description.trim()
            : undefined,
    });

    if (!updated) {
      throw new AppError(404, 'Project not found or soft-deleted.', { id });
    }

    res.status(200).json({ message: 'Project updated successfully.', project: updated });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/v1/projects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireProjectRootMutationRole(req);
    const id = req.params.id ?? '';
    const deleted = await repo.softDeleteProject(id);
    if (!deleted) {
      throw new AppError(404, 'Project not found or already soft-deleted.', { id });
    }
    res.status(200).json({ message: 'Project soft-deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// Global RFC Error Handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildRfcError(err.statusCode, err.message, err.details));
    return;
  }

  const fallbackMessage =
    err instanceof Error ? err.message : 'An unexpected error occurred in project-service.';
  res.status(500).json(buildRfcError(500, fallbackMessage, { path: req.originalUrl }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.info(`[${SERVICE_NAME}] Listening on port ${PORT}`);
});
