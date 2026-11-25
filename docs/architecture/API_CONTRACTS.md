# Contratos de integração — Auth, Data API e Storage

**Referência em 25/11/2026:** [Mapa de Implementação](IMPLEMENTATION_MAP.md), baseline `e0b6f5c`. As migrations, adaptadores e testes definem as assinaturas, resultados, grants e erros.

## Superfícies e fronteiras

O diagrama registra o perfil base. Com Identity no DEV, Kong encaminha Auth e Storage ao serviço interno do Core e o PostgREST usa pre-request. [Contrato vigente](GG05B_IDENTITY_DESIGN.md#contrato-vigente-no-dev).

~~~mermaid
flowchart LR
  UI["React / supabase-js"] --> KONG["Kong"]
  KONG --> AUTH["GoTrue — Auth / sessão"]
  KONG --> API["PostgREST — tabelas e RPCs"]
  KONG --> ST["Storage API — buckets privados"]
  AUTH --> PG[("PostgreSQL 17")]
  API --> PG
  ST --> PG
  ST --> OBJ["Objetos / backend local em CI; R2 planejado em PROD"]
~~~

A URL pública da API depende do gateway Kong e do ambiente aprovado. O frontend **não utiliza FastAPI/Express como backend de negócio**. A navegação e a chave publishable não representam autorização. Grants, perfil ativo, RLS e RPCs confiáveis validam permissão e escopo.

## Inventário das chamadas do frontend

| Domínio | RPCs observadas no código | Adaptador e referência |
| --- | --- | --- |
| Autenticação/Core | my_access; consulta de profiles | apps/web/src/core/auth/AuthProvider.tsx |
| Administração | user_directory, save_role, audit_log_page, role_detail; leitura/gravação autorizada de roles, profiles e assignments | apps/web/src/core/admin/api.ts |
| Revisão por unidade | unit_access_summary, unit_access_assignments | apps/web/src/core/admin/unit-access-review-api.ts |
| Capas de unidades | unit_covers, begin_unit_cover_upload, confirm_unit_cover_upload, cancel_unit_cover_upload, set_unit_cover_position, remove_unit_cover | apps/web/src/core/unitCovers.ts |
| Auditorias | units, inspection_summaries, create_inspection, finalize_inspection, reopen_inspection; leitura de checklist_sections, checklist_items, inspection_answers | apps/web/src/modules/audit/api.ts |
| Evidência de checklist | checklist_evidence, checklist_evidence_pending_count, begin_checklist_evidence_upload, confirm_checklist_evidence_upload, remove_checklist_evidence | apps/web/src/modules/audit/evidence.ts |
| Planos de ação | plan_summaries, creation_scopes, create_manual_plan, update_plan, set_plan_status, verify_plan | apps/web/src/modules/action-plans/api.ts |
| Evidências de planos | plan_evidence, begin_evidence_upload, confirm_evidence_upload, remove_evidence | apps/web/src/modules/action-plans/evidence.ts |
| Curva ABC | units, unit_series, revision_detail, begin_source_upload, confirm_source_upload, publish_revision, record_file_check; leitura analítica v2: overview, competency_products, product_history, compare, unit_revisions ([brief v2](../briefs/ABC_ANALYTICS_V2.md)); Storage abc-source-files | apps/web/src/modules/abc/api.ts; schema abc exposto, abc_private não exposto |
| Exportação / histórico | inspection_export, unit_history_export | apps/web/src/modules/audit/reporting/api.ts |
| Vendas | public.sales_entries_list, public.sales_dashboard, public.sales_export_page | apps/web/src/modules/sales/api.ts e export/api.ts |
| Salas | public.room_booking_* (agenda, pedidos, gestão, contato, foto e histórico) | apps/web/src/modules/rooms/api.ts e [AG-D5-C](../modules/room-booking/D5C_ADMIN_MODES.md) |
| Comunicados | public.announcements_published, public.announcements_manage_list, public.announcements_notice_save | apps/web/src/modules/announcements/api.ts |
| Relatos | public.feedback_* (reserva, confirmação e consulta autorizada) | apps/web/src/modules/feedback/api.ts e [contrato GG-11](../modules/feedback/FEEDBACK_V1.md) |
| Identity opt-in | Ingresso de Auth/Storage e admissão da aplicação via pre-request em REST/GraphQL | apps/core-identity e [contrato GG-05B](GG05B_IDENTITY_DESIGN.md#contrato-vigente-no-dev) |

Este quadro não lista **todas** as RPCs existentes no PostgreSQL e não deve ser usado como autorização para acesso direto. Para alterar contrato: identificar migration original, registrar assinatura/escopos/erros e consumidores, adicionar migration incremental, testes com JWT real, regressões de concorrência, escopo e compatibilidade.

## Convenções testáveis

- auth.users autentica; core.profiles determina cadastro ativo; my_access fornece permissões e escopos. Falha de autenticação não deve retornar dados.
- Roles são conjuntos de permissões, atribuições possuem escopo global/unidade/setor; não autorizar por nome de cargo ou visibilidade de menu.
- Mutação exige versão/estado quando o domínio requer; erro de concorrência não permite sobrescrever silenciosamente.
- Upload: RPC de reserva, Storage upload de bytes e RPC de confirmação; não há transação ACID distribuída. Requer tratamento de pendência e reconciliação. A leitura depende da [autorização do objeto e do perfil](SECURITY.md#storage-privado-e-miniaturas).
- PostgREST expõe `public`, `graphql_public`, `core`, `audit`, `action_plans` e `abc` no Compose. As funções públicas preservam as fronteiras dos schemas de Vendas, Salas, Comunicados e Relatos. Os schemas internos e auxiliares ficam fora da lista de exposição.
- Instantes com timestamptz, datas de negócio com date e dinheiro com numeric. Não interpretar número de ponto flutuante do browser como fonte contábil definitiva.
- Logs, exports e erros não devem conter senha, service_role, JWT, PII desnecessária nem URL assinada persistida.
- Cada novo módulo deve documentar contrato público e negações cross-unit, inclusive leitura de exportação.

## Limites de verificação do arquivo ABC

`confirm_source_upload` confere metadados de existência/tamanho/MIME do objeto. O SHA-256 registrado é **informado pelo cliente** e **não é recalculado pelo servidor sobre os bytes físicos**. `publish_revision` revalida payload, somas, regras e `content_hash`, mas não comprova relação entre payload e bytes XLSX. `record_file_check` registra conferência posterior executada pelo navegador. O parser no browser também bloqueia casos que não estão estritamente equivalentes no SQL (ex.: competência não encerrada). Não descrever esse desenho como verificação antecipada criptográfica do XLSX; ver [THREAT_MODEL](THREAT_MODEL.md).

## Prova de contrato

Fontes: [AUTHORIZATION](AUTHORIZATION.md), [DATA_MODEL](DATA_MODEL.md), [IMPLEMENTATION_MAP](IMPLEMENTATION_MAP.md), [STACK_INTEGRATION](STACK_INTEGRATION.md) e migrations em supabase/migrations. Regressões atuais incluem tests/database.test.ts, tests/authorization.test.ts e tests/integration/{audit,action-plans,evidence,reporting,core-security-matrix,unit-cover}.mjs. Teste executado em CI efêmera não prova produção.
