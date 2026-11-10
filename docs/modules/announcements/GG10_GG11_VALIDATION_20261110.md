# GG-10 e GG-11 — validação de 10/11/2026

Base remota conferida `a0d479e2a1b035b390dab9840a3b61faf46ec266`. Implementação
`a279e101e20fe5abb79dcf4f7349576926c0e878`. Branch
`codex/gg-10-refinement-gg-11-feedback`. O worktree isola arquivos porque o
checkout original continha alterações de outra frente. O runtime continuou
sendo o Supabase local existente.

## GG-10 — Comunicados

- **PASS — SQL em memória** com `npm test -- --maxWorkers=3`. Listagem
  ordena o ativo antes da paginação. A constraint aceita períodos adjacentes e
  rejeita sobreposições na criação e edição. Foram exercitadas combinações de
  cor e categoria, atualização obsoleta, perfil inativo, revogação, ausência de
  permissão global e histórico imutável.
- **PASS — Chromium com transporte sintético** com
  `GG10_BROWSER_BUILD=1 node tests/integration/announcements-browser.mjs`.
  Editor, destaque **ATIVO**, botão **Editar**, ausência de histórico na
  interface, foco, barra sticky e reflow entre 320 e 1.440 px. Menor
  contraste de texto e botão nas seis combinações medidas de 9,26:1.
- **BLOCKED — migration no banco persistente local.** O ensaio de instalação
  com `docker exec -i supabase_db_gaucha-gestao-local psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f -`
  retornou o `23P01` esperado no preflight. A transação terminou sem instalação.
- **NOT EXECUTED localmente —** duas sessões concorrentes com a migration
  persistida. A matriz de CI exercita duas transações PostgreSQL independentes
  no job `action-plans-integration`.

## GG-11 — Relatos e sugestões

- **PASS — PostgreSQL 17.6 real, transação com ROLLBACK.** O mesmo comando
  `docker exec ... psql` executou a migration sem o `COMMIT` interno e
  criou apenas identidades e relatos sintéticos dentro da transação. O ensaio
  verificou recibo idempotente, auditoria única, leitura administrativa,
  negativas para funcionário e Gestor de Comunicados, tentativa de delegação,
  perfil inativo e sessão revogada. A RLS foi exercitada com metadados
  sintéticos de Storage e as operações declaradas pelo Storage. A checagem após
  o `ROLLBACK` confirmou ausência do schema e do bucket novos.
- **PASS — Chromium com transporte sintético.** Abriu o formulário pela barra
  e pela entrada permanente a 320 px, rejeitou PNG inválido, simulou perda de
  rede sem recibo, recuperou pelo mesmo UUID e abriu detalhe administrativo.
- **NOT EXECUTED localmente —** Auth/PostgREST/Storage HTTP de ponta a ponta
  com bytes reais. A matriz de CI usa identidades, imagem e dados sintéticos.
  O PostgreSQL valida a reserva, a autoria e os metadados. O backend não
  inspeciona o conteúdo binário da imagem.
- **NOT EXECUTED —** homologação manual do mantenedor em aparelhos físicos.

## Inventário e estado local

Destino confirmado por Docker, mapeamento em loopback, banco `postgres` e
ledger com **36 migrations**. Antes e depois dos ensaios, havia **18 avisos**,
sendo 3 arquivados, 2 rascunhos, 11 inativos e 2 publicados, e **57 versões**.
Os dois publicados têm ambos os limites vazios e derivam status ativo. O
inventário por UUID, estado e quantidade de versões foi salvo localmente
com modo 0600, sem título, mensagem ou autoria.

**BLOCKED — limpeza física e exemplos.** A FK de `notice_history` depende da
linha do comunicado e seu trigger impede apagar o histórico. A inspeção
também não comprovou a proveniência sintética de todos os registros. Nenhuma
exclusão, alteração de aviso, cópia de conteúdo ou criação de exemplos foi
realizada. A alternativa preserva a trilha. O mantenedor identifica os avisos
sintéticos e decide qual publicação ajustar ou desativar pela administração.
Depois, aplica as migrations e valida os dois exemplos por fluxo normal. Se
for necessário ocultar os registros antigos, definir um filtro explícito que
preserve o acervo. A lista permanecerá com os registros existentes enquanto
não houver essa decisão.

## Checks e preparação da release candidata

`npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:build`
e `npm audit --audit-level=moderate` passaram localmente. O Vite emitiu aviso
sobre o tamanho do chunk principal. A consulta npm reportou zero vulnerabilidades.
O Chromium foi executado a partir do bundle verificado para evitar usar o Vite
da frente paralela.

Na integração, revalidar as mudanças independentes de `App.tsx` da #107,
`navigation.ts` da #115 e as adições da #116 aos contratos de autorização e
ao roadmap. Conferir a sequência do ledger se a #116 for integrada antes
da candidata. A #114 trata de backup e não altera os fluxos. Exigir inventário
de sobreposições, CI da candidata e aprovação do mantenedor antes de qualquer
passo operacional. A revisão humana é do mantenedor único. A reversão de
interface preserva as tabelas e objetos. C30, STAGING e PROD ficam fora
da autorização deste trabalho.
