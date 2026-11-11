*** Settings ***
Documentation     Suíte Oficial de Integração Back-end (Step 2.6) - Gestor de Testes Corporativo.
...               Valida RBAC Matrix, Defesa contra Força Bruta Progressiva, Upload de Evidências,
...               Obrigatoriedade de Evidência em PASSED/FAILED e Trava de >= 70 caracteres.
Library           RequestsLibrary
Library           Collections
Library           String
Suite Setup       Initialize API Sessions And Seed State

*** Variables ***
${GATEWAY_URL}           http://localhost:8000/api/v1
${DEMO_PROJECT_ID}       aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
${DEMO_MODULE_ID}        bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
${DEMO_PAGE_ID}          cccccccc-cccc-4ccc-8ccc-cccccccccccc
${DEMO_FEATURE_ID}       dddddddd-dddd-4ddd-8ddd-dddddddddddd
${DEMO_SCENARIO_ID}      eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee
${DEV_USER_ID}           44444444-4444-4444-8444-444444444444
${DEFAULT_PASSWORD}      Admin@123
${VALID_LONG_RATIONALE}  O cenário ficou bloqueado devido à indisponibilidade temporária do barramento de pagamentos homologação no ambiente interno.
${VALID_AUDIT_COMMENT}   Substituição de evidência realizada pelo Líder de Testes pois a imagem original continha dados pessoais sensíveis de teste.

*** Keywords ***
Initialize API Sessions And Seed State
    Create Session    adm_session      ${GATEWAY_URL}
    Create Session    lider_session    ${GATEWAY_URL}
    Create Session    qa_session       ${GATEWAY_URL}
    Create Session    dev_session      ${GATEWAY_URL}
    Create Session    anon_session     ${GATEWAY_URL}

    # Authenticate ADM, LIDER_TESTES, and QA sessions (Cookies stored automatically in each session)
    Login Role Session    adm_session      admin@gestortestes.local
    Login Role Session    lider_session    lider@gestortestes.local
    Login Role Session    qa_session       qa@gestortestes.local

    # Ensure DEV user account is unlocked before running brute-force tests
    ${unlock_payload}=    Create Dictionary    unlock_account=${True}
    PUT On Session    adm_session    /auth/users/${DEV_USER_ID}    json=${unlock_payload}    expected_status=200
    Login Role Session    dev_session      dev@gestortestes.local

Login Role Session
    [Arguments]    ${session_alias}    ${email}
    ${payload}=    Create Dictionary    email=${email}    password=${DEFAULT_PASSWORD}
    ${resp}=       POST On Session      ${session_alias}    /auth/login    json=${payload}    expected_status=200
    Should Not Be Empty    ${resp.json()}[csrfToken]

*** Test Cases ***
TC01 - RBAC: ADM Must Be Forbidden From Creating Or Editing Projects
    [Documentation]    [2.6.2] Verifica que o papel ADM gerencia usuários mas recebe 403 Forbidden ao tentar mutar projetos.
    [Tags]             RBAC    ADM
    ${project_payload}=    Create Dictionary    name=Projeto Proibido ADM    description=Tentativa de violação RBAC
    ${resp_create}=        POST On Session      adm_session    /projects    json=${project_payload}    expected_status=403
    Should Be Equal As Integers    ${resp_create.json()}[statusCode]    403
    Should Contain                 ${resp_create.json()}[message]       Only LIDER_TESTES is authorized

    ${resp_update}=        PUT On Session       adm_session    /projects/${DEMO_PROJECT_ID}    json=${project_payload}    expected_status=403
    Should Be Equal As Integers    ${resp_update.json()}[statusCode]    403

TC02 - RBAC: DEV Must Have Read-Only Access And Be Forbidden From Mutating Any Data
    [Documentation]    [2.6.2] Verifica que o papel DEV pode ler a árvore do projeto mas recebe 403 em qualquer tentativa de escrita.
    [Tags]             RBAC    DEV
    # DEV can read project tree
    ${resp_tree}=      GET On Session    dev_session    /projects/${DEMO_PROJECT_ID}/tree    expected_status=200
    Should Be Equal    ${resp_tree.json()}[tree][id]    ${DEMO_PROJECT_ID}

    # DEV cannot create modules
    ${mod_payload}=    Create Dictionary    project_id=${DEMO_PROJECT_ID}    name=Módulo Ilegal DEV    position=${1}
    ${resp_mod}=       POST On Session      dev_session    /projects/modules    json=${mod_payload}    expected_status=403
    Should Be Equal As Integers    ${resp_mod.json()}[statusCode]    403

    # DEV cannot create scenarios
    ${sc_payload}=     Create Dictionary    feature_id=${DEMO_FEATURE_ID}    title=Cenário Ilegal DEV    gherkin_text=Feature: X
    ${resp_sc}=        POST On Session      dev_session    /tests/scenarios    json=${sc_payload}    expected_status=403
    Should Be Equal As Integers    ${resp_sc.json()}[statusCode]    403

    # DEV cannot record test executions
    ${exec_payload}=   Create Dictionary    scenario_id=${DEMO_SCENARIO_ID}    status=SKIPPED    rationale=${VALID_LONG_RATIONALE}
    ${resp_exec}=      POST On Session      dev_session    /tests/executions    json=${exec_payload}    expected_status=403
    Should Be Equal As Integers    ${resp_exec.json()}[statusCode]    403

    # DEV cannot access ADM user provisioning
    ${resp_users}=     GET On Session       dev_session    /auth/users    expected_status=403
    Should Be Equal As Integers    ${resp_users.json()}[statusCode]    403

TC03 - Brute Force Protection: Progressive Lockout On 5 Consecutive Failed Attempts
    [Documentation]    [2.6.3] Verifica o contador de tentativas falhas (1..4 -> 401) e o bloqueio Stage 1 (5m -> 429) na 5ª falha.
    [Tags]             Security    BruteForce
    ${bad_payload}=    Create Dictionary    email=dev@gestortestes.local    password=SenhaIncorreta999!

    FOR    ${attempt}    IN RANGE    1    5
        ${resp_fail}=    POST On Session    anon_session    /auth/login    json=${bad_payload}    expected_status=401
        Should Be Equal As Integers    ${resp_fail.json()}[details][failedAttempts]    ${attempt}
    END

    # 5th failed attempt triggers Stage 1 lockout (5 minutes) with HTTP 429
    ${resp_lock}=    POST On Session    anon_session    /auth/login    json=${bad_payload}    expected_status=429
    Should Be Equal As Integers    ${resp_lock.json()}[statusCode]                     429
    Should Be Equal As Integers    ${resp_lock.json()}[details][failedAttempts]        5
    Should Be Equal As Integers    ${resp_lock.json()}[details][suspensionLevel]       1
    Should Be Equal As Integers    ${resp_lock.json()}[details][lockDurationMinutes]   5

    # Subsequent attempt with valid password must still be rejected with 429 while suspended
    ${valid_payload}=       Create Dictionary    email=dev@gestortestes.local    password=${DEFAULT_PASSWORD}
    ${resp_while_locked}=   POST On Session      anon_session    /auth/login    json=${valid_payload}    expected_status=429
    Should Be Equal As Integers    ${resp_while_locked.json()}[statusCode]    429

    # ADM unlocks account and DEV can authenticate again
    ${unlock_payload}=    Create Dictionary    unlock_account=${True}
    PUT On Session        adm_session     /auth/users/${DEV_USER_ID}    json=${unlock_payload}    expected_status=200
    ${resp_recovered}=    POST On Session    anon_session    /auth/login    json=${valid_payload}    expected_status=200
    Should Be Equal       ${resp_recovered.json()}[user][role]    DEV

TC04 - Execution Governance: Mandatory Evidence For PASSED And FAILED Statuses
    [Documentation]    [2.6.4] Verifica que execuções PASSED ou FAILED sem evidência ativa são rejeitadas com 422.
    [Tags]             Execution    Evidences
    @{empty_evidences}=    Create List
    ${passed_no_ev}=       Create Dictionary    scenario_id=${DEMO_SCENARIO_ID}    status=PASSED    evidences=${empty_evidences}
    ${resp_passed}=        POST On Session      qa_session    /tests/executions    json=${passed_no_ev}    expected_status=422
    Should Be Equal As Integers    ${resp_passed.json()}[statusCode]    422
    Should Contain                 ${resp_passed.json()}[message]       At least 1 active evidence file is mandatory

    ${failed_no_ev}=       Create Dictionary    scenario_id=${DEMO_SCENARIO_ID}    status=FAILED    evidences=${empty_evidences}
    ${resp_failed}=        POST On Session      qa_session    /tests/executions    json=${failed_no_ev}    expected_status=422
    Should Be Equal As Integers    ${resp_failed.json()}[statusCode]    422

    # Valid PASSED execution with 1 active evidence succeeds (201)
    ${ev_item}=            Create Dictionary    file_path=/api/v1/storage/files/robot-ev.png    file_type=image/png    file_size_bytes=${1024}
    @{valid_evidences}=    Create List          ${ev_item}
    ${valid_passed}=       Create Dictionary    scenario_id=${DEMO_SCENARIO_ID}    status=PASSED    duration_ms=${950}    evidences=${valid_evidences}
    ${resp_ok}=            POST On Session      qa_session    /tests/executions    json=${valid_passed}    expected_status=201
    Should Be Equal        ${resp_ok.json()}[execution][status]    PASSED
    Set Suite Variable     ${CREATED_EXECUTION_ID}                 ${resp_ok.json()}[execution][id]

TC05 - Execution & Audit Governance: Strict >= 70 Characters Lock For Rationale And Leader Audit
    [Documentation]    [2.6.4] Verifica a trava impeditiva de >= 70 caracteres para status BLOCKED/SKIPPED e para substituição de evidência pelo Líder.
    [Tags]             Execution    Rationale70Chars    LeaderAudit
    # 1. Short rationale (< 70 chars) for BLOCKED and SKIPPED -> 422
    ${short_blocked}=    Create Dictionary    scenario_id=${DEMO_SCENARIO_ID}    status=BLOCKED    rationale=Justificativa curta com menos de setenta chars.
    ${resp_short_b}=     POST On Session      qa_session    /tests/executions    json=${short_blocked}    expected_status=422
    Should Be Equal As Integers    ${resp_short_b.json()}[statusCode]                 422
    Should Be Equal As Integers    ${resp_short_b.json()}[details][requiredLength]    70

    ${short_skipped}=    Create Dictionary    scenario_id=${DEMO_SCENARIO_ID}    status=SKIPPED    rationale=Pulado rapidamente sem detalhes suficientes.
    ${resp_short_s}=     POST On Session      qa_session    /tests/executions    json=${short_skipped}    expected_status=422
    Should Be Equal As Integers    ${resp_short_s.json()}[statusCode]                 422
    Should Be Equal As Integers    ${resp_short_s.json()}[details][requiredLength]    70

    # 2. Valid rationale (>= 70 chars) for BLOCKED -> 201
    ${valid_blocked}=    Create Dictionary    scenario_id=${DEMO_SCENARIO_ID}    status=BLOCKED    rationale=${VALID_LONG_RATIONALE}
    ${resp_valid_b}=     POST On Session      qa_session    /tests/executions    json=${valid_blocked}    expected_status=201
    Should Be Equal      ${resp_valid_b.json()}[execution][status]    BLOCKED

    # 3. QA must be forbidden (403) from superseding execution evidences
    ${audit_payload}=    Create Dictionary
    ...                  file_path=/api/v1/storage/files/new-leader-ev.png
    ...                  file_type=image/png
    ...                  file_size_bytes=${2048}
    ...                  comment_audit=${VALID_AUDIT_COMMENT}
    ${resp_qa_audit}=    PATCH On Session    qa_session    /tests/executions/${CREATED_EXECUTION_ID}/evidences    json=${audit_payload}    expected_status=403
    Should Be Equal As Integers    ${resp_qa_audit.json()}[statusCode]    403

    # 4. LIDER_TESTES with short comment_audit (< 70 chars) -> 422
    ${short_audit}=      Create Dictionary
    ...                  file_path=/api/v1/storage/files/new-leader-ev.png
    ...                  file_type=image/png
    ...                  file_size_bytes=${2048}
    ...                  comment_audit=Auditoria curta inválida.
    ${resp_short_aud}=   PATCH On Session    lider_session    /tests/executions/${CREATED_EXECUTION_ID}/evidences    json=${short_audit}    expected_status=422
    Should Be Equal As Integers    ${resp_short_aud.json()}[statusCode]                 422
    Should Be Equal As Integers    ${resp_short_aud.json()}[details][requiredLength]    70

    # 5. LIDER_TESTES with valid comment_audit (>= 70 chars) -> 200 & preserves immutable execution status
    ${resp_leader_ok}=   PATCH On Session    lider_session    /tests/executions/${CREATED_EXECUTION_ID}/evidences    json=${audit_payload}    expected_status=200
    Should Be Equal                ${resp_leader_ok.json()}[execution][status]       PASSED
    Should Be Equal As Integers    ${resp_leader_ok.json()}[deactivatedCount]        1
