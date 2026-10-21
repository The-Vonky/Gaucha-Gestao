> **Brief histórico do Core v2.** As branches de integração, proprietários de arquivos e estados de execução aqui citados valem **somente para a rodada original**. Não iniciar tarefa nova nem recriar essas branches sem uma issue atual aprovada; usar `origin/main` conforme [AGENTS.md](../../AGENTS.md).

# Brief — Interface de logs legíveis v1

**Leitura original:** `AGENTS.md`, `CORE_ADMIN_UI_WAVE3.md`, `CORE_AUDIT_LOG_READ_MODEL_V1.md`, `LogsPage` e API/tipos atuais.

Criar tela `LogsPage` **somente de leitura**, alimentada por `core.audit_log_page` via adaptador próprio `audit-log-review-api.ts` e tipos locais:
- filtrar intervalo `[from,to)`, UUID de autor ou pesquisa de nome **autorizada**, módulo/ação e tipo/ID da entidade;
- paginação/ordenação estáveis, total e botão explícito de limpar filtros;
- apresentar **quem, quando, ação, entidade, unidade, setor** com linguagem de operador; IDs e before/after/metadata somente como detalhe técnico secundário;
- avisar que pesquisa por nome só encontra autores visíveis ao chamador; desconhecido/restrito não vira nome inventado;
- rótulos seguros de ativo/inativo, respeito ao escopo e privacidade; loading/erro/vazio/negado acessíveis em pt-BR;
- preservar navegação e gate de permissão, **sem novas permissões**.

Na divisão de arquivos histórica, apenas `LogsPage.tsx` e novos `audit-log-review*`/testes pertenciam a essa trilha; não alterar `api.ts`, `types.ts`, `admin.css`, `parts.tsx` ou testes compartilhados. Sem migration, mutação ou política de retenção.

Testar filtros, limites de tempo, autores invisíveis, entrada inválida, detalhes, paginação e erros RPC. A orientação antiga era PR para `integration/core-foundation-v2-wave2`, **sem merge autônomo**. Não usar essa branch como destino atualmente.
