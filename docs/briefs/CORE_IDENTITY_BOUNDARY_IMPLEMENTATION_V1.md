# Implementation Brief — Core Identity Boundary v1

> **For agentic workers:** usar `superpowers:executing-plans` para executar as etapas inline, quando essas skills estiverem disponíveis. Claude Code é o executor previsto; não implementar nesta branch documental.

- **Status:** pronto para handoff após aceite do ADR-007; produção e políticas PO continuam gates separados.
- **Goal:** implementar o boundary técnico de identidade e APIs estreitas de credenciais, com provas reais de autorização, sessões e falhas parciais.
- **Architecture:** um serviço Core no mesmo Compose; Auth por API interna, Core por funções privadas/role restrita, estado/auditoria no PostgreSQL existente. Sem backend de negócios ou Edge Functions.
- **Tech Stack:** Node 24 LTS, TypeScript strict/ESM, Fastify 5, `pg` 8, `fetch` nativo, npm/lockfile existente.
- **Spec:** [ADR-007-core-identity-boundary](../decisions/ADR-007-core-identity-boundary.md).
- **Branch futura:** `feat/core-identity-boundary-v1`, criada da `integration/core-foundation-v2-wave2` depois de D aceito e da revisão das integrações A/B/C. PR para essa integração; sem merge/deploy implícito.

## 1. Instrução para Claude Code e fontes

Execute este brief como implementação técnica; leia `AGENTS.md`, ADR-007 completo, ACCOUNT_LIFECYCLE_V1, SECURITY, AUTHORIZATION, ADR-004/005, Compose/Kong/UPSTREAM e workflows relevantes. Confirme o HEAD inicial e os contratos A/B/C integrados antes de criar migration: não copiar interfaces antigas de outra branch nem reabrir o desenho do runtime.

Implemente e valide as etapas abaixo em commits pequenos. Não implemente UI administrativa/Minha Conta, SMTP, MFA, inativação/reativação Auth, outros módulos ou produção. Faça commit/push e PR de integração somente quando autorizado pela tarefa que invocar este brief. Na ausência de aceite do ADR, revisar/documentar é permitido; execução de runtime não começa por inferência.

## 2. Global constraints e decisões PO

- Browser recebe chave pública/JWT próprio; nenhuma service role, senha DB ou signing secret no bundle/respostas comuns.
- Auth Admin somente pelo adaptador interno; nenhum DML SQL em `auth.users`, `auth.sessions`, refresh tokens ou hashes de senha.
- Core profile/lifecycle inicial nascem no trigger da criação Auth; não segundo insert de profile no serviço.
- Não converter `profiles.active=false` em hold de senha; preservar regras de revogação/delegação.
- Default deny externo para Admin Auth e PUT user; default deny em dados para estado/sessão ausentes.
- Nova migration incremental; nenhuma migration aplicada é editada. Nenhuma alteração em Audit/Action Plans ou contratos de read model A/B/C.
- Serviço sem `JWT_SECRET`/credencial `postgres`; DB role só EXECUTE privado; segredo Auth no adaptador Admin isolado.
- Sem retry cego de mutação Auth em timeout, sem persistir senhas/links/hashes de request, sem exposição de introspecção SQL/headers.
- Runtime versions exatas/lockfile, imagem com patch/digest registrado; `npm ci`; nada instalado no boot.
- Limites iniciais CI/staging: body 16 KiB, Auth 10 s, request 20 s, drain 30 s; administração recente por sessão de senha ≤300 s. Defaults de rate limit são os do ADR §9.

Este brief permite **construir e testar em CI com identidades fictícias** todos os fluxos. Habilitação funcional para pessoas depende das decisões abaixo; fora de CI fixtures, feature switches começam desligados e não permitem acesso alternativo a Auth Admin.

| Decisão ACCOUNT_LIFECYCLE | O que o executor faz sem inventar aprovação |
| --- | --- |
| PO-01 runtime | Fechado tecnicamente por ADR-007; implementação exige seu aceite |
| PO-02 primeiro acesso obrigatório, PO-05 prazo, PO-07 senha | Implementar mecanismo fail-closed e parâmetros; usar 24 h/12 caracteres apenas em CI. Não liberar onboarding real antes de política registrada |
| PO-03 adoção legada | Ferramenta operador aceita lista de UUIDs reconciliados; nenhuma adoção de todos os profiles por default. CI fornece lista sintética; produção não roda nesta entrega |
| PO-04 entrega/confirmar e-mail, PO-08 reset | Testar temporária em CI. Habilitar criação/reset real somente com procedimento de identidade/endereço/entrega/justificativa aprovado; flag client nunca decide `email_confirm` |
| PO-06 sessões/JWT/Storage | Implementar cutoff e novo login; manter TTL JWT atual no default versionado até aprovação de redução. Não prometer revogação de URL já assinada |
| PO-09 SMTP/suporte, PO-10 inativação/reativação | Fora da implementação; manter recuperação assistida existente e rotas SMTP fechadas |
| PO-11 retenção, PO-12 limites, PO-13 MFA, PO-14 continuidade admin | Fornecer logs/limites/config e registro de gates; não habilitar produção sem procedimento aprovado, AAL2 ou decisão explícita de adiamento, e bootstrap/emergência revisados |

Modo CI não é um bypass no servidor/RLS: mesmos checks e schemas; muda apenas configuração de política e bootstrap operador com alvos fictícios. Não adicionar endpoint público para bootstrap/adotar usuários nem variável que desative autorização.

## 3. File structure e serviços

Lista permitida para esta implementação; novos arquivos dentro dos diretórios indicados precisam ter uma responsabilidade clara. Qualquer nova superfície fora da lista exige explicar a necessidade no PR antes de ampliar escopo.

| Arquivos | Responsabilidade |
| --- | --- |
| `apps/core-identity/package.json`, `tsconfig.json`, `Dockerfile`, `.dockerignore` | Workspace/build e imagem Node pinada; código runtime nunca importado pelo web |
| `apps/core-identity/src/config.ts`, `server.ts`, `main.ts` | Validar config/secrets, factory Fastify testável, startup/drain |
| `apps/core-identity/src/contracts.ts`, `routes.ts`, `identity.ts` | Tipos/schemas, endpoints ADR §6, orquestração de fases |
| `apps/core-identity/src/auth.ts`, `database.ts` | Adaptadores estreitos Auth/SQL; interfaces abaixo; sem clients globais mutáveis entre contexto titular/Admin |
| `apps/core-identity/src/rateLimit.ts`, `audit.ts`, `reconcile.ts`, `health.ts` | Limites persistentes, eventos/logs sanitizados, reconciliação, probes/métricas |
| `package.json`, `package-lock.json`, `eslint.config.js`, `vitest.config.ts` | Novo workspace e comandos do serviço; preservar validações web existentes |
| **Nova migration** `supabase/migrations/<timestamp>_core_identity_boundary_v1.sql` | Ledger/lifecycle/rate-limit, função trigger complementar, helpers canônicos incrementalmente, grants runtime e eventos |
| `tests/core-identity-auth.test.ts`, `core-identity-api.test.ts`, `core-identity-database.test.ts`, `core-identity-failures.test.ts`, `core-identity-observability.test.ts` | Contratos, autorização, concorrência e fault injection sem credenciais reais |
| `tests/integration/core-identity.mjs`, `tests/identity-fixture.ts`, `tests/integration/identity-fixture.mjs` | Auth/Kong/PostgreSQL reais e fixtures com sessões/lifecycle admitidos |
| `tests/*database.test.ts`, `tests/storage-stub.ts`, `tests/integration/*.mjs` existentes | Apenas adaptação **test-only** do bootstrap de identidade/sessão que o predicado compartilhado exigir; não mudar assertions de negócio para fazê-las passar |
| `infra/supabase/docker-compose.yml`, `volumes/api/kong.yml`, `UPSTREAM.md`, `infra/README.md` | Sexto serviço, redes/allowlist/limits, proveniência e comandos em duas fases |
| `infra/env/staging.env.example`, `production.env.example` | Nomes/placeholders server-only; production permanece não executável |
| `scripts/ops/gen-secrets.sh`, `common.sh`, `healthcheck.sh`, `smoke.mjs`, **novo** `identity-admin.mjs` | Secrets CI/runtime, guards/probes, fixtures internas e adoção/reconciliação operador em alvo descartável explícito |
| `.github/workflows/infra-validate.yml`, `validate.yml`, **novo** `core-identity-validate.yml` | Validar seis serviços e runtime Node24; gates/negativas e suite real, sem deploy |
| `docs/architecture/CORE_IDENTITY_BOUNDARY_V1.md`, `docs/operations/CORE_IDENTITY_RUNBOOK_V1.md` | Contratos implementados, versões/digests, evidências e runbook; distinguir implementação de produção |

`volumes/db/roles.sql`, `jwt.sql` e `kong-entrypoint.sh` não precisam ser alterados: a role runtime nasce por nova migration e recebe senha por comando operador guardado; entrypoint vendorizado permanece íntegro. Se a avaliação real demonstrar necessidade, registrar o delta/proveniência e justificar antes de editar. Não hardcode senha na migration nem pressupor que o bootstrap inicial rode de novo em volume existente.

Serviços alteráveis: adicionar `core-identity`; Kong rotas/plugins/redes; Auth política nativa de senha atual e rede; DB rede/grants por migration. REST/Storage: somente conexões/rede necessárias para preservar stack, sem mudança de APIs, schemas expostas/buckets ou dados de negócios. Sem serviço Functions/Tunnel/SMTP novo.

## 4. Interfaces fixas para as etapas

Nomes abaixo são contratos locais sugeridos para evitar divergência entre tarefas; não criar package Shared genérico.

- `VerifiedActor`: `{ userId: string; sessionId: string; sessionCreatedAt: string; credentialState: 'credential_pending' | 'ready'; generation: number }`. Construtor apenas em validação confiável; nenhum objeto vindo de body é aceito como ator.
- `AuthPort`: `validateUser(jwt)`, `createUser({id,email,displayName,temporaryPassword,operationId,emailConfirm})`, `readUser(id)`, `resetPassword({id,temporaryPassword,operationId,generation})`, `changeOwnPassword({jwt,currentPassword,newPassword})`, `logoutOwn({jwt,scope:'global'})`. Contextos/headers construídos internamente; métodos não aceitam URL/role/metadados arbitrários. DTOs sanitizados; senha nunca no resultado persistível.
- `IdentityStore`: `verifySession({userId,sessionId})`, `beginOperation({actor,type,targetId,email,idempotencyKey,nonSecretInput})`, `authorizePhase({operationId,actor,expectedGeneration})`, `commitPhase({operationId,expectedGeneration,outcome})`, `operationStatus({actor,operationId})`, `consumeRateLimit({bucket,limit,windowSeconds})`. Cada método chama função privada tipada; não expõe `query(sql)` para handlers.
- `OperationResult`: `{ operationId: string; status: 'pending'|'completed'|'failed'|'reconciliation_required'; code?: string }`. Campo `temporaryPassword` somente DTO de resposta de emissão única, depois do commit; nunca `OperationResult` do ledger/replay.
- `buildServer({config,auth,store})`: retorna instância Fastify sem abrir porta; tests usam `inject`. `main.ts` abre listener/gerencia SIGTERM. Probes sem efeitos Auth mutantes.
- Estados DB `provisioning`, `credential_pending`, `ready`, `security_hold`; geração monotônica; cutoff por `auth.sessions.created_at`, não por JWT `iat`.

Formato externo e semântica de endpoints são ADR §6; não implementar aliases permissivos ou passthrough de payload. Ator/alvo/operation UUIDs são validados, nomes/e-mails limitados e normalizados. Respostas têm `Cache-Control: no-store`; `operations/:id` nunca entrega segredo nem enumera alvos sem autoridade.

## 5. Review focus

| Condição perigosa | Teste e resultado obrigatório |
| --- | --- |
| JWT antigo é renovado depois do cutoff | Mesma `session_id`/created_at continua negada em Core, REST/GraphQL e Storage; `iat` novo não libera |
| Executor morre enquanto Auth ainda pode completar request | Lease vencida não lança segundo reset; conta continua hold; retomar só após quiescência/evidência |
| E-mail existente ou resposta create perdida | UUID reservado/marker decide reconciliação; conta com mesmo e-mail e UUID diferente é conflito |
| Permissão do admin/composição da role muda durante a operação | Nova fase revalida; segredo não é entregue se perdeu autoridade; efeito Auth ocorrido é auditado |
| Restore ressuscita senha/sessão antiga e Kong recebe URL/método alternativo | Cutoff/revisão de conta impede acesso Core; allowlist normalizada não abre Admin/PUT bypass |

## 6. Etapas de implementação

### Etapa 1 — Persistência privada e autorização canônica

**Consome:** ADR §§5/7/8 e helpers atuais; **produz:** `IdentityStore` e barreira de sessão/lifecycle compartilhada.

- [ ] Criar testes DB que falhem para sessão inexistente/alheia/pré-cutoff, lifecycle ausente/pending/hold, inativo, escopo insuficiente, auto-reset, autoridade parcial sobre alvo e tentativa EXECUTE por `anon`/`authenticated`/role runtime fora da allowlist.
- [ ] Executar `npx vitest run tests/core-identity-database.test.ts`; registrar falhas por ausência do contrato, não por erro de fixture.
- [ ] Gerar migration pelo CLI disponível após `supabase migration new --help`; implementar estruturas, trigger complementar e funções privadas. Owners/search_path/grants explícitos. Função de decisão retorna apenas fatos necessários; sem acesso geral a Auth. Preservar semântica `can_manage_profile`/`can_revoke`.
- [ ] Integrar predicado em helpers Core; adaptar fixtures de testes à identidade/sessão realista sem condicional que ignore sessão no ambiente test. Adoção operator-only, lista explícita, auditada; bootstrap do primeiro admin em fixture CI separado do servidor.
- [ ] Exercitar duas sessões PostgreSQL em concorrência: grants/role edit/inativação contra begin/finalização. Confirmar locks, geração e deny; rodar suite DB existente e `npm test` sem alterar assertions de negócio.
- [ ] Commit atômico de migration/fixtures/contratos DB com evidência de privilégio negativo.

### Etapa 2 — Runtime, JWT e adaptador Auth

**Consome:** `IdentityStore`; **produz:** `buildServer`, `AuthPort`, factory de config e validação `VerifiedActor`.

- [ ] Criar testes auth/API negando chave pública/service role, assinatura inválida, issuer/audience errados, token expirado/futuro, header duplicado, user ID divergente, token sem sessão, profile inativo/hold e indisponibilidade Auth. Testar limites de body/header e erros sem dump.
- [ ] Executar `npx vitest run tests/core-identity-auth.test.ts tests/core-identity-api.test.ts` e confirmar testes novos vermelhos pelo contrato faltante.
- [ ] Criar workspace Node24/Fastify5/TS strict e pin/lock das versões. Implementar GET Auth online + checks de claims + store, adaptador nativo de paths exatos, SQL com parâmetros e config lendo secrets montados. Nenhum `JWT_SECRET`/client Admin compartilhado com requests titular.
- [ ] Adicionar `typecheck`, `build`, `test` do serviço e agregação root sem quebrar scripts web. Executar checks; publicar no documento implementado patches/digests/dependências, sem instalar produto fora do escopo.
- [ ] Commit runtime/validação/adaptadores; só health/status autenticado até a etapa seguinte.

### Etapa 3 — Orquestração e falhas Auth/Core

**Consome:** `AuthPort`, `IdentityStore`, `VerifiedActor`; **produz:** endpoints ADR §6 com ledger e emissão única.

- [ ] Testes de criação idempotente, e-mail duplicado, mesma chave com campos não secretos divergentes, segredo nunca em replay, reset sem autoalteração, primeiro acesso expirado/geração antiga e troca própria com senha atual incorreta.
- [ ] Testes de fault injection antes/depois de cada efeito/commit: resposta Auth perdida, crash, audit outage, logout outage, drift profile, lease vencida e operação antiga em voo. Confirmar hold e ausência de segundo efeito; incluir os cinco review-focus cenários pertinentes.
- [ ] Testar finalização própria após logout confirmado: a sessão encerrada não é exigida de novo para o commit privado, mas evidência Auth, profile ativo e geração vigente são obrigatórios. Hold próprio permite somente continuação vinculada; inativação/hold concorrente nega. Não expor opção pública de ignorar sessão.
- [ ] Rodar `npx vitest run tests/core-identity-api.test.ts tests/core-identity-failures.test.ts`, confirmar falha inicial e implementar fases curtas, locks/leases/CAS, correlação Admin e reconciliação limitada. Nenhuma transação SQL esperando HTTP; nenhuma senha persistida.
- [ ] Implementar revogação administrativa **Core** sem troca de senha, resultado explícito sobre refresh Auth. Reset tem poder distinto e testado. `me` não aceita alvo escolhido pelo request. Mutações exigem chave UUID e justificativa onde administrativo.
- [ ] Configurar switches funcionais desligados fora de CI até decisões PO aplicáveis; nenhum switch desliga autorização. `202`/status para ambiguidade, reemissão nova para entrega incerta. Revalidar ator antes de fase/replay/entrega.
- [ ] Testes verdes de contratos/falhas; commit da orquestração.

### Etapa 4 — Compose/Kong e provas reais da API pinada

**Consome:** serviço/DB implementados; **produz:** stack de seis serviços com ingress restrito e suite real.

- [ ] Criar `tests/integration/core-identity.mjs` com asserts reais: criar exatamente um Auth/profile/lifecycle; trigger falho aborta criação; `current_password` errada/ausente nega; reset administrativo termina sessões/refresh; troca titular mantém sessão atual até logout; JWT antigo negado pela barreira mesmo dentro de `exp`.
- [ ] Acrescentar testes Kong com chave pública **e service key sintética CI**: Admin e PUT externos devem falhar para ambas; Admin interno autorizado funciona. Testar método, normalização, prefixos, trailing slash/URL escapes e headers, sem reabrir rota ampla.
- [ ] Implementar Compose/redes/secrets/Core health e Kong allowlist ADR §4. Habilitar password-require-current no Auth e rate limit pinado. Não criar dependência circular; startup platform → migration/runtime credential → Core readiness.
- [ ] Atualizar `smoke.mjs` para fixture Admin interna por `compose exec`/adapter operador, health externo mínimo e expectativas de lifecycle; remover deletes de profile para compensar lifecycle de produto. Cleanup fictício segue processo descartável e APIs suportadas, sem apagar trilha para satisfazer teste.
- [ ] Atualizar assertions CI de cinco para seis serviços, preserve loopback/no host DB/Auth/Core ports. Fixture tem grants/sessões/adoção controlados; suite nova usa mesmo Compose, sem cloud. CLI integração legada precisa da mesma configuração Auth/session; não presumir configuração do Dashboard.
- [ ] Executar `node tests/integration/core-identity.mjs --environment ci --env-file <arquivo-externo> --project <alvo-novo> --database postgres`; implementar esse parser/guard com a mesma segurança de `scripts/ops/common.sh`. Sem alvos implícitos, DB externo ou produção. Resultado esperado: todas as assertions/negativas passam e cleanup always remove somente o projeto criado.
- [ ] Rodar smoke/health e integrações existentes nos jobs adequados; commit stack/CI/evidências.

### Etapa 5 — Abuso, auditoria, saúde e recuperação

**Consome:** serviço/stack; **produz:** limites observáveis, readiness e runbook verificável.

- [ ] Testar buckets por ator/alvo/origem, persistência no restart, NAT/IP spoof, `Retry-After`, status versus emissão e fail-closed sem limitador. Teste concorrente prova que limite atômico não aceita chamadas além do orçamento.
- [ ] Testes canário procuram senhas/JWT/service key fictícios em logs/erros/audit/bundle. Verificar Pino, Kong e Auth reais; eventos guardam ator humano/executor/operation/status e não segredos. Sem label métrica por usuário.
- [ ] Testar `/livez=200` e `/readyz=503` com Auth/DB indisponível, credencial expirada/role incorreta e schema ausente; probes não alteram conta. Testar drain/SIGTERM e crash sem replay Auth.
- [ ] Executar `npx vitest run tests/core-identity-observability.test.ts` vermelho → implementar → verde; testar offline Auth/DB/Core no Compose descartável com recovery de readiness. Não afirmar que Docker reinicia container somente porque health virou unhealthy.
- [ ] Criar runbook com manutenção, operação pendente, entrega perdida, bootstrap/adotar UUIDs explícitos, rotate DB/HS256 coordenado, backup completo/roles, restore/cutoff/revisão de credenciais e rollback compatível. Defaults/PO e owners explícitos; sem senha no documento.
- [ ] Demonstrar restore em **novo** projeto descartável com DB Auth/Core/ledger e roles recuperados; refresh/JWT pré-restore negado Core e conta com reset perdido fica hold. Demonstrar rollback N/N-1 sem remover predicado ou reabrir Admin/PUT. Se alguma prova não puder ser feita, registrar impedimento real e manter gate correspondente fechado.
- [ ] Commit controles e runbook com comandos/evidência sanitizada.

## 7. Validação final obrigatória e entrega

Executar, registrar resultado real e corrigir regressões antes de concluir:

- `npm ci`; `npm run typecheck`; `npm run lint`; `npm test`.
- `npm run typecheck -w apps/core-identity`; `npm run build -w apps/core-identity`.
- `npm run build` e `npm run verify:build` com valores públicos fictícios definidos pelo CI atual; bundle sem segredo de runtime.
- `bash -n scripts/ops/*.sh` por arquivo e ShellCheck conforme workflow; `node --check` nos scripts novos/alterados.
- `docker compose ... config --quiet`, seis serviços, imagem pinada, porta somente Kong loopback, redes/segredos/readiness; não imprimir configuração com secrets.
- Health/smoke/identity integração Compose real, fault injection/concorrência e testes atuais CLI/PostgreSQL/Storage. Schema `private` e funções runtime não acessíveis por Data API/browser.
- Restore/rotação/rollback descartáveis conforme etapa 5; nenhum teste constitui deploy, capacidade física ou production ready.
- `git diff --check`; revisão do diff completo, whitelist, migrations append-only, nenhum secret/Quality/UI/deploy fora do escopo. Atualizar docs e checklist com evidências, não marcar checks não executados.

Entregar HEAD/commits, arquivos/migration, versões/digests, validações, PR de integração quando autorizado e gates PO/operacionais restantes. Se a coordenação A/B/C alterou helpers/Core audit durante o trabalho, reconciliar só os conflitos do boundary sem reescrever contratos ou force-push. Nenhum merge para main ou deploy pertence a este brief.
