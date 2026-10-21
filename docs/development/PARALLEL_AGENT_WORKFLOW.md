# Desenvolvimento paralelo com agentes — Gaúcha Gestão

**Estado em 21/10/2026:** documento integrado à `main` desde a PR #43. Funciona como **disciplina operacional manual de colaboração**, não como ruleset automático ou autorização para ambiente persistente. O escopo de cinco dias abaixo é histórico e não distribui tarefas futuras por padrão.
**Idioma de trabalho:** pt-BR para registros, handovers, issues e PRs. Consulte [AGENTS.md](../../AGENTS.md) como regra compartilhada; este documento detalha somente coordenação entre agentes.
**Objetivo:** dois desenvolvedores, agentes simultâneos, um único fluxo de integração e nenhuma concorrência sobre ambientes persistentes ou produção.

> **Decisão do responsável técnico — 15/10/2026:** a proteção técnica (`ruleset`/branch protection) da `main` será implementada **somente na fase final do projeto**. O risco de push/merge sem bloqueio automático foi conscientemente aceito; **não equivale a mitigação técnica**. Até lá, PR, CI e revisão humana independente são exigências **operacionais manuais**, não gates impostos pelo GitHub. Sem habilitar ou alterar ruleset neste ciclo. Reavaliar a ordem exata e as condições antes de qualquer GO de produção.

## 1. Responsabilidade e limites

| Frente | Responsável primário | Escopo padrão |
| --- | --- | --- |
| Plataforma e release | Responsável técnico do projeto | `infra/**`, `scripts/ops/**`, workflows CI/CD, backups, observabilidade, redes e deploy |
| Aplicação e qualidade | Segundo desenvolvedor | `apps/web/src/modules/**`, `tests/**` de domínio/E2E, homologação P1–P9, regressões de UI |
| Core/Auth e migrations | Dev A (ou outro responsável expressamente nomeado na issue) | `apps/web/src/core/**`, `supabase/migrations/**`, regras de autorização e Identity Boundary; depende dos gates do ADR-007 |
| Integração | Responsável técnico, com revisão de outro humano | `main`, resolução de conflitos, release, mudanças operacionais |

**Divisão dos cinco dias (issues #46–#59):** Dev A (`The-Vonky`) cuida de Core, arquitetura, infraestrutura, recovery, decisões e handover; Dev B assume Qualidade v1, setup/testes, matriz P1–P9, bugs e regressões; Matheus apoia o diagnóstico e a montagem física da C30/HD HPE. O login GitHub de Dev B foi confirmado como [@bernardowillian](https://github.com/bernardowillian) na Issue #47 e como colaborador com permissão de escrita na revisão de 20/10/2026. **Isso não atribui autorização de produção, backup, arquitetura ou merge de novas PRs.** Os responsáveis por decisões sensíveis continuam definidos por issue/ADR/ata, não por inferência.

Propriedade é **por tarefa/arquivo**, não propriedade permanente do diretório. Qualquer mudança que atravessar a fronteira deve ser dividida ou coordenada na issue antes da edição. Evite dois agentes escritores no mesmo arquivo, migration, branch, banco ou projeto Docker. Revisores trabalham preferencialmente sem escrever código.

A proposta do ADR-007 no [PR #24](https://github.com/The-Vonky/Gaucha-Gestao/pull/24) foi **encerrada sem merge e sem aceite**, e a [Issue #42](https://github.com/The-Vonky/Gaucha-Gestao/issues/42) foi encerrada como não planejada nesta etapa. A revisão arquitetural prossegue na [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49). **ADR-007 permanece NO-GO:** não implementar runtime privilegiado, migrations ou cutover sem nova proposta, revisão independente e GO humano explícito.

## 2. Preparação dos dois desenvolvedores

1. **Verifique** se [@bernardowillian](https://github.com/bernardowillian) ainda possui o acesso mínimo necessário em **Settings → Collaborators** (permissão de escrita verificada em 20/10/2026). Não enviar convite duplicado nem aumentar privilégios sem necessidade; nunca conceder credenciais de deploy ou segredos de produção por esta regra.
2. **Não configurar proteção/ruleset da `main` nesta fase.** A ativação foi adiada por decisão consciente para a **etapa final do projeto**. Registrar o risco residual e, antes do GO, confirmar a sequência de proteção, aprovação e implantação. Quando a fase final for autorizada e houver revisor elegível, propor checks obrigatórios, aprovação humana de outra pessoa e bloqueio de force-push/deleção como mudança separada, sem antecipá-la agora.
3. **Disciplina manual até a proteção:** não fazer push direto na `main`, não usar auto-merge/bypass, verificar `validate`, `action-plans-integration` e `infra-validate` quando pertinentes e exigir revisão humana independente antes do merge. Essa disciplina depende das pessoas e não substitui enforcement técnico; se não houver revisor elegível, a mudança crítica aguarda.
4. Não configurar `CODEOWNERS` com um único usuário e revisão obrigatória: isso poderia bloquear PRs de autoria do próprio dono. Adicionar nomes reais e revisão por CODEOWNERS somente após o segundo colaborador aceitar o convite.

## 3. Branches e worktrees

`main` é a fonte oficial. Criar branch **somente ao iniciar uma issue aprovada**, sempre de `origin/main`; não reutilizar branches antigas de integração.

| Trabalho inicial | Branch sugerida | Worktree local |
| --- | --- | --- |
| Homologação persistente de infraestrutura | `feat/prod-runtime` | `../Gaucha-Gestao-Infra` |
| Backup e recuperação (após separar propriedade de `scripts/ops`) | `feat/backup-recovery` | `../Gaucha-Gestao-Backup` |
| Testes da candidata de release | `test/release-e2e` | `../Gaucha-Gestao-Tests` |
| Correções mobile validadas | `fix/quality-mobile` | `../Gaucha-Gestao-UI` |

Exemplo PowerShell **por computador**, na raiz do clone local, somente quando os nomes/caminhos estiverem livres:

```powershell
git status --short
git fetch origin --prune
git worktree list
git worktree add -b feat/prod-runtime ../Gaucha-Gestao-Infra origin/main
```

Na estação de aplicação, substitua o último comando por:

```powershell
git worktree add -b test/release-e2e ../Gaucha-Gestao-Tests origin/main
```

Nunca sobrescrever pasta ou worktree existente; inspecionar `git status` e `git worktree list` antes de remover qualquer coisa. O GitHub conectado **não cria worktrees nos computadores locais**. Branch local torna-se remota no primeiro `git push -u origin <branch>`.

Após um PR integrado, limpar worktree **somente depois** de conferir que não há trabalho não enviado: `git worktree remove <caminho>`; apagar branch local com `git branch -d <branch>` apenas quando seguro.

## 4. Isolamento de runtime e dados

- Cada agente com teste que usa Docker deve possuir projeto Compose, volumes, portas e arquivo de ambiente **exclusivos**. Worktree isolada não isola PostgreSQL, CLI Supabase nem Storage.
- Use apenas instâncias descartáveis com identificador inequívoco e credenciais sintéticas; nunca apontar scripts de teste ou seed para produção ou banco compartilhado.
- Scripts existentes em `scripts/ops` aceitam somente `ci`/`staging` descartável e rejeitam `production`. Não reinterpretá-los como mecanismo de deploy produtivo.
- Nunca executar `supabase db reset`, `db push`, `--linked`, seed ou migração destrutiva em instância compartilhada/remota; migrations incrementais em PR único, com revisão de ownership e rollback/forward-fix.
- Não copiar arquivos de produção, tokens, URLs assinadas, senhas ou dados pessoais para prompts, artefatos ou logs de agentes.
- O servidor legado (Windows, com serviços legados) deixou de ser o host planejado: a plataforma vai para a Lenovo ThinkStation C30 ([ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md)). O destino do servidor legado está pendente; enquanto ele existir, não é sandbox, e qualquer ação nele exige avaliação de impacto e aprovação operacional específica.
- A C30 também não é sandbox. Reinstalação, provisionamento e qualquer ambiente persistente nela seguem o [Plano Diretor](../planning/PLANO_DIRETOR_2026.md) e exigem aprovação humana antes da ação.

## 5. Contrato mínimo de cada issue e de cada agente

Toda issue executável deve declarar: **objetivo**, **fora de escopo**, **dono humano**, **branch**, **arquivos permitidos**, **dependências**, **ambiente exclusivo**, **critérios de aceite** e **testes exigidos**.

Sessão de agente:
1. Ler `AGENTS.md`, brief/issue e somente docs/arquivos relevantes.
2. Conferir branch, `git status`, diff e commits recentes.
3. Implementar escopo mínimo e testes focados; não reformular arquitetura sem ADR aceito.
4. Registrar qualquer arquivo adicional antes de mudar uma área de outro agente.
5. Revisar diff e executar os checks pertinentes; reportar comandos **realmente executados** e limitações.
6. Abrir PR pequeno; não fazer merge, deploy, tag, migration compartilhada ou release autonomamente.

Revisão pode usar outro agente/modelo para parecer técnico, mas a aprovação de merge é **humana**. Uma aprovação verbal precisa ser descrita **como verbal**, com data, autor do relato e escopo da PR; não inventar review formal `APPROVED` no GitHub. Não estender autorização de uma PR a outra. Segurança de Auth/RLS/concorrência não pode ser substituída por CI verde.

## 6. Merge, CI e liberação

Pipeline: **Issue → worktree/branch isolada → commits focalizados → PR → checks → revisão humana independente → merge main → homologação → release autorizado**.

Checks existentes: `validate` (typecheck, lint, Vitest, build, npm audit), `action-plans-integration` (Supabase local/E2E), `infra-validate` (stack reproduzível). Rodar testes de domínio pertinentes mesmo quando a suíte completa for exigida para merge. Se `action-plans-integration` falhar intermitentemente, consultar a [Issue #41](https://github.com/The-Vonky/Gaucha-Gestao/issues/41) (encerrada administrativamente, sem correção comprovada) e registrar nova ocorrência na [Issue #57](https://github.com/The-Vonky/Gaucha-Gestao/issues/57) antes de abrir issue específica; não mascarar o erro apenas repetindo execução.

**Documentação atualizada em 21/10:** Core/Qualidade/ABC v1 estão integrados ao código; a PR #62 de restore foi mergeada com 8 PASS / DR-08 PARCIAL; a Issue #51 continua aberta. O documento de colaboração não decide o fechamento desses gates. **Produção não está liberada:** P1–P9 e O1–O8 seguem conforme `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md`, junto dos gates de segurança, recuperação e autorização explícita de deploy. Não confundir branch protegida ou CI verde com homologação física.

## 7. Capacidade e coordenação

Para o plano dos cinco dias, priorizar **uma frente de escrita ativa por desenvolvedor** (Dev A: Core/infra; Dev B: Qualidade/testes); trabalhos paralelos adicionais exigem divisão explícita de arquivos e ambiente na issue. Fora desse ciclo, o limite geral é **dois agentes escritores por pessoa**; revisores somente leitura podem operar paralelamente. Registrar dono, arquivos e estado da tarefa na issue/PR, não em conversa temporária. Quando houver conflitos em arquivos, CI sobrecarregada ou fila de revisão, diminuir paralelismo.

**Cadência proposta (confirmar com Dev B):** alinhamento inicial de 20 minutos, revisão cruzada até 16h nos dias aplicáveis, atualização ao fim de cada dia com responsável, prioridade, gate, SHA, PR, evidência sanitizada, bloqueador e próximo passo. Sem confirmação explícita da equipe, marcar `PENDENTE`, nunca `FEITO`.

Na passagem entre modelos/agentes, usar Git e issue como fonte de continuidade: branch, `git status`, diff, commits, PR, validação e bloqueios. Não reconstruir contexto inteiro por chat.
