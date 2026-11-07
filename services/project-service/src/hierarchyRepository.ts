import { pool } from './db.js';
import { AppError } from './errors.js';

import type {
  FeatureRecord,
  HierarchyEntityType,
  ModuleRecord,
  PageRecord,
  ProjectRecord,
  ScenarioNodeRecord,
} from './db.js';

export interface BatchOrderItem {
  entity_type: HierarchyEntityType;
  id: string;
  position: number;
}

export interface FeatureTreeNode extends FeatureRecord {
  scenarios: ScenarioNodeRecord[];
}

export interface PageTreeNode extends PageRecord {
  features: FeatureTreeNode[];
}

export interface ModuleTreeNode extends ModuleRecord {
  pages: PageTreeNode[];
}

export interface ProjectTreeResponse extends ProjectRecord {
  modules: ModuleTreeNode[];
}

const ENTITY_TABLE_MAP: Record<HierarchyEntityType, string> = {
  MODULE: 'modules',
  PAGE: 'pages',
  FEATURE: 'features',
  SCENARIO: 'scenarios',
};

export class HierarchyRepository {
  // Projects (Root Level)
  public async listProjects(): Promise<ProjectRecord[]> {
    const res = await pool.query<ProjectRecord>(
      'SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC',
    );
    return res.rows;
  }

  public async findProjectById(id: string): Promise<ProjectRecord | null> {
    const res = await pool.query<ProjectRecord>(
      'SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [id],
    );
    return res.rows[0] ?? null;
  }

  public async createProject(input: {
    name: string;
    description: string | null;
    createdBy: string;
  }): Promise<ProjectRecord> {
    const res = await pool.query<ProjectRecord>(
      `INSERT INTO projects (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.name, input.description, input.createdBy],
    );
    const created = res.rows[0];
    if (!created) {
      throw new Error('Failed to create project.');
    }
    return created;
  }

  public async updateProject(
    id: string,
    input: { name?: string; description?: string | null },
  ): Promise<ProjectRecord | null> {
    const res = await pool.query<ProjectRecord>(
      `UPDATE projects
       SET name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, input.name ?? null, input.description !== undefined, input.description ?? null],
    );
    return res.rows[0] ?? null;
  }

  public async softDeleteProject(id: string): Promise<boolean> {
    const res = await pool.query(
      'UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // Modules (Level 2)
  public async listModules(projectId?: string): Promise<ModuleRecord[]> {
    if (projectId) {
      const res = await pool.query<ModuleRecord>(
        'SELECT * FROM modules WHERE project_id = $1 AND deleted_at IS NULL ORDER BY position ASC, created_at ASC',
        [projectId],
      );
      return res.rows;
    }
    const res = await pool.query<ModuleRecord>(
      'SELECT * FROM modules WHERE deleted_at IS NULL ORDER BY position ASC, created_at ASC',
    );
    return res.rows;
  }

  public async createModule(input: {
    projectId: string;
    name: string;
    description: string | null;
    position: number;
  }): Promise<ModuleRecord> {
    const project = await this.findProjectById(input.projectId);
    if (!project) {
      throw new AppError(404, 'Parent project not found or soft-deleted.', {
        project_id: input.projectId,
      });
    }

    const res = await pool.query<ModuleRecord>(
      `INSERT INTO modules (project_id, name, description, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.projectId, input.name, input.description, input.position],
    );
    const created = res.rows[0];
    if (!created) {
      throw new Error('Failed to create module.');
    }
    return created;
  }

  public async updateModule(
    id: string,
    input: { name?: string; description?: string | null; position?: number },
  ): Promise<ModuleRecord | null> {
    const res = await pool.query<ModuleRecord>(
      `UPDATE modules
       SET name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           position = COALESCE($5, position),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.description !== undefined,
        input.description ?? null,
        input.position ?? null,
      ],
    );
    return res.rows[0] ?? null;
  }

  public async softDeleteModule(id: string): Promise<boolean> {
    const res = await pool.query(
      'UPDATE modules SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // Pages (Level 3)
  public async listPages(moduleId?: string): Promise<PageRecord[]> {
    if (moduleId) {
      const res = await pool.query<PageRecord>(
        'SELECT * FROM pages WHERE module_id = $1 AND deleted_at IS NULL ORDER BY position ASC, created_at ASC',
        [moduleId],
      );
      return res.rows;
    }
    const res = await pool.query<PageRecord>(
      'SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY position ASC, created_at ASC',
    );
    return res.rows;
  }

  public async createPage(input: {
    moduleId: string;
    name: string;
    description: string | null;
    position: number;
  }): Promise<PageRecord> {
    const modRes = await pool.query(
      'SELECT id FROM modules WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [input.moduleId],
    );
    if (modRes.rowCount === 0) {
      throw new AppError(404, 'Parent module not found or soft-deleted.', {
        module_id: input.moduleId,
      });
    }

    const res = await pool.query<PageRecord>(
      `INSERT INTO pages (module_id, name, description, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.moduleId, input.name, input.description, input.position],
    );
    const created = res.rows[0];
    if (!created) {
      throw new Error('Failed to create page.');
    }
    return created;
  }

  public async updatePage(
    id: string,
    input: { name?: string; description?: string | null; position?: number },
  ): Promise<PageRecord | null> {
    const res = await pool.query<PageRecord>(
      `UPDATE pages
       SET name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           position = COALESCE($5, position),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.description !== undefined,
        input.description ?? null,
        input.position ?? null,
      ],
    );
    return res.rows[0] ?? null;
  }

  public async softDeletePage(id: string): Promise<boolean> {
    const res = await pool.query(
      'UPDATE pages SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // Features (Level 4)
  public async listFeatures(pageId?: string): Promise<FeatureRecord[]> {
    if (pageId) {
      const res = await pool.query<FeatureRecord>(
        'SELECT * FROM features WHERE page_id = $1 AND deleted_at IS NULL ORDER BY position ASC, created_at ASC',
        [pageId],
      );
      return res.rows;
    }
    const res = await pool.query<FeatureRecord>(
      'SELECT * FROM features WHERE deleted_at IS NULL ORDER BY position ASC, created_at ASC',
    );
    return res.rows;
  }

  public async createFeature(input: {
    pageId: string;
    name: string;
    description: string | null;
    position: number;
  }): Promise<FeatureRecord> {
    const pageRes = await pool.query(
      'SELECT id FROM pages WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [input.pageId],
    );
    if (pageRes.rowCount === 0) {
      throw new AppError(404, 'Parent page not found or soft-deleted.', {
        page_id: input.pageId,
      });
    }

    const res = await pool.query<FeatureRecord>(
      `INSERT INTO features (page_id, name, description, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.pageId, input.name, input.description, input.position],
    );
    const created = res.rows[0];
    if (!created) {
      throw new Error('Failed to create feature.');
    }
    return created;
  }

  public async updateFeature(
    id: string,
    input: { name?: string; description?: string | null; position?: number },
  ): Promise<FeatureRecord | null> {
    const res = await pool.query<FeatureRecord>(
      `UPDATE features
       SET name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           position = COALESCE($5, position),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.description !== undefined,
        input.description ?? null,
        input.position ?? null,
      ],
    );
    return res.rows[0] ?? null;
  }

  public async softDeleteFeature(id: string): Promise<boolean> {
    const res = await pool.query(
      'UPDATE features SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // [2.4.4] Transactional Batch Position Sync (Drag-and-Drop)
  public async syncHierarchyOrder(items: BatchOrderItem[]): Promise<number> {
    const client = await pool.connect();
    let updatedCount = 0;
    try {
      await client.query('BEGIN');
      for (const item of items) {
        const tableName = ENTITY_TABLE_MAP[item.entity_type];
        if (!tableName) {
          throw new AppError(422, `Invalid entity_type '${item.entity_type}'.`);
        }

        const res = await client.query(
          `UPDATE ${tableName}
           SET position = $2, updated_at = NOW()
           WHERE id = $1 AND deleted_at IS NULL`,
          [item.id, item.position],
        );
        updatedCount += res.rowCount ?? 0;
      }
      await client.query('COMMIT');
      return updatedCount;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // [2.4.5] Aggregated Full Hierarchy Tree for Low-Latency UI Consumption
  public async getFullProjectTree(projectId: string): Promise<ProjectTreeResponse | null> {
    const project = await this.findProjectById(projectId);
    if (!project) {
      return null;
    }

    const modulesRes = await pool.query<ModuleRecord>(
      `SELECT * FROM modules
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY position ASC, created_at ASC`,
      [projectId],
    );
    const modules = modulesRes.rows;
    const moduleIds = modules.map((m) => m.id);

    const pagesRes =
      moduleIds.length > 0
        ? await pool.query<PageRecord>(
            `SELECT * FROM pages
             WHERE module_id = ANY($1::uuid[]) AND deleted_at IS NULL
             ORDER BY position ASC, created_at ASC`,
            [moduleIds],
          )
        : { rows: [] as PageRecord[] };
    const pages = pagesRes.rows;
    const pageIds = pages.map((p) => p.id);

    const featuresRes =
      pageIds.length > 0
        ? await pool.query<FeatureRecord>(
            `SELECT * FROM features
             WHERE page_id = ANY($1::uuid[]) AND deleted_at IS NULL
             ORDER BY position ASC, created_at ASC`,
            [pageIds],
          )
        : { rows: [] as FeatureRecord[] };
    const features = featuresRes.rows;
    const featureIds = features.map((f) => f.id);

    const scenariosRes =
      featureIds.length > 0
        ? await pool.query<ScenarioNodeRecord>(
            `SELECT id, feature_id, title, gherkin_text, version, position, created_by, created_at, updated_at
             FROM scenarios
             WHERE feature_id = ANY($1::uuid[]) AND deleted_at IS NULL
             ORDER BY position ASC, created_at ASC`,
            [featureIds],
          )
        : { rows: [] as ScenarioNodeRecord[] };
    const scenarios = scenariosRes.rows;

    const scenariosByFeature = new Map<string, ScenarioNodeRecord[]>();
    for (const sc of scenarios) {
      const list = scenariosByFeature.get(sc.feature_id) ?? [];
      list.push(sc);
      scenariosByFeature.set(sc.feature_id, list);
    }

    const featuresByPage = new Map<string, FeatureTreeNode[]>();
    for (const feat of features) {
      const list = featuresByPage.get(feat.page_id) ?? [];
      list.push({
        ...feat,
        scenarios: scenariosByFeature.get(feat.id) ?? [],
      });
      featuresByPage.set(feat.page_id, list);
    }

    const pagesByModule = new Map<string, PageTreeNode[]>();
    for (const pg of pages) {
      const list = pagesByModule.get(pg.module_id) ?? [];
      list.push({
        ...pg,
        features: featuresByPage.get(pg.id) ?? [],
      });
      pagesByModule.set(pg.module_id, list);
    }

    const moduleTree: ModuleTreeNode[] = modules.map((mod) => ({
      ...mod,
      pages: pagesByModule.get(mod.id) ?? [],
    }));

    return {
      ...project,
      modules: moduleTree,
    };
  }
}
