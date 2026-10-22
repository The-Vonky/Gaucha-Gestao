# Instruções para agentes de desenvolvimento — Gaúcha Gestão

**Idioma de trabalho:** português brasileiro (pt-BR) em documentação, PRs, issues, registros de validação, relatórios e explicações. **Não traduzir** nomes de arquivos, diretórios, símbolos de código, schemas, SQL, funções, variáveis, comandos, logs ou identificadores técnicos. Preservar citações e nomes oficiais de serviços.

> **Estado de referência (21/10/2026):** Core v2, Auditorias/Qualidade v1, Planos de Ação, evidências, relatórios e Curva ABC v1 estão integrados ao código. O módulo ABC ainda requer homologação manual. Ensaios automatizados em CI e restore sintético não comprovam implantação produtiva. **PROD NO-GO**: não há autorização para deploy ou manipulação de dados reais.

> **Atualização operacional de 22/10/2026:** a C30 possui **STAGING persistente** no commit `f9f041e` (18 migrations) com Supabase e Caddy ativos; não está em PROD e não é laboratório descartável. Ver [inventário do host](docs/operations/C30_STAGING_AS_BUILT_20261022.md), [diagnóstico seguro](docs/operations/C30_STAGING_RUNBOOK.md), [lacunas de backup](docs/operations/C30_BACKUP_GAPS.md) e [releases](docs/operations/C30_STAGING_RELEASE_GUIDE.md). Qualquer migração do checkout mais recente para o host exige tratamento separado e autorizado.

## 1. Papel e fonte da verdade

Você implementa **trabalho explicitamente aprovado** em uma plataforma corporativa com dados sensíveis. Não redesenhe a arquitetura, invente escopo ou declare decisões de produto pelo simples fato de uma ferramenta permitir alterá-las.

Antes de editar:
1. Ler **a issue e o brief da tarefa** (quando existir), incluindo escopo, exclusões, ambiente, responsável e critérios de aceite.
2. Ler **apenas** os ADRs aceitos e os contratos de arquitetura relevantes. Se houver divergência com código ou outro documento, identificar o conflito e não escolher uma política arbitrária.
3. Consultar **o código e o estado Git atuais**, não confiar na fotografia de um chat ou texto histórico.
4. Aproveitar componentes, módulos, padrões e contratos já existentes.

Hierarquia de decisão: **pedido/brief atual autorizado** → **ADRs aceitos** → **Plano Diretor e gates aplicáveis** → **contratos arquiteturais** → **estas instruções** → **convenções no código**. Uma issue ou PR proposta **não revoga** ADR aceito. Decisões de produção, segurança privilegiada, retenção, infraestrutura permanente e corte operacional exigem o responsável humano.

Fontes de navegação: [README](README.md), [índice documental](docs/README.md), [mapa de implementação](docs/architecture/IMPLEMENTATION_MAP.md), [registro de decisões](docs/planning/DECISION_REGISTER.md) e [Plano Diretor 2026](docs/planning/PLANO_DIRETOR_2026.md).

## 2. Arquitetura e responsabilidade de domínio

- **Monólito modular** conforme [ADR-001](docs/decisions/ADR-001-modular-monolith.md).
- O **Core** é dono de identidade, perfil, usuários, unidades, setores, permissões, grants e auditoria sistêmica. Não duplicar essas entidades dentro dos módulos.
- Módulos de negócio podem depender de **Core** e **Shared**. Core **nunca** depende de um módulo; Shared não depende de domínios.
- Um módulo não importa detalhes internos de outro. Integrações entre módulos usam contratos explícitos.
- A UI não é fronteira confiável. Login/sessão não garante permissão; **RLS, grants e RPCs no PostgreSQL** aplicam a autorização por papel, unidade e setor ([ADR-005](docs/decisions/ADR-005-core-authorization.md)).
- Somente adicionar bibliotecas, serviços, filas e abstrações quando houver necessidade comprovada e decisão apropriada. Aplicar **KISS, DRY e YAGNI**.

## 3. Segurança, dados e execução

- **Negação por padrão** e menor privilégio. Validar entradas, escopos e transições no backend/banco, não somente no React.
- Preservar trilha de auditoria, concorrência otimista, histórico e imutabilidade previstos em contrato.
- Tratar upload de arquivos como conteúdo não confiável. No caso da Curva ABC, a validação física dos bytes XLSX **não é feita pelo SQL do servidor**; não descrever a prévia no browser como garantia criptográfica prévia ([modelo de ameaças](docs/architecture/THREAT_MODEL.md)).
- Nunca publicar em commits, PRs, logs ou prompts: senhas, JWTs, chaves administrativas, dados pessoais, dumps, objetos empresariais, URLs assinadas ou `.env` reais.
- Nunca usar credenciais **service_role/secret** no frontend; chave de cliente somente `publishable`/anon autorizada.
- **Sem alterações destrutivas sem autorização específica:** `supabase db reset`, `db push`, `--linked`, `docker compose down -v`, `docker volume prune`, formatação, seed em banco persistente ou migração remota.
- Worktree/checkout distinto **não** significa banco Docker isolado. Cada teste destrutível requer projeto Compose/CLI, volume, porta, env e dono **exclusivos e identificados**.
- DEV compartilhado ([Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68)), ERP de Contratos, servidor legado e C30 **não são sandboxes**. Não parar, copiar dados, modificar ou limpar sem inventário e GO operacional específico.
- Migrations: **append-only**. Nunca editar migração já aplicada em ambiente compartilhado; mudanças destrutivas exigem estratégia explícita de preservação, restauração e rollback/forward-fix.

Documentos obrigatórios conforme o escopo:
- Auth/RLS/usuários: [SECURITY](docs/architecture/SECURITY.md), [AUTHORIZATION](docs/architecture/AUTHORIZATION.md), [ADR-005](docs/decisions/ADR-005-core-authorization.md).
- Host/backup/implantação: [ADR-008](docs/decisions/ADR-008-production-host-thinkstation-c30.md), [ADR-006 — Proposed](docs/decisions/ADR-006-infra-v1-reused-hardware.md), [BACKUP_RECOVERY](docs/architecture/BACKUP_RECOVERY.md) e [Plano Diretor](docs/planning/PLANO_DIRETOR_2026.md).
- Curva ABC: [brief](docs/briefs/ABC_DOMAIN_V1.md), [guia](docs/modules/abc/OPERATOR_GUIDE_V1.md) e [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70).

**ADR-007 / Identity Boundary:** proposta anterior na PR #24 fechada **sem merge**. A [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) permanece aberta. **Não** implementar serviço privilegiado, migrations de identidade ou corte sem nova proposta aprovada, revisão independente e GO humano.

## 4. Trabalho de engenharia

1. Trabalhar sobre branch própria de `origin/main`, identificada à tarefa; conferir `git status`, diff, commits recentes e arquivos modificados por outro agente.
2. Delimitar o menor conjunto de arquivos e preservar comportamento fora do escopo; coordenar sobreposições antes de editar.
3. Manter tipagem, tratamento explícito de erros e separação de UI, domínio, persistência e infraestrutura.
4. Usar contratos de banco/RPC e componentes existentes, adicionar testes proporcionais ao risco; incluir **casos negativos** para RLS, perfil inativo, unidade indevida e concorrência quando pertinente.
5. Atualizar **na mesma PR** documentação canônica, diagramas e roadmap quando mudar fluxo, permissão, schema, dependência ou status de módulo. Escrever texto explicativo em **pt-BR**.
6. Revisar diff; executar apenas validações pertinentes e efetivamente disponíveis. Não afirmar que algo passou sem evidência do SHA/comando. Informar testes **não executados**.
7. PR deve conter objetivo, arquivos, testes, riscos, limites, validação, revisores e pendências; usar [template](.github/pull_request_template.md).

**Validação normal de frontend:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:build`, `npm audit --audit-level=moderate` quando aplicáveis. Integração real e infraestrutura são executadas por `action-plans-integration` e `infra-validate`. CI verde **não** substitui P1–P9/O1–O8 nem deploy autorizado.

## 5. Colaboração, revisão e entrega

Seguir [PARALLEL_AGENT_WORKFLOW](docs/development/PARALLEL_AGENT_WORKFLOW.md) e [AI_WORKFLOW](docs/development/AI_WORKFLOW.md):
- Uma **área de escrita, branch e runtime exclusivos** por agente, com proprietário nomeado na issue. Core/migrations/CI em conflito têm um único escritor coordenado.
- Usar brief + Git + issue/PR como passagem entre agentes; não reproduzir chat inteiro como fonte da verdade.
- Não dar push direto na `main`, executar force-push, apagar branch com trabalho não integrado, fazer release ou mudar configuração de produção autonomamente.
- **Merge requer autorização e revisão humana apropriadas ao risco**. Aprovação verbal comunicada pelo responsável deve ser registrada como verbal; **não se transforma** em review formal `APPROVED` nem é autorização genérica para novas PRs. O ruleset da `main` foi **adiado** no Plano Diretor; a ausência de proteção automática não elimina a disciplina de PR/CI/revisão.
- Quando uma condição essencial estiver indefinida (segurança privilegiada, escopo de dados, ambiente, autoridade, operação destrutiva), **interromper a ação de risco e perguntar somente o necessário**.

**Relatório de conclusão em pt-BR:** resumo objetivo, arquivos/commits, checks com resultado real, o que não foi provado, riscos e próximas dependências. **Não** declarar PROD pronta nem fechar um gate humano por inferência.

## 6. Estado funcional e interpretação histórica

A Fundação Core v2 foi consolidada na PR #38. A Qualidade v1 foi integrada com histórico/reabertura, Planos de Ação, duas famílias de evidência, exportação e UX institucional **Elo**. A Curva ABC v1 entrou pela PR #69; código implementado **não** significa homologação, aplicação de migration em DEV compartilhado ou migração do histórico do desktop. A [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) acompanha testes de ABC.

O ensaio sintético de restore (PR #62 / [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51)) possui **8 PASS e DR-08 PARCIAL**, sobre **17 migrations históricas**. A plataforma corrente inclui 18 migrations; o bucket ABC não foi abrangido por aquela prova. A documentação do host C30 e de Cloudflare/R2 é principalmente **TO-BE**, não prova de implantação.

Textos antigos, prints e contagens de testes podem descrever **baselines históricas**. Confirmar em código, CI e issues atuais antes de usar como status. **Produção: NO-GO** até homologação P1–P9, prontidão O1–O8, recuperação real, identidade privilegiada e decisão humana registrada.
