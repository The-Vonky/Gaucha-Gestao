# Core Consumer Contract Map v1

- Status: DESIGN ONLY — levantamento com evidências; recomendações não aprovam implementação.
- Data: 2026-10-08.
- Brief: [CORE_CONSUMER_CONTRACT_MAP_V1](../briefs/CORE_CONSUMER_CONTRACT_MAP_V1.md).
- Branch: `docs/core-consumer-contract-map-v1`.
- Base de aplicação do brief: `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`.
- Snapshot documental analisado: `102c57684ec631b6637ddd4b93fbe232e9005153` (inclui o brief).
- Integração prevista pelo brief: `integration/core-foundation-v2`; este documento não realiza integração.

## 1. Resultado e limite do levantamento

Antes do próximo módulo, estabilizar identidade/profile, autorização por atribuição e escopo, referências organizacionais e preservação dos atores históricos. Datas, dinheiro e arquivos precisam de convenções técnicas compatíveis, não de novos domínios universais no Core. Não há evidência para promover clientes comerciais, responsáveis de negócio, serviços, produtos, competências ou workflows ao Core.

Oito módulos foram examinados. Seis têm fontes standalone acessíveis e identificadas abaixo. Não foi identificado repositório/artefato de origem de Salas ou Frota no inventário acessível consultado; isso não afirma que não existam. Nesses casos só se usam as decisões documentadas da plataforma. Nenhum sistema de origem foi modificado e nenhum dado operacional foi consultado.

Audit e Action Plans são consumidores existentes usados como evidência. Seus domínios, contratos e autorizações não são redesenhados. O mapa não fecha migração, homologação, implantação nem os gates P1–P9/O1–O8 da Qualidade.

## 2. Como ler CONFIRMADO e UNKNOWN

- **CONFIRMADO:** existe fonte explícita para a dependência ou obrigação indicada. Não significa que o recurso esteja implementado, que a empresa tenha aprovado sua migração, ou que o Core deva possuir a entidade.
- **UNKNOWN:** falta evidência suficiente para definir a necessidade ou sua relação com o Core. Não significa dispensado, proibido ou inexistente.
- **P:** obrigação aceita da plataforma, sobretudo ADR-005/AUTHORIZATION; aplicável ao módulo integrado mesmo quando o standalone não tem login.
- **O:** comportamento/modelo documentado ou código da origem. Exige mapeamento e aceite no gate do módulo; não substitui os ADRs da plataforma.
- **D:** desenho explícito na origem ainda planejado; é evidência de necessidade declarada, não de software entregue nem de aprovação pela Gaúcha Gestão.

Na matriz, **usuário** significa identidade autenticada para operar o módulo integrado; **responsável** significa pessoa de negócio, não ator de sessão; **histórico de usuário** significa identificação do ator em registros/eventos de negócio. O log de sistema comum continua obrigatório para mutações sensíveis, mesmo onde o histórico específico do domínio é UNKNOWN. **Datas** trata datas/períodos de negócio; timestamps técnicos não provam essa necessidade. **Anexos** inclui arquivos de origem preservados, distinguindo-os de evidências de negócio. **Referências** confirma apenas os vínculos expressos na fonte, discriminados na seção 4.

RBAC CONFIRMADO confirma o mecanismo comum. Não confirma quais ações, unidades ou setores cada módulo deve autorizar. Uma unidade de domínio também não determina automaticamente o escopo das permissões. Serviço, indicador, categoria, departamento mencionado em navegação e escopo analítico não são automaticamente `core.sectors` ou escopo RBAC.

## 3. Matriz módulo × primitiva

### 3.1 Identidade, organização e autorização

| Módulo | Usuário | Responsável/owner/participante | Unidade | Setor | Escopo RBAC |
| --- | --- | --- | --- | --- | --- |
| ISO / Propostas ISO | CONFIRMADO — P1; O1 §5 | CONFIRMADO — O1 §3, responsável comercial textual | UNKNOWN — cliente/cidade não comprovam unidade Core | UNKNOWN | CONFIRMADO — P1; distribuição global/unidade/setor UNKNOWN |
| Vendas / Maquininhas | CONFIRMADO — P1 | UNKNOWN | CONFIRMADO — O2 §1–3, venda por unidade | UNKNOWN | CONFIRMADO — P1; catálogo e cobertura por operação UNKNOWN |
| Satisfação | CONFIRMADO — P1 | CONFIRMADO — O3b `owner`; O3c, plano por indicador | CONFIRMADO — O3c, clientes/unidades; identidade exata a mapear | UNKNOWN — serviço não é setor | CONFIRMADO — P1; catálogo e cobertura por operação UNKNOWN |
| Agendamento de Salas | CONFIRMADO — P1 | UNKNOWN — solicitante/participante não deduzido do nome | UNKNOWN | UNKNOWN | CONFIRMADO — P1; catálogo e cobertura por operação UNKNOWN |
| Frota | CONFIRMADO — P1 | UNKNOWN — motorista não deduzido | CONFIRMADO — P4, “Platform adaptation” identifica Unit compartilhada com Fleet | UNKNOWN | CONFIRMADO — P1; exemplo Fleet@Matriz não fecha catálogo nem todas as operações |
| Planejado × Realizado | CONFIRMADO — P1 | UNKNOWN | CONFIRMADO — O4a, filiais e análises por filial/período | UNKNOWN — serviço/nomenclatura não é setor | CONFIRMADO — P1; catálogo e cobertura por operação UNKNOWN |
| Curva ABC | CONFIRMADO — P1; O5b `user_account` | UNKNOWN — autor de publicação não prova responsável de negócio | CONFIRMADO — O5b `branch`; O5a §1–2 | UNKNOWN — `reporting_scope` não é setor | CONFIRMADO — P1; O5b grants por filial; tradução dos papéis/ações UNKNOWN |
| Contratos ERP | CONFIRMADO — P1; O6 `USERS`/`SESSIONS` | CONFIRMADO — O6 `RESPONSIBLE_PEOPLE`, separado de USERS | UNKNOWN — vínculo cliente→contrato não comprova unidade Core | UNKNOWN | CONFIRMADO — P1; perfil legado não fecha catálogo/cobertura da plataforma |

### 3.2 Histórico, arquivos e valores

| Módulo | Histórico de usuário | Anexos/arquivos preservados | Datas de negócio | Valores monetários | Referências entre entidades |
| --- | --- | --- | --- | --- | --- |
| ISO / Propostas ISO | CONFIRMADO — O1 §4/6, nome no upload e histórico | CONFIRMADO — O1 §4/7/8, cliente/proposta | CONFIRMADO — O1 §3, envio/retorno | CONFIRMADO — O1 §3, valor de refeição | CONFIRMADO — O1 §8; entre módulos UNKNOWN |
| Vendas / Maquininhas | UNKNOWN — histórico mensal não é histórico de ator | UNKNOWN — importação não prova retenção de arquivos | CONFIRMADO — O2 §1/5, dia e competência | CONFIRMADO — O2 §1/4, decimal em reais | CONFIRMADO — O2 §1; entre módulos UNKNOWN |
| Satisfação | UNKNOWN — owner e histórico de indicadores não identificam ator da sessão | UNKNOWN — impressão/PDF não prova upload/retenção de anexo | CONFIRMADO — O3a competência/data; O3b prazo | UNKNOWN — votos/score não são dinheiro | CONFIRMADO — O3a/b; entre módulos UNKNOWN |
| Agendamento de Salas | UNKNOWN | UNKNOWN | UNKNOWN — horário/fuso/recorrência sem fonte | UNKNOWN | UNKNOWN |
| Frota | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN — visão futura de custos em P2 não fecha modelo monetário | UNKNOWN |
| Planejado × Realizado | UNKNOWN — eventos/snapshots não comprovam ator identificável | CONFIRMADO — O4a `source_files`, original preservado | CONFIRMADO — O4a filial/período e datas das linhas | CONFIRMADO — O4a/b, Decimal e precisão por saída | CONFIRMADO — O4a, origem→validação→snapshot; entre módulos UNKNOWN |
| Curva ABC | CONFIRMADO — O5b `audit_event.actor_id`; O5a §1–2 (D), autoria de revisões | CONFIRMADO — O5a §1/4 (D), fonte imutável e evidência; adoção pendente | CONFIRMADO — O5b vigência; O5a §1/4 (D), competência | CONFIRMADO — O5a §4 (D), NUMERIC/Decimal/BRL | CONFIRMADO — O5a §1–2 (D); entre módulos UNKNOWN |
| Contratos ERP | CONFIRMADO — O6, usuário no histórico financeiro/auditoria/documentos | CONFIRMADO — O6 “Documentos”, dono cliente OU contrato | CONFIRMADO — O6, início/fim, eventos, reajuste/aditivo | CONFIRMADO — O6, centavos e percentuais bps | CONFIRMADO — O6, cliente/responsável/contrato; entre módulos UNKNOWN |

Fonte de requisitos planejados não autoriza antecipar tabelas, permissões ou integrações. Nenhuma célula CONFIRMADO autoriza expandir Core sem avaliar o ownership da seção 5.

## 4. Evidência e interpretação por consumidor

| Consumidor | Relações sustentadas e contrato a estabilizar | Limite da confirmação |
| --- | --- | --- |
| ISO / Propostas ISO | O1: cliente→propostas/anexos; proposta→anexos; responsável comercial é texto; upload/histórico guardam nome. Requer identidade canônica para ações novas, preservação de atribuição histórica, arquivo com dono e convenções de data/dinheiro. | Cliente comercial não é unidade. Nome do responsável/ator não permite inventar FK para profile. Nenhuma relação ISO→Audit, ISO→Sales ou proposta→Contrato está confirmada. |
| Vendas / Maquininhas | O2: lançamento diário por unidade+forma; ajustes legados por mês+unidade+forma e estado de competência. Requer ID/lifecycle de unidade, data civil e decimal. | Totais históricos não permitem fabricar vendas diárias ou autores. “Maquininhas” não prova cadastro de dispositivos/transações individuais. Importações/KPIs continuam no módulo. |
| Satisfação | O3: avaliação por cliente/unidade+serviço+competência, votos por indicador, comentários por avaliação e planos locais por indicador com owner/prazo. Requer unidade canônica e datas; responsabilidade deve preservar texto existente. | Correspondência cliente legado↔unidade Core precisa validação. Serviço não prova setor. Planos locais são evidência de sobreposição com Action Plans, não autorização para novo `source_type`/RPC ou acesso às suas tabelas. |
| Salas | P1/P2 confirmam operação integrada com acesso por permissão. | Sem fonte para entidades sala, reserva, organizador, participantes, unidade, datas/recorrência ou conflitos. Nenhuma estrutura nova no Core se justifica pelo nome do módulo. |
| Frota | P4 explicita unidade compartilhada; P1 fixa autorização comum. | Exemplos Fleet@Matriz e futura agregação de custos não são inventário do negócio. Veículo, motorista, viagem, despesa, anexos, datas e vínculos ainda precisam fonte. |
| Planejado × Realizado | O4: filial/aliases→arquivos; arquivos→prévia/validação→análises versionadas; serviços e datas nos snapshots; ponteiro vigente separado. Requer unidade, arquivo original, datas/períodos e decimal. | Não impor usuário histórico a evento legado sem autoria. Alias fica no módulo. Snapshot analítico imutável não equivale a histórico de profile. Não há vínculo comprovado com ABC ou Contracts. |
| Curva ABC | O5b prova contas, filiais, grants e atores no núcleo intranet. O5a declara revisão→linhas/produtos/arquivo/job, séries por filial/competência/escopo analítico e snapshots (D). Requer unidade, ator histórico, acesso scoped e convenções de arquivo/data/decimal. | Origem contém desktop e intranet; confirmar baseline a migrar. `reporting_scope` descreve população/serviço de análise, não uma concessão de autorização. Catálogo de produtos/conversões/versões de mapas não pertence ao Core por ser “canônico” dentro de ABC. Compras em O5a §6 é extensão futura, não dependência entregue. |
| Contratos ERP | O6: clientes→contratos; responsável independente→contratos; contratos→histórico/reajustes/aditivos; documento pertence a cliente OU contrato, com uploader. Requer autenticação/profile, ator histórico, arquivos, datas e dinheiro exato. | Não converter `responsible_people` em Auth users. Não equiparar cliente à unidade. Não compartilhar clientes com Propostas sem contrato de domínio aprovado. Backup deve ser revisto antes da migração/cutover (P3). |

Todas as relações **entre os oito módulos**, ou deles com Audit/Action Plans, permanecem UNKNOWN quanto a contrato concreto. As relações internas acima permanecem sob ownership do módulo. O mecanismo aceito para qualquer integração futura é contrato público explícito, com autorização preservada (ADR-001/002), não acesso às tabelas internas nem intermediário universal no Core.

### Evidência dos consumidores já existentes

- **Action Plans:** E1a distingue `responsible: string` de `verified_by`/`completed_by`, e devolve nomes de unidade/setor/atores em summaries. Há `unit_id`, setor opcional, datas e metadados de evidência. Isso prova reutilização de organização/identidade e necessidade de distinguir responsável de ator; não prova um cadastro corporativo universal de responsáveis.
- **Integração Audit→Action Plans:** E1b expõe `plansForInspection` como leitura pública sob RLS. O contrato permanece específico à inspeção; não é contrato genérico para os módulos ainda ausentes.
- **Audit Checklist Evidence:** E2 possui metadados/bucket próprios e pai `(inspection_id, item_key)`, usa validador Shared também consumido por Action Plans e autoriza pela entidade dona. Prova reutilização técnica de arquivos com ownership distinto, sem tabela universal de anexos e sem dependência Audit→Action Plans para arquivos.
- **Core atual:** E3 separa Profile/DirectoryUser de entidades organizacionais, assignments e log. O diretório com e-mail/último acesso é administrativo; não é licença para todo módulo acessar `auth.users` ou listar todas as contas.

## 5. Contratos candidatos realmente compartilhados e ownership

“Aceito” abaixo registra o baseline existente; “recomendação” especifica o mínimo a fechar na Fundação v2, sem afirmar que uma API nova já exista. Os nomes C1–C7 são identificadores deste mapa, não nomes de tabelas/RPCs a criar.

| Contrato | Decisão já sustentada | Fechamento recomendado antes do consumo | O que continua fora do Core |
| --- | --- | --- | --- |
| C1 — Identidade/profile e lifecycle | P1/P5: Auth ID canônico, profile 1:1, ativo obrigatório, sessão válida não supera inativação; credenciais são do Auth. | Definir leitura mínima autorizada de referência de usuário (ID, nome exibível, estado) e tratamento de indisponível/inativo. Verificar criação/inativação/reativação sem órfãos e compatibilidade de consumidores existentes. | Usuários privados por módulo, credenciais duplicadas, atributos de RH especulativos. E-mail/último acesso do diretório admin não viram contrato irrestrito. |
| C2 — Permissão + atribuição + escopo | P1: role é bundle; escopo pertence à atribuição; global/unit/sector; default deny; grants/RLS e regras de domínio confiáveis. | Fixar semântica de cobertura e contrato de consulta/check. Ações futuras só entram no catálogo quando aprovadas/implementadas; não replicar papéis standalone como condicionais. | Estados e aprovações do negócio; `reporting_scope` de ABC; filtros de período; cópias de grants por módulo. |
| C3 — Referências organizacionais | P1/P5: UUID, code separado, unidade/setor canônicos, associação unit_sector válida; desativar preservando história. | Fixar leitura autorizada de ID/code/name/active; distinguir seleção operacional de consulta histórica. Definir vínculo e erro para unidade/setor inválido sem expor recurso fora do acesso. | Aliases ERP/importação e correspondências de legados. Não inventar setores onde nenhuma fonte os demonstra. |
| C4 — Referência histórica de ator e log de sistema | P1/P5: preservar ID histórico, log confiável com ator/tempo/ação/entidade e sem segredo; sem escrita direta do cliente. | Definir como apresentar ator inativo e como importar autoria textual/ambígua sem fabricar identidade. Separar nome atual de nome na época; política de snapshot nominal precisa decisão. Eventos automáticos devem ser identificáveis sem conta humana falsa. | Histórico de revisão/calculadora/contrato/apuração, payload e retenção específicos; histórico de negócio não é substituído apenas pelo log Core. |
| C5 — Capacidade técnica de arquivo | P5/P6/E2: bytes em Storage, metadados e vínculo no dono; acesso herda entidade, chave não concede acesso; uploads não confiáveis. | Fixar contrato mínimo de reserva/confirmação/leitura/remoção e falhas/reconciliação quando aplicável, autorização de download e preservação DB+bytes. Reusar componentes concretos existentes, sem universalizar seus limites. | Tabelas de metadados, categorias, quotas, tipos, retenção, original de importação e lifecycle são do dono. Arquivo importado não vira automaticamente “evidência”. |
| C6 — Datas e dinheiro (convenções Shared/persistência) | P5: `timestamptz` para instante, `date` para data civil; `numeric` exato para moeda; arredondamento documentado por módulo. | Documentar serialização sem perda decimal e sem conversão indevida de data civil para UTC. Resolver compatibilidade centavos/texto/float/NUMERIC e limites por consumidor; nenhuma escala universal inferida. | Competência, vigência, recorrência, fórmulas, moedas admitidas, escalas e ROUND_HALF_UP específico. Não criar calendário ou razão financeira no Core. |
| C7 — Referência e integração pública | P0/P7: domínio possui registros, integração usa contrato explícito; Core nunca depende de módulo. | Cada futuro gate deve identificar FK/referência Core e versão/fonte legada separadas; qualquer vínculo entre módulos precisa contrato público aprovado pelo dono. Leitura agregada deve respeitar escopo de cada consumidor. | Cliente, proposta, contrato, produto, serviço, veículo, sala, pesquisa e relatório; registry polimórfico universal, warehouse executivo ou workflow genérico. |

**Responsável:** a separação entre identidade autenticada, pessoa responsável e ator histórico deve ficar estável antes da migração. Não há decisão aceita que torne os três a mesma entidade. Recomendação: reutilizar referência de profile somente quando a fonte e o PO confirmarem vínculo; preservar responsável textual ou entidade do módulo nos demais casos. Criar cadastro corporativo de pessoas sem login depende de necessidade transversal demonstrada e decisão de ownership; este mapa não o aprova.

## 6. Contradições, lacunas e decisões do PO

| ID | Evidência/conflito | Decisão ou informação necessária | Efeito enquanto pendente |
| --- | --- | --- | --- |
| PO-1 | P2 coloca Registros ISO em Qualidade; P3 diz que a origem é comercial e exige resolver ownership/navegação; O1 descreve clientes/propostas. | Confirmar domínio, nome e posição funcional do legado ISO. Decidir apenas após inventário se há vínculo com Contratos/Sales. | Gate específico de ISO bloqueado; não tratar proposta como registro de auditoria nem mover domínio só por menu. |
| PO-2 | O1/O3 usam responsável textual; O6 mantém pessoa independente; E1a separa responsável e ator autenticado. | Responsável precisa login? Pode ser externo/inativo? Há identidade corporativa compartilhada comprovada ou cadastros locais distintos? | Sem entidade universal, sem FK obrigatória para Auth e sem gerar contas a partir de nomes. |
| PO-3 | O2 usa units, O3 chama clients de unidades, O4/O5 usam branches; O1/O6 têm cliente comercial. | Validar tabela de correspondência por origem/ID para Core Unit, cardinalidade e política para nomes ambíguos/inativos. | Unidade confirmada não significa mapeamento concluído. Clientes comerciais continuam separados até decisão fundamentada. |
| PO-4 | Mecanismo RBAC aceito; todos os catálogos futuros/coberturas por operação ainda não especificados para a plataforma. Setor é UNKNOWN nos oito módulos. | Informar público e ações aprovadas, recursos globais/por unidade/por setor e regras de delegação; separar recorte analítico de RBAC. | Não seedar permissões, criar setor artificial ou conceder global por conveniência. |
| PO-5 | O3 tem planos locais; Action Plans transversal já existe, mas E1b só oferece consulta por inspeção. | Confirmar paridade necessária e eventual integração de Satisfação com o módulo transversal; dono deve aprovar contrato e origem. | Sem duplicar/reformular Action Plans e sem presumir `source_type` novo. |
| PO-6 | O1 usa nomes em histórico; O6/O5b têm ID de usuário; outros domínios não comprovam autoria. P1/P5 preservam referências, mas não definem nome imutável na época. | Aprovar apresentação/importação de ator legado não resolvido, snapshot nominal quando necessário e retenção do histórico. | Preservar fonte; não associar homônimos automaticamente, reescrever autoria ou apagar histórico na inativação. |
| PO-7 | O1 tem float monetário; O6 centavos/bps; O4 decimal textual com escalas; O5a declara precisão ampla; P5 usa numeric. | Aprovar política de conversão/reconciliação, precisão, arredondamento e tolerâncias por domínio. | Core não impõe `numeric(14,2)` nem escala de duas casas para todas as etapas. Não prometer recuperar precisão perdida na origem. |
| PO-8 | O4 retém original; O5a arquivos/evidências são desenho; O6 usa arquivos em diretório próprio; E2 tem quotas/lifecycle específicos. | Definir retenção, classificação, limites e estratégia DB+objetos por consumidor; distinguir originais, anexos e export temporário. | Sem tabela universal, purge automático ou cópia das quotas de Audit para todos. |
| PO-9 | Sem fonte identificada para Salas/Frota; O5 mistura desktop/intranet; O3 README descreve RC e validação pendente apesar do status “finished” em P3. | Identificar versão/repositório/artefato canônico por módulo e diferenciar funcionalidade entregue de planejada ou pendente de validação. | UNKNOWN permanece; nem status do roadmap nem documentação de design comprovam paridade/homologação. |

PO-1 é bloqueio explícito já existente no roadmap. Os demais pontos bloqueiam somente o contrato/migração que deles depender; não exigem desenhar os oito domínios antes de fechar um núcleo pequeno. Detalhes técnicos de API podem ser definidos pelo arquiteto dentro dos ADRs; semântica de negócio, ownership controverso e políticas de preservação precisam PO/owner operacional conforme o tema.

## 7. Critérios mínimos de fechamento antes do próximo módulo

Recomendação de aceite documental/técnico da Fundação, sem executar implementação neste trabalho:

1. **Contrato canônico publicado:** C1–C4 têm semântica, superfície pública autorizada, lifecycle, comportamento de referências inativas/ausentes e erros documentados. Distinguir administrador, ator, responsável e participante; nenhum módulo depende do diretório administrativo para funcionar sem autorização equivalente.
2. **Authorization boundary preservado:** checks confiáveis/RLS usam estado atual de profile/role/assignment, sem autorização apenas de frontend/JWT antigo; sem service role no browser. Semântica global/unit/sector e vínculo unit_sector fixados. Recursos sem escopo definido são negados até decisão, não convertidos em globais automaticamente.
3. **Validação de consumo existente:** a evolução planejada deve preservar Audit/Action Plans e cobrir usuário inativo/sem role, permissão ausente, unidade errada, setor incompatível, ID adivinhado e leitura histórica; export/download não ampliam escopo. Testes de regressão só são exigidos quando houver implementação; este documento não afirma tê-los executado.
4. **Preservação e apresentação histórica:** referência Core não cascata remoção do negócio; inativação não elimina registros. Política aprovada para ator legado textual/não resolvido e para nome atual versus histórico onde o próximo consumidor precisar; reativação não cria concessão implícita.
5. **Convenções técnicas compatíveis:** C5 é fechado antes de consumidor com arquivo; C6 antes de consumidor com data/dinheiro. Registrar ownership, limites, serialização, precisão e cenários de falha/reconciliação. Reusar contratos existentes sem construir tabela universal ou domínio financeiro/calendário.
6. **Gate do próximo módulo completo (P3):** origem+versão identificadas, inventário de comportamento/regras críticas, classificação de dados, mapeamento Core, catálogo/cobertura de permissões aprovado, estratégia de migração/cutover e critérios de aceite. Cada UNKNOWN necessário é resolvido com fonte/PO ou explicitamente excluído do escopo aprovado; nunca convertido silenciosamente em requisito.
7. **Boundary revisado:** nenhum cadastro privado de usuário/unidade/setor substitui Core; nenhuma entidade de negócio é promovida por conveniência; imports/aliases ficam no dono; nenhuma integração cruza internals. ISO continua sem autorização de implementação até PO-1.

Fechar esses critérios não autoriza produção. Cutover continua exigindo paridade/diferenças aprovadas, reconciliação, controles de acesso, backup/restore/rollback e validação dos stakeholders previstos em P3. A Qualidade mantém seus aceites físicos/operacionais em aberto conforme P6/AGENTS.

## 8. Registro das fontes

As fontes P/E abaixo foram lidas no snapshot documental indicado no cabeçalho. Fontes O são links para commits fixos dos sistemas de origem; nomes de repositório foram confirmados no inventário acessível. A ausência de Salas/Frota nesse inventário é limitação deste levantamento, não descoberta de requisito.

| ID | Fonte e trechos utilizados |
| --- | --- |
| P0 | [AGENTS.md](../../AGENTS.md): Sources of truth, Architecture invariants, Security, Validation e Current phase. [Brief](../briefs/CORE_CONSUMER_CONTRACT_MAP_V1.md): Method/Deliverable. |
| P1 | [ADR-005](../decisions/ADR-005-core-authorization.md): Authentication, Core tables, Scope evaluation, RLS pattern, User/Unit lifecycle; [AUTHORIZATION](AUTHORIZATION.md): Authorization equation, Resource rules, Exports and attachments, Lifecycle. |
| P2 | [PRODUCT_STRUCTURE](PRODUCT_STRUCTURE.md): Technical ownership map, Navigation is permission-driven, Unit context (visão futura/condicional, não vínculo implementado). |
| P3 | [MODULE_ROADMAP](../migration/MODULE_ROADMAP.md): Inventory, Phase 2, Per-module migration gate. |
| P4 | [AUDIT_SOURCE_OF_TRUTH](../modules/audit/AUDIT_SOURCE_OF_TRUTH.md): Unit experience → Platform adaptation, declaração explícita de Unit compartilhada com Fleet/ABC/Satisfaction/PxR. Não se transportam pendências históricas superseded para o estado atual de Audit. |
| P5 | [DATA_MODEL](DATA_MODEL.md): Core relationships, Time, Money, Attachments, Imported source data, Delete policy. |
| P6 | [SECURITY](SECURITY.md): Identity, Uploads, System audit trail; [FOUNDATION_GATES](FOUNDATION_GATES.md): gates 4–8/10; readiness operacional não estabelecida. |
| P7 | [ADR-001](../decisions/ADR-001-modular-monolith.md): Decision; [ADR-002](../decisions/ADR-002-core-and-module-ownership.md): Decision/Guardrail; [OVERVIEW](OVERVIEW.md): Dependency rule, Shared corporate concepts. |
| E1a | [Action Plans types](../../apps/web/src/modules/action-plans/types.ts): Plan, PlanSummary, Evidence, CreationScope. |
| E1b | [Action Plans public](../../apps/web/src/modules/action-plans/public.ts): plansForInspection e boundary de leitura. |
| E2 | [CHECKLIST_EVIDENCE_V1](../modules/audit/CHECKLIST_EVIDENCE_V1.md): Contract, Access and lifecycle, Storage and client, Reconciliation and recovery. |
| E3 | [Core types](../../apps/web/src/core/types.ts): Profile, DirectoryUser, Organization, Assignment, AuditLog e user_directory. |
| O1 | The-Vonky/Registros_ISO-Gaucha @ `2187918842bef1be24e3699c716a7129cb4c9bb5`: [dicionario_dados.md](https://github.com/The-Vonky/Registros_ISO-Gaucha/blob/2187918842bef1be24e3699c716a7129cb4c9bb5/registros-iso/docs/dicionario_dados.md), §§3–6 e 8. |
| O2 | The-Vonky/dashboard_vendas-Gaucha @ `caa4236e8010cae48236e07ba033493b4d3ef80d`: [DADOS_E_REGRAS.md](https://github.com/The-Vonky/dashboard_vendas-Gaucha/blob/caa4236e8010cae48236e07ba033493b4d3ef80d/docs/DADOS_E_REGRAS.md), §§1–5 e 8. |
| O3a | The-Vonky/dashboard_Satisfacao-Gaucha @ `1c305bff23c8cffa97817b1168779a51491b5b62`: [0001_init.sql](https://github.com/The-Vonky/dashboard_Satisfacao-Gaucha/blob/1c305bff23c8cffa97817b1168779a51491b5b62/src-tauri/migrations/0001_init.sql), assessments/indicator_votes/comments. |
| O3b | Mesmo commit de O3a: [0003_action_plans.sql](https://github.com/The-Vonky/dashboard_Satisfacao-Gaucha/blob/1c305bff23c8cffa97817b1168779a51491b5b62/src-tauri/migrations/0003_action_plans.sql), owner, due_date e referências. |
| O3c | Mesmo commit de O3a: [README](https://github.com/The-Vonky/dashboard_Satisfacao-Gaucha/blob/1c305bff23c8cffa97817b1168779a51491b5b62/README.md), Principais recursos, Apurações, Planos de ação, Versão/Status. |
| O4a | The-Vonky/planejadoXrealizado-Gaucha @ `b4bb155b2e41854c3a881731e8baaae61cd9b3f5`: [MODELO_DADOS](https://github.com/The-Vonky/planejadoXrealizado-Gaucha/blob/b4bb155b2e41854c3a881731e8baaae61cd9b3f5/docs/technical/MODELO_DADOS.md), entidades, integridade e precisão. |
| O4b | Mesmo commit de O4a: [CALCULOS_FINANCEIROS](https://github.com/The-Vonky/planejadoXrealizado-Gaucha/blob/b4bb155b2e41854c3a881731e8baaae61cd9b3f5/docs/sprint-5/CALCULOS_FINANCEIROS.md), Precisão e arredondamento. |
| O5a | The-Vonky/CurvaABC-Gaucha @ `b44c829a2bff04602bab433a6cef8c12ec84c405`: [05-DADOS](https://github.com/The-Vonky/CurvaABC-Gaucha/blob/b44c829a2bff04602bab433a6cef8c12ec84c405/intranet/docs/05-DADOS.md), §§1–4; entidades de consumo/produção/arquivos/publicação explicitamente planejadas. |
| O5b | Mesmo commit de O5a: [schema.py](https://github.com/The-Vonky/CurvaABC-Gaucha/blob/b44c829a2bff04602bab433a6cef8c12ec84c405/intranet/backend/app/db/schema.py), user_account, branch, branch_role_grant, audit_event. |
| O6 | The-Vonky/GestaoDeContratos-Gaucha @ `84083d00b106c52f5a646048ae5994012b1e9475`: [data-model](https://github.com/The-Vonky/GestaoDeContratos-Gaucha/blob/84083d00b106c52f5a646048ae5994012b1e9475/contratos-intranet/docs/data-model.md), relações e Convenções importantes. |

## 9. Validação deste entregável

Revisão documental: oito consumidores, dez dimensões com CONFIRMADO/UNKNOWN, fontes para confirmações, distinção P/O/D, ownership e perguntas de PO, critérios mínimos e invariantes de segurança. Verificação de caminhos/links locais e diff restrito a este Markdown. Sem código, migrations, seed de permissões, mudanças em RLS/RPC ou execução em banco/produção. Testes de aplicação não são evidência produzida por este trabalho documental.
