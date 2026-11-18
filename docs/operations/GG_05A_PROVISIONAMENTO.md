# GG-05A · Provisionamento supervisionado do piloto

**Uso atual:** ensaio sintético e diagnóstico do DEV. O mantenedor pode homologar o procedimento com o notebook. Cadastro de funcionários, convite, recuperação operacional e liberação do piloto aguardam decisão específica. O responsável por uma execução precisa ter autorização tanto para aquele ambiente quanto para aquela pessoa e aquele escopo.

## Conferir o ambiente

No checkout que serve o localhost, iniciar pelo modo offline. A segunda linha executa o ensaio do contrato com as migrations em memória.

~~~bash
python3 -B scripts/ops/gg-05a.py
npm test -- tests/database.test.ts -t GG-05A
~~~

Para o diagnóstico de estrutura autorizado no notebook, conferir a branch e o SHA com `git status -sb` e `git rev-parse HEAD`. Executar `python3 -B scripts/ops/gg-05a.py --verificar-local` no terminal pessoal. Conferir o operador do sistema mostrado e digitar o nome do projeto. O programa usa o socket Unix local, verifica os labels do Compose, fixa o ID do container consultado e compara **todas** as versões do ledger com o checkout em uma transação de leitura. Verifica o trigger de inserção e a FK pelos catálogos. Saída não zero interrompe o procedimento. Um PASS de estrutura não examina contas nem prova recuperabilidade.

Na sessão da Administração, conferir o endereço local, a identidade pessoal do operador e sua autorização para gerenciar o alvo. Em caso de divergência de ambiente, operador, UUID, versão ou escopo, registrar BLOCKED e interromper. O diagnóstico desta entrega só aceita o projeto pessoal `gaucha-gestao-local`. Outro destino exige procedimento e GO próprios.

## Abrir e conferir uma solicitação

1. Em registro operacional **restrito**, identificar a autorização, pessoa, nome de exibição, e-mail institucional validado por canal independente, papel, permissões esperadas, tipo de escopo e unidade/setor exatos. Um pedido por pessoa e um operador por vez. Para PR e logs de diagnóstico, usar somente referência opaca, data UTC, etapa, resultado e código de falha. Senhas, tokens, links de uso único, corpo de respostas e dados pessoais ficam fora desses registros.
2. Identificar o próprio operador e os titulares de Platform Administrator no diretório e na revisão de acessos. Excluir do fluxo o próprio operador, qualquer conta administrativa global, papel administrativo equivalente ou composição duvidosa. Se a continuidade do acesso administrativo depender da ação, suspender inclusive reset, banimento ou alteração de e-mail no Auth. Contar grants, consultar último login ou ver e-mail confirmado não prova controle atual da caixa postal, dos fatores ou de outro login recuperável.
3. Buscar o e-mail em **Administração → Usuários**, incluindo inativos. A busca é parcial. Conferir correspondência exata e o UUID na ficha. O diretório une Auth e Core pelo ID; busca vazia também pode indicar restrição do operador ou par incompleto. Na superfície Auth autorizada conferir a identidade pelo mesmo e-mail/UUID. Havendo UUID diferente, mais de um candidato, conta anterior, histórico inexplicado ou visibilidade parcial, suspender. E-mail, nome e metadados por si sós não autorizam reaproveitamento.
4. Antes de cada mudança, confirmar no registro privado o verbo, o ambiente, o UUID (ou o destinatário do primeiro convite), o papel e o escopo. Conferir o resultado no servidor e registrar o evento antes da próxima etapa. São necessários novo GO e prova de domínio do destinatário para mudar o e-mail ou reaproveitar uma identidade.

Exemplo de registro sanitizado para a folha de execução: `GG05A-EXEMPLO | DEV | operador OP-01 | pedido P-01 | revogar | versão relida | evento conferido | PASS`. A correspondência entre referências e pessoas fica no registro restrito. Em falha, anotar etapa, horário e código sanitizado (por exemplo, `23505`), inclusive quando o resultado do commit for desconhecido.

## Cadastro e primeiro acesso · etapa Auth bloqueada para funcionários

Após aprovação da fronteira e do canal de entrega, o desenho proposto é um convite nominal de uso único pela superfície administrativa aprovada do GoTrue. Antes de emitir, conferir ausência nas duas fontes, remetente, destinatário e allowlist do retorno. O titular abre o convite pela própria caixa, valida o destino e define pessoalmente sua credencial. O mantenedor não recebe a senha. Verificar expiração, rejeição de reuso e primeiro login em uma sessão nova antes de conceder o papel. A tela atual só implementa login por senha. O Compose local fixa GoTrue v2.196.0, fecha signup público, desliga autoconfirmação e não configura entrega SMTP no serviço Auth. Callback para definição de senha, entrega ao destinatário e garantia de contenção do acesso básico durante o convite ainda precisam de prova. [Contrato de convite](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) · [Definição e recuperação de senha](https://supabase.com/docs/guides/auth/passwords).

O insert de `auth.users` dispara `create_core_profile` na **mesma transação**. A PK/FK faz o perfil usar o mesmo UUID. Uma falha de criação do perfil aborta a inserção, inclusive o log transacional. O perfil nasce **ativo**, com nome proveniente de `display_name` ou “Novo usuário”, sem concessão inicial. Metadado de nome não é fonte de autorização. Comparar o UUID Auth com o da ficha, conferir nome, status, histórico e zero atribuições ativas. Corrigir nome pela Administração somente após confirmação do vínculo. Um usuário ativo sem papel já pode acessar funcionalidades de base, como comunicados publicados e envio de relato com sessão válida. Se for necessário impedir até esse acesso antes da conferência, a janela entre convite e bloqueio manual impede a liberação do fluxo atual.

## Atribuir, verificar, bloquear

| Operação após GO | Ação do operador | Evidência esperada |
| --- | --- | --- |
| Atribuir | Na ficha do UUID, revisar atribuições e composição do papel institucional **ativo**. Selecionar explicitamente Global, Unidade ou Setor na unidade, inclusive quando a tela inicia em Global. Para setor, confirmar o vínculo com a unidade e suporte no módulo. Para Vendas usar Sales Viewer ou Sales Manager, com as permissões de exportação conhecidas e escopo de unidade ou global autorizado. | Confirmar conjunto inteiro de grants ativos, permissões, unidades e setores na revisão efetiva. Comparar com o pedido. Resultado parcial/restrito impede liberar. |
| Validar primeiro acesso | Com o titular na própria sessão, verificar nome, última entrada e operação de leitura autorizada. Em fixture sintética, verificar negativa equivalente em outra unidade. | Resultado da operação no servidor e revisão efetiva coincidem. A lista de menus sozinha não comprova escopo. |
| Revogar um papel | Confirmar grant e versão, revogar na ficha, reler incluindo revogados. | Evento `revoke` com operador, grant inativo, demais atribuições preservadas. Outra atribuição pode continuar concedendo a mesma capacidade. |
| Bloquear a pessoa | Confirmar alvo não administrativo, inativar o perfil com a versão exibida e reler. | `deactivate` e revogações no Core. Repetir leitura protegida na sessão já aberta. Providenciar também contenção da identidade e das sessões no Auth pelo canal aprovado quando o incidente exigir. |
| Reativar | Com GO próprio e identidade recuperada, reler a ficha, ativar e conferir novamente cada concessão necessária. | Reativação recupera o acesso básico; o trigger de inativação revogou as atribuições antigas. Conceder de novo somente o conjunto autorizado. |

O Core usa `private.can_delegate`, `private.can_revoke`, `private.can_manage_profile`, RLS e validações de grant, com checagem de escopo, composição, vigência e unicidade do grant ativo. Permissões específicas de domínio ainda se aplicam (por exemplo, gestão de sala em D5-B). Atualizações de perfil e revogação usam versão. `core.my_access` e as operações protegidas reavaliam o estado persistido em novas requisições. O cliente atualiza a visão no retorno à aba, em eventos de Auth e periodicamente. Bytes já exibidos e URLs já assinadas seguem limites próprios. O bloqueio no Core não altera a senha nem invalida criptograficamente o JWT. GoTrue administra renovação, sessões e expiração. O Compose configura TTL de 3600 s. [Sessões do Supabase](https://supabase.com/docs/guides/auth/sessions).

## Reconciliar falha ou resposta perdida

| Observação após releitura autorizada | Tratamento |
| --- | --- |
| Timeout antes/depois de convidar, ou e-mail já cadastrado | Marcar resultado desconhecido. Consultar Auth e diretório incluindo inativos, conferir UUID, destinatário e histórico. Retomar no primeiro passo comprovadamente pendente. Só considerar reemissão com autorização após excluir ambiguidade e verificar a situação do convite anterior. |
| Auth sem Core ou Core sem Auth | Suspender emissão e grants. Conferir igualdade de IDs, visibilidade, ambiente, ledger, trigger e FK. Escalar inconsistência para reparo revisado. Nenhum insert manual em tabelas de identidade. |
| Par válido e nenhum grant | Conferir que é a solicitação original e que o primeiro acesso seguro foi comprovado. Retomar atribuição autorizada ou bloquear o perfil não administrativo se houver risco. |
| Resposta perdida após conceder, erro de duplicata ou versão obsoleta | Reler todas as atribuições e comparar a tupla UUID/papel/escopo/unidade/setor e a versão. Um único grant exatamente esperado permite registrar a etapa já concluída. Escopo maior, grant adicional ou edição concorrente exige parar e revisar. |
| Falha no bloqueio, na revogação ou no log | Tratar acesso como potencialmente ativo. Verificar estado efetivo, log e versão em nova leitura. Manter contenção autorizada até verificar o resultado. Falha antes do commit pode não produzir log Core; registrar o incidente no registro restrito. |

A trilha `core.system_audit_log` registra mudanças transacionais em perfis e grants. A criação por trigger pode ter ator Core nulo. Correlacionar registro supervisionado, evento Auth disponível e evento Core por UUID e horário. O log Core não identifica por si só o emissor do convite.

## Recuperação e continuidade administrativa

Confirmar a solicitação com o titular por canal institucional independente e conferir o UUID. Suspender operações concorrentes sobre a conta. Para pessoa não administrativa e risco de comprometimento, bloquear primeiro no Core, conferir a revogação e conter as sessões no Auth conforme procedimento aprovado. A recuperação proposta é individual, com link de uso único, retorno permitido, definição da nova credencial pelo titular e confirmação de novo login. Manter o perfil inativo até verificar a contenção de sessões e credenciais anteriores. Uma reativação com novo grant pode tornar esse grant acessível a um JWT antigo ainda aceito. Conferir a política de expiração e operações já em andamento antes da liberação. Testar encerramento/renovação de sessão e a negativa de uma requisição com token anterior; recuperação de senha por si só não deve devolver grants. Conferir escopo antes de reativar. Sem canal de recuperação homologado, manter bloqueado e escalar. Nunca reenviar links em tickets, copiar JWT do navegador, ajustar senha compartilhada ou executar bootstrap.

RLS impede editar o próprio perfil e revogar o próprio grant. O bootstrap de administrador é único. Não existe prova de uma invariante abrangendo recuperabilidade Auth e alterações simultâneas em dois administradores. Se o alvo for administrador, se o operador não puder enumerar a composição efetiva ou se não houver evidência de acesso administrativo recuperável, parar **antes** de qualquer mudança. Ações administrativas de emergência dependem de decisão e procedimento próprios. A GG-05B poderá tratar UI após decisão da fronteira privilegiada.

## Matriz de aceite e evidência sanitizada

| Verificação | Estado e evidência |
| --- | --- |
| Estrutura DEV em 18/11/2026 | PASS · diagnóstico confirmou trigger, FK e as 43 versões do checkout, última `20261118132509`. |
| Atomicidade da criação, FK, repetição de UUID e ausência de grant automático | PASS · ensaio PGlite com falha induzida no trigger e releitura do diretório. |
| Vínculo no PostgreSQL do notebook | PASS · UUID sintético gerado dentro da transação criou perfil ativo sem grant. Após ROLLBACK, consultas independentes confirmaram ausência da identidade, do perfil e do evento. Imagem GoTrue v2.196.0 conferida no DEV. |
| Negativas sobre o próprio administrador e autopromoção | PASS · operações autenticadas no ensaio GG-05A em memória. Alcance limitado ao Core. |
| GoTrue/PostgREST, duplicata por e-mail, grants simultâneos, resposta perdida, negativa cruzada, mesmo JWT antes/depois, recuperação e renovação | Ensaio `gg05a-provisioning.mjs` integrado a `action-plans-integration`; consultar o resultado do SHA na PR. O teste usa apenas o destinatário sintético da CI e valida recuperação do provedor sem entrega de e-mail. |
| Segurança das dependências | FAIL · `npm audit --audit-level=moderate` reportou 11 achados high na cadeia de picomatch, GHSA-fc5q-39xc-vjpf. |
| Entrega de convite, callback, posse da caixa/fatores, recuperação ponta a ponta e corridas reset/login/revogação no GoTrue pinado do notebook | BLOCKED · dependem de canal e desenho aprovados e de ensaio dedicado. |
| Preservar último administrador recuperável entre Auth e Core, conter acesso básico antes da liberação e atribuir autoria fim a fim | BLOCKED · política operacional de preservar contas administrativas nesta etapa; invariante transacional e reconciliação entre sistemas pendentes. |

Para avançar com funcionários, registrar nova proposta de fronteira para a operação supervisionada, evidências no GoTrue pinado, parecer independente de segurança previsto em D01 e aceite do mantenedor. Depois, o GO operacional deve nomear ambiente, operador, participantes, papéis e escopos, canal de convite/recuperação e responsável pela contenção. O aceite da PR trata desenvolvimento. GG-05 e piloto permanecem abertos. [Registro D01](../planning/DECISION_REGISTER.md) · [Issue #49 encerrada administrativamente](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) · [Autorização Core](../architecture/AUTHORIZATION.md).
