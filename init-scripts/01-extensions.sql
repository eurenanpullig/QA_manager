-- =============================================================================
-- STEP 1.3: EXTENSIONS & CORE DDL SCHEMA (GESTOR DE TESTES)
-- =============================================================================

-- [1.3.1] PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- [1.3.2] Domain: User Profiles & Auth
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('ADM', 'LIDER_TESTES', 'QA', 'DEV')),
    theme_preference VARCHAR(16) NOT NULL DEFAULT 'DARK' CHECK (theme_preference IN ('LIGHT', 'DARK')),
    font_scale_percent INT NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INT NOT NULL DEFAULT 0,
    suspended_until TIMESTAMP WITH TIME ZONE NULL,
    suspension_level INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- [1.3.3] Domain: Organizational Hierarchy
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES modules(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES pages(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- [1.3.4] Domain: Scenarios & Versioning
CREATE TABLE IF NOT EXISTS scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_id UUID NOT NULL REFERENCES features(id),
    title VARCHAR(255) NOT NULL,
    gherkin_text TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    position INT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS scenario_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL REFERENCES scenarios(id),
    version_number INT NOT NULL,
    gherkin_text TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (scenario_id, version_number)
);

-- [1.3.5] Domain: Dynamic Suites & Runs
CREATE TABLE IF NOT EXISTS suites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS suite_scenarios (
    suite_id UUID NOT NULL REFERENCES suites(id),
    scenario_id UUID NOT NULL REFERENCES scenarios(id),
    execution_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (suite_id, scenario_id)
);

CREATE TABLE IF NOT EXISTS suite_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suite_id UUID NOT NULL REFERENCES suites(id),
    status VARCHAR(32) NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'INTERRUPTED')),
    current_scenario_id UUID NULL REFERENCES scenarios(id),
    executed_by UUID NOT NULL REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE NULL
);

-- [1.3.6] Domain: Executions & Evidence Ledger
CREATE TABLE IF NOT EXISTS executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL REFERENCES scenarios(id),
    scenario_version_id UUID NOT NULL REFERENCES scenario_versions(id),
    suite_run_id UUID NULL REFERENCES suite_runs(id),
    execution_number BIGSERIAL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('IN_PROGRESS', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED')),
    duration_ms INT NOT NULL DEFAULT 0,
    rationale TEXT NULL,
    executed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_execution_rationale_length CHECK (
        status NOT IN ('BLOCKED', 'SKIPPED') OR (rationale IS NOT NULL AND char_length(rationale) >= 70)
    )
);

CREATE TABLE IF NOT EXISTS execution_evidences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES executions(id),
    file_path VARCHAR(1024) NOT NULL,
    file_type VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    comment_audit TEXT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_evidence_comment_audit_length CHECK (
        comment_audit IS NULL OR char_length(comment_audit) >= 70
    )
);

-- [1.3.7] Performance Indexes (Foreign Keys, Ordering Position, Status & Soft Delete)
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

CREATE INDEX IF NOT EXISTS idx_modules_project_position ON modules(project_id, position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modules_deleted_at ON modules(deleted_at);

CREATE INDEX IF NOT EXISTS idx_pages_module_position ON pages(module_id, position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pages_deleted_at ON pages(deleted_at);

CREATE INDEX IF NOT EXISTS idx_features_page_position ON features(page_id, position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_features_deleted_at ON features(deleted_at);

CREATE INDEX IF NOT EXISTS idx_scenarios_feature_position ON scenarios(feature_id, position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scenarios_deleted_at ON scenarios(deleted_at);

CREATE INDEX IF NOT EXISTS idx_scenario_versions_scenario_id ON scenario_versions(scenario_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_suites_project_id ON suites(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suites_deleted_at ON suites(deleted_at);

CREATE INDEX IF NOT EXISTS idx_suite_scenarios_order ON suite_scenarios(suite_id, execution_order);

CREATE INDEX IF NOT EXISTS idx_suite_runs_suite_status ON suite_runs(suite_id, status);
CREATE INDEX IF NOT EXISTS idx_suite_runs_executed_by ON suite_runs(executed_by);

CREATE INDEX IF NOT EXISTS idx_executions_scenario_id ON executions(scenario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_scenario_version_id ON executions(scenario_version_id);
CREATE INDEX IF NOT EXISTS idx_executions_suite_run_id ON executions(suite_run_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);

CREATE INDEX IF NOT EXISTS idx_execution_evidences_execution_active ON execution_evidences(execution_id, is_active);
