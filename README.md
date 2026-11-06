# Gaúcha Gestão

**Plataforma interna da Gaúcha Alimentação para reunir sistemas corporativos em uma aplicação modular, com identidade única, controle de acesso por unidade e rastreabilidade de operações.**

> **Estado em 21/10/2026 · baseline da documentação: [main `f9f041e`](https://github.com/The-Vonky/Gaucha-Gestao/commit/f9f041edc6bd76f1abb4b59e2bde8ae8acbae923)**  
> **Código funcional integrado, implantação produtiva NÃO autorizada (PROD NO-GO).** Merge de código, CI verde e teste local **não** significam que o sistema foi implantado, homologado ou está pronto para receber dados reais. Consulte o [Plano Diretor](docs/planning/PLANO_DIRETOR_2026.md) para os gates oficiais.

**Comece aqui:** [Executar localmente](#primeiros-passos-ambiente-local) · [O que já funciona](#o-que-ja-existe) · [O que falta](#o-que-falta-para-producao) · [Arquitetura](#arquitetura-como-as-pecas-conversam) · [Documentação completa](#onde-encontrar-cada-resposta)

## C30 STAGING publicado para testes — atualização de 30/10/2026

**AS-IS operacional, não PROD:** o STAGING da ThinkStation C30 está acessível por **[https://teste.gauchagestao.online](https://teste.gauchagestao.online)**, usando **Cloudflare DNS Free + Tunnel `gaucha-staging` → Caddy HTTP loopback 4181 → frontend e APIs Supabase pela mesma origem**. Login em PC e celular, leitura de auditoria/histórico preservados, criação de nova auditoria e envio/visualização/download de fotografias foram **relatados e testados pelo operador**. Esta é validação funcional inicial, não homologação formal de segurança, escala, backup ou produção.

A C30 permanece no commit **`f9f041e` (18 migrations)**; a release dedicada é `f9f041e-cloudflare`, com `VITE_SUPABASE_URL=https://teste.gauchagestao.online`. Na mudança de URL foram recriados somente **Auth e Storage**; PostgreSQL, REST e Kong foram preservados. O ngrok Free deixou de ser a entrada utilizada após atingir sua franquia de transferência. **Workers Static Assets, R2 e Cloudflare Access não foram implantados** nesta migração. Ver o [AS-BUILT de 30/10](docs/operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e o [runbook do Tunnel](docs/operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md).

A [fotografia de 22/10](docs/operations/C30_STAGING_AS_BUILT_20261022.md) e o [plano histórico do ngrok](docs/operations/STAGING_PUBLIC_ACCESS_PLAN.md) descrevem um estado **anterior** à publicação atual. A `main` do GitHub não é automaticamente implantada na C30. O risco de HDD, a ausência de backup/restore independentes comprovados, os testes negativos de RLS pendentes e os gates P1–P9/O1–O8 permanecem: **PROD NO-GO**. Ver [lacunas de backup](docs/operations/C30_BACKUP_GAPS.md).

## Entenda o projeto em cinco minutos

A empresa mantém vários sistemas separados (auditorias, controles financeiros, agendas, contratos etc.). A Gaúcha Gestão consolida **identidade, unidades, setores, permissões, navegação e auditoria** em um **Core** reutilizável; cada módulo de negócio preserva suas próprias regras e dados. A migração é **incremental**, sem descartar os sistemas antigos antes de validação e plano de retorno.

| Pergunta | Resposta rápida |
| --- | --- |
| **O que já está no código?** | Core v2 e administração; **Auditoria de Qualidade v1**; **Planos de Ação**; evidências e relatórios; **Curva ABC v1** com importação, revisões e consulta. |
| **O que funciona em testes?** | Testes automatizados de frontend, SQL/RLS e integração Supabase/Storage/Chromium em CI; Compose mínimo descartável. Não representam operação produtiva. |
| **Onde desenvolver?** | Instância **local e exclusiva**, seguindo o passo a passo abaixo. Existe também um **DEV compartilhado** documentado na [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68): não confundir nem apagar. |
| **Produção?** | **NO-GO**. Homologação física, segurança privilegiada, host, backup independente, metas operacionais e aceite humano ainda pendentes. |
| **Como evolui?** | Primeiro concluir os gates da Qualidade/plataforma; depois migrar módulos individualmente conforme [roadmap](docs/migration/MODULE_ROADMAP.md), decisões e briefs aprovados. |
| **Quem define o que implementar?** | Brief/issue aprovada + ADRs aceitos + [Plano Diretor](docs/planning/PLANO_DIRETOR_2026.md). Agentes e desenvolvedores não devem converter propostas em decisões. |

### Vocabulário de estado (importante)

- **IMPLEMENTADO (AS-IS):** está no código versionado, com testes quando indicados; **não** afirma deploy.
- **VALIDADO EM CI:** executado na versão/commit do workflow citado; **não** substitui teste em dispositivos nem restore produtivo.
- **DECIDIDO:** escolha registrada em ADR aceito, que pode ainda aguardar instalação (ex.: C30).
- **PROPOSTO (TO-BE):** design, brief ou futura infraestrutura sem aprovação/execução.
- **PENDENTE / BLOQUEADO:** requer evidência, decisão, teste ou autorização antes de avançar.

## O que já existe

| Domínio | Entrega concreta na plataforma | Limite atual |
| --- | --- | --- |
| **Core v2 / Administração** | Autenticação Supabase, perfis, papéis, grants por unidade/setor, diretório e governança de acessos, logs | Serviço privilegiado de criação/recuperação de identidade **não aprovado** ([ADR-007 / Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49)) |
| **Qualidade — Auditorias** | Checklist de 9 seções / 158 critérios, criação/edição/finalização/reabertura, histórico, anexos por critério, XLSX e impressão/PDF | Homologação Android/iOS **P1–P9** e prontidão **O1–O8** pendentes |
| **Planos de Ação** | Planos manuais e associados à Auditoria; ciclo corretivo, evidências, atribuições e verificações | Operação/aceite reais dependem do fechamento dos gates |
| **Curva ABC v1** | Importação XLSX do ERP no navegador, prévia, publicação e histórico de revisões por unidade, consulta e conferência posterior do original. **Em revisão (PRs #78–#80):** correção da importação via HTTP de LAN e seis áreas analíticas (visão geral, importações, comparações, relatórios, produtos, classes) | Amostras reais autorizadas, RLS em duas identidades e integridade da origem ainda pedem homologação ([#70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70)); **SQL não reinterpreta o XLSX físico no servidor** |
| **Infra de testes** | Supabase CLI local e stack Docker Compose mínima (PostgreSQL, Kong, Auth, PostgREST, Storage); CI com testes de RLS/Storage | Laboratório e CI **não** são STAGING/PROD persistentes |
| **Continuidade (ensaio)** | Restore **sintético a frio** de banco/Auth/arquivos/RLS comprovado no snapshot histórico com 17 migrations | **DR-08 PARCIAL** (tempo não medido); ambiente atual com 18 migrations e arquivo ABC não foi coberto por aquele ensaio ([#51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51)) |

**Ainda não integrados como módulos da plataforma:** Propostas/Registros ISO (ownership pendente), Vendas/Maquininhas, Satisfação, Agendamento de Salas, Frota, Planejado × Realizado e ERP de Contratos. Os respectivos legados **não são apagados** ao implementar o novo sistema.

**Agendamento de Salas:** o [brief AG-00](docs/briefs/ROOM_BOOKING_V1.md) e seus [critérios de aceite](docs/modules/room-booking/ACCEPTANCE_V1.md) estão versionados, mas continuam **PROPOSTOS**; não houve aprovação do negócio nem implementação AG-01. O sistema legado permanece como referência até eventual corte aprovado.

## Arquitetura: como as peças conversam

A arquitetura aprovada é um **monólito modular de frontend com Core compartilhado e backend de negócio centrado em PostgreSQL/RPC/RLS**, não um conjunto de microsserviços nem uma API Node de negócio paralela.

~~~mermaid
flowchart LR
  U["Usuário / navegador"] --> UI["React + TypeScript / App Shell"]
  UI --> SDK["supabase-js / chave publishable"]
  SDK --> G["Kong / gateway"]
  G --> AUTH["GoTrue / Auth / JWT"]
  G --> REST["PostgREST / schemas e RPC"]
  G --> STORE["Storage API / buckets privados"]
  AUTH --> PG[("PostgreSQL 17")]
  REST --> PG
  STORE --> PG
  STORE --> OBJ["Bytes de arquivos"]
  PG --> CORE["core: identidade, grants, unidades, logs"]
  PG --> MOD["audit / action_plans / abc"]
~~~

**O que o desenho representa:** componentes existentes no **código/stack de laboratório**, não um deploy de produção. Uma sessão JWT estabelece identidade; **RLS, grants e RPCs no banco** aplicam autorização. A interface apenas apresenta opções permitidas — ocultar botão nunca é uma barreira de segurança. Arquivos precisam de **metadados no banco e bytes no Storage** coerentes.

**Produção planejada, ainda não demonstrada:** frontend estático com **Cloudflare Workers Static Assets**, DNS/WAF/Tunnel como entrada, **R2** para objetos e **ThinkStation C30 com Ubuntu Server LTS bare metal** como host do backend. Cloudflare não substitui RLS; R2 não é cópia de segurança independente; Compose num host único não fornece alta disponibilidade. A C30 foi escolhida pelo [ADR-008](docs/decisions/ADR-008-production-host-thinkstation-c30.md); **já opera STAGING**, mas **não está aprovada como host de produção**.

Para diagramas maiores e arquitetura detalhada: [DIAGRAMS](docs/architecture/DIAGRAMS.md), [WORKFLOWS](docs/architecture/WORKFLOWS.md), [IMPLEMENTATION_MAP](docs/architecture/IMPLEMENTATION_MAP.md) e [THREAT_MODEL](docs/architecture/THREAT_MODEL.md).

### Stack e por que foi escolhida

| Camada | Tecnologia de referência | Função no projeto e razão da escolha |
| --- | --- | --- |
| Web | **React 19 + TypeScript 5 + React Router 7 + Vite 6** | SPA modular com tipagem e build estático; o Vite compila o frontend e **não** executa backend de negócio em PROD |
| Design | **Elo v1** | Padrões institucionais de interface e componentes reutilizáveis |
| API e identidade | **supabase-js 2, GoTrue/Auth, Kong, PostgREST** | Sessão comum, roteamento de serviços, consultas e RPCs SQL; menos API própria a manter |
| Dados e segurança | **PostgreSQL 17, migrations, RLS, RPC** | Transações, invariantes e escopos confiáveis próximos dos dados; uso de `numeric` para cálculos sensíveis |
| Objetos | **Supabase Storage API** | Evidências, capas e XLSX originais em buckets privados; consistência DB/bytes requer cuidado |
| Infra de CI/laboratório | **Docker Compose + Supabase CLI** | Ambiente reproduzível e isolado, sem orquestrador distribuído |
| Qualidade | **Vitest, PGlite, Playwright e GitHub Actions** | Unit/UI, banco/RLS, integração com serviços reais em CI e verificação de build/dependências |
| Implantação futura | **Ubuntu Server na C30 + Cloudflare/R2** | Controle de runtime/dados e custo recorrente adequado à fase atual; disponibilidade, operação e recuperação precisam ser comprovadas |

**“Melhor escolha” aqui significa adequação aos requisitos e trade-offs documentados**, não comparação científica universal. Para alternativas, riscos aceitos, decisões substituídas e critérios de revisão, leia [TECHNOLOGY_DECISIONS](docs/architecture/TECHNOLOGY_DECISIONS.md) e os [ADRs](docs/decisions/), principalmente [ADR-001](docs/decisions/ADR-001-modular-monolith.md), [ADR-002](docs/decisions/ADR-002-core-and-module-ownership.md), [ADR-004](docs/decisions/ADR-004-platform-stack.md), [ADR-005](docs/decisions/ADR-005-core-authorization.md) e [ADR-008](docs/decisions/ADR-008-production-host-thinkstation-c30.md).

## Primeiros passos: ambiente local

**Pré-requisitos:** Git, **Node.js >= 22.12**, npm, Docker Engine/Desktop com Linux containers e Docker Compose. Usamos a **Supabase CLI 2.117.0** via `npx`; não precisa instalar um binário `supabase` global. Use terminal Bash (Linux/macOS/WSL2).

> **Isolamento obrigatório:** execute em checkout e instância locais próprios. Antes de iniciar Docker, confira se não é o projeto DEV compartilhado, staging persistente, outro projeto Supabase, o ERP de Contratos ou um banco com dados importantes. **Não execute** `supabase db reset`, `db push`, `--linked`, `docker compose down -v` ou `prune` em ambientes compartilhados. Não envie envs ou saídas contendo tokens para PRs.

1. **Obtenha o código e instale dependências** (checkout novo):

   ~~~bash
   git clone https://github.com/The-Vonky/Gaucha-Gestao.git
   cd Gaucha-Gestao
   git switch main
   npm ci
   ~~~

2. **Confirme Docker/Compose e inicie o Supabase local somente se o projeto for exclusivo.** A configuração em [`supabase/config.toml`](supabase/config.toml) usa API `54321`, Postgres `54322` e Studio `54323`. O comando abaixo deixa Studio habilitado e exclui serviços não essenciais:

   ~~~bash
   docker version
   docker compose version
   docker compose ls --all
   npx --yes supabase@2.117.0 start -x realtime,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor
   npx --yes supabase@2.117.0 status
   ~~~

   Se a instância **já existe**, investigue o status e as portas antes de iniciá-la novamente; **não** use reset para resolver erro de portas ou migrations. O `status` apresenta chaves e informações sensíveis: consulte **localmente**, nunca cole sua saída integral em issues/chats.

3. **Configure o frontend.** Copie o modelo e preencha `apps/web/.env.local` **com o Project URL da API e a Publishable key do mesmo Supabase local**, exibidos pela CLI. Somente valores públicos de cliente; **nunca Secret/service_role, URI do banco nem chaves administrativas**.

   ~~~bash
   cp apps/web/.env.example apps/web/.env.local
   # Edite apps/web/.env.local no seu editor, sem commitar o arquivo:
   # VITE_SUPABASE_URL=http://127.0.0.1:54321
   # VITE_SUPABASE_PUBLISHABLE_KEY=<sua chave publishable LOCAL>
   ~~~

4. **Crie um usuário de laboratório para conseguir fazer login.** Cadastro público está desabilitado: no **Studio local** (`http://127.0.0.1:54323`), abra **Authentication → Users**, crie e confirme um usuário de teste. No **SQL Editor local**, como operador do banco, execute **uma única vez**, substituindo pelo UUID do usuário confirmado:

   ~~~sql
   select private.bootstrap_administrator('UUID_DO_USUARIO_CONFIRMADO'::uuid);
   ~~~

   Esse bootstrap é uma ação **privilegiada apenas no banco local**; não use conta, senha ou UUID do DEV compartilhado e não copie privilégios para outros ambientes. Consulte [LOCAL_FOUNDATION](docs/development/LOCAL_FOUNDATION.md) para o contrato e as regras de acesso.

5. **Inicie a aplicação:**

   ~~~bash
   npm run dev
   ~~~

   O comando também inicia o executor local de miniaturas para novos uploads em qualquer auditoria, usando a configuração privada previamente provisionada no notebook. Não é necessário outro terminal nem UUID; `Ctrl+C` encerra frontend/executor e restaura NOLOGIN. Consulte [pré-requisitos, recuperação e validação](docs/modules/audit/AUD_IMG_02_INTEGRATED_DEV_20261106.md).

   Abra o endereço indicado pelo Vite (geralmente `http://localhost:5173`) e faça login com a conta **criada no seu Supabase local**. Se mudar o arquivo `.env.local`, reinicie o Vite.

**Verificação rápida / solução de problemas:** “ambiente indisponível” geralmente indica URL/chave ausente, chave incorreta ou Vite não reiniciado; “login inválido” pode indicar conta inexistente **naquele banco**; “sem acesso” exige verificar grants/escopo Core, **não** desligar RLS. Portas ocupadas exigem inventário de processos/projetos antes de mudar serviços. Para trabalho remoto entre dois devs use a [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68), e **não** exponha Studio, Postgres, chaves locais padrão ou Admin API à LAN.

## Verificar o código e contribuir

~~~bash
npm run typecheck
npm run lint
npm test
npm run test:rls
npm run build
npm run verify:build
npm audit --audit-level=moderate
~~~

Para verificar o **bundle real** sem conectar ao backend, o build/`verify:build` precisa das variáveis públicas fictícias usadas na CI:

~~~bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci-build-placeholder \
npm run build && npm run verify:build
~~~

| Pipeline | O que comprova | O que **não** comprova |
| --- | --- | --- |
| [Validate foundation](.github/workflows/validate.yml) → `validate` | Tipagem, lint, testes, build, verificação de bundle e `npm audit` | Deploy produtivo, validação física |
| Mesmo workflow → `action-plans-integration` | Testes reais com **Supabase CLI descartável**, Storage, PostgreSQL/JWT/RLS e browser | Dados reais, persistência produtiva, dispositivos físicos |
| [Infra validate](.github/workflows/infra-validate.yml) | Compose mínimo, migrations e saúde do stack em CI | Recuperação em host físico ou configuração C30 |

**Evidência recente:** no HEAD de revisão da [PR #62](https://github.com/The-Vonky/Gaucha-Gestao/pull/62) os jobs `validate`, `action-plans-integration` e `infra-validate` terminaram com sucesso em 21/10/2026; o merge subsequente está em `f9f041e`. Para avaliar qualquer alteração nova, consulte os **checks do SHA exato** em [GitHub Actions](https://github.com/The-Vonky/Gaucha-Gestao/actions), não uma contagem histórica de testes.

**Fluxo de contribuição:** issue/brief aprovado → branch própria derivada de `origin/main` → alterações pequenas e migrations **append-only** → testes negativos de escopo/RLS → PR com diffs, riscos e checks → revisão humana → merge. Não faça push direto na `main`. Leia [AGENTS.md](AGENTS.md), [PARALLEL_AGENT_WORKFLOW](docs/development/PARALLEL_AGENT_WORKFLOW.md) e o [template de PR](.github/pull_request_template.md). Não commite segredos, dumps ou dados reais.

## O que falta para produção

Os módulos implementados **não** dispensam infraestrutura, homologação ou aprovação de operação. A sequência real é regida pelo [Plano Diretor v1.3](docs/planning/PLANO_DIRETOR_2026.md) e pela [matriz de aceite P1–P9/O1–O8](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md).

~~~mermaid
flowchart TD
  NOW["Software Core + Qualidade + ABC integrado"] --> SAFE["Preservar dados/legado + validar restauração"]
  NOW --> IAM["ADR-007 / identidade privilegiada: decisão e revisão"]
  SAFE --> HARD["Aceite físico da C30 / definição de RPO e RTO"]
  IAM --> STAGING["STAGING seguro e autorizado"]
  HARD --> STAGING
  STAGING --> MOBILE["P1–P9: Android e iOS reais"]
  STAGING --> OPS["O1–O8: backup, restore, segurança, alertas e carga"]
  MOBILE --> GO{"GO humano documentado?"}
  OPS --> GO
  GO -- "Não" --> HOLD["Manter NO-GO / corrigir gaps"]
  GO -- "Sim" --> PROD["Cutover controlado e operação assistida"]
~~~

| Prioridade / dependência | Situação atual e próximo resultado necessário |
| --- | --- |
| **Preservar ambientes e dados** | Inventário da C30, ERP de Contratos e volumes; nenhuma reinstalação/descarte sem backup restaurável e autorização |
| **Identidade privilegiada (P0)** | [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49): nova proposta ADR-007 e revisão independente. PR antiga fechada **não equivale a decisão aceita** |
| **Backup/restore** | [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51) + [relatório](docs/planning/02_RESTORE_DRILL.md): ensaio sintético histórico `8 PASS / DR-08 PARCIAL`; repetir com tempo medido e avaliar ABC/18 migrations; definir off-site, WAL/PITR, RPO/RTO |
| **Implantação e operações** | Aceitar host C30, configuração STAGING, TLS/entrada e Storage, alertas, capacidade, retenções e planos de reversão |
| **Aceite Qualidade** | Executar [P1–P9 e O1–O8](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md) com evidências e assinatura |
| **Curva ABC v1** | [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70): arquivos ERP, autoria, RLS, concorrência, originais e diferenças entre navegador e SQL |
| **DEV compartilhado** | [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68): comprovar rede restrita, duas identidades, autoria/RLS e persistência sem reset |
| **Módulos futuros** | Migrar gradualmente após gate de negócio e técnico; [Agendamento AG-00](docs/briefs/ROOM_BOOKING_V1.md) permanece proposto |

**Sem prazo, orçamento final ou RPO/RTO garantidos** enquanto requisitos e medições estiverem abertos. Nada neste README autoriza deploy, migrações de dados reais, formatação de disco ou abertura de portas. Decisões futuras devem constar de ADR/issue com aprovador, alternativa, impacto e evidência.

## Onde encontrar cada resposta

| Preciso entender… | Fonte oficial |
| --- | --- |
| **Todas as tecnologias, motivos, alternativas e evolução** | [Racional da stack](docs/architecture/TECHNOLOGY_DECISIONS.md) · [ADRs](docs/decisions/) |
| **Topologia atual versus proposta; diagramas** | [DIAGRAMS](docs/architecture/DIAGRAMS.md) · [STACK_INTEGRATION](docs/architecture/STACK_INTEGRATION.md) |
| **Autenticação, arquivos, fluxos e falhas** | [WORKFLOWS](docs/architecture/WORKFLOWS.md) · [AUTHORIZATION](docs/architecture/AUTHORIZATION.md) · [THREAT_MODEL](docs/architecture/THREAT_MODEL.md) |
| **Onde cada módulo está implementado** | [IMPLEMENTATION_MAP](docs/architecture/IMPLEMENTATION_MAP.md) · [API_CONTRACTS](docs/architecture/API_CONTRACTS.md) · [DATA_MODEL](docs/architecture/DATA_MODEL.md) |
| **Como operar e recuperar** | [OPERATIONS_MATRIX](docs/operations/OPERATIONS_MATRIX.md) · [02_RESTORE_DRILL](docs/planning/02_RESTORE_DRILL.md) · [BACKUP_RECOVERY](docs/architecture/BACKUP_RECOVERY.md) |
| **O que foi aprovado, rejeitado ou continua bloqueado** | [DECISION_REGISTER](docs/planning/DECISION_REGISTER.md) · [Plano Diretor](docs/planning/PLANO_DIRETOR_2026.md) |
| **O que vem depois e como migrar** | [EXECUTION_MAP](docs/planning/EXECUTION_MAP.md) · [MODULE_ROADMAP](docs/migration/MODULE_ROADMAP.md) · [MODULE_BLUEPRINTS](docs/planning/MODULE_BLUEPRINTS.md) |
| **Como trabalhar no repositório** | [Índice da documentação](docs/README.md) · [AGENTS.md](AGENTS.md) · [Fluxo de colaboração](docs/development/PARALLEL_AGENT_WORKFLOW.md) |
| **Como usar os módulos já integrados** | [Guia Qualidade](docs/modules/audit/OPERATOR_GUIDE_V1.md) · [Guia Curva ABC](docs/modules/abc/OPERATOR_GUIDE_V1.md) |

### Estrutura do repositório

~~~text
apps/web/        React / Core / App Shell / módulos audit, action-plans e abc
supabase/        CLI config + migrations SQL por schema (core, audit, action_plans, abc)
infra/           Compose mínimo do Supabase self-hosted e scripts de laboratório
scripts/         checks de bundle e rotinas ops para ambientes descartáveis
tests/           Vitest/PGlite, integração Auth/Storage/Postgres e testes browser
docs/            decisões, arquitetura, briefs, módulos, planejamento e runbooks
.github/         CI e template de PR
AGENTS.md        regras de engenharia, segurança e trabalho paralelo
~~~

**Regra de manutenção:** toda mudança que altere stack, contrato, schema, permissão, jornada ou status de módulo deve atualizar **o documento canônico e seus diagramas na mesma PR**. Este README é o mapa de entrada; seu conteúdo deve ser revalidado contra o código, os ADRs e os checks do commit correspondente, não usado como evidência autossuficiente.