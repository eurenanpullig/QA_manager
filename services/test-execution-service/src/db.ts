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

export type ExecutionStatus = 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';
export type SuiteRunStatus = 'IN_PROGRESS' | 'COMPLETED' | 'INTERRUPTED';

export const MIN_RATIONALE_LENGTH = 70;
export const MIN_AUDIT_COMMENT_LENGTH = 70;

export interface ScenarioRecord {
  id: string;
  feature_id: string;
  title: string;
  gherkin_text: string;
  version: number;
  position: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ScenarioVersionRecord {
  id: string;
  scenario_id: string;
  version_number: number;
  gherkin_text: string;
  changed_by: string;
  created_at: Date;
}

export interface SuiteRecord {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface SuiteRunRecord {
  id: string;
  suite_id: string;
  status: SuiteRunStatus;
  current_scenario_id: string | null;
  executed_by: string;
  started_at: Date;
  finished_at: Date | null;
}

export interface ExecutionRecord {
  id: string;
  scenario_id: string;
  scenario_version_id: string;
  suite_run_id: string | null;
  execution_number: string;
  status: ExecutionStatus;
  duration_ms: number;
  rationale: string | null;
  executed_by: string;
  created_at: Date;
}

export interface EvidenceRecord {
  id: string;
  execution_id: string;
  file_path: string;
  file_type: string;
  file_size_bytes: string;
  is_active: boolean;
  comment_audit: string | null;
  created_by: string;
  created_at: Date;
}
