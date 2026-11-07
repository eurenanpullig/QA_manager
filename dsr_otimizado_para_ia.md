# SYSTEM SPECIFICATION: GESTOR DE TESTES (DSR MACHINE-READABLE)
# ARCHITECTURAL SOURCE OF TRUTH (SINGLE SOURCE OF TRUTH FOR AGENTS & CODEGEN)

metadata:
  system_name: "Gestor de Testes"
  architecture_pattern: "Distributed Microservices (REST sRGB) + Eventual Consistency UI Sync"
  deployment_model: "Self-Hosted Monotenant / Intranet"
  primary_language: "JavaScript / TypeScript"
  backend_runtime: "Node.js (Clean Code / Modular Architecture)"
  frontend_framework: "React.js (Classical Modular: components, hooks, services, contexts, pages)"
  database_engine: "PostgreSQL 15+"
  containerization: "Docker Compose"
  primary_test_frameworks: "Cypress (Web E2E) + Robot Framework (Integration/API)"

---

## 1. IDENTITY ACCESS & RBAC ENGINE (MATRIX DEFINITION)

### 1.1 Session & Security Constraints
- **Token Mechanism:** Stateless JWT with pairing `AccessToken` (TTL: 1h) & `RefreshToken` (TTL: 1h).
- **Client Storage:** Secure `HttpOnly` Cookies with `SameSite=Strict` and active CSRF mitigation tokens.
- **Brute Force Protection (Progressive Jailing):**
  - Failed Attempt Threshold: 5 failed authentications.
  - Progressive Suspension Timeline:
    $$\text{Stage 1: } 5\text{ min} \longrightarrow \text{Stage 2: } 15\text{ min} \longrightarrow \text{Stage 3: } 45\text{ min} \longrightarrow \text{Stage 4: } 2\text{ hours} \longrightarrow \text{Stage 5: } 24\text{ hours}$$

### 1.2 Access Control Matrix (Strict)

| Permission Scope | ADM | Líder de Testes | QA | DEV |
| :--- | :---: | :---: | :---: | :---: |
| User Provisioning / Suspend / Role Assign | **CRUD** | NONE | NONE | NONE |
| Global Project Visibility | READ (Audit) | READ | RESTRICTED (Assigned) | RESTRICTED (Assigned) |
| Project Root Metadata Edit/Delete | NONE | **CRUD** | NONE | NONE |
| Modules / Pages / Features Mutation | NONE | **CRUD** | **CRUD** | READ-ONLY |
| Scenarios Creation / Editing (Gherkin) | NONE | **CRUD** | **CRUD** | READ-ONLY |
| Test Execution Run / Recording | NONE | **EXECUTE** | **EXECUTE** | READ-ONLY |
| Execution Record Hard Deletion | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** |
| Evidence Mutation / Historical Override | NONE | **MUTATE + AUDIT** | NONE | NONE |

*Note: Execution records are immutable and append-only across all roles. The Líder de Testes is uniquely authorized to supersede execution evidence files, strictly requiring a mandatory textual rationale ($\ge 70$ characters).*

---

## 2. DATA SCHEMAS & DATABASE CONTRACT (POSTGRESQL)

```
[projects] 1 -- * [modules] 1 -- * [pages] 1 -- * [features] 1 -- * [scenarios]
                                                                        |
                                                                        +-- 1 -- * [scenario_versions]
                                                                        |
                                                                        +-- 1 -- * [executions]
                                                                                        |
                                                                                        +-- 1 -- * [execution_evidences]
                                                                                        |
[suite_runs] 1 -- * [executions] <------------------------------------------------------+
      ^
      |
[suites] 1 -- * [suite_scenarios] * -- 1 [scenarios]
```

### 2.1 Schema Definitions (DDL Standards)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Domain: User Profiles & Auth
CREATE TABLE users (
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

-- Domain: Organizational Hierarchy
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES modules(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES pages(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- Domain: Scenarios & Versioning
CREATE TABLE scenarios (
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

CREATE TABLE scenario_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL REFERENCES scenarios(id),
    version_number INT NOT NULL,
    gherkin_text TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Domain: Dynamic Suites & Runs
CREATE TABLE suites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE suite_scenarios (
    suite_id UUID NOT NULL REFERENCES suites(id),
    scenario_id UUID NOT NULL REFERENCES scenarios(id),
    execution_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (suite_id, scenario_id)
);

CREATE TABLE suite_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suite_id UUID NOT NULL REFERENCES suites(id),
    status VARCHAR(32) NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'INTERRUPTED')),
    current_scenario_id UUID NULL REFERENCES scenarios(id),
    executed_by UUID NOT NULL REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE NULL
);

-- Domain: Executions & Evidence Ledger
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL REFERENCES scenarios(id),
    scenario_version_id UUID NOT NULL REFERENCES scenario_versions(id),
    suite_run_id UUID NULL REFERENCES suite_runs(id),
    execution_number BIGSERIAL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('IN_PROGRESS', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED')),
    duration_ms INT NOT NULL DEFAULT 0,
    rationale TEXT NULL, -- Mandatory >= 70 chars if BLOCKED or SKIPPED
    executed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE execution_evidences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES executions(id),
    file_path VARCHAR(1024) NOT NULL,
    file_type VARCHAR(64) NOT NULL, -- e.g., image/png, video/mp4, text/plain
    file_size_bytes BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    comment_audit TEXT NULL, -- Mandatory >= 70 chars when is_active is toggled or superseded
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

---

## 3. MICROSERVICES BOUNDARIES & API ROUTING CONTRACT

### 3.1 Network Topology & Gateway
- Central Point of Ingress: `API Gateway` (Port 8000)
- Service 1: `auth-service` (Port 5001) $\rightarrow$ Ingress route: `/api/v1/auth`
- Service 2: `project-service` (Port 5002) $\rightarrow$ Ingress route: `/api/v1/projects`
- Service 3: `test-execution-service` (Port 5003) $\rightarrow$ Ingress route: `/api/v1/tests`
- Service 4: `storage-service` (Port 5004) $\rightarrow$ Ingress route: `/api/v1/storage`

### 3.2 Error Schema Standardization (RFC-Compliant JSON)

```json
{
  "timestamp": "2026-11-06T19:48:00.000Z",
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "Rationale must contain at least 70 characters for status BLOCKED or SKIPPED.",
  "details": {
    "field": "rationale",
    "receivedLength": 45,
    "requiredLength": 70
  }
}
```

### 3.3 REST Endpoints Contract Reference

#### `auth-service`
- `POST /api/v1/auth/login` $\longrightarrow$ Authenticates credentials, evaluates lockouts, issues HttpOnly Cookies.
- `POST /api/v1/auth/refresh` $\longrightarrow$ Exchanges valid Refresh Token for new Access Token.
- `POST /api/v1/auth/logout` $\longrightarrow$ Clears credential cookies.
- `GET /api/v1/auth/profile` $\longrightarrow$ Retrieves user settings (role, theme, font scale).
- `PUT /api/v1/auth/profile` $\longrightarrow$ Updates preferences (`theme_preference`, `font_scale_percent`).

#### `project-service`
- `GET/POST /api/v1/projects` $\longrightarrow$ List / Create projects.
- `PUT/DELETE /api/v1/projects/:id` $\longrightarrow$ Update / Soft-delete project root.
- `POST /api/v1/projects/hierarchy/sync-order` $\longrightarrow$ Batch persist of drag-and-drop nodes `position`.

#### `test-execution-service`
- `POST /api/v1/tests/scenarios` $\longrightarrow$ Saves Scenario & appends new `scenario_versions` snapshot.
- `POST /api/v1/tests/suites` $\longrightarrow$ Creates dynamic Suite entity.
- `POST /api/v1/tests/suites/:id/run` $\longrightarrow$ Initializes `suite_runs`, validates suite is non-empty, yields ordered scenario execution stack.
- `POST /api/v1/tests/executions` $\longrightarrow$ Creates an execution tied to a frozen `scenario_version_id`. Enforces evidence validation:
  - If status in (`PASSED`, `FAILED`): Minimum 1 active record in `execution_evidences`.
  - If status in (`BLOCKED`, `SKIPPED`): `rationale` length $\ge 70$.
- `PATCH /api/v1/tests/executions/:id/evidences` $\longrightarrow$ (Líder only) Deactivates old evidence, appends new file link with $\ge 70$ chars `comment_audit`. Execution status remains unchanged.

#### `storage-service`
- `POST /api/v1/storage/upload` $\longrightarrow$ `multipart/form-data`.
  - Validation: Images (PNG/JPG/WEBP $\le 30\text{ MB}$), Videos (MP4/MKV $\le 200\text{ MB}$), Logs ($\le 10\text{ MB}$).
  - Disk Atomic Protocol: Writes to disk first. Returns `{ file_path, file_size_bytes, file_type }`. If writing aborts, deletes partial artifacts (zero orphan files).

---

## 4. UI/UX SPECIFICATIONS (REACT + MATERIAL DESIGN)

### 4.1 Visual & Accessibility Requirements
- **Geometry Directive:** Zero $90^\circ$ sharp corners (`border-radius > 0` everywhere, min `rounded-md` / `8px`).
- **Layout Strategy:** Mobile First responsive grid. Screen utilization must maximize viewport without padding overflow.
- **Theme Support:** Native Dark and Light modes dynamically loaded via `users.theme_preference`. Contrast ratios strictly compliant with WCAG 2.1 AA.
- **Dynamic Typography:** Root `html { font-size: X% }` scale multiplier (range: 80% to 150%) governed by the global user profile setting.
- **Hierarchy Representation on Mobile:** Fullscreen navigable stacked drill-downs (`Projects -> Modules -> Pages -> Features -> Scenarios`) with breadcrumb headers.

### 4.2 Drag-and-Drop Batch Sync Pattern
- Drag movements update local React UI state instantly.
- **Debounce/Buffer Persist Engine:**
  ```typescript
  // Trigger batch persistence strictly upon:
  // 1. Idle timeout threshold: 5 minutes (300,000 ms).
  // 2. Navigation route change or window beforeunload event.
  // 3. Imminent Access Token renewal window.
  ```

### 4.3 Suite Stability Formula
$$\text{Stability Ratio } (R) = \frac{N_{\text{PASSED}}}{N_{\text{TOTAL}}} \times 100$$
$$\text{Condition: } R \ge 70\% \implies \text{"ESTÁVEL"} \quad \vert \quad R < 70\% \implies \text{"INSTÁVEL"}$$

---

## 5. REPOSITORY ARCHITECTURE & DOCKER TOPOLOGY

```
gestor-testes-root/
├── docker-compose.yml
├── .env.example
├── gateway/
│   ├── Dockerfile
│   └── src/
├── services/
│   ├── auth-service/
│   ├── project-service/
│   ├── test-execution-service/
│   └── storage-service/
├── frontend/
│   ├── Dockerfile
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── hooks/
│       ├── pages/
│       └── services/
└── storage-volume/
```

```yaml
# docker-compose.yml specification
version: '3.8'

services:
  postgres-db:
    image: postgres:15-alpine
    container_name: gt_postgres
    environment:
      POSTGRES_DB: gestor_testes
      POSTGRES_USER: gt_admin
      POSTGRES_PASSWORD: gt_secure_password
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"

  api-gateway:
    build: ./gateway
    container_name: gt_gateway
    ports:
      - "8000:8000"
    depends_on:
      - auth-service
      - project-service
      - test-execution-service
      - storage-service

  auth-service:
    build: ./services/auth-service
    environment:
      DATABASE_URL: postgres://gt_admin:gt_secure_password@postgres-db:5432/gestor_testes
      JWT_SECRET: super_jwt_secret_token
    depends_on:
      - postgres-db

  project-service:
    build: ./services/project-service
    environment:
      DATABASE_URL: postgres://gt_admin:gt_secure_password@postgres-db:5432/gestor_testes
    depends_on:
      - postgres-db

  test-execution-service:
    build: ./services/test-execution-service
    environment:
      DATABASE_URL: postgres://gt_admin:gt_secure_password@postgres-db:5432/gestor_testes
    depends_on:
      - postgres-db

  storage-service:
    build: ./services/storage-service
    volumes:
      - local_storage:/var/app/uploads
    ports:
      - "5004:5004"

  frontend-app:
    build: ./frontend
    container_name: gt_frontend
    ports:
      - "3000:3000"
    depends_on:
      - api-gateway

volumes:
  pgdata:
  local_storage:
```