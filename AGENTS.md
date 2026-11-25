# Instruções para agentes de desenvolvimento — Gaúcha Gestão

Trabalhe em português brasileiro (pt-BR) em documentação, PRs, issues, registros de validação e explicações. Preserve caminhos, identificadores técnicos, comandos, logs, citações e nomes oficiais.

## Mantenedor e ambientes

- O mantenedor humano único decide o merge, após avaliar diff, CI, riscos e o aceite aplicável. Agentes podem executar trabalho autorizado e coordenado. O fluxo usual dispensa um segundo desenvolvedor. Registre a revisão efetiva, a ausência de segunda revisão e o risco residual. Aplique as exigências específicas de segurança privilegiada e ADRs.
- A decisão vigente no Agendamento é [AG-D5-C](docs/modules/room-booking/D5C_ADMIN_MODES.md), integrada pela [PR #129](https://github.com/The-Vonky/Gaucha-Gestao/pull/129). D5-A e D5-B fazem parte do histórico. Registre na PR os testes negativos de RLS/permissões, CI, diff, risco e aceite do mantenedor. A divisão Dev A/Dev B pertence ao [mapa de execução arquivado](docs/planning/EXECUTION_MAP.md).
- O ambiente principal é [Ubuntu nativo](docs/operations/LOCAL_DEV_UBUNTU.md). [Windows com WSL2 e Docker Desktop](docs/operations/LOCAL_DEV_WINDOWS.md) também tem suporte oficial. Reutilize o projeto Supabase/Docker DEV pessoal `gaucha-gestao-local`. Confira `git status`, serviços, schema e destino antes de operar. Use novos containers, bancos, volumes, portas, stacks e worktrees apenas quando o escopo justificar.
- Migrations locais, quando necessárias à tarefa, devem ser incrementais, compatíveis e não destrutivas, com estado, dependências, preservação de dados e reversão verificados. Testes em memória e CI descartável são opções de validação. Ensaio destrutivo isolado exige justificativa e autorização específica.
- C30/STAGING é persistente e separado do DEV e da CI. Use o [AS-BUILT de 30/10](docs/operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e o [runbook de STAGING](docs/operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md) como referências datadas. O estado implantado e lacunas de recuperação exigem verificação própria. **PROD NO-GO**. Deploy, alterações persistentes na C30 e manipulação de dados reais exigem GO específico.

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

Siga a leitura progressiva: **AGENTS.md → portal documental → fontes canônicas da tarefa → histórico quando necessário**. Antes de editar, confira a issue/brief autorizado, escopo, ambiente e aceite. Consulte o [portal](docs/README.md) para localizar ADRs, contratos e runbooks relevantes. Compare as fontes com código e Git atuais. Identifique divergências sem escolher uma política arbitrária. Reutilize os padrões e contratos existentes.

Hierarquia de decisão: **pedido/brief atual autorizado** → **ADRs aceitos** → **Plano Diretor e gates aplicáveis** → **contratos arquiteturais** → **estas instruções** → **convenções no código**. Uma issue ou PR proposta não revoga ADR aceito. Decisões de produção, segurança privilegiada, retenção, infraestrutura permanente e corte operacional exigem o responsável humano.

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
- Curva ABC: [brief](docs/briefs/ABC_DOMAIN_V1.md), [guia](docs/modules/abc/OPERATOR_GUIDE_V1.md) e [homologação D13](https://github.com/The-Vonky/Gaucha-Gestao/issues/86).

**D01 / Identity Boundary — atualização 23/11/2026:** proposta anterior da PR #24 fechada **sem merge**, [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) encerrada administrativamente. GG-05B foi autorizada apenas para o **DEV**, homologada no notebook e integrada pela [PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127) (`df113c2`). Isso **não** libera contas reais, cutover ou instalação em C30/STAGING/PROD. Revisão de segurança aplicável, recuperação emergencial do administrador e GO operacional permanecem obrigatórios. Ver [D01](docs/planning/DECISION_REGISTER.md).

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

## 6. Manutenção documental

Use a [política de fontes](docs/README.md#regra-de-manutenção-documental) e o [Guia Mestre GG-01–GG-15](docs/planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md). Preserve o recorte de evidências históricas. P1–P9, O1–O8, recuperação, identidade privilegiada e GO explícito continuam como condições de liberação aplicáveis.
