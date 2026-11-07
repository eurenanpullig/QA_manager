# Regras Inegociáveis de Governança e Execução (Gestor de Testes)

1. **Execução Incremental Rigorosa (Um Step por Vez):**
   - NUNCA execute, escreva código ou antecipe arquivos de um Step seguinte antes de receber a validação e autorização expressa do usuário.
   - Ao concluir todas as microtarefas do Step corrente, emita o relatório do **CHECKPOINT** correspondente, apresente as evidências de execução e **PARE IMEDIATAMENTE** sem invocar novas ferramentas de escrita ou execução do próximo Step.
   - Sempre finalize o relatório com a frase: *"Step [X.Y] finalizado. Aguardo sua validação técnica para prosseguir para o Step [X.Z]"*.

2. **Versionamento e Pull Requests no GitHub:**
   - Somente após a validação do usuário (ou ao fechar o Step autorizado), faça commit na branch `feat/step-X.Y`, suba para o repositório remoto (`origin`), crie o Pull Request via `gh pr create` e realize o merge para `main`.
