# AP-02 — Delegação e execução de planos de ação

Escopo aprovado para DEV e homologação no notebook. O contrato se aplica a planos manuais e aos gerados por respostas AP/NAT de Auditorias. [ADR-003](../../decisions/ADR-003-action-plans-transversal-module.md) · [ADR-005](../../decisions/ADR-005-core-authorization.md)

## Planejamento e execução

Na criação manual ou em **Editar planejamento**, digite no campo **Responsável** e escolha um funcionário nos resultados logo abaixo. Digitar sem confirmar uma opção preserva a seleção anterior. O painel de resultados abre sobre o formulário. A busca devolve até 50 pares UUID/nome de perfis ativos com acesso efetivo para executar no par unidade/setor. O operador precisa da permissão de criação naquele escopo ou de escrita no plano selecionado. A seleção pode ficar em branco enquanto o plano estiver pendente. A mudança de unidade ou setor na criação limpa a seleção.

Planos novos e planos pendentes legados precisam de um responsável cadastrado elegível para entrar em andamento ou ser concluídos diretamente. A atribuição usa `responsible_id` ligado a `core.profiles`. O nome atual vem do Core e o texto original permanece em `responsible`, sem associação automática. Planos legados em andamento ou concluídos podem ser tratados por quem tem capacidade gerencial. Ao salvar o planejamento de um plano em andamento ou concluído, uma atribuição já existente pode ser substituída por outra elegível. Planos verificados preservam o bloqueio de planejamento.

Em andamento, abra **Relato da execução** e salve até 2.000 caracteres. Cada gravação gera uma revisão com ator, hora do banco e versão do plano. O histórico fica na seção Execução. A versão é compartilhada com planejamento e transições, de modo que um conflito exige recarregar os dados. O relato é opcional para executar e concluir. Conclusão, reabertura e verificação são ações explícitas. Evidências de execução mantêm as regras de verificação e o histórico das rodadas.

## Capacidades efetivas

| Capacidade | Operação no escopo |
| --- | --- |
| `action_plan.read` | Leitura dos planos e evidências no escopo. Compõe com qualquer outro papel. |
| `action_plan.execute` | Leitura por atribuição ao próprio UUID, início da execução, relato em andamento e evidências da execução em andamento. Pode remover somente evidências de sua autoria. |
| `action_plan.write` | Planejamento, início, retorno de em andamento para pendente, relato em andamento e gestão de evidências da execução conforme a imutabilidade da verificação. |
| `action_plan.complete` | Conclusão e reabertura antes da verificação, com autorização de execução efetiva. |
| `action_plan.verify` | Verificação de concluídos, reverificação e gestão da rodada aberta de evidências de verificação. |

O papel `quality_executor` contém apenas `action_plan.execute`. O grant de setor cobre somente o setor indicado, inclusive ao buscar candidatos. Quality e Platform Administrator conservam as capacidades gerenciais. Quality Viewer conserva a leitura. Um executor com leitura por outro papel continua consultando os planos cobertos por esse papel e ganha operações adicionais somente quando os grants correspondentes estiverem efetivos.

A leitura por atribuição vale para RLS, listagens, detalhe, histórico e evidências. O Storage permite a esse leitor somente download autenticado e exige upload autenticado para operações por atribuição, com nova avaliação do grant e da atribuição. No perfil base, quem tem leitura por escopo conserva o fluxo de URL assinada temporária. O perfil Identity usa download autenticado. Reatribuição, inativação e revogação são reavaliadas nas novas chamadas, inclusive entre reserva, upload e confirmação. O download realizado e o material já entregue ao cliente seguem o comportamento inerente à entrega de arquivos.

## Consulta da auditoria de origem

Em um plano de checklist atribuído, **Origem → Abrir auditoria** abre a visão geral e o checklist em leitura. A autorização exige plano existente, atribuição ao próprio perfil ativo e `action_plan.execute` efetiva no escopo do plano. O vínculo dá acesso ao detalhe, respostas, observações e download ou abertura autenticada das evidências originais. A listagem geral, o histórico da unidade, a exportação e as alterações de auditoria continuam usando seus grants próprios. As permissões independentes dos outros papéis se somam às do Executor.

RLS, RPCs e Storage reavaliam o vínculo nas próximas requisições. Reatribuir, revogar o grant ou iniciar a exclusão do plano retira a leitura por esse vínculo. A leitura permanece disponível se outro plano atribuído da mesma auditoria ou outro grant efetivo ainda a autorizar. As migrations incrementais aplicam a regra ao detalhe, às evidências e ao catálogo da versão do checklist usada pela auditoria. [Leitura da origem](../../../supabase/migrations/20261127143007_action_plans_origin_audit.sql) · [Catálogo do checklist](../../../supabase/migrations/20261127143821_action_plans_origin_catalog.sql)

## Compatibilidade, ledger e exclusões

A migration [20261127130631](../../../supabase/migrations/20261127130631_action_plans_delegation.sql) usa o catálogo existente quando já há `action_plan.execute`, `action_plan.complete` ou `quality_executor`. Os grants do papel Executor são reduzidos a `execute`, mantendo os UUIDs dos papéis e suas atribuições. Quando `complete` é introduzida pela AP-02, os papéis personalizados que já tinham `write` conservam a capacidade de concluir. Se `complete` já existia, os grants personalizados de conclusão são preservados conforme cadastrados. Grants novos de `write` conservam a gestão de execução e exigem `complete` para conclusão/reabertura. Revise papéis personalizados e seus escopos ao avaliar a aplicação em outro ambiente.

As migrations históricas `20261109120000` e `20261109133000` pertencem ao [hotfix 7412976](https://github.com/The-Vonky/Gaucha-Gestao/commit/7412976b62f867782217eda345478044d602395d). Um ledger que as contenha diverge da sequência canônica e fica fora do aplicador de prefixo do DEV. Em operação futura autorizada, inventarie ledger, funções e grants, compare os checksums do hotfix, confira a resolução de dependências e ensaie em cópia autorizada. Registre a equivalência das duas entradas históricas e a estratégia de aplicação/reconciliação aprovada antes de alterar o ledger. Use correção incremental para reversão após gravações, preservando UUIDs, versões e relatos. A migration é transacional e pode ser revertida integralmente antes do commit.

AP-01 e AUD-DELETE-01 excluem as revisões de relato junto com o plano por FK em cascata. O salvamento atualiza a versão do plano sob as mesmas barreiras de exclusão e invalida prévias antigas. Cadastro de funcionários, eventos administrativos (o evento de relato guarda versão e autoria) e backups seguem os contratos existentes. [Exclusão definitiva](EXCLUSAO_DEFINITIVA.md)

## Homologação no notebook

- Crie um plano manual pendente sem responsável e tente iniciá-lo. Atribua um perfil elegível e repita para um plano de Auditoria. Confira o nome no detalhe, na fila e na Auditoria.
- Com Executor atribuído, inicie o plano, salve duas revisões de relato e anexe, baixe e remova uma evidência própria. Confira os impedimentos de alterar planejamento, evidência alheia, concluir, reabrir, excluir ou verificar.
- Consulte a fila e o detalhe com outro Executor, com Quality Viewer e com Executor que também tenha leitura independente. Repita após reatribuição, inativação e revogação de grant. Confira também escopo de unidade e setor.
- Com Quality, confira conflito de versão em duas sessões, consulte o relato e as evidências, conclua e verifique. Confira os bloqueios após conclusão para Executor e após verificação para gestão.
- Confira o texto dos responsáveis legados em planos em andamento ou concluídos. Exclua fixtures via AP-01 e AUD-DELETE-01 e confira a retirada do relato/histórico e a preservação do cadastro do responsável.
- Digite, escolha e salve o responsável na criação e na edição em desktop e mobile. Abra a auditoria pelo plano, consulte respostas e observações e baixe uma evidência. Confira a negação de acesso direto a uma auditoria e a um plano da mesma unidade sem atribuição. Repita após reatribuição, exclusão e revogação.
- Execute no Chromium em desktop e viewport móvel nos perfis base e Identity. Homologação do mantenedor e dispositivos físicos seguem a [matriz da Qualidade](QUALITY_ACCEPTANCE_V1.md).
