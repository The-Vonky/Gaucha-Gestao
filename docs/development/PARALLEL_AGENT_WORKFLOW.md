# Desenvolvimento paralelo com agentes — Gaúcha Gestão

**Estado em 21/10/2026:** documento integrado à `main` desde a PR #43. Funciona como **disciplina operacional manual de colaboração**, não como ruleset automático ou autorização para ambiente persistente. O escopo de cinco dias abaixo é histórico e não distribui tarefas futuras por padrão.
**Idioma de trabalho:** pt-BR para registros, handovers, issues e PRs. Consulte [AGENTS.md](../../AGENTS.md) como regra compartilhada; este documento detalha somente coordenação entre agentes.
**Objetivo vigente (23/10/2026):** **um mantenedor/desenvolvedor humano**, com agentes auxiliares e controle sequencial de tarefas, reutilizando o Docker/Supabase local existente; PRs verificadas pelo mantenedor antes de merge. O plano histórico de dois desenvolvedores abaixo não define composição obrigatória atual.

> **Histórico de 15/10/2026:** o adiamento do ruleset da `main` continua registrado. Em **23/10/2026**, o responsável informou que é o único desenvolvedor humano; **não há mais exigência operativa de um segundo desenvolvedor/revisor para a PR AG-01**. O mantenedor aceita o risco residual de revisão individual, decide merge após CI, testes e avaliação de segurança. Não há autorização implícita de produção.

## 1. Responsabilidade e limites

| Frente | Responsável primário | Escopo padrão |
| --- | --- | --- |
| Plataforma e release | Responsável técnico do projeto | `infra/**`, `scripts/ops/**`, workflows CI/CD, backups, observabilidade, redes e deploy |
| Aplicação e qualidade | Mantenedor único, com agente executor quando delegado | `apps/web/src/modules/**`, `tests/**` de domínio/E2E, homologação e regressões de UI |
| Core/Auth e migrations | Dev A (ou outro responsável expressamente nomeado na issue) | `apps/web/src/core/**`, `supabase/migrations/**`, regras de autorização e Identity Boundary; depende dos gates do ADR-007 |
| Integração | Mantenedor único, com PR, checks e auto-revisão rastreada | `main`, resolução de conflitos, release, mudanças operacionais (GO de produção sempre específico) |

**Divisão dos cinco dias (issues #46–#59):** Dev A (`The-Vonky`) cuida de Core, arquitetura, infraestrutura, recovery, decisões e handover; Dev B assume Qualidade v1, setup/testes, matriz P1–P9, bugs e regressões; Matheus apoia o diagnóstico e a montagem física da C30/HD HPE. O login GitHub de Dev B foi confirmado como [@bernardowillian](https://github.com/bernardowillian) na Issue #47 e como colaborador com permissão de escrita na revisão de 20/10/2026. **Isso não atribui autorização de produção, backup, arquitetura ou merge de novas PRs.** Os responsáveis por decisões sensíveis continuam definidos por issue/ADR/ata, não por inferência.

Propriedade é **por tarefa/arquivo**, não propriedade permanente do diretório. Qualquer mudança que atravessar a fronteira deve ser dividida ou coordenada na issue antes da edição. Evite dois agentes escritores no mesmo arquivo, migration, branch, banco ou projeto Docker. Revisores trabalham preferencialmente sem escrever código.

A proposta do ADR-007 no [PR #24](https://github.com/The-Vonky/Gaucha-Gestao/pull/24) foi **encerrada sem merge e sem aceite**, e a [Issue #42](https://github.com/The-Vonky/Gaucha-Gestao/issues/42) foi encerrada como não planejada nesta etapa. A revisão arquitetural prossegue na [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49). **ADR-007 permanece NO-GO:** não implementar runtime privilegiado, migrations ou cutover sem nova proposta, revisão independente e GO humano explícito.

## 2. Preparação vigente do mantenedor único (histórico de dois desenvolvedores abaixo)

1. **Equipe atual:** somente o mantenedor humano. Convites/acessos de colaboradores mencionados no histórico de 20/10 **não indicam disponibilidade atual de outro desenvolvedor** e não exigem convite nem revisão por terceiro.
2. **Não configurar proteção/ruleset da `main` nesta fase.** A ativação foi adiada por decisão consciente para a **etapa final do projeto**. Registrar o risco residual e, antes do GO, confirmar a sequência de proteção, aprovação e implantação. Quando a fase final for autorizada e houver revisor elegível, propor checks obrigatórios, aprovação humana de outra pessoa e bloqueio de force-push/deleção como mudança separada, sem antecipá-la agora.
3. **Disciplina vigente:** usar PR, não fazer push direto na `main` nem auto-merge; verificar checks pertinentes, executar testes e revisar diff, especialmente RLS/grants/concorrência. **O mantenedor humano único aprova ou rejeita o merge**; ausência de outro humano deve ser explicitada como risco residual, nunca como impedimento automático ao desenvolvimento.
4. Não configurar `CODEOWNERS`/ruleset exigindo aprovação de outra pessoa indisponível. Reavaliar proteção técnica posteriormente, sem bloquear o desenvolvimento atual.

## 3. Branch, checkout de homologação e worktrees

**Regra vigente em 10/11/2026:** o notebook é o ambiente de desenvolvimento e homologação. A `main` permanece fonte oficial do código integrado, mas o mantenedor **testa a branch da PR no localhost ANTES do merge**. Não criar worktrees como pré-requisito ou proteção rotineira contra atualizações locais; a disciplina antiga de worktrees exclusivas para dois desenvolvedores é histórica.

O agente com acesso à estação deve entregar a alteração no checkout que alimenta o servidor de desenvolvimento, não apenas em sua worktree ou no GitHub. Seguir a sequência:

1. Identificar a pasta em que está rodando o frontend e conferir `git status --short`, `git branch --show-current`, `git worktree list` e o SHA atual. Identificar trabalhos não commitados; evitar somente **perda ou conflito real**, não bloquear homologação por precaução genérica.
2. Trabalhar em uma branch da tarefa, sem escrever na `main`. Ao terminar commits/push e abrir/atualizar a PR, disponibilizar **o HEAD da branch no checkout do notebook usado pelo localhost**, via `git fetch`, `git switch` e atualização fast-forward quando aplicável. Conferir o SHA final. Não tentar abrir uma mesma branch simultaneamente em duas worktrees; adaptar o fluxo se já estiver ativa em outra pasta.
3. Se a troca de branch colidir com modificações locais, isolar essas alterações de forma reversível, com identificação e possibilidade de restauração. Não usar comandos destrutivos nem apagar WIP. Para conflitos efetivos entre PRs pendentes, escolher explicitamente qual branch será homologada de cada vez; uma composição local temporária exige registro dos commits e não integra a `main`.
4. Reutilizar a instância Supabase/Docker local existente e verificar migrations necessárias, com um escritor por vez. Não presumir que trocar código atualiza o schema. Migrations incrementais locais dependem de conferência do destino e da preservação dos dados; não fazer reset para vencer bloqueios.
5. Verificar que o app local realmente usa o código novo, executar smoke test pertinente e registrar na PR **checkout, branch, SHA, URL do localhost, status de banco/migrations, evidências e bloqueios**. Só marcar `PRONTO PARA HOMOLOGAÇÃO LOCAL` depois dessa confirmação.
6. Se o agente **não tem acesso efetivo ao notebook** (por exemplo, atua apenas pelo conector GitHub ou em workspace remoto), informar `PENDENTE DE SINCRONIZAÇÃO LOCAL`, descrever os comandos adaptados ao checkout real e não afirmar que executou a sincronização.

Exemplo de sincronização em **PowerShell dentro do checkout real do notebook**, somente após inspecionar o estado e confirmar que a branch não está ativa em outra worktree:

```powershell
git status --short
git branch --show-current
git worktree list
git fetch origin
# Para primeira instalação da branch:
git switch --track origin/NOME-DA-BRANCH
# Em homologações seguintes, se a branch local já existir:
# git switch NOME-DA-BRANCH
# git pull --ff-only origin NOME-DA-BRANCH
git rev-parse HEAD
```

Os comandos alternativos do exemplo não devem ser executados ambos sem verificar o estado. O checkout ativo e o frontend precisam apontar ao mesmo código. Após o merge aprovado, o retorno do checkout à `main` é uma operação local separada e verificável. O GitHub conectado, por si só, **não modifica os arquivos do notebook**.

## 4. Isolamento de runtime e dados

- **Usar o ambiente Supabase/Docker local existente (`gaucha-gestao-local`)** por padrão para desenvolver e verificar manualmente, com somente um escritor/migração por vez. **Não criar novos projetos, containers, bancos, volumes ou portas por hábito.** Isolamento específico só para ensaio destrutivo/concorrente cuja necessidade seja comprovada e autorizada.
- Para ensaios de unidade, preferir testes em memória; para teste manual end-to-end, usar o ambiente **local já configurado** e contas/dados de teste. Nunca direcionar reset/destruição para ambiente existente nem apontar comandos a C30/STAGING/PROD. Não expor segredos/credenciais nos relatórios.
- Scripts existentes em `scripts/ops` aceitam somente `ci`/`staging` descartável e rejeitam `production`. Não reinterpretá-los como mecanismo de deploy produtivo.
- Nunca executar `supabase db reset`, `db push`, `--linked`, seed ou migração destrutiva em instância compartilhada/remota; migrations incrementais em PR único, com revisão de ownership e rollback/forward-fix.
- Não copiar arquivos de produção, tokens, URLs assinadas, senhas ou dados pessoais para prompts, artefatos ou logs de agentes.
- O servidor legado (Windows, com serviços legados) deixou de ser o host planejado: a plataforma vai para a Lenovo ThinkStation C30 ([ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md)). O destino do servidor legado está pendente; enquanto ele existir, não é sandbox, e qualquer ação nele exige avaliação de impacto e aprovação operacional específica.
- A C30 também não é sandbox. Reinstalação, provisionamento e qualquer ambiente persistente nela seguem o [Plano Diretor](../planning/PLANO_DIRETOR_2026.md) e exigem aprovação humana antes da ação.

## 5. Contrato mínimo de cada issue e de cada agente

Toda issue executável deve declarar: **objetivo**, **fora de escopo**, **dono humano**, **branch**, **arquivos permitidos**, **dependências**, **ambiente de desenvolvimento local reutilizado ou isolamento excepcional justificado**, **critérios de aceite** e **testes exigidos**.

Sessão de agente:
1. Ler `AGENTS.md`, brief/issue e somente docs/arquivos relevantes.
2. Conferir branch, `git status`, diff e commits recentes.
3. Implementar escopo mínimo e testes focados; não reformular arquitetura sem ADR aceito.
4. Registrar qualquer arquivo adicional antes de mudar uma área de outro agente.
5. Revisar diff e executar os checks pertinentes; reportar comandos **realmente executados** e limitações.
6. Abrir PR pequeno; não fazer merge, deploy, tag, migration compartilhada ou release autonomamente.
7. Disponibilizar o HEAD no checkout local de homologação quando houver acesso ao notebook; registrar o SHA carregado e solicitar aceite **antes** do merge.

Revisão pode usar outro agente/modelo para parecer técnico, mas a aprovação de merge é **humana**. Uma aprovação verbal precisa ser descrita **como verbal**, com data, autor do relato e escopo da PR; não inventar review formal `APPROVED` no GitHub. Não estender autorização de uma PR a outra. Segurança de Auth/RLS/concorrência não pode ser substituída por CI verde.

## 6. Merge, CI e liberação

Pipeline vigente (10/11/2026): **Issue → branch da tarefa → commits + PR + CI → checkout do notebook sincronizado com a branch da PR → testes e aceite do mantenedor no localhost → correções na mesma PR, se necessárias → revisão final/CI → merge pelo mantenedor na `main` → eventual release autorizado separadamente**. Revisão independente é recomendável quando houver outro revisor disponível, mas **não é requisito para inventar outra pessoa**.

Checks existentes: `validate` (typecheck, lint, Vitest, build, npm audit), `action-plans-integration` (Supabase local/E2E), `infra-validate` (stack reproduzível). Rodar testes de domínio pertinentes mesmo quando a suíte completa for exigida para merge. Se `action-plans-integration` falhar intermitentemente, consultar a [Issue #41](https://github.com/The-Vonky/Gaucha-Gestao/issues/41) (encerrada administrativamente, sem correção comprovada) e registrar nova ocorrência na [Issue #57](https://github.com/The-Vonky/Gaucha-Gestao/issues/57) antes de abrir issue específica; não mascarar o erro apenas repetindo execução.

**Documentação atualizada em 21/10:** Core/Qualidade/ABC v1 estão integrados ao código; a PR #62 de restore foi mergeada com 8 PASS / DR-08 PARCIAL; a Issue #51 continua aberta. O documento de colaboração não decide o fechamento desses gates. **Produção não está liberada:** P1–P9 e O1–O8 seguem conforme `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md`, junto dos gates de segurança, recuperação e autorização explícita de deploy. Não confundir branch protegida ou CI verde com homologação física.

## 7. Capacidade e coordenação

**Operação atual:** um mantenedor humano, com um agente escritor por tarefa e **o runtime Docker/Supabase local já existente**. Trabalhos paralelos devem ser coordenados somente se efetivamente existirem; não exigir worktrees ou ambientes adicionais por padrão. A antiga divisão Dev A/Dev B foi específica das issues #46–#59 e está encerrada como regra para novas tarefas.

**Cadência atual:** o agente entrega commits, PR, CI e **a branch sincronizada no checkout do notebook**, quando tiver acesso local, pronta para homologação antes do merge. Se não tiver acesso ao notebook, registra o impedimento e fornece instruções exatas de sincronização, sem alegar execução. O mantenedor avalia e decide o merge; não depender de reuniões com segundo desenvolvedor. Registros do antigo ciclo Dev A/Dev B permanecem históricos.

Na passagem entre modelos/agentes, usar Git e issue como fonte de continuidade: branch, `git status`, diff, commits, PR, validação e bloqueios. Não reconstruir contexto inteiro por chat.
