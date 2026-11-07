# PROTOCOLO DE ORQUESTRAMENTO DE EXECUÇÃO (AI AGENT PLAYBOOK)

## PROJETO: GESTOR DE TESTES CORPORATIVO (SELF-HOSTED)

**Fonte da Verdade:** DSR Técnico Machine-Readable & Executivo

**Modo de Operação:** Squad Ágil Autônomo com Validação Humana Contínua (*Human-in-the-Loop*)

## 0. REGRAS GERAIS DE EXECUÇÃO DO AGENTE (PROMPT DO SISTEMA)

1. **Execução Incremental Rigorosa:** A IA nunca deve executar mais de um **Step (Subcapítulo)** por vez.

2. **Gatilho de Parada (*Checkpoint Barrier*):** Ao concluir todas as microtarefas de um Step, a IA deve:

   * Parar imediatamente.

   * Listar o que foi construído/executado com evidências (arquivos criados, comandos rodados, testes executados).

   * Solicitar explicitamente: *"Step \[X.Y\] finalizado. Aguardo sua validação técnica para prosseguir para o Step \[X.Z\]"*.

3. **Imutabilidade e Regras Críticas do DSR:**

   * Soft Delete padronizado com `deleted_at`.

   * UUIDv4 em todas as PKs.

   * Restrição estrita de cantos arredondados no Front-end (`border-radius > 0`, zero $90^\circ$).

   * Regra dos $\ge 70$ caracteres para justificativas (BLOCKED/SKIPPED) e auditoria de evidências do Líder.

   * Upload atômico no disco com prevenção absoluta de arquivos órfãos.

4. **Formato das Tarefas:** Tarefas atômicas, objetivas e com critério binário de aceite (Feito / Não Feito).

# CAPÍTULO 1: PREPARAÇÃO DO AMBIENTE E FUNDAÇÃO DA INFRAESTRUTURA

```
[Capítulo 1]
  ├── Step 1.1: Estrutura de Diretórios, Monorepo e CI de Linting [CHECKPOINT 1]
  ├── Step 1.2: Orquestração Docker & Setup do Banco PostgreSQL [CHECKPOINT 2]
  └── Step 1.3: Migrations DDL, Extensões e Seeders de Inicialização [CHECKPOINT 3]

```

### Step 1.1: Estrutura de Diretórios, Monorepo e CI de Linting

> **Meta do Step:** Deixar a fundação do repositório pronta, padronizada e com regras de Clean Code/Linting bloqueantes.

* \[ \] **1.1.1** Criar a árvore de pastas raiz: `gateway/`, `services/`, `frontend/`, `storage-volume/`, `init-scripts/`.

* \[ \] **1.1.2** Inicializar o controle de versão Git com `.gitignore` completo (ignorando `.env`, `node_modules`, `storage-volume/*`, logs, uploads).

* \[ \] **1.1.3** Configurar `.env.example` central com todas as variáveis obrigatórias (portas, senhas, segredo JWT, caminhos de storage).

* \[ \] **1.1.4** Configurar ESLint e Prettier padronizados na raiz com foco em Clean Code (regras rígidas sem any implícito, imports organizados).

* \[ \] **1.1.5** Criar o workflow de CI do GitHub Actions (`.github/workflows/lint.yml`) bloqueando PRs que falharem no linting.

* \[ \] **1.1.6** Criar script npm na raiz para execução unificada de linting em todos os subdiretórios (`npm run lint`).

🛑 **CHECKPOINT 1:** Parar e reportar a estrutura de diretórios e a validação do CI de linting.

### Step 1.2: Orquestração Docker & Setup do Banco PostgreSQL

> **Meta do Step:** Subir todos os contêineres vazios/base comunicando-se na mesma rede interna Docker.

* \[ \] **1.2.1** Escrever o arquivo `docker-compose.yml` contendo os 7 serviços definidos no DSR:

  * `postgres-db` (PostgreSQL 15 Alpine).

  * `api-gateway` (Porta 8000).

  * `auth-service` (Porta 5001).

  * `project-service` (Porta 5002).

  * `test-execution-service` (Porta 5003).

  * `storage-service` (Porta 5004).

  * `frontend-app` (Porta 3000).

* \[ \] **1.2.2** Configurar os volumes nomeados `pgdata` e `local_storage` no `docker-compose.yml`.

* \[ \] **1.2.3** Criar os `Dockerfile`s mínimos de desenvolvimento para cada serviço Node.js com hot-reload ativo (`nodemon` ou `--watch`).

* \[ \] **1.2.4** Criar o `Dockerfile` inicial da aplicação React.

* \[ \] **1.2.5** Executar `docker compose up -d` e verificar a comunicação via healthcheck do contêiner PostgreSQL.

🛑 **CHECKPOINT 2:** Parar e comprovar que os contêineres subiram sem crash e o banco está pronto para conexões.

### Step 1.3: Migrations DDL, Extensões e Seeders de Inicialização

> **Meta do Step:** Estruturar o banco de dados com todas as tabelas, índices e dados demonstrativos iniciais.

* \[ \] **1.3.1** Criar script SQL em `init-scripts/01-extensions.sql` ativando a extensão `"uuid-ossp"`.

* \[ \] **1.3.2** Criar migration/DDL das tabelas de identidade: `users` com enums de papéis e preferências de interface.

* \[ \] **1.3.3** Criar migration/DDL da hierarquia: `projects`, `modules`, `pages`, `features` (com colunas de ordenação e soft delete).

* \[ \] **1.3.4** Criar migration/DDL de cenários e versionamento: `scenarios` e `scenario_versions`.

* \[ \] **1.3.5** Criar migration/DDL de suítes dinâmicas: `suites`, `suite_scenarios` e `suite_runs`.

* \[ \] **1.3.6** Criar migration/DDL de execuções e evidências: `executions` e `execution_evidences`.

* \[ \] **1.3.7** Criar índices de performance no PostgreSQL para chaves estrangeiras, `position`, status e `deleted_at`.

* \[ \] **1.3.8** Criar script `init-scripts/02-seeds.sql` populando:

  * Usuário Administrador (ADM) padrão com senha hasheada (Argon2 ou Bcrypt).

  * Projeto demonstrativo completo: 1 Projeto $\rightarrow$ 1 Módulo $\rightarrow$ 1 Página $\rightarrow$ 1 Funcionalidade $\rightarrow$ 1 Cenário com sintaxe Gherkin válida.

🛑 **CHECKPOINT 3 (Fim do Capítulo 1):** Parar e exibir o schema do banco gerado e a consulta SQL comprovando os dados semente inseridos.

# CAPÍTULO 2: DESENVOLVIMENTO DO BACK-END (MICRO-SERVIÇOS & API GATEWAY)

```
[Capítulo 2]
  ├── Step 2.1: API Gateway Central e Padronização de Erros [CHECKPOINT 4]
  ├── Step 2.2: auth-service (JWT, Cookies HttpOnly e Rate Limit Anti-Força Bruta) [CHECKPOINT 5]
  ├── Step 2.3: storage-service (Upload Atômico, Quotas e Volumes de Disco) [CHECKPOINT 6]
  ├── Step 2.4: project-service (Hierarquia Funcional, Soft Delete e Batch Order) [CHECKPOINT 7]
  ├── Step 2.5: test-execution-service (Gherkin Engine, Suítes, Runs e Execuções Imutáveis) [CHECKPOINT 8]
  └── Step 2.6: Suíte de Integração Back-end via Robot Framework [CHECKPOINT 9]

```

### Step 2.1: API Gateway Central e Padronização de Erros

> **Meta do Step:** Ponto de entrada unificado funcionando na porta 8000, com roteamento semântico e resposta RFC-compliant.

* \[ \] **2.1.1** Implementar o servidor HTTP do Gateway (Express ou Fastify) roteando para `/api/v1/auth`, `/api/v1/projects`, `/api/v1/tests`, `/api/v1/storage`.

* \[ \] **2.1.2** Implementar middleware interceptor global para formatação unificada de erros JSON (`timestamp`, `statusCode`, `error`, `message`, `details`).

* \[ \] **2.1.3** Configurar middleware de segurança HTTP (Helmet) e CORS restrito às credenciais vindas do front-end.

* \[ \] **2.1.4** Implementar middleware de propagação de contexto de usuário autenticado nos headers internos (`x-user-id`, `x-user-role`).

🛑 **CHECKPOINT 4:** Parar e demonstrar o Gateway roteando chamadas e devolvendo o schema padrão de erros.

### Step 2.2: auth-service (JWT, Cookies HttpOnly e Rate Limit Anti-Força Bruta)

> **Meta do Step:** Módulo de segurança, login com bloqueio progressivo e controle de sessão stateless.

* \[ \] **2.2.1** Configurar conexão com PostgreSQL e repositório de usuários.

* \[ \] **2.2.2** Implementar `POST /api/v1/auth/login` validando e-mail/senha com Bcrypt/Argon2.

* \[ \] **2.2.3** Implementar algoritmo de defesa contra força bruta:

  * Contador de falhas consecutivas (`failed_attempts`).

  * Bloqueio progressivo: 5 falhas $\rightarrow$ 5m $\rightarrow$ 15m $\rightarrow$ 45m $\rightarrow$ 2h $\rightarrow$ 24h.

  * Reset de falhas após login bem-sucedido.

* \[ \] **2.2.4** Configurar emissão de `AccessToken` (1h) e `RefreshToken` (1h) gravados em Cookies `HttpOnly`, `SameSite=Strict`, com token anti-CSRF.

* \[ \] **2.2.5** Implementar `POST /api/v1/auth/refresh` rotacionando tokens sem exigir reconexão do usuário.

* \[ \] **2.2.6** Implementar `POST /api/v1/auth/logout` limpando os cookies.

* \[ \] **2.2.7** Implementar `GET` e `PUT /api/v1/auth/profile` para recuperar e atualizar `theme_preference` e `font_scale_percent`.

* \[ \] **2.2.8** Implementar endpoints administrativos CRUD de usuários (`/api/v1/auth/users`), restritos ao papel `ADM`.

🛑 **CHECKPOINT 5:** Parar e validar o fluxo de autenticação, geração de cookies seguros e bloqueio por 5 tentativas falhas.

### Step 2.3: storage-service (Upload Atômico, Quotas e Volumes de Disco)

> **Meta do Step:** Gestão de arquivos de evidência com garantia de não-orfandade e limites físicos rígidos.

* \[ \] **2.3.1** Configurar recepção de `multipart/form-data` via Multer ou Busboy apontando para `/var/app/uploads`.

* \[ \] **2.3.2** Implementar filtros de MIME Type e limites rígidos de payload:

  * Imagens (PNG/JPG/WEBP): máx. 30 MB.

  * Vídeos (MP4/MKV): máx. 200 MB.

  * Logs textuais: máx. 10 MB.

* \[ \] **2.3.3** Implementar o protocolo de atomicidade de disco:

  * Gravar o arquivo temporariamente.

  * Em caso de falha de conexão ou erro no disco, acionar rollback imediato (exclusão física do arquivo residual).

  * Retornar `{ file_path, file_size_bytes, file_type }` apenas após gravação completa e íntegra.

* \[ \] **2.3.4** Implementar rota protegida de download/streaming seguro de evidências por streaming de arquivo estático.

🛑 **CHECKPOINT 6:** Parar e demonstrar upload de imagem e teste de rejeição de arquivo com rollback quando ultrapassar o limite.

### Step 2.4: project-service (Hierarquia Funcional, Soft Delete e Batch Order)

> **Meta do Step:** Governança dos 4 níveis hierárquicos e persistência eficiente de posicionamento drag-and-drop.

* \[ \] **2.4.1** Implementar CRUD para `projects` (apenas Líder de Testes cria/edita; QA/Dev apenas leitura; ADM não altera).

* \[ \] **2.4.2** Implementar CRUD para `modules`, `pages` e `features` (Líder e QA criam/editam; Dev leitura).

* \[ \] **2.4.3** Aplicar filtro automático de Soft Delete (`deleted_at IS NULL`) em todas as queries e endpoint de exclusão lógica.

* \[ \] **2.4.4** Implementar `POST /api/v1/projects/hierarchy/sync-order` recebendo lote de IDs e posições inteiras (`batch update` transacional) para sincronização da ordenação visual.

* \[ \] **2.4.5** Implementar rota agregada de árvore hierárquica completa para consumo direto na UI com baixa latência.

🛑 **CHECKPOINT 7:** Parar e demonstrar a criação da hierarquia de 4 níveis e a alteração de ordem em lote.

### Step 2.5: test-execution-service (Gherkin Engine, Suítes, Runs e Execuções Imutáveis)

> **Meta do Step:** Núcleo de testes do sistema, imutabilidade, snapshots de cenários e governança de evidências.

* \[ \] **2.5.1** Implementar criação/edição de `scenarios` disparando inserção atômica de snapshot na tabela `scenario_versions` a cada mutação de texto Gherkin.

* \[ \] **2.5.2** Implementar CRUD de suítes dinâmicas (`suites`) e vínculo com cenários em ordem sequencial (`suite_scenarios`).

* \[ \] **2.5.3** Implementar `POST /api/v1/tests/suites/:id/run`:

  * Validar se a suíte possui cenários (rejeitar se vazia).

  * Criar registro em `suite_runs` (status `IN_PROGRESS`).

  * Retornar pilha ordenada de cenários pendentes.

* \[ \] **2.5.4** Implementar `POST /api/v1/tests/executions`:

  * Vincular imutavelmente ao `scenario_version_id` corrente no momento do disparo.

  * Bloquear alteração de status passada (sempre nova execução append-only).

  * Validar regra de negócio: Se status `PASSED` ou `FAILED`, exigir ao menos 1 evidência ativa.

  * Validar regra de negócio: Se status `BLOCKED` ou `SKIPPED`, exigir justificativa (`rationale`) com $\ge 70$ caracteres.

* \[ \] **2.5.5** Implementar `PATCH /api/v1/tests/executions/:id/evidences` (exclusivo para Líder de Testes):

  * Inativar evidência antiga (`is_active = FALSE`).

  * Anexar nova evidência mantendo a antiga no histórico.

  * Exigir `comment_audit` com $\ge 70$ caracteres.

  * Garantir imutabilidade do status original do teste.

* \[ \] **2.5.6** Implementar endpoint de retomada de suíte interrompida (`GET/POST /api/v1/tests/suites/runs/:run_id/resume`).

🛑 **CHECKPOINT 8:** Parar e validar a criação de cenário com versionamento, a execução imutável com evidência e a rejeição por justificativa curta (< 70 caracteres).

### Step 2.6: Suíte de Integração Back-end via Robot Framework

> **Meta do Step:** Garantir cobertura total das regras de negócio do back-end através de testes automatizados de API.

* \[ \] **2.6.1** Estruturar diretório de testes do Robot Framework com bibliotecas `RequestsLibrary` e `Collections`.

* \[ \] **2.6.2** Escrever casos de teste automatizados para RBAC (ADM não toca em projetos; DEV não altera dados).

* \[ \] **2.6.3** Escrever casos de teste automatizados validando o bloqueio por força bruta progressiva.

* \[ \] **2.6.4** Escrever casos de teste automatizados validando a obrigatoriedade de evidência e a trava de $\ge 70$ caracteres.

* \[ \] **2.6.5** Executar toda a suíte do Robot Framework gerando o log/report HTML aprovado.

🛑 **CHECKPOINT 9 (Fim do Capítulo 2):** Parar e apresentar o relatório de 100% de sucesso da suíte Robot Framework no back-end.

# CAPÍTULO 3: DESENVOLVIMENTO DO FRONT-END (REACT & EXPERIÊNCIA DO USUÁRIO)

```
[Capítulo 3]
  ├── Step 3.1: Arquitetura Base React, Material Design e Tokens Visuais [CHECKPOINT 10]
  ├── Step 3.2: Camada de Serviços, Contextos e Autenticação com Cookies [CHECKPOINT 11]
  ├── Step 3.3: Módulo de Hierarquia e Persistência Diferida Drag-and-Drop [CHECKPOINT 12]
  ├── Step 3.4: Editor Gherkin em Tempo Real e Versionamento de Cenários [CHECKPOINT 13]
  ├── Step 3.5: Orquestrador de Execução de Suítes e Anexação de Evidências [CHECKPOINT 14]
  ├── Step 3.6: Painel de Auditoria do Líder e Geração de PDF no Cliente [CHECKPOINT 15]
  └── Step 3.7: Testes End-to-End (E2E) com Cypress e Homologação Final [CHECKPOINT 16]

```

### Step 3.1: Arquitetura Base React, Material Design e Tokens Visuais

> **Meta do Step:** Configurar o ecossistema visual React, responsividade Mobile First e temas sem cantos retos.

* \[ \] **3.1.1** Estruturar o projeto React em camadas clássicas: `components/`, `hooks/`, `services/`, `contexts/`, `pages/`.

* \[ \] **3.1.2** Configurar Emotion/MUI ou Tailwind CSS com a regra categórica: **zero cantos de** $90^\circ$ (todas as bordas com raio mínimo `rounded-md` / 8px).

* \[ \] **3.1.3** Implementar Contexto de Tema com suporte a `Dark` e `Light` mode (persistindo na preferência do usuário e respeitando WCAG 2.1 AA).

* \[ \] **3.1.4** Implementar seletor global de escala tipográfica (ajuste percentual dinâmico aplicado ao elemento raiz `html / rem`).

* \[ \] **3.1.5** Criar layout responsivo Mobile First com Drawer retrátil e transição fluida para telas desktop.

🛑 **CHECKPOINT 10:** Parar e demonstrar componentes base renderizados com bordas arredondadas, alternância de tema e escala de fonte.

### Step 3.2: Camada de Serviços, Contextos e Autenticação com Cookies

> **Meta do Step:** Comunicação com o Gateway, controle de rotas privadas por perfil e gestão de sessão com auto-refresh.

* \[ \] **3.2.1** Configurar cliente HTTP (Axios) com `withCredentials: true` e interceptores para tratamento do schema RFC de erros.

* \[ \] **3.2.2** Implementar intercepção para renovação transparente de sessão chamando `/auth/refresh` antes da expiração.

* \[ \] **3.2.3** Criar `AuthContext` disponibilizando dados do usuário logado, permissões e estado de login.

* \[ \] **3.2.4** Construir a tela de Login com feedback de tentativas incorretas e indicação visual de bloqueio temporário.

* \[ \] **3.2.5** Implementar `GuardedRoute` segregando telas com base no RBAC (telas exclusivas de ADM, Líder, QA e Dev).

🛑 **CHECKPOINT 11:** Parar e validar o login no navegador, persistência dos cookies e redirecionamento correto por papel.

### Step 3.3: Módulo de Hierarquia e Persistência Diferida Drag-and-Drop

> **Meta do Step:** Navegação nos 4 níveis funcionais e motor de reordenação com persistência otimizada por buffer/tempo.

* \[ \] **3.3.1** Criar componentes de exibição da hierarquia (Projeto $\rightarrow$ Módulo $\rightarrow$ Página $\rightarrow$ Funcionalidade) em lista navegável tela cheia no mobile e árvore expansível no desktop.

* \[ \] **3.3.2** Integrar biblioteca de Drag-and-Drop (ex.: `@hello-pangea/dnd` ou `dnd-kit`).

* \[ \] **3.3.3** Implementar o motor de **Persistência Diferida de Ordenação**:

  * Atualização visual instantânea no estado do React.

  * Disparo de persistência em lote via buffer de inatividade (debounce de 5 minutos).

  * Gatilho imediato de persistência ao trocar de rota ou fechar a aba (`beforeunload`).

  * Gatilho imediato de persistência no momento de renovação de token.

* \[ \] **3.3.4** Modais de criação/edição com Soft Delete para os nós da árvore.

🛑 **CHECKPOINT 12:** Parar e demonstrar o reordenamento de itens na tela e a chamada de sincronização ocorrendo conforme os gatilhos definidos.

### Step 3.4: Editor Gherkin em Tempo Real e Versionamento de Cenários

> **Meta do Step:** Interface fluida para escrita de testes BDD com destaque de sintaxe e rastreabilidade de versões.

* \[ \] **3.4.1** Implementar editor de texto livre com parsing sintático em tempo real destacando cláusulas Gherkin (`Feature`, `Scenario`, `Given`, `When`, `Then`, `And`, `Examples`).

* \[ \] **3.4.2** Criar visualizador de histórico de versões do cenário ($v_1, v_2, \dots$), permitindo comparar alterações de texto.

* \[ \] **3.4.3** Formulário de vinculação de cenários à funcionalidade correspondente.

🛑 **CHECKPOINT 13:** Parar e exibir o editor Gherkin com destaque visual colorido de sintaxe e o histórico de versões salvo.

### Step 3.5: Orquestrador de Execução de Suítes e Anexação de Evidências

> **Meta do Step:** Bateria de testes em lote, formulário de execução com upload de evidências e retomada de execuções pausadas.

* \[ \] **3.5.1** Construir tela de montagem de Suítes de Teste dinâmicas (seleção de múltiplos cenários de diferentes funcionalidades).

* \[ \] **3.5.2** Criar tela de execução de suíte com barra de progresso e navegação item a item na pilha sequencial.

* \[ \] **3.5.3** Implementar modal de registro de execução com máquina de estados:

  * Seleção de status (`PASSED`, `FAILED`, `BLOCKED`, `SKIPPED`).

  * Upload de arquivos de evidência com validação de tamanho no cliente antes do envio (imagens até 30 MB, vídeos até 200 MB).

  * Bloqueio de finalização de `PASSED`/`FAILED` caso nenhuma evidência tenha sido anexada.

  * Campo de texto de justificativa com contador obrigatório de caracteres ($\ge 70$) para `BLOCKED` ou `SKIPPED`.

* \[ \] **3.5.4** Implementar mecânica de retomada de suíte interrompida a partir do ponto de parada (`suite_runs`).

* \[ \] **3.5.5** Exibir badge com o selo da suíte: **"ESTÁVEL"** ($\ge 70\%$ PASSED) ou **"INSTÁVEL"** ($< 70\%$).

🛑 **CHECKPOINT 14:** Parar e demonstrar o fluxo completo de rodar uma suíte, anexar evidência e pausar/retomar a bateria.

### Step 3.6: Painel de Auditoria do Líder e Geração de PDF no Cliente

> **Meta do Step:** Telas de saneamento de evidências com histórico perene e emissão de relatório PDF no navegador.

* \[ \] **3.6.1** Criar tela exclusiva para o Líder de Testes para substituição de evidências de execuções finalizadas.

* \[ \] **3.6.2** Implementar formulário com upload da nova evidência e validação obrigatória do comentário de auditoria com mínimo de 70 caracteres.

* \[ \] **3.6.3** Criar linha do tempo visual mostrando a evidência original arquivada, a evidência atual, a justificativa e o autor da mudança.

* \[ \] **3.6.4** Implementar componente de exportação de relatório PDF diretamente no front-end (`@react-pdf/renderer` ou `jsPDF`):

  * Cabeçalho padronizado: Nome do Projeto, Escopo e Data/Hora da Geração.

  * Volumetria total de testes por módulo.

  * Gráfico e taxas consolidadas de sucesso/falha.

🛑 **CHECKPOINT 15:** Parar e exibir o PDF exportado gerado localmente e a tela de trilha de auditoria do Líder.

### Step 3.7: Testes End-to-End (E2E) com Cypress e Homologação Final

> **Meta do Step:** Validação integrada ponta a ponta da aplicação completa e preparação para entrega final.

* \[ \] **3.7.1** Configurar Cypress no projeto frontend com comandos customizados para autenticação.

* \[ \] **3.7.2** Escrever spec E2E cobrindo o fluxo: Login $\rightarrow$ Criação de Projeto $\rightarrow$ Escrita de Cenário Gherkin $\rightarrow$ Execução com Upload de Imagem.

* \[ \] **3.7.3** Escrever spec E2E testando a trava impeditiva de justificativa curta (< 70 caracteres) para status BLOCKED.

* \[ \] **3.7.4** Escrever spec E2E testando a substituição de evidência pelo Líder de Testes.

* \[ \] **3.7.5** Rodar toda a bateria do Cypress em modo headless (`cypress run`) comprovando 100% de aprovação.

🛑 **CHECKPOINT 16 (Conclusão do Projeto):** Parar, apresentar o relatório final consolidado de homologação e disponibilizar os comandos para o time subir a aplicação.