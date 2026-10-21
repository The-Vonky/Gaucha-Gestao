# Fluxo de desenvolvimento assistido por IA

**Idioma padrão:** pt-BR em briefs, tarefas, comentários, PRs, handovers, relatórios e documentação. Preservar identificadores técnicos em sua grafia original. **Fonte neutra para todos os agentes:** [AGENTS.md](../../AGENTS.md); o [CLAUDE.md](../../CLAUDE.md) contém apenas adaptações específicas para aquela ferramenta.

## Objetivo e divisão de responsabilidades

Usar agentes para implementar trabalho de engenharia **aprovado**, reduzindo leitura repetida e preservando revisão humana, segurança e contexto verificável no Git.

| Etapa | Quem decide / executa | Resultado |
| --- | --- | --- |
| Planejamento e arquitetura | Responsável humano, com apoio técnico | Requisitos, decisão de produto, ADR/segurança, UX, brief, fora de escopo, aceite |
| Implementação | Agente/desenvolvedor autorizado | Código, migration nova quando aplicável, testes, documentação canônica, commits focalizados |
| Revisão | Outro humano, com parecer de agente quando útil | Evidências, riscos, autorização de merge proporcional à criticidade |
| Operação persistente / produção | Responsável operacional explicitamente autorizado | Inventário, preservação, validações e registro do GO; nunca inferido de CI verde |

Uma sessão de implementação **não** substitui a aprovação do responsável e não deve redesenhar a plataforma opportunisticamente.

## Unidade de trabalho e contexto

Prefira **uma feature, correção ou atualização documental claramente limitada por sessão**. Contexto inicial esperado:

~~~text
AGENTS.md
+ issue/brief autorizado e critérios de aceite
+ ADRs/contratos relevantes
+ arquivos efetivamente afetados
+ git status, diff e commits da branch
~~~

Evite instruções vagas como «leia todo o projeto e melhore tudo». Se a tarefa for uma auditoria de todo o acervo, declare explicitamente o escopo amplo e identifique primeiro inventário/riscos antes de editar.

Um brief útil registra: objetivo, comportamento atual, escopo e exclusões, módulo e proprietário dos dados, mudança de schema, RLS/Storage, UI, compatibilidade, validação, ambiente isolado, responsável humano e evidências exigidas. **Não copie toda a arquitetura** para cada brief: referencie a fonte canônica.

## Passagem entre agentes ou modelos

O **repositório** (branch, commits, diff, issue e brief) é a fonte do trabalho, não a memória do modelo nem a conversa anterior.

1. Branch/worktree própria quando houver escrita, derivada de `origin/main`; preservar worktrees existentes.
2. Commits atômicos em checkpoints estáveis; mudanças não commitadas devem ser pequenas e conscientes.
3. Registrar na issue/PR o que foi feito, o que faltou, riscos e testes com SHA e resultado.
4. O próximo agente verifica `AGENTS.md`, o brief/issue, `git status`, diff e commits recentes **antes** de editar.
5. Não refazer tarefas concluídas nem transferir íntegra de conversas ou credenciais para outra ferramenta.

Exemplo de retomada:

~~~text
Continue a tarefa autorizada a partir do estado atual deste repositório.
Leia AGENTS.md e o brief <caminho do brief>.
Confira a branch, git status, diff e commits recentes; preserve mudanças de outros agentes.
Não refaça trabalho concluído. Termine o escopo pendente,
execute validações pertinentes e relate os resultados reais em pt-BR.
~~~

## Custos de contexto e paralelismo

- Faça busca focalizada antes de abrir arquivos grandes; leia somente módulos/contratos usados pela tarefa.
- Limpe contexto quando mudar para uma frente não relacionada; evite prompts e resumos duplicados.
- Mais de um agente com escrita só quando o benefício justificar custos e conflitos; cada um com área de arquivos, branch e **runtime Docker/Supabase isolado**.
- Não use o mesmo banco persistente, volume ou migration para tarefas paralelas. A [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68) descreve DEV compartilhado que **não é descartável**.
- A divisão de Core/migrations/CI deve ter um só escritor coordenado. Consulte o [protocolo paralelo](PARALLEL_AGENT_WORKFLOW.md).

## Documentação e segurança

- Um arquivo de instruções **não deve duplicar o conteúdo inteiro** de `AGENTS.md`.
- Atualize docs, diagramas e contratos **na mesma PR** da funcionalidade alterada; texto em **pt-BR**, preservando código e nomes oficiais.
- Não converta ADR **Proposed** em **Accepted** nem declare GO de produção por mera tradução/revisão.
- Não use segredos nem dados reais em prompts. Nunca mande `env`, JWT, dump ou arquivos corporativos para handover.
- Confirme as versões e caminhos no código: snapshots históricos podem estar corretos para seu período, mas **não** representam a `main` atual.
- PR deve passar nos checks exigidos e na revisão humana aplicável; aprovação verbal precisa ser identificada corretamente.

## Relatório de conclusão

Use formato breve, factual e verificável: **arquivos modificados; migrations; checks com resultado e SHA; limitações; riscos; PR/commit; próxima decisão humana**. Não declare validações que não executou. Pare diante de ação destrutiva ou privilégio indefinido.

Para orientações de produto, arquitetura e prioridades, consulte [README](../../README.md), [documentação integrada](../README.md), [ADRs](../decisions/) e [Plano Diretor](../planning/PLANO_DIRETOR_2026.md).
