# Governança de acesso — Core v1 / Fundação Core v2

- Status: **DESIGN ONLY — proposta para revisão, sem autorização de implementação**.
- Data: 2026-10-08.
- Branch: `docs/core-access-governance-v1`.
- Base funcional do brief: `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`.
- HEAD de leitura: `db336adcb29ebf367c94e651cdd2f8815c630d04`.
- Integração prevista pelo brief: `integration/core-foundation-v2`; nenhum merge nesta tarefa.

## 1. Objetivo, autoridade e limites

A Administração deve explicar quem possui acesso potencial a quais capacidades, por qual perfil e escopo, quem concedeu/revogou, quando e quem será afetado por uma mudança. A resposta deve servir a um administrador não técnico e ter origem verificável no servidor/banco.

Terminologia: **usuário** é a identidade com `core.profiles`; **perfil de acesso** é `core.roles`; **atribuição** é `core.user_role_assignments`. Não confundir perfil da identidade com perfil de acesso. A atribuição não comprova vínculo empregatício, lotação ou responsabilidade por uma unidade. Este desenho não cria esses requisitos.

Classificação usada no documento:

- **Vigente (V):** suportado pelo ADR/arquitetura ou confirmado no código; não depende da aprovação deste desenho.
- **Recomendação (R):** contrato proposto para implementação futura; nomes de novas RPCs e campos são conceituais, não APIs disponíveis.
- **PO:** decisão de produto/política ainda aberta, com alternativa conservadora explicitada na seção 12. Aprovar este documento não cria permissões ou altera RLS automaticamente.

Fontes de autoridade:

- [Brief desta tarefa](../briefs/CORE_ACCESS_GOVERNANCE_V1.md) e [AGENTS.md](../../AGENTS.md).
- [ADR-005](../decisions/ADR-005-core-authorization.md), [AUTHORIZATION.md](AUTHORIZATION.md), [DATA_MODEL.md](DATA_MODEL.md), [SECURITY.md](SECURITY.md).
- Core/Admin: `apps/web/src/core/admin/api.ts`, telas `UsersPage.tsx`, `UserAssignments.tsx`, `RolesPage.tsx`, `RoleEditor.tsx`, `LogsPage.tsx`, `OrganizationPage.tsx`, `SectorUnits.tsx` no mesmo diretório e `apps/web/src/shared/errors.ts`.
- Fundação física: migrations `202609240001_core_foundation.sql`, `202609240003_revocation_authority.sql`, `20261008120000_core_user_directory.sql`; [Unit Cover v1](../modules/core/UNIT_COVER_V1.md).

Audit e Action Plans permanecem consumidores existentes. Core não consulta suas tabelas para montar um dossiê, não redefine suas regras e não cria catálogo de permissões de módulos futuros. Não há código, migration, mudança de RLS/RPC vigente ou implantação neste documento.

## 2. Diagnóstico confirmado da Administração atual (V)

| Capacidade atual | Evidência e limite |
| --- | --- |
| Diretório de usuários | `core.user_directory`: nome, situação, versão, e-mail e `last_sign_in_at`, apenas para `admin.user.read/manage` global e usuário ativo. Último login do Auth não prova última atividade no sistema. |
| Atribuições | Tela por usuário; nomes de perfil/unidade/setor resolvidos no cliente pelas linhas que RLS permite; ausência de nome vira UUID. Agrupa `active=true/false`, sem explicar efetividade nem exibir concessor/data e revogador/data. |
| Metadados de concessão | Atribuição tem `granted_by`, `created_at`, `updated_at`, `version`. Não possui `revoked_by` ou `revoked_at` próprios. |
| Histórico | `private.record_change` grava `grant/revoke` e antes/depois no log. A revogação decorrente de desativação do usuário também produz eventos. `updated_at` sozinho não é contrato de revogação. |
| Perfis | `core.save_role` salva composição atomicamente, verifica autoridade e versão; editor apenas avisa que todos os usuários serão afetados. Perfis de sistema são protegidos. Não há lista de impacto prévio. |
| Lifecycle | Desativar usuário revoga suas atribuições; reativar usuário não as restaura. Desativar perfil de acesso mantém atribuições, sem concessão efetiva enquanto o perfil estiver inativo; reativá-lo pode restabelecer capacidades. |
| Logs | RLS usa `admin.audit_log.read` no escopo do evento. Tela filtra ator por UUID; detalhe mostra IDs/JSON. Semântica de `actor_user_id=null` não identifica uma pessoa. |
| Organização | Unidade tem cadastro, ativação e editor de capa; setores têm vínculos por unidade. Não há dossiê de unidade com acessos. |
| Desvinculação | FK composta das atribuições aponta para `unit_sectors`, inclusive em atribuições revogadas. Revogar não elimina o bloqueio histórico. Não se propõe apagar referências. |
| Erros | `shared/errors.ts` traduz SQLSTATE, mas reúne `PGRST116` e `40001` como conflito/indisponibilidade e trata `23503` genericamente. Não distingue com segurança ausência, invisibilidade e versão obsoleta. |

Diferença entre arquitetura lógica e execução: os helpers atuais exigem usuário, atribuição, perfil de acesso e permissão ativos, mas não verificam `units.active/sectors.active` na avaliação de acesso. O cadastro valida atividade para novas atribuições. Logo, unidade/setor inativo deve ser exibido como contexto inativo, sem afirmar que toda capacidade existente foi revogada. A autorização por registro e o lifecycle dos consumidores continuam prevalecendo.

## 3. Modelo de acesso e escolha de desenho

**V:** autorização = identidade autenticada + usuário Core ativo + atribuição ativa + perfil de acesso ativo + permissão ativa + cobertura de escopo + regra do registro/domínio. Negação é o padrão; não se decide por nomes de perfil ou claims antigos.

**R — abordagem recomendada:** RPCs de leitura pequenas em `core`, com projeções tipadas e avaliação no servidor, apoiadas em RLS e nos helpers existentes. Uma mesma semântica alimenta telas, impacto e exportação. Views reutilizáveis podem apoiar essas RPCs, sem criar outra fonte de autorização.

Alternativas consideradas:

| Abordagem | Consequência | Decisão proposta |
| --- | --- | --- |
| RPCs específicas, dados mínimos, composição por seção | Mais contratos explícitos; respostas consistentes e escopo verificável | Recomendada |
| Carregar catálogos completos no navegador e cruzar listas | Falhas de resolução, várias páginas inconsistentes, exposição excessiva e impacto incompleto | Não atende ao brief |
| Resolver genérico privilegiado para qualquer UUID/entidade | Facilita nomes, mas vira diretório e bypass de isolamento; acopla Core aos módulos | Rejeitada |

### 3.1 Estados que a resposta deve diferenciar (R)

- **Atribuição vigente:** `assignment.active=true`; não significa que concede acesso neste instante.
- **Capacidade potencial vigente:** conjunção dos estados ativos e do escopo, equivalente ao helper; não promete autorização sobre todo registro de negócio.
- **Sem efeito:** usuário/perfil/permissão inativo ou perfil sem permissões ativas; informar motivos verificáveis. Unidade/setor inativo é aviso separado, conforme seção 2.
- **Revogada:** atribuição inativa; uma nova concessão usa nova identidade de atribuição, preservando a anterior.
- **Não avaliável nesta consulta:** composição/nomes/histórico restritos; nunca apresentar como “sem acesso”.

Global cobre recursos de todas as unidades/setores aplicáveis; unidade cobre apenas aquela unidade; setor cobre apenas o setor naquela unidade. Nunca unir “todas as unidades do usuário” com “todas as permissões do usuário”. Preservar sempre o par capacidade + escopo e as atribuições que o originam.

## 4. Perguntas do operador → contratos de leitura (R)

| Pergunta | Contrato | Evidência na resposta |
| --- | --- | --- |
| Quem tem acesso? | `access_review_dataset` ou resumos de usuários | Usuários ativos/inativos, com/sem atribuição, situação da capacidade e instante da consulta |
| Acesso a quê, por qual perfil e escopo? | `user_access_summary` | Perfis/atribuições, capacidades agrupadas por domínio e escopo, proveniência por `assignment_id` |
| Quem concedeu/revogou e quando? | `assignment_history` | Eventos, atores, datas, causa, referência ao log; ausência de evidência explicitada |
| Quem será afetado ao alterar um perfil? | `role_holders` + `role_impact_preview` | Pessoas/atribuições, deltas de capacidades, sobreposição por outros perfis, versão do impacto |
| Quem tem acesso à unidade? | `unit_access_summary` | Atribuições globais, daquela unidade e de seus setores, sem confundir usuários com lotação |
| O que compõe esta unidade? | `unit_dossier` | Cadastro, setores vinculados, resumo de acessos, capa autorizada e atalhos de logs |
| O que aconteceu e por quem? | `governance_logs` + `governance_log_detail` + `log_actor_options` | Frase legível, nomes com origem, ação, contexto e IDs preservados |
| Como revisar periodicamente e exportar? | `access_review_dataset` + `access_review_export` | Mesmo filtro/semântica, escopo visível, completude e manifesto de geração |
| Por que não posso desvincular? | `unit_sector_unlink_check` e erro da mutação confiável | Bloqueio de referências vigentes/históricas, detalhes somente quando autorizados |

## 5. Convenções dos contratos propostos (R)

### 5.1 Referências, tempo e completude

Referência legível: `type`, `id` imutável, `label`, `code` quando existente/permitido, `label_source` (`snapshot`, `current`, `unavailable`, `restricted`), `active` quando visível. Nome não é identificador. Homônimos são selecionados pelo ID; o código/identificador secundário distingue resultados sem exigir digitação de UUID.

`label_at_event` é um nome capturado no evento; `label_current` é nome atual autorizado. Não substituir silenciosamente um pelo outro. Sem evidência antiga, mostrar “Nome atual; nome à época não registrado”. `null` e referência restrita não autorizam buscas privilegiadas adicionais.

Todos os instantes são `timestamptz`/ISO 8601; armazenar UTC e exibir fuso explícito. Filtros de intervalo usam `[from_at,to_at)`; cliente converte a faixa escolhida no fuso informado. Data de concessão, data de evento e data de geração têm nomes distintos.

Resposta comum: `contract_version=1`, `evaluated_at`, `items`, `next_cursor`, `visibility` por seção/campo e `coverage`. Valores de seção: `available`, `restricted`, `unavailable`. `coverage` informa escopo autorizado e se a avaliação de capacidades/histórico é completa para o filtro. Uma seção restrita retorna conteúdo/contagem nulos, não zero. Essa indicação descreve a permissão faltante, não confirma a existência de dados ocultos.

### 5.2 Consulta, paginação e consistência

Filtros aceitos e tipados: busca por nome/código, `user_id`, `role_id`, `unit_id`, `sector_id`, situação da atribuição/usuário, domínio/permissão e datas quando aplicáveis. Nenhum filtro expande autorização. Busca literal limitada a 160 caracteres; rejeitar campos/filtros desconhecidos.

Páginas de 25 por padrão, máximo recomendado de 100; ordenação estável por nome + ID ou `(occurred_at desc,id desc)`. Cursor opaco validado pelo servidor e vinculado ao filtro/ordenamento, sem carregar dados secretos. Contagens consideram somente linhas autorizadas. Não enviar catálogos inteiros para resolver cada página.

Cada resposta composta é calculada em snapshot consistente de uma chamada. Navegação entre páginas é consulta corrente, não relatório congelado: `evaluated_at` não é token de snapshot. Para log, fixar o limite superior de tempo da navegação; para exportação/impacto, usar a consistência específica das seções 6.4 e 9. Mudança de usuário, sessão ou permissões invalida resultados/cache e respostas em voo; a próxima chamada reautoriza no banco.

### 5.3 Fronteira confiável

Preferir RPCs `SECURITY INVOKER`; views eventualmente expostas devem usar `security_invoker=true` na versão PostgreSQL compatível. Aplicar gates da seção 7 além da RLS das fontes; todos os joins, agrupamentos e contagens obedecem a esses limites.

Os helpers vigentes comparam concessões com `auth.uid()`: autorizam o **operador**, não calculam automaticamente o acesso do usuário revisado. A projeção do alvo reproduz a mesma equação a partir de fontes que o operador pode ler, sem impersonação, troca de identidade ou nova concessão. Autorizar leitura da revisão não autoriza executar as capacidades do alvo.

Não conceder `SELECT` em Auth ou retirar RLS para completar nomes. Reutilizar `user_directory` apenas dentro de sua audiência atual. Escrita de snapshots/erros pode exigir mecanismos confiáveis específicos; não autoriza um leitor `SECURITY DEFINER` universal. Qualquer definer necessário deve ter propósito estreito, identidade/gates explícitos, `search_path` fixo/vazio, relações qualificadas e `EXECUTE` revogado de `PUBLIC/anon`. Falha em RLS resulta em restrição/negação, não tentativa com service key. Credencial privilegiada nunca chega ao navegador.

Referências técnicas consultadas: [Supabase — views e RLS](https://supabase.com/docs/guides/database/postgres/row-level-security#views-and-rls) e [segurança de funções](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker). São cuidados de implementação futura, não mudança na stack aceita.

## 6. Contratos RPC/view propostos (R)

Todos os nomes abaixo são novos, salvo reutilizações explicitamente identificadas. Não se exige materialização de views, novas tabelas ou tecnologia de relatório neste estágio.

### 6.1 Logs legíveis e navegação

| Contrato | Entrada | Saída e regra |
| --- | --- | --- |
| `governance_logs` | Intervalo, `actor_user_id`, `subject_user_id`, ação, módulo, tipo/ID de entidade, unidade/setor, cursor | Evento autorizado: ID, instante, ação/módulo com rótulo, ator/entidades referenciadas, `summary`, campos alterados permitidos, correlação e disponibilidade dos detalhes |
| `governance_log_detail` | `event_id` | Mesma RLS do evento; antes/depois por lista de campos seguros e suas referências, sem JSON arbitrário como apresentação padrão |
| `log_actor_options` | Nome, intervalo/filtros de log, cursor | Atores distintos que aparecem em eventos visíveis; ID técnico e nome permitido. Sem e-mail, último login ou diretório irrestrito |

`subject_user_id` significa usuário afetado; `actor_user_id` significa quem operou. “Ver logs deste usuário” oferece ambos separadamente, com padrão **usuário afetado**. Em Core, usuário afetado é `profiles.entity_id` ou `user_role_assignments.before/after.user_id`, projetado pelo servidor a partir de eventos autorizados. Não usar uma busca JSON genérica nem inventar destinatários nos eventos de outros módulos.

Exemplo ilustrativo: “Ana concedeu Qualidade a Bruno na unidade CMD em 08/10/2026 09:20 −03:00”. Detalhe mantém evento, usuário, perfil, atribuição e escopo por IDs. “Ver logs desta unidade” usa `unit_id`; eventos globais de perfil sem `unit_id` ficam na revisão do perfil, sem atribuir a eles uma unidade fictícia.

Ator nulo: “Operação sem ator de usuário registrado”; identificar como automação/operação administrativa apenas quando metadado confiável comprovar. Não inventar nome de operador. Atores inativos continuam resolvíveis dentro da autorização.

Nomes: resolver atualmente somente por linhas legíveis sob RLS; para novos eventos Core, recomendar snapshots mínimos confiáveis de nomes de ator, usuário afetado, perfil, unidade e setor (PO-01). Eventos antigos sem snapshot usam nome atual autorizado ou rótulo “Referência sem nome disponível”, com ID no detalhe técnico. Não regravar eventos antigos para simular nomes históricos.

Para entidades de negócio, consumir apenas rótulos seguros já registrados no evento; sem esse dado, mostrar tipo + referência técnica. Integração futura por contrato público depende do módulo; Core não passa a importar suas tabelas/implementações internas.

### 6.2 Resumo e histórico por usuário

`user_access_summary(user_id, filtros, cursor)`:

- Usuário: ID, nome, atividade, versão; e-mail/último login são opcionais e vêm do `user_directory` existente, sem ampliar audiência.
- Atribuição: ID/versão, perfil por referência, atividade do perfil, escopo original e rótulos visíveis, `granted_by`, `granted_at=created_at`, situação nominal e avisos de contexto.
- Composição, quando autorizada: chaves/descrições de permissões ativas e inativas; pares capacidade + escopo com `source_assignment_ids`. Deduplicar sem perder proveniência. Ausência de leitura de composição retorna `capabilities=restricted`.
- `history_available` e navegação dependem de leitura de logs; indicação de botão nunca concede essa leitura.

A disponibilidade da composição é avaliada por perfil: R ou `admin.user.manage` global permitem consulta completa; as policies atuais também permitem composição de perfis que o próprio operador possui. Sem esses predicados, uma consulta vazia não comprova perfil sem permissões. Se apenas parte dos perfis for legível, retornar os dados conhecidos com `coverage=partial` e não emitir total de capacidades como se estivesse completo.

`assignment_history(user_id, assignment_id opcional, intervalo, cursor)`:

- Linha por evento: `assignment_id`, `event_id`, `event_type`, `occurred_at`, ator, usuário afetado, perfil/escopo, causa e `correlation_id` quando registrados.
- Concessão/revogação têm evidências próprias. Para a concessão original, `granted_by/created_at` são evidência da atribuição; revogador/data vêm do evento de revogação autorizado. Não inferir revogador de `granted_by` nem data de `updated_at`.
- Separar revogação explícita, revogação por desativação de usuário e interrupção de capacidade por perfil inativo. A última não é revogação da atribuição. Usar causa explícita no metadado de novos eventos; legado sem causa comprovada recebe “Causa não registrada”.
- Identificar origem da evidência (`assignment_row`, `audit_event`, `unavailable/restricted`). Sem log autorizado, mostrar “Histórico de revogação não disponível nesta consulta”, preservando a situação atual conhecida.
- Nova concessão após revogação é novo `assignment_id`; a linha anterior permanece. Não agrupar apenas por usuário/perfil de modo a apagar ciclos distintos.

**Persistência recomendada:** reutilizar `system_audit_log` como trilha de transições, com projeção tipada para histórico de atribuição. Não duplicar eventos numa segunda tabela sem necessidade comprovada. Novas mutações registram contexto mínimo e causa no mesmo commit que a alteração, sem permitir escrita direta do cliente no log.

### 6.3 Resumo e dossiê por unidade

`unit_access_summary(unit_id, sector_id opcional, filtros, cursor)` retorna pessoas deduplicadas e suas atribuições/proveniência. Inclui:

1. atribuições globais, indicando “Global — abrange esta unidade”;
2. atribuições da unidade, indicando “Nesta unidade”;
3. atribuições de setor pertencente àquela unidade, indicando “Somente setor X nesta unidade”.

Uma atribuição de setor não libera registros gerais da unidade. Usuário com dois perfis aparece uma vez no total de pessoas e duas vezes nas atribuições; totais de capacidades, atribuições e pessoas são métricas separadas. Usuários sem atribuição não têm relação dedutível com a unidade e não são inventados como seus membros. Filtro opcional de revogados traz referências históricas, sem contá-las como acesso vigente.

Com filtro de setor, incluir concessões globais, da unidade e daquele setor; excluir outros setores. Sem composição legível, contar pessoas com atribuições, não pessoas com capacidade operacional comprovada. Cada métrica identifica seu critério e sua completude.

`unit_dossier(unit_id)` compõe seções independentes:

| Seção | Conteúdo | Fonte/limite |
| --- | --- | --- |
| Identificação | ID, código, nome, atividade e versão | Unidade autorizada |
| Setores | Setores vinculados, códigos e atividade | `unit_sectors/sectors` autorizados; seção exige leitura de setor vigente |
| Acessos | Resumo de pessoas/atribuições e acesso à lista paginada | `unit_access_summary`; exige audiência de usuários, não apenas leitura de unidade |
| Capa | Disponibilidade e enquadramento da capa corrente pronta | Reutilizar `unit_covers` e Storage existentes; `core.unit_cover.read` ou `admin.unit.manage` na unidade |
| Eventos | Disponibilidade de “Ver logs desta unidade” e página própria | `governance_logs` sob permissão do evento; não fazer dump dos logs no dossiê |

Seção sem autorização mostra “Sem permissão para consultar esta seção”; não “Sem usuários/setores/capa”. Cadastro de unidade visível não autoriza sua capa. O dossiê não entrega object keys/URLs para quem não passou pelo contrato existente de capa, não altera seu TTL nem exporta imagens. Não inclui indicadores/dossiês de Qualidade ou Action Plans.

### 6.4 Pessoas com perfil e impacto antes de salvar

`role_holders(role_id, situações, cursor)` exige leitura de perfil **e** audiência global de usuários. Retorna pessoas, atividade do usuário, atribuições ativas/revogadas, escopo e estado do perfil; contagens de pessoas e atribuições distintas. Perfil inativo ainda tem titulares de atribuições ativas, embora não conceda capacidades.

`role_impact_preview(role_id, expected_role_version, proposed_permission_keys, proposed_active, cursor)` calcula no servidor:

- permissões adicionadas/removidas, atividade antes/depois e perfil/candidato normalizados;
- pessoas/atribuições que usam o perfil, inclusive usuários inativos e atribuições sem efeito, separados dos afetados imediatamente;
- capacidades que cada pessoa ganha/perde por escopo e quais permanecem cobertas por outra atribuição;
- afetados por composição, por desativação ou reativação; apenas renomear tem impacto de apresentação, sem ganho/perda de capacidade;
- permissões inativas não geram ganho efetivo; perfil sem permissões não é tratado como acesso operacional;
- `impact_revision`, `role_version`, `evaluated_at`, completude, total de titulares, afetados imediatos e titulares sem efeito atual.

Sobreposição exige comparação de cobertura, não só igualdade de chaves: remover Qualidade@CMD de alguém com permissão equivalente global pode não remover essa capacidade em CMD; remover global de alguém com permissão em CMD ainda pode remover cobertura fora de CMD. Representar escopos simbólicos e cobertura residual; não afirmar que listas de unidades atuais limitam o alcance de uma concessão global.

Linha de impacto: `user_id`, `assignment_ids`, `permission_key`, `before_coverage`, `after_coverage`, `gained_coverage`, `lost_coverage`, `retained_by_assignment_ids`. Cobertura residual pode ser expressa por `base_scope` e `except_scopes` (por exemplo, global exceto CMD), sem inventar enumeração de registros de negócio. Conjuntos de permissões/atribuições são normalizados em ordem estável; alteração apenas de ordem não muda o impacto.

Exemplo ilustrativo: retirar `audit.inspection.read` de um perfil pode alterar três atribuições, mas retirar capacidade de apenas duas pessoas; a terceira conserva leitura por outro perfil. Isso não calcula quais auditorias individuais são legíveis, pois regras de registro pertencem ao consumidor.

**Prévia não autoriza salvar.** Consulta de cenário exige leitura de composição/titulares; quando invocada pelo fluxo de edição, também verifica `admin.role.manage`, perfil não protegido, autoridade sobre composição atual/proposta e regras de lifecycle atuais. O resultado pode ser somente consulta para um operador de leitura.

**Recomendação para futuro contrato de mutação, sem modificar `save_role` agora:** salvar composição/ativação recebe a versão esperada e a revisão de impacto confirmada. Revisão vincula ator, candidato normalizado e dependências relevantes: perfil/versão, suas atribuições, atividade dos titulares, permissões ativas e demais concessões que mudem sobreposição. Paginação não limita o cálculo do impacto total. Trocar candidato invalida a confirmação.

Na transação de salvar, revalidar autoridade atual e calcular novamente sob sincronização das dependências relevantes. Diferença retorna `STALE_IMPACT` sem escrita e obriga nova revisão. Atribuição nova/revogada, usuário desativado, outra composição que mude cobertura ou perda de autoridade durante a prévia não podem deixar o commit usar uma avaliação antiga. A versão do perfil sozinha não detecta esses casos. Não implementar fingerprint/token apenas no cliente. Especificação de locks e testes de corrida pertence ao futuro brief de implementação.

Operador que só tem `admin.role.manage` continua com as capacidades vigentes; este desenho não altera seu contrato atual. Para o fluxo futuro com confirmação de impacto nominativo, recomendar exigir também audiência global de usuários (PO-03), sem buscar titulares com credenciais privilegiadas.

### 6.5 Revisão unificada e diagnóstico de desvinculação

`access_review_dataset(perspective=user|unit|role, filtros, cursor)` usa a semântica das seções anteriores. Gates de entrada: usuário exige U; unidade exige U + T no alvo; perfil exige U + R. Perspectiva por usuário inclui usuários sem atribuição; por unidade inclui alcance global/unitário/setorial; por perfil inclui titulares e atribuições sem efeito/revogadas conforme filtro. Perfil/usuário/unidade inativos são visíveis ao revisor autorizado e nunca confundidos com exclusão. Campos de composição, nomes e histórico continuam com seus gates próprios.

`unit_sector_unlink_check(unit_id, sector_id)` é diagnóstico, não garantia de sucesso: autoriza gestão de vínculos com `admin.sector.manage` global, valida visibilidade do alvo e retorna `can_unlink`, `blocker_code`, evidências e disponibilidade dos detalhes. Classifica referências a atribuições vigentes, apenas históricas ou outras referências persistentes. Quantidades/nomes de atribuições exigem audiência de usuários; referências de negócio não autorizadas são opacas. Não enumerar tabelas/IDs privados de outros módulos.

Futura mutação de desvinculação reautoriza, revalida contexto e trata FK no servidor dentro da transação. Usa versões esperadas da unidade/setor e estado esperado do vínculo quando pertinente; `unit_sectors` hoje não tem versão própria, portanto não inventar coluna vigente. Diagnóstico anterior pode ficar obsoleto. Nunca remover a FK, apagar atribuição revogada, desvincular em cascata ou revogar acessos automaticamente para vencer o bloqueio.

## 7. Matriz de autorização

### 7.1 Legenda e comportamento vigente

Todos os gates pressupõem identidade autenticada e Core ativo:

- **U:** `admin.user.read` **ou** `admin.user.manage`, **global**.
- **R:** `admin.role.read` **ou** `admin.role.manage`, **global**.
- **T(Uni):** `admin.unit.read` **ou** `admin.unit.manage` cobrindo a unidade; também permanecem as audiências auxiliares que `units_read` já permite (`admin.user.manage` e `admin.sector.read/manage` globais).
- **S:** `admin.sector.read/manage` global ou `admin.user.manage` global, conforme as policies atuais de setor/vínculo.
- **L(E):** `admin.audit_log.read` cobrindo `unit_id/sector_id` do evento. Evento sem unidade/setor exige global; setor isolado não cobre evento da unidade toda.
- **C(Uni):** `core.unit_cover.read` ou `admin.unit.manage` cobrindo a unidade, como Unit Cover v1.

`manage` não é alias universal de `read`; as alternativas acima refletem policies explícitas. Usuários comuns possuem leitura de sua própria identidade/atribuições e de perfis que possuem, mas isso não cria uma tela de revisão administrativa nem libera dados de terceiros.

**V:** U lê usuários/atribuições globais e nomes dos perfis; `admin.user.read` isolado não lê toda a composição de perfis/permissões nem garante nomes de unidades/setores. `admin.user.manage` global já lê esses catálogos. R isolado lê composição, mas não a relação de usuários/atribuições. T isolado não lê pessoas. L isolado lê eventos, sem autorizar busca no Auth/diretório.

### 7.2 Gates das novas projeções (R; sem ampliar policies de origem)

| Dado/operação | `admin.user.read` global | `admin.user.manage` global | `admin.role.read/manage` global | `admin.unit.read/manage` no alvo | `admin.audit_log.read` | Complemento obrigatório |
| --- | --- | --- | --- | --- | --- | --- |
| Usuário: nome, atividade, e-mail, último login | Sim | Sim | Não | Não | Não | Reutilizar diretório autorizado; não expor outros campos Auth |
| Atribuições atuais/revogadas e concessor original | Sim | Sim | Não isoladamente | Não isoladamente | Não como diretório | U; nome de unidade/setor só se fonte legível |
| Composição completa/capacidades do usuário | Com R | Sim, por policies atuais | Com U | Não isoladamente | Não | U + composição autorizada, sem tratar conteúdo oculto como conjunto vazio |
| Titulares de perfil e contagens de impacto | Com R | Com R | Com U | Não | Não | U + R; sem contagem global sob apenas R |
| Simular composição/atividade de perfil | Com R | Com R | Com U | Não | Não | U + R; para editar, `admin.role.manage` e autoridade adicional |
| Cadastro de unidade | Se T também atendido | Sim, policy atual | Não isoladamente | Sim | Não isoladamente | T(Uni) |
| Pessoas com alcance na unidade | Com T | Sim | Com U + T | Com U | Não isoladamente | U + T(Uni); composição quando legível |
| Setores/vínculos no dossiê | Com T + S | Sim | Não isoladamente | Com S | Não | T(Uni) + S |
| Capa | Com C | Com C | Com C | Só `manage` ou C separado | Não | C(Uni); contrato/Storage vigentes |
| Log legível/detalhe | Só com L | Só com L | Só com L | Só com L | Sim, eventos cobertos | L(E); nomes atuais por RLS ou snapshots mínimos conforme PO-01 |
| Filtro de atores por nome | Só com L | Só com L | Só com L | Só com L | Sim, limitado | L(E) nas opções e resultados; sem e-mail/último login |
| Histórico completo de atribuição | Com L | Com L | Com U + L | Com U + L | Com U | U + L(E); concessão da linha atual continua legível com U |
| Exportar revisão | Conforme perspectiva/seções legíveis | Conforme perspectiva/seções legíveis | Com U para revisão por perfil | Com U para revisão por unidade | Com U e gates da perspectiva para histórico | Mesmos gates da perspectiva/dados; política de exportação PO-04 |
| Diagnosticar/desvincular unidade-setor | Não isoladamente | Não isoladamente | Não | Não isoladamente | Não | `admin.sector.manage` global; U para detalhes de atribuições |

Não há permissão nova concedida por esta matriz. A decisão de liberar revisão nominativa a gestores somente de unidade seria **nova política**, não interpretação de `admin.unit.read` (PO-02). Até decisão e contrato aprovados, devolver seção restrita. Da mesma forma, histórico completo não é liberado apenas por U: eventos globais invisíveis com L unitário continuam invisíveis.

Mutações preservam checks vigentes: conceder exige `can_delegate`; revogar exige `can_revoke` e não pode atingir o próprio usuário; desativar/renomear depende de `can_manage_profile`; alterar perfil requer autoridade sobre permissões globais e proteção de perfis de sistema; unidade/setor conservam suas permissões distintas. Prévia ou botão habilitado não substitui nenhum desses checks.

## 8. Auditoria, nomes e privacidade (V/R)

**V:** eventos preservam IDs de ator/entidade, instantes e antes/depois; clientes não escrevem/apagam a trilha. Usuário, unidade, setor e perfil referenciados são normalmente desativados, preservando joins históricos. Logs do sistema são separados do domínio Auditoria de Qualidade.

**R:** novos eventos de governança Core devem ter metadado versionado com atores/entidades mínimas por ID e nome à época, causa, chaves de campos alterados e correlação quando disponível. Snapshots são produzidos no servidor a partir das fontes canônicas, nunca aceitos como nomes alegados pelo cliente. Não mudar payloads/regras de Audit ou Action Plans nesta trilha.

Nomes em logs são dado pessoal. PO-01 define se o nome mínimo capturado pertence ao próprio evento legível sob L; isso não libera nome atual, e-mail ou busca geral. Até essa decisão, resolver nomes apenas dentro dos campos existentes e das fontes autorizadas; referências sem nome são explicitamente incompletas. Não “corrigir” antigos atores nulos nem reescrever a trilha após renomeação.

Projetar antes/depois por allowlist: nome/situação, composição de perfil, escopo, atividade da atribuição e campos organizacionais relevantes. Credenciais, tokens, chaves privadas, metadados Auth completos, URLs assinadas e conteúdo/anexos de negócio ficam fora da resposta/exportação. IDs continuam disponíveis no detalhe autorizado para investigação; UUID/JSON não é a linguagem principal da Administração.

Não usar nomes ou filtros de busca em mensagens de erro externas/telemetria sem necessidade. Exportações registram ator/instante, filtros normalizados sem texto pessoal livre, perspectiva, escopo e número de linhas; não duplicam toda a lista de pessoas no log. Retenção/acesso ao log de exportação também segue L.

Falhas de autorização não devem gerar registro que desaparece junto com rollback; eventual trilha de tentativas negadas exige mecanismo operacional confiável separado, sem segredos (pós-v1). Não prometer rastreio de leituras/tentativas negadas que hoje não existe.

## 9. Exportação e revisão periódica (R; política PO)

### 9.1 Dataset e escopo

`access_review_export(perspective, filtros, include_history)` exporta a mesma semântica de `access_review_dataset`, gerada no servidor sob a identidade/permissões atuais. Exportar não amplia leitura. Não aceitar um arquivo montado a partir de tabelas baixadas com credencial privilegiada no cliente.

Conjunto recomendado de arquivos CSV UTF-8, com relações por IDs:

| Arquivo | Grão e campos essenciais |
| --- | --- |
| `usuarios.csv` | Uma linha por usuário visível: ID, nome, atividade, possui atribuição; inclui sem acesso na perspectiva usuário. E-mail/último login opcionais somente para U e finalidade aprovada |
| `atribuicoes.csv` | Uma linha por atribuição: ID, usuário, perfil/nome, atividade, escopo, unidade/setor por ID/rótulo autorizado, concessor/data originais, situação e motivos de inefetividade |
| `capacidades.csv` | Uma linha por atribuição + permissão + escopo, mantendo proveniência e situação dos componentes; somente se composição estiver legível |
| `historico.csv` | Uma linha por evento de atribuição, opcional: ID do evento/atribuição, ação, ator/nome permitido, instante e causa, apenas sob U + L(E) |
| `manifesto.csv` | Contrato/versão, gerador, instante UTC/fuso de apresentação, perspectiva/filtros, cobertura/completude, seções restritas, contagens e limites aplicados |

Campos restritos usam marcador explícito de indisponibilidade, sem nomes/contagens ocultos. `historico.csv` parcial informa limite do escopo temporal/organizacional; ausência de evento não prova que ninguém revogou. Revisão por perfil exige U + R; R isolado conserva apenas a consulta vigente de composição, fora deste dataset de pessoas/acessos. Dados de unidades e setores exigem os mesmos gates das telas.

Não exportar JSON bruto, Auth completo, capas/Storage keys, URLs, senhas, documentos/anexos, registros de Audit/Action Plans ou permissões de módulos futuros. Escapar delimitadores/quebras e neutralizar fórmulas de planilha em texto controlável pelo usuário, sem alterar a identidade técnica.

### 9.2 Consistência e operação

Gerar todos os arquivos/contagens de uma exportação em snapshot consistente do banco; não concatenar páginas de instantes diferentes. Revalidar autorização na geração e imediatamente antes de disponibilizar o resultado. Revogação durante o processamento cancela entrega; não afirmar que um arquivo já baixado pode ser revogado remotamente.

V1 recomendada: geração manual, sob demanda, com limite explícito de volume e duração estabelecido no brief de implementação após medição. Se excedido, retornar `EXPORT_LIMIT_EXCEEDED` sem truncamento silencioso e orientar refinar filtros. Sem e-mail automático, job agendado ou armazenamento público. Resultado não deve ser persistido no navegador além do necessário para download; eventual arquivo temporário de servidor tem acesso privado e expiração definida antes de implementar.

### 9.3 Revisão periódica

PO define responsável, cadência, unidades/perfis obrigatórios e evidência de conclusão. Proposta inicial: revisão manual trimestral e também após desligamentos ou alterações privilegiadas, conduzida por operador que já possua U + R e demais leituras necessárias. A cadência é recomendação, não requisito já aprovado.

Checklist de revisão: usuários inativos/com atribuições, perfis sem efeito, concessões globais, permissões administrativas, sobreposição de atribuições e concessões/revogações desde a última revisão. Nada é revogado automaticamente. Recomendações de correção retornam aos fluxos de Administração atuais com suas gates e auditoria.

V1 gera evidência de extração, sem declarar certificação concluída. Registro formal de aceite, justificativa por concessão, dupla aprovação, notificações/agendamento e comparação persistida entre ciclos são pós-v1 mediante aprovação; um manifesto de exportação não comprova que alguém revisou todas as linhas.

## 10. Erros de domínio no servidor (R)

Contrato de falha proposto: `code` estável, `message` legível, `retryable`, `correlation_id` e `details` tipado/limitado ao que o ator pode ler. O transporte PostgREST/servidor pode usar erro estruturado; SQLSTATE continua sinal técnico. Não usar erro como retorno de sucesso nem fazer o cliente analisar nome de constraint ou texto de FK.

Ordem de validação: sessão/atividade → gate e visibilidade do alvo → versão/estado → regras de domínio → alteração/auditoria. A ausência e a invisibilidade de um ID arbitrário recebem a mesma resposta externa. Só distinguir bloqueio/versão após provar que o alvo está autorizado. Não inferir motivo só de zero linhas ou `PGRST116`.

| Código de domínio | Resposta ao operador | Detalhe permitido / ação |
| --- | --- | --- |
| `ACCESS_DENIED_OR_UNAVAILABLE` | “Este registro não está disponível para seu acesso.” | Sem confirmar existência/nome; atualizar acesso ou procurar administrador |
| `STALE_VERSION` | “Este registro mudou. Atualize os dados antes de continuar.” | Versão atual apenas para alvo legível; não repetir escrita automaticamente |
| `STALE_IMPACT` | “Os usuários ou acessos afetados mudaram. Revise o impacto novamente.” | Recalcular prévia, renovar confirmação; nenhuma escrita |
| `DELEGATION_NOT_ALLOWED` | “Você não pode conceder ou remover este acesso no escopo escolhido.” | Explicar autoridade insuficiente sem revelar permissões privadas |
| `SYSTEM_ROLE_PROTECTED` | “Este perfil de sistema é protegido.” | Só para perfil visível; preservar proteção vigente |
| `SELF_MUTATION_NOT_ALLOWED` | “Esta alteração não pode ser feita na sua própria conta.” | Conforme regra da operação vigente; não criar proibição nova para toda concessão |
| `INACTIVE_REFERENCE` | “Uma das referências não aceita novo uso.” | Tipo/nome apenas se legível; usuário, perfil, unidade ou setor conforme validação |
| `INVALID_SCOPE` | “Confira a unidade, o setor e o escopo do perfil.” | Forma inválida, perfil global-only ou setor não associado, sem enumeração oculta |
| `ASSIGNMENT_ALREADY_ACTIVE` | “Esta atribuição já está vigente.” | Conflito de unicidade autorizado; não criar cópia |
| `UNLINK_BLOCKED_ACTIVE_ASSIGNMENTS` | “O vínculo possui referências de acesso. Preserve-o.” | Com U, explicar atribuições vigentes e link para revisão; sem U, mensagem genérica |
| `UNLINK_BLOCKED_HISTORY` | “O vínculo possui referências históricas e deve ser preservado.” | Com U, identificar atribuições revogadas; sem U, mesma mensagem genérica de referências |
| `UNLINK_BLOCKED_REFERENCES` | “Este vínculo possui referências e não pode ser removido.” | Sem tabelas/constraints/registros de negócio não autorizados; suporte por correlação |
| `INVALID_FILTER_OR_CURSOR` | “Os filtros não são válidos. Reinicie a consulta.” | Campos aceitos, sem ecoar payload técnico |
| `EXPORT_LIMIT_EXCEEDED` | “O resultado excede o limite de exportação. Refine os filtros.” | Limite e sugestão de filtro, sem arquivo incompleto |
| `TEMPORARILY_UNAVAILABLE` | “Não foi possível concluir agora. Tente novamente.” | Repetir leitura; para escrita ambígua, atualizar estado antes de reenviar |

Quando não há U, as causas internas `UNLINK_BLOCKED_ACTIVE_ASSIGNMENTS/HISTORY` também devem ser normalizadas externamente como `UNLINK_BLOCKED_REFERENCES`, para não vazar categorias por `code/details`. Classificação interna de FK usa mapeamento confiável e restrito no servidor; referência desconhecida produz bloqueio genérico, nunca liberação. Nome de constraint, SQL, stack e conteúdo privado ficam fora da mensagem.

Os códigos são proposta de evolução dos fluxos Core, não comportamento já implementado. RPCs atuais e RLS não são enfraquecidas para oferecer mensagem melhor; a futura camada confiável deve conservar transações, checks de delegação/revogação e proteção de histórico.

## 11. Recorte v1 e pós-v1

| V1 recomendada para brief futuro | Pós-v1 / fora desta tarefa |
| --- | --- |
| Projeções confiáveis de logs, atores/entidades Core por nome autorizado e atalhos por ator/afetado/unidade | Resolvedor genérico de entidades de módulos e backfill especulativo de nomes antigos |
| Resumo por usuário/unidade/perfil e estado de efetividade separado de atividade nominal | Lotação/RH/responsáveis, hierarquias extras, overrides diretos de permissão |
| Histórico tipado a partir da trilha existente; snapshots mínimos novos após PO-01 | Outra trilha duplicada ou coleta universal de leituras/negativas |
| Titulares e prévia de impacto de composição/ativação, com validação confiável no commit futuro | Workflow de aprovação de acesso, quatro olhos e notificações |
| Dossiê administrativo por seções, reutilizando capa atual | Dossiê de negócio com auditorias, planos ou métricas desses módulos |
| Diagnóstico/erro de desvinculação que preserva referências | Mudar lifecycle de vínculos ou apagar/cascatear referências para permitir remoção |
| Dataset e exportação manual limitada; processo periódico manual aprovado pelo PO | Agendamento, e-mail, exports massivos assíncronos, certificação persistida e comparação entre ciclos |

V1 aqui é **escopo recomendado de design**, não entrega funcional nem aprovação das recomendações. Este commit altera somente documentação. Cada evolução de servidor, persistência ou UX precisa de brief aprovado e verificação de autorização própria.

## 12. Decisões explícitas de PO

| ID | Decisão necessária | Recomendação | Regra até decisão / impacto |
| --- | --- | --- | --- |
| PO-01 | Quem lê evento sob L pode ver nomes mínimos capturados de ator/entidades, mesmo sem leitura atual do diretório? Quais campos e retenção? | Autorizar apenas nomes à época pertencentes ao evento, IDs e códigos necessários; nenhum e-mail/Auth/lookup geral | Sem autorização nova, usar fontes já legíveis; logs podem ter referência sem nome. Não inventar snapshot antigo |
| PO-02 | Gestor somente de unidade deve revisar nominativamente pessoas/atribuições daquela unidade? | Manter U global + T em v1; se for necessário delegar, definir política/capacidade específica por unidade em outro brief | `admin.unit.read/manage` sozinho não entrega pessoas nem contagens. Nenhuma expansão implícita por RPC |
| PO-03 | Alteração de perfil exige prévia nominativa completa? O editor deve ter U além de `admin.role.manage`? | Exigir U + R e gates de edição para o futuro fluxo de confirmação, incluindo ativação/desativação | `save_role` atual não muda nesta branch. Futuro brief precisa resolver a combinação antes de exigir confirmação universal |
| PO-04 | Exportar é extensão da leitura ou exige autorização distinta? E-mail/último login são necessários? | Manual sob as mesmas gates, sem histórico bruto; e-mail/último login opcionais e desmarcados por padrão | Política não implementada; se exigir capacidade nova, introduzir somente junto à funcionalidade aprovada |
| PO-05 | Responsável, periodicidade, evidência de revisão e necessidade de comparação entre ciclos | Trimestral e por desligamento/mudança privilegiada; revisão manual, sem revogação automática | Manifesto comprova geração, não aceite; nenhum scheduler/assinatura de revisão nesta versão |
| PO-06 | Prazo de retenção de eventos/snapshots/exportações e acesso aos arquivos baixados | Preservar trilha; minimizar exportações e expirar temporários; definir finalidade e responsável antes de persistir novos dados | Sem purge/backfill automático; política de capa existente não muda; retenção numérica não inventada |
| PO-07 | Qual comportamento futuro para unidade-setor ainda referenciado, porém fora de uso? | Preservar vínculo físico/histórico e explicar bloqueio; eventual desativação do vínculo em contrato separado | Revogar atribuição não permite remover FK histórica. Sem migração de lifecycle nesta trilha |

Estas decisões não reabrem ADR-005. Usuário + perfil + permissão + atribuição/escopo, checks no banco, IDs históricos, Core independente dos módulos, proteção de perfis de sistema e preservação de referências são invariantes vigentes.

## 13. Critérios de aceite do desenho e da futura implementação

Revisão deste desenho: oito perguntas do usuário mapeadas, contratos de leitura e erros definidos, audiência por campo explícita, escopo/exportação preservados, recomendações separadas de decisões vigentes e PO, v1/pós-v1 delimitados. Validação desta tarefa é documental/diff; nenhuma alegação de testes funcionais ou RLS executados.

O futuro brief de implementação deve comprovar, com testes de servidor e UX apropriados:

1. Inativo, sem atribuição, sem permissão, outro escopo e ID adivinhado negados; global/unidade/setor autorizados somente nos respectivos recursos.
2. U sem R não recebe composição oculta; R sem U não recebe titulares/contagens; T sem U não recebe pessoas; leitura de unidade sem C não entrega capa; setor sem S é restrito.
3. L unitário/setorial não recebe eventos globais ou de outro escopo, nem atores/detalhes por atalhos; histórico/contagens derivados não escapam dessa regra.
4. Global + unidade + setor deduplicam pessoas sem multiplicar escopos/permissões indevidamente; atribuições inativas e permissões/perfis inativos não concedem capacidades; contexto organizacional inativo não é confundido com revogação universal.
5. Homônimos, renomeação, ator inativo/nulo, entidade sem nome e legado sem snapshot têm rótulo/origem corretos; não ocorre consulta privilegiada para completar nome.
6. Concessão/revogação/desativação e nova concessão preservam IDs, atores e datas de evidência; `updated_at` não vira revogação inventada; perfil inativo não aparece como atribuição revogada.
7. Prévia mostra sobreposição e cobertura residual. Mudança de versão, atribuição, atividade de titular, composição sobreposta ou autoridade antes do commit exige nova revisão/negação; concorrência não permite salvar impacto obsoleto.
8. Desvinculação bloqueada por atribuições vigentes **e revogadas** conserva as FKs e dados; erro só revela detalhes autorizados e não distingue existência invisível.
9. Exportação e tela concordam para os mesmos filtros/snapshot; zero acesso e seções restritas são diferentes; revogação antes da entrega cancela exportação; limites não truncam; células com fórmulas são neutralizadas.
10. Views/RPCs, consultas diretas, filtros, cursores, detalhes, atalhos e exportação conservam gates/RLS; clientes não escrevem a trilha nem usam service key; Audit e Action Plans mantêm seus contratos.
