# Instruções para agentes de desenvolvimento — Gaúcha Gestão

> **STAGING C30 — fato operacional de 30/10/2026:** acesso HTTPS de testes por [`teste.gauchagestao.online`](https://teste.gauchagestao.online) via Cloudflare Tunnel, Caddy 4181 e frontend `f9f041e-cloudflare`. Auth/Storage receberam configuração de domínio e foram recriados; banco/REST/Kong preservados. O servidor permanece no commit `f9f041e` (não acompanha a main), com dados persistentes e backup/restore independente ainda sem prova. **Não executar migrations, resets, atualizações ou ações de produção no STAGING por inferência.** Consultar [AS-BUILT de 30/10](docs/operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e [runbook Cloudflare](docs/operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md). O registro de 22/10 abaixo é histórico; **PROD NO-GO**.

**Idioma de trabalho:** português brasileiro (pt-BR) em documentação, PRs, issues, registros de validação, relatórios e explicações. **Não traduzir** nomes de arquivos, diretórios, símbolos de código, schemas, SQL, funções, variáveis, comandos, logs ou identificadores técnicos. Preservar citações e nomes oficiais de serviços.

> **Estado de referência (21/10/2026):** Core v2, Auditorias/Qualidade v1, Planos de Ação, evidências, relatórios e Curva ABC v1 estão integrados ao código. O módulo ABC ainda requer homologação manual. Ensaios automatizados em CI e restore sintético não comprovam implantação produtiva. **PROD NO-GO**: não há autorização para deploy ou manipulação de dados reais.

> **Atualização operacional de 22/10/2026:** a C30 possui **STAGING persistente** no commit `f9f041e` (18 migrations) com Supabase e Caddy ativos; não está em PROD e não é laboratório descartável. Ver [inventário do host](docs/operations/C30_STAGING_AS_BUILT_20261022.md), [diagnóstico seguro](docs/operations/C30_STAGING_RUNBOOK.md), [lacunas de backup](docs/operations/C30_BACKUP_GAPS.md) e [releases](docs/operations/C30_STAGING_RELEASE_GUIDE.md). Qualquer migração do checkout mais recente para o host exige tratamento separado e autorizado.

## Regra operacional vigente — mantenedor único e desenvolvimento local (23/10/2026)

**Organização vigente em 10/11/2026: há um único desenvolvedor e mantenedor humano, que decide o merge. O antigo segundo desenvolvedor saiu da equipe.** Agentes de IA podem executar tarefas autorizadas, inclusive em paralelo de forma coordenada, mas **não representam outros desenvolvedores humanos**. O agente pode implementar código, abrir PR, executar testes e recomendar correções. A decisão final de integração é do titular; **não exigir segundo desenvolvedor, revisão humana independente ou parecer D5-A como condição inexistente** para desenvolver e revisar a PR de Agendamento. D5-A já foi aprovada em produto, com risco de ampliação de `room_booking.manage` assumido pelo mantenedor (Issues #83/#87). Não afirmar que uma revisão independente inexistente aconteceu. Registrar na PR: CI, testes negativos de RLS/permissões, diff revisado, riscos e aceite do titular. **Não eliminar controles de segurança só por existir um mantenedor.**

**Ambiente padrão para desenvolvimento e validação manual:** reutilizar o projeto Supabase/Docker local do próprio mantenedor, atualmente identificado como `gaucha-gestao-local`. **Não criar novo container, PostgreSQL, banco, volume, porta, Compose, projeto Supabase ou worktree por rotina.** Primeiro inspecionar `git status`, `docker ps`, serviços e schema atuais; confirmar que o destino é o ambiente local pretendido. O agente pode propor/aplicar migrations **incrementais não destrutivas ao desenvolvimento local existente, após verificar estado, dependências e preservar dados**; manter resultados/reversão registrados. Não executar `supabase db reset`, `docker compose down -v`, `prune`, sobrescrita de dados, reset/seed destrutivo ou migrations em DEV de terceiros, C30/STAGING/PROD sem autorização específica. Testes unitários em memória não criam infraestrutura Docker. Se precisar de ensaio destrutivo separado, justificar antes e obter autorização em vez de provisionar automaticamente.

A divisão histórica **Dev A / Dev B** e os planos de dois desenvolvedores estão **encerrados como modelo operacional**: não atribuir tarefas a Dev B, aguardar seu retorno, exigir handover para ele ou condicionar PR/merge a um segundo colaborador inexistente. Atribuições correntes pertencem ao mantenedor único e a agentes que ele designar. Os status de tarefas do antigo [mapa de execução](docs/planning/EXECUTION_MAP.md) são **fotografia arquivada**, não backlog ativo nem tarefas que precisem ser marcadas como concluídas. O acompanhamento atual utiliza o [Guia Mestre GG-01–GG-15](docs/planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md), decisões recentes e o estado real das PRs. **Exigências específicas de revisão por segurança privilegiada/ADR continuam sujeitas a decisão técnica própria; não inventar revisão concluída.** O fluxo de homologação local antes do merge foi atualizado em 10/11/2026, conforme seção a seguir.
## Regra permanente — exclusão de dados de teste no DEV local (12/11/2026)

**Decisão explícita do mantenedor:** o banco de desenvolvimento **pessoal** do notebook, no projeto Docker `gaucha-gestao-local`, é um ambiente de trabalho **descartável**, não um repositório de histórico empresarial. Quando o mantenedor solicitar apagar dados criados/usados no desenvolvimento (por exemplo: unidades, setores, usuários de teste, auditorias, evidências, registros e seus históricos), **executar a exclusão real e completa do conjunto solicitado**. Não substituir por inativação/soft delete, retenção de histórico, arquivamento ou backup obrigatório; não discutir a necessidade de guardar registros de teste e **não solicitar uma segunda autorização** para a exclusão já pedida. Isto também vale para dados que um agente/Codex criou durante testes.

**Forma de execução:** identificar o banco DEV local correto e os registros-alvo; inspecionar as relações/chaves estrangeiras, eliminar dependências pertencentes ao alvo quando necessárias para concluir a exclusão pedida (incluindo trilhas e objetos de teste vinculados, se abrangidos pelo pedido), preferindo uma transação e consultas de verificação. Não alegar sucesso sem conferir que os alvos deixaram de existir. Se houver referência a dados não abrangidos ou alvo realmente ambíguo, perguntar somente sobre essa ambiguidade concreta; não usar a existência de histórico como veto. Não modificar migrations, regras de autorização, políticas RLS nem código de produção para realizar uma limpeza pontual do DEV. Um pedido de apagar registros não autoriza automaticamente apagar o banco inteiro, os volumes ou dados de outros projetos.

**Fronteira obrigatória:** esta regra vale **exclusivamente para o DEV local pessoal confirmado**. Não se aplica ao DEV compartilhado, ThinkStation C30, STAGING, PROD, ERP, serviços externos ou bancos de terceiros. Nesses ambientes, permanecem todas as restrições de integridade, retenção, backup e autorização operacional. Esta regra é uma exceção explícita, para exclusão de **dados de teste solicitada pelo mantenedor**, às orientações gerais de preservação de histórico, auditoria e dados locais deste arquivo.

## Fluxo vigente — entrega ao notebook para homologação ANTES do merge (10/11/2026)

**Decisão explícita do mantenedor:** o notebook é o ambiente normal de **desenvolvimento e homologação local**. Após implementar uma funcionalidade destinada a teste manual, o agente deve **disponibilizar o commit da PR no checkout do notebook que realmente serve o localhost**, sempre que tiver acesso à máquina. Esta etapa faz parte da tarefa autorizada; não precisa esperar o merge na `main`, nem pedir uma aprovação de produção para atualizar o código local.

**Ordem obrigatória:** issue/brief autorizado → branch da tarefa → implementação e testes automatizados → commits/push e PR → **sincronização da branch no checkout ativo do notebook** → verificação do app e, quando aplicável, banco local → **homologação do mantenedor no localhost e refinamentos na mesma PR** → CI/diff conferidos e **aceite explícito do mantenedor para merge** → merge na `main`. Somente depois, em processo separado e com GO específico, preparar eventual release para C30/STAGING/PROD.

**Execução padrão:**
1. Localizar o checkout que alimenta o app (por exemplo, `http://127.0.0.1:5173`) e inspecionar `git status`, branch, worktrees, serviços e migrations locais. Não confundir o checkout do notebook com um clone remoto/sandbox do agente.
2. Preferir trabalhar diretamente nesse checkout, em **branch da tarefa**, quando o agente tiver acesso local e isso não conflitar com outra tarefa ativa. Se desenvolveu em outra worktree ou ambiente, fazer `fetch` e disponibilizar **a branch/commit correto no checkout usado pelo localhost**, sem merge antecipado na `main`. A troca de branch é parte normal da homologação e não requer isolar o notebook por rotina.
3. Não usar `reset --hard`, `clean -fd`, force-push, sobreposição silenciosa ou descarte de alterações não commitadas. Havendo trabalho local incompatível, separar em commit/branch identificada ou outro método **reversível e verificável**, mantendo a sequência de homologação; só interromper e explicar a colisão concreta se realmente impedir a sincronização segura. Nunca misturar PRs pendentes sem informar o conjunto exato de commits.
4. Reutilizar o Supabase/Docker local existente. Se a tarefa requer migrations, verificar o ledger e aplicar apenas mudanças **incrementais, compatíveis e não destrutivas** na instância local correta; registrar sucesso/impedimento e não declarar homologável um fluxo de banco que não foi aplicado. Os bloqueios de dados reais, segredos e ambientes remotos continuam.
5. Conferir o SHA efetivamente carregado, a inicialização do frontend e um smoke test compatível com a tarefa; informar ao mantenedor **branch, SHA, checkout, endereço do localhost, estado de migrations e testes não executados**. Registrar na PR se o notebook está `PRONTO PARA HOMOLOGAÇÃO` ou `PENDENTE DE SINCRONIZAÇÃO LOCAL`, nunca presumir que a publicação no GitHub atualiza o notebook.
6. Se o agente atuar somente no GitHub/nuvem **sem acesso efetivo ao filesystem/processos do notebook**, deve informar a limitação, fornecer um procedimento simples e específico para o mantenedor sincronizar a branch e marcar a entrega local como **NÃO EXECUTADA**. Não alegar que atualizou o notebook.

**Separação de poderes:** atualizar a branch no notebook **não é** fazer merge, deploy, reset, manipular o ERP ou tocar na C30. O aceite humano continua indispensável para merge e qualquer mudança persistente no servidor. Worktree extra só por necessidade real de isolamento ou concorrência, jamais como motivo automático para deixar a versão testável fora do localhost.



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
- Worktree/checkout distinto não isola banco Docker. **Testes não destrutivos e execução manual utilizam por padrão o Supabase/Docker local existente**; somente um teste que demande isolamento destrutivo precisa de runtime exclusivo, com justificativa e autorização, sem criar infraestrutura por padrão.
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
- Uma **área de escrita e branch identificadas** por tarefa. O runtime local existente é **reutilizado por padrão**, em execução sequencial e sem operações destrutivas; apenas agentes concorrentes com testes incompatíveis exigem isolamento específico. Core/migrations/CI têm escritor único coordenado.
- Usar brief + Git + issue/PR como passagem entre agentes; não reproduzir chat inteiro como fonte da verdade.
- Não dar push direto na `main`, executar force-push, apagar branch com trabalho não integrado, fazer release ou mudar configuração de produção autonomamente.
- **Merge requer decisão explícita do mantenedor humano**, com diff e CI/testes pertinentes avaliados. No cenário atual, o mantenedor único realiza essa revisão, registrando a ausência de segunda revisão e o risco residual. Aprovação verbal não equivale a review formal `APPROVED`; não inventar um revisor. O ruleset da `main` foi adiado, mas PR/CI/testes continuam necessários.
- Quando uma condição essencial estiver indefinida (segurança privilegiada, escopo de dados, ambiente, autoridade, operação destrutiva), **interromper a ação de risco e perguntar somente o necessário**.

**Relatório de conclusão em pt-BR:** resumo objetivo, arquivos/commits, checks com resultado real, o que não foi provado, riscos e próximas dependências. **Não** declarar PROD pronta nem fechar um gate humano por inferência.

## 6. Estado funcional e interpretação histórica

A Fundação Core v2 foi consolidada na PR #38. A Qualidade v1 foi integrada com histórico/reabertura, Planos de Ação, duas famílias de evidência, exportação e UX institucional **Elo**. A Curva ABC v1 entrou pela PR #69; código implementado **não** significa homologação, aplicação de migration em DEV compartilhado ou migração do histórico do desktop. A [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) acompanha testes de ABC.

O ensaio sintético de restore (PR #62 / [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51)) possui **8 PASS e DR-08 PARCIAL**, sobre **17 migrations históricas**. A plataforma corrente inclui 18 migrations; o bucket ABC não foi abrangido por aquela prova. A documentação do host C30 e de Cloudflare/R2 é principalmente **TO-BE**, não prova de implantação.

Textos antigos, prints e contagens de testes podem descrever **baselines históricas**. Confirmar em código, CI e issues atuais antes de usar como status. **Produção: NO-GO** até homologação P1–P9, prontidão O1–O8, recuperação real, identidade privilegiada e decisão humana registrada.
