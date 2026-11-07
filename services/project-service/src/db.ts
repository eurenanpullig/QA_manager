import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://gt_admin:gt_secure_password@postgres-db:5432/gestor_testes';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export type UserRole = 'ADM' | 'LIDER_TESTES' | 'QA' | 'DEV';

export type HierarchyEntityType = 'MODULE' | 'PAGE' | 'FEATURE' | 'SCENARIO';

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ModuleRecord {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface PageRecord {
  id: string;
  module_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface FeatureRecord {
  id: string;
  page_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ScenarioNodeRecord {
  id: string;
  feature_id: string;
  title: string;
  gherkin_text: string;
  version: number;
  position: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}
