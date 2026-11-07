-- =============================================================================
-- STEP 1.3.8: INITIALIZATION SEEDERS (ADM USER & DEMO HIERARCHY)
-- =============================================================================

-- 1. Default Users (ADM, LIDER_TESTES, QA, DEV) with Bcrypt hashed password ('Admin@123')
INSERT INTO users (id, name, email, password_hash, role, theme_preference, font_scale_percent, is_active)
VALUES
    (
        '11111111-1111-4111-8111-111111111111',
        'Administrador Global',
        'admin@gestortestes.local',
        crypt('Admin@123', gen_salt('bf', 10)),
        'ADM',
        'DARK',
        100,
        TRUE
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'Líder de Testes Padrão',
        'lider@gestortestes.local',
        crypt('Admin@123', gen_salt('bf', 10)),
        'LIDER_TESTES',
        'DARK',
        100,
        TRUE
    ),
    (
        '33333333-3333-4333-8333-333333333333',
        'Analista QA Padrão',
        'qa@gestortestes.local',
        crypt('Admin@123', gen_salt('bf', 10)),
        'QA',
        'DARK',
        100,
        TRUE
    ),
    (
        '44444444-4444-4444-8444-444444444444',
        'Desenvolvedor Padrão',
        'dev@gestortestes.local',
        crypt('Admin@123', gen_salt('bf', 10)),
        'DEV',
        'DARK',
        100,
        TRUE
    )
ON CONFLICT (email) DO NOTHING;

-- 2. Demo Project Hierarchy: 1 Project -> 1 Module -> 1 Page -> 1 Feature -> 1 Scenario (Gherkin)
INSERT INTO projects (id, name, description, created_by)
VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Portal Corporativo E-Commerce',
    'Projeto demonstrativo oficial para validação da árvore hierárquica de testes BDD.',
    '22222222-2222-4222-8222-222222222222'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO modules (id, project_id, name, description, position)
VALUES (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Módulo de Autenticação e Segurança',
    'Fluxos de login, controle de sessão JWT e bloqueio progressivo contra força bruta.',
    0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pages (id, module_id, name, description, position)
VALUES (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Página de Login Corporativo',
    'Tela principal de entrada com suporte a temas Dark/Light e acessibilidade WCAG 2.1 AA.',
    0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO features (id, page_id, name, description, position)
VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Autenticação com Credenciais Válidas',
    'Validação de credenciais e emissão de cookies seguros HttpOnly.',
    0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenarios (id, feature_id, title, gherkin_text, version, position, created_by)
VALUES (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Login bem-sucedido com credenciais corporativas válidas',
    E'Feature: Autenticação com Credenciais Válidas\n\n  Scenario: Login bem-sucedido com credenciais corporativas válidas\n    Given que o usuário está na página de login corporativo\n    When o usuário preenche o e-mail "qa@gestortestes.local" e uma senha válida\n    And aciona o botão de entrar\n    Then o sistema deve emitir cookies HttpOnly de sessão\n    And redirecionar o usuário para o painel principal do projeto',
    1,
    0,
    '33333333-3333-4333-8333-333333333333'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenario_versions (id, scenario_id, version_number, gherkin_text, changed_by)
VALUES (
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    1,
    E'Feature: Autenticação com Credenciais Válidas\n\n  Scenario: Login bem-sucedido com credenciais corporativas válidas\n    Given que o usuário está na página de login corporativo\n    When o usuário preenche o e-mail "qa@gestortestes.local" e uma senha válida\n    And aciona o botão de entrar\n    Then o sistema deve emitir cookies HttpOnly de sessão\n    And redirecionar o usuário para o painel principal do projeto',
    '33333333-3333-4333-8333-333333333333'
)
ON CONFLICT (scenario_id, version_number) DO NOTHING;
