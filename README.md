# Gaúcha Gestão

Plataforma corporativa modular que centraliza os sistemas internos da Gaúcha Alimentação: autenticação, autorização por unidade, auditorias de qualidade, planos de ação, evidências e, aos poucos, os demais sistemas da empresa.

> **Estado em 15/10/2026:** o software da Qualidade v1 e a Fundação Core v2 estão na `main` e passam nos checks. **A plataforma não está em produção e não está liberada para produção (NO-GO).** O host foi decidido (Lenovo ThinkStation C30, [ADR-008](docs/decisions/ADR-008-production-host-thinkstation-c30.md)), mas ainda não foi preparado. A ordem do que falta está no [Plano Diretor 2026](docs/planning/PLANO_DIRETOR_2026.md).

## Sumário

- [Onde estamos](#onde-estamos)
- [Próximos passos](#próximos-passos)
- [Decisões pendentes](#decisões-pendentes)
- [Arquitetura em resumo](#arquitetura-em-resumo)
- [Módulos](#módulos)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Como rodar localmente](#como-rodar-localmente)
- [Testes e CI](#testes-e-ci)
- [Como trabalhar no repositório](#como-trabalhar-no-repositório)
- [Mapa da documentação](#mapa-da-documentação)
- [Princípios](#princípios)

## Onde estamos

| Frente | Situação | Referência |
| --- | --- | --- |
| Qualidade v1 (software) | Implementada e integrada: Auditoria (158 critérios), reabertura, Planos de Ação, evidências, Checklist Evidence, exportação XLSX e impressão/PDF, Login v3 · Elo | PR #18; [matriz factual](docs/modules/audit/QUALITY_COMPLETION_V1.md) |
| Fundação Core v2 | Consolidada na `main` pelo PR #38 (13/10): resolvers de referências, governança e revisão de acessos, logs administrativos legíveis, matriz de segurança com JWT reais. Seguida pelos PRs #39 (npm audit completo) e #40; Issue #41 permanece em acompanhamento | [prontidão da consolidação](docs/briefs/CORE_V2_CONSOLIDATION_READINESS.md) |
| Identidade privilegiada (ADR-007) | **Proposta**, em `docs/adr-core-identity-boundary-v1`, não mergeada. O serviço de criação/recuperação de contas **não existe**. Não implementar runtime, migrations ou cutover sem GO humano | [protocolo paralelo, §1](docs/development/PARALLEL_AGENT_WORKFLOW.md) |
| Homologação física P1–P9 | **Pendente** (Android Chrome e iOS Safari). Testes manuais informados em 13/10 não substituem esses gates | [aceite final](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md) |
| Prontidão operacional O1–O8 | O1, O5 e O6 parciais; O2 desconhecido; O3, O4, O7 e O8 abertos | [aceite final](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md) |
| Infraestrutura reproduzível | Perfil mínimo de 5 serviços (Postgres 17, Kong, GoTrue, PostgREST, Storage) validado em CI descartável | [ADR-006](docs/decisions/ADR-006-infra-v1-reused-hardware.md), [infra/](infra/README.md) |
| Host | **Decidido em 15/10:** ThinkStation C30 dedicada, Ubuntu Server LTS direto no hardware, substituindo o servidor legado e a HP ML350 do ADR-004. A máquina ainda roda Windows e não cumpre os critérios de aceite | [ADR-008](docs/decisions/ADR-008-production-host-thinkstation-c30.md) |
| Backup e restore | Sem backup independente nem restore demonstrado. Ferramenta de WAL/PITR e destino off-site em aberto | [BACKUP_RECOVERY](docs/architecture/BACKUP_RECOVERY.md) |
| Proteção da `main` | **Adiada** por decisão do responsável. Risco de governança aberto, principalmente com agentes em paralelo | [protocolo paralelo, §2](docs/development/PARALLEL_AGENT_WORKFLOW.md) |
| Produção | **NO-GO.** Nenhum deploy, dado real ou ambiente de produção existe | [Plano Diretor, §1](docs/planning/PLANO_DIRETOR_2026.md) |

Checks executados localmente em 15/10/2026 sobre o HEAD `aee20ec` da `main`: typecheck, lint, 483 testes (34 arquivos), build, verify:build e `npm audit` (0 vulnerabilidades) passaram. As integrações com Supabase real (`tests/integration`) rodam só na CI e não foram executadas nessa verificação.

## Próximos passos

Resumo da sequência do [Plano Diretor, §8](docs/planning/PLANO_DIRETOR_2026.md). Cada etapa tem um gate; a seguinte só começa quando o gate da anterior estiver comprovado.

| Etapa | O quê | Quem |
| --- | --- | --- |
| 0 | Congelar baseline: branches, PRs, dados e serviços existentes | Humano |
| 1 | Backup do que existe hoje (incluindo a C30) e restore isolado. Nada é formatado antes disso | Humano |
| 2 | Fechar ADR-007, revisão de segurança, CI do commit exato, decidir proteção da `main` | Humano decide; agentes implementam após GO |
| 3 | Definir metas: RPO técnico, RTO, retenções, usuários/unidades, p95 | Humano |
| 4 | Reinstalar a C30 com Ubuntu Server, subir o perfil mínimo e medir contra as metas | Humano opera; agentes preparam scripts/Ansible |
| 5 | Montar STAGING reproduzível com Cloudflare e Storage privado | Agentes, com aprovação humana para o ambiente persistente |
| 6 | Homologar P1–P9 no STAGING | Humano executa nos aparelhos; agentes corrigem bugs |
| 7 | Decidir backup por ADR e provisionar PROD com backup, segredos, alertas | Humano decide; agentes implementam |
| 8 | Simular incidentes, rollback e carga; comprovar O8 e metas | Humano + agentes |
| 9 | Aprovação formal e cutover | Humano |
| 10 | Operação assistida e migração dos demais módulos, um por vez | Ambos |

## Decisões pendentes

Estas decisões são do responsável do projeto. Agentes não devem assumi-las.

- Metas numéricas: RPO técnico, RTO dentro e fora da janela (seg–sex, 07–18h), retenções, usuários e unidades esperados, meta de p95. Não registrar RPO = 0.
- Destino do servidor legado: desligar, ou manter como host de STAGING / testes de restore.
- Onde roda o STAGING, se o servidor legado não for mantido.
- Ferramenta de WAL/PITR (WAL-G ou pgBackRest) e destino off-site do backup.
- GO do ADR-007 (identidade privilegiada).
- Ativação da proteção da `main` e aprovação do [protocolo de trabalho paralelo](docs/development/PARALLEL_AGENT_WORKFLOW.md).

## Arquitetura em resumo

Monólito modular ([ADR-001](docs/decisions/ADR-001-modular-monolith.md)). O Core é dono de identidade, autorização, unidades, setores e logs; os módulos de negócio dependem do Core, nunca o contrário ([ADR-002](docs/decisions/ADR-002-core-and-module-ownership.md)). A autorização é aplicada no banco, com RLS e RPCs confiáveis ([ADR-005](docs/decisions/ADR-005-core-authorization.md)).

```text
navegador
  → frontend estático (Cloudflare Workers Static Assets)
  → API via Cloudflare Tunnel/WAF (sem portas públicas no host)
  → Kong → GoTrue (Auth) · PostgREST · Storage API
  → PostgreSQL 17 com RLS          Storage API → Cloudflare R2 (arquivos)
host: Lenovo ThinkStation C30 · Ubuntu Server LTS · Docker Compose
```

| Camada | Tecnologia | Decisão |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite; Design System Elo | [ADR-004](docs/decisions/ADR-004-platform-stack.md), [Elo v1](docs/briefs/DESIGN_SYSTEM_ELO_V1.md) |
| Backend | Supabase self-hosted, perfil mínimo de 5 serviços | [ADR-006](docs/decisions/ADR-006-infra-v1-reused-hardware.md) |
| Banco | PostgreSQL 17 (`supabase/postgres:17.6.1.136`), migrations versionadas | [DATA_MODEL](docs/architecture/DATA_MODEL.md) |
| Arquivos | Storage API com buckets privados; R2 em produção | [ADR-004](docs/decisions/ADR-004-platform-stack.md) |
| Entrada | Cloudflare DNS, WAF e Tunnel | [ADR-004](docs/decisions/ADR-004-platform-stack.md) |
| Host | ThinkStation C30, Ubuntu Server LTS bare metal, dedicada | [ADR-008](docs/decisions/ADR-008-production-host-thinkstation-c30.md) |

Antes de qualquer mudança estrutural, leia o [OVERVIEW](docs/architecture/OVERVIEW.md).

## Módulos

| Módulo | Situação |
| --- | --- |
| Auditoria de Qualidade | Implementado na plataforma; prioridade atual (homologação e operação pendentes) |
| Planos de Ação | Implementado na plataforma, transversal ([ADR-003](docs/decisions/ADR-003-action-plans-transversal-module.md)) |
| Registros ISO | Sistema standalone finalizado; migração futura |
| Vendas / Maquininhas | Sistema standalone finalizado; migração futura |
| Pesquisa de Satisfação | Sistema standalone finalizado; migração futura |
| Agendamento de Sala de Reunião | Sistema standalone finalizado; requer revisão |
| Frota | Sistema de origem em desenvolvimento |
| Planejado × Realizado | Sistema standalone finalizado; requer revisão |
| Curva ABC | Sistema de origem em desenvolvimento |
| ERP de Contratos | Sistema standalone finalizado; requer revisão de backup |

Os sistemas standalone continuam preservados como referência e contingência. A migração é incremental, um módulo por vez, cada um com gates próprios ([MODULE_ROADMAP](docs/migration/MODULE_ROADMAP.md)).

## Estrutura do repositório

```text
apps/web/            frontend React (app/, core/, modules/audit, modules/action-plans, shared/)
supabase/            config.toml e migrations versionadas (nunca editar migration já aplicada)
infra/               compose do perfil mínimo e env de exemplo (sem segredos)
scripts/             verify-build.mjs e scripts/ops (só ci/staging descartável; recusam production)
tests/               testes unitários, de UI e de banco (Vitest/PGlite); integration/ e performance/
docs/
  planning/          Plano Diretor 2026: ordem de execução, gates, custos, pendências
  decisions/         ADRs 001–006 e 008 (ADR-007 em proposta, fora da main)
  architecture/      visão geral, segurança, autorização, dados, backup, gates
  briefs/            briefs de implementação (um por entrega)
  modules/           contratos e aceites por módulo
  development/       setup local, testes manuais, fluxo com IA e trabalho paralelo
  migration/         roteiro de migração dos sistemas standalone
.github/             workflows de CI e template de PR
AGENTS.md            regras para agentes de código (CLAUDE.md aponta para ele)
```

## Como rodar localmente

Requisitos: Node 22.12+ e npm. Para Supabase local, também Supabase CLI e Docker.

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local   # preencha só URL local e chave publishable
npm run dev
```

- No frontend, use apenas a chave **publishable** (ou JWT anon legado). Nunca `service_role`, chave secreta ou credencial do PostgreSQL.
- Sem configuração, a aplicação mostra um estado explícito de "ambiente indisponível".
- Supabase local, bootstrap do primeiro administrador e regras da fundação: [LOCAL_FOUNDATION](docs/development/LOCAL_FOUNDATION.md).
- Para testar o Core v2 em PC/Android sem tocar em ambiente compartilhado: [CORE_V2_MANUAL_TEST](docs/development/CORE_V2_MANUAL_TEST.md).
- `supabase db reset` só em banco local descartável sob seu controle. Nunca `--linked`, `db push` ou URL remota.

## Testes e CI

| Comando | O que faz |
| --- | --- |
| `npm run typecheck` | TypeScript sem emitir arquivos |
| `npm run lint` | ESLint em todo o repositório |
| `npm test` | Vitest: unidade, UI e banco (PGlite com migrations, RLS e grants reais) |
| `npm run test:rls` | Só os testes de banco/RLS |
| `npm run build` | Build de produção do frontend |
| `npm run verify:build` | Confere que o bundle contém os módulos e nenhuma chave privilegiada |

Para o `verify:build` passar localmente, o build precisa das mesmas variáveis fictícias da CI (sem elas, o bundle é só a tela de ambiente não configurado):

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci-build-placeholder \
npm run build && npm run verify:build
```

Jobs da CI (`.github/workflows/`):

- `validate`: typecheck, lint, testes, build, verify:build e `npm audit --audit-level=moderate`.
- `action-plans-integration`: Supabase CLI descartável com integrações reais (`tests/integration/*.mjs`) e Playwright.
- `infra-validate`: sobe o perfil mínimo do ADR-006, aplica migrations, healthcheck e smoke; depois destrói tudo.

CI verde comprova o código, não a operação: não substitui P1–P9, O1–O8 nem aprovação de liberação.

## Como trabalhar no repositório

Vale para pessoas e agentes de IA.

1. Toda mudança parte de uma issue ou brief aprovado, com objetivo, fora de escopo, dono humano, arquivos permitidos, ambiente exclusivo, critérios de aceite e testes ([protocolo, §5](docs/development/PARALLEL_AGENT_WORKFLOW.md)).
2. Uma branch por issue, criada de `origin/main` (`feat/`, `fix/`, `docs/`, `test/`, `chore/`, `security/`), em worktree própria quando houver trabalho paralelo.
3. Nunca push direto na `main`. Tudo entra por PR usando o [template](.github/pull_request_template.md), com validações reais descritas e o que não foi executado declarado.
4. Testes com Docker usam projeto Compose, volumes, portas e env exclusivos. Nada aponta para produção ou banco compartilhado.
5. Migrations são incrementais; destrutivas exigem aprovação e plano de recuperação.
6. Segredos, dumps, dados pessoais e URLs assinadas nunca entram em código, commits, logs ou prompts.
7. Reinstalar a C30, criar ambiente persistente, deploy ou mexer no servidor legado exige aprovação humana **antes** da ação.

Agentes de código seguem o [AGENTS.md](AGENTS.md) (o [CLAUDE.md](CLAUDE.md) só aponta para ele). O fluxo de trabalho com IA está em [AI_WORKFLOW](docs/development/AI_WORKFLOW.md) e o trabalho paralelo em [PARALLEL_AGENT_WORKFLOW](docs/development/PARALLEL_AGENT_WORKFLOW.md), integrado à `main` pelo PR #43.

## Mapa da documentação

| Preciso de… | Leia |
| --- | --- |
| Entender o plano, a ordem e o que falta | [Plano Diretor 2026](docs/planning/PLANO_DIRETOR_2026.md) |
| Saber por que a stack é essa | [ADRs](docs/decisions/), começando pelo [ADR-004](docs/decisions/ADR-004-platform-stack.md) e o [ADR-008](docs/decisions/ADR-008-production-host-thinkstation-c30.md) |
| Visão geral e regras de dependência | [OVERVIEW](docs/architecture/OVERVIEW.md) |
| Segurança e autorização | [SECURITY](docs/architecture/SECURITY.md), [AUTHORIZATION](docs/architecture/AUTHORIZATION.md) |
| Modelo de dados | [DATA_MODEL](docs/architecture/DATA_MODEL.md) |
| Backup e recuperação | [BACKUP_RECOVERY](docs/architecture/BACKUP_RECOVERY.md) |
| Gates de aceite da Qualidade v1 | [QUALITY_ACCEPTANCE_V1](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md) |
| Infraestrutura reproduzível | [infra/README](infra/README.md) |

## Princípios

- monólito modular;
- segurança e autorização desde a fundação, aplicadas no backend e no banco;
- módulos dependem do Core, nunca o contrário;
- dados corporativos compartilhados não são duplicados por módulo;
- migração incremental, sem big bang;
- backups só contam com restauração testada;
- produção nunca é ambiente de teste;
- KISS, DRY e YAGNI;
- decisões arquiteturais registradas em ADRs;
- documentação curta, específica e útil para pessoas e agentes de código.
