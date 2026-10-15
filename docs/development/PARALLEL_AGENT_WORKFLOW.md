# Desenvolvimento paralelo com agentes — Gestão-Gaúcha

**Estado:** protocolo de colaboração proposto. Aplicável depois de aprovado e integrado à `main`.
**Objetivo:** dois desenvolvedores, agentes simultâneos, um único fluxo de integração e nenhuma concorrência sobre ambientes persistentes ou produção.

## 1. Responsabilidade e limites

| Frente | Responsável primário | Escopo padrão |
| --- | --- | --- |
| Plataforma e release | Responsável técnico do projeto | `infra/**`, `scripts/ops/**`, workflows CI/CD, backups, observabilidade, redes e deploy |
| Aplicação e qualidade | Segundo desenvolvedor | `apps/web/src/modules/**`, `tests/**` de domínio/E2E, homologação P1–P9, regressões de UI |
| Core/Auth e migrations | Uma pessoa designada por issue | `apps/web/src/core/**`, `supabase/migrations/**`, regras de autorização e Identity Boundary |
| Integração | Responsável técnico, com revisão de outro humano | `main`, resolução de conflitos, release, mudanças operacionais |

Propriedade é **por tarefa/arquivo**, não propriedade permanente do diretório. Qualquer mudança que atravessar a fronteira deve ser dividida ou coordenada na issue antes da edição. Evite dois agentes escritores no mesmo arquivo, migration, branch, banco ou projeto Docker. Revisores trabalham preferencialmente sem escrever código.

`docs/decisions/ADR-007-core-identity-boundary.md` ainda é **proposta** no PR #24. Não implementar runtime privilegiado, migrações ou cutover com base nela antes de GO independente e aprovação humana explícita.

## 2. Preparação dos dois desenvolvedores

1. Convide o segundo desenvolvedor pelo **username GitHub exato** em **Settings → Collaborators**, com o menor nível de acesso capaz de enviar branches e PRs; não conceda credenciais de deploy nem segredos de produção.
2. Habilite proteção/ruleset de `main` na interface do GitHub, depois que existir ao menos um revisor humano elegível. Exija PR para merge, pelo menos **1 aprovação humana de outra pessoa**, fechamento de conversas, rejeição de force-push/deleção e checks obrigatórios: `validate`, `action-plans-integration`, `infra-validate`. Confirme os nomes exatos no GitHub antes de ativar.
3. Não permitir push direto em `main`; não usar auto-merge ou bypass administrativo para contornar checks. Se a interface da conta/plano limitar regras, registre a limitação e imponha a verificação humana até ela ser resolvida.
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

Revisão deve usar outro agente/modelo quando útil, mas a aprovação de merge é **humana**. A avaliação de segurança de Auth/RLS/concurrency não pode ser substituída por CI verde.

## 6. Merge, CI e liberação

Pipeline: **Issue → worktree/branch isolada → commits focalizados → PR → checks → revisão humana independente → merge main → homologação → release autorizado**.

Checks existentes: `validate` (typecheck, lint, Vitest, build, npm audit), `action-plans-integration` (Supabase local/E2E), `infra-validate` (stack reproduzível). Rodar testes de domínio pertinentes mesmo quando a suíte completa for exigida para merge. Se `action-plans-integration` falhar intermitentemente, investigar Issue #41; não mascarar o erro apenas repetindo execução.

**Produção não está liberada:** P1–P9 e O1–O8 seguem conforme `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md`, junto dos gates de segurança, recuperação e autorização explícita de deploy. Não confundir branch protegida ou CI verde com homologação física.

## 7. Capacidade e coordenação

Começar com no máximo **dois agentes escritores por pessoa**; revisores somente leitura podem operar paralelamente. Registrar dono, arquivos e estado da tarefa na issue/PR, não em conversa temporária. Quando houver conflitos em arquivos, CI sobrecarregada ou fila de revisão, diminuir paralelismo.

Na passagem entre modelos/agentes, usar Git e issue como fonte de continuidade: branch, `git status`, diff, commits, PR, validação e bloqueios. Não reconstruir contexto inteiro por chat.
