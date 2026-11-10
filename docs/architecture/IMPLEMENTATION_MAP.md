# Mapa rastreável: funcionalidades, contratos e código

**VEN-05A — 03/11/2026:** `modules/sales/export/{api,types,workbook,download,SalesExportActions}`
e `public.sales_export_page`, migration `20261103175405_sales_excel_export.sql`:
Excel filtrado/histórico autorizado, separado do read-model analítico; testes
`sales-export-*` e integração CI Auth/PostgREST/Chromium. [Contrato](../modules/sales/VEN05A_EXCEL_EXPORT.md).
Refinamento de 04/11: exportação somente em Lançamentos, ações após filtros,
XLSX com nome legível/total/criador; `20261104122256` acrescenta nome às RPCs
sem ampliar escopos. Aplicação e conferência somente no Supabase local autorizado;
revisão/merge e homologação visual de Excel pendentes. VEN-04B integrada #94
(`91bd16b`); as referências a revisão prévia abaixo são registros históricos.

**MEL-01 — 30/10/2026:** limpeza autorizada somente no notebook, catálogo de unidades
vazio, fixtures com teardown físico dirigido e correção de consultas globais sem unidades
(`20261030145036_sales_empty_units.sql`). [Evidências](../modules/sales/VEN04B_MEL01_LOCAL_CLEANUP.md).
PR #94 continua para revisão; sem merge ou deploy.

**Vendas — adendo de 29/10/2026:** VEN-01/02/03 integradas nas PRs #90/#91/#92.
VEN-04A integrada pela PR #93 (`7ddcd31`). VEN-04B implementada para revisão:
[dashboard gerencial completo](../modules/sales/VEN04B_DASHBOARD_UI.md), com
[evidências sintéticas locais](../modules/sales/VEN04B_LOCAL_VALIDATION.md).
Correção pré-merge: administrador com sete capacidades Vendas, Sales Manager/Operator
protegidos e teardown dirigido; [evidências](../modules/sales/VEN04B_ACCESS_CORRECTION.md).
Sem homologação VEN-07 ou alterações em STAGING/PROD. O restante mantém sua fotografia histórica.

**Melhorias aprovadas em 26/10/2026 após teste manual:** foto privada da sala gerida somente por `room_booking.manage`, status verde/vermelho e contagem pelo relógio do servidor, visão da secretária sem cards de solicitante e histórico geral paginado somente para gestão. D5-B, agenda, pedidos próprios e decisões anteriores preservados. [Contrato, segurança e validação](../modules/room-booking/EXPERIENCE_V1.md).

**Fotografia:** main após PR #69 (`fed0e0f`, 20/10/2026). Inventário de arquivos/contratos, **não relatório de aprovação de deploy ou de testes executados agora**.

## Limites da implementação atual

| Superfície | Implementação encontrada | Contratos/DDL e testes correspondentes | Estado |
| --- | --- | --- | --- |
| Shell, login e navegação | apps/web/src/app/{App.tsx,navigation.ts}; core/auth/{AuthProvider.tsx,Login.tsx}; core/client.ts | core.profiles, core.my_access, [autorização](AUTHORIZATION.md); tests/login.test.tsx, tests/authorization.test.ts | AS-IS |
| Avisos institucionais GG-10 | app/AnnouncementLayout.tsx; shared/announcements/; modules/announcements/ | [Contrato GG-10](../ui/GG10_INSTITUTIONAL_ANNOUNCEMENTS.md); tests/announcements.test.tsx; tests/integration/announcements-browser.mjs | Barra compacta, administração por RPC e refinamento de agenda/cores em revisão |
| Relatos e sugestões GG-11 | modules/feedback/; app/App.tsx; app/navigation.ts | [Contrato GG-11](../modules/feedback/FEEDBACK_V1.md); tests/integration/announcements-security.mjs | Recebimento interno e consulta exclusiva por Platform Administrator em revisão |
| Administração Core | apps/web/src/core/admin/ (usuários, papéis, permissões, unidades, setores, logs, revisões de acesso) | supabase/migrations/*core*.sql; [ACCESS_GOVERNANCE_READ](../modules/core/ACCESS_GOVERNANCE_READ_V1.md); tests/admin*.test.*, tests/integration/admin.mjs | AS-IS |
| Auditorias | apps/web/src/modules/audit/; api.ts (create_inspection, finalize_inspection, reopen_inspection, inspection_summaries), scoring.ts | supabase/migrations/*audit*.sql; [fonte funcional](../modules/audit/AUDIT_SOURCE_OF_TRUTH.md); tests/audit*.test.*, tests/integration/audit.mjs | AS-IS |
| Login/issuer e executor local de miniaturas | scripts/audit-derivative-runtime-*.mjs; scripts/audit-derivative-dev.mjs; migrations 20261104192428/20261105194432 | [Iniciar/parar e prova automática](../modules/audit/AUD_IMG_02_LOCAL_EXECUTOR_20261105.md) | Sessão de terminal, auditoria/corte explícitos; mesmos cinco grants; NOLOGIN ao encerrar; sem serviço permanente |
| Miniaturas privadas AUD-IMG-02 | scripts/dev.mjs; scripts/audit-derivative-{dev,runtime,worker,encoder,decoder}.mjs; RPCs de miniatura/estado; flag versionada VITE_AUDIT_EVIDENCE_THUMBNAILS=false | [Comando único e prova em duas auditorias](../modules/audit/AUD_IMG_02_INTEGRATED_DEV_20261106.md): npm run dev, global_new com corte, validade renovável/NOLOGIN; polling e estado compacto | PR #101 draft; flag temporária no .env.local; escrita negada adicional ainda parcial por timeout; sem backfill/deploy |
| Checklist e suas evidências | apps/web/src/modules/audit/{InspectionChecklist.tsx,evidence.ts,useChecklistEvidence.ts,EvidenceImage.tsx,evidenceImages.ts}; cache neutro shared/privateImageCache.ts; RPCs begin/confirm/remove | [CHECKLIST_EVIDENCE_V1](../modules/audit/CHECKLIST_EVIDENCE_V1.md); [tráfego e proposta de derivados](../modules/audit/EVIDENCE_IMAGE_TRAFFIC.md); tests/integration/audit-evidence.mjs | AS-IS |
| Planos de Ação | apps/web/src/modules/action-plans/{api.ts,lifecycle.ts,ActionPlanPage.tsx} | schemas/migrations action_plans; [brief](../briefs/ACTION_PLAN_DOMAIN_V1.md); tests/action-plans*.test.*, tests/integration/action-plans.mjs | AS-IS |
| Evidências dos planos | apps/web/src/modules/action-plans/evidence.ts, PlanEvidence.tsx; begin/confirm/remove | [evidence brief](../briefs/EVIDENCE_STORAGE_V1.md); tests/integration/evidence.mjs | AS-IS |
| Relatórios / exportação | apps/web/src/modules/audit/reporting/{api.ts,workbook.ts,PrintSurface.tsx,download.ts} | [reporting brief](../briefs/AUDIT_EXPORT_REPORTING_V1.md); tests/audit-reporting*.test.*, tests/integration/reporting.mjs | AS-IS |
| Curva ABC v1 + áreas v2 (em PR) | apps/web/src/modules/abc/{AbcModule.tsx,AbcOverview.tsx,AbcImports.tsx,AbcCompare.tsx,AbcReports.tsx,AbcProducts.tsx,AbcCategories.tsx,AbcImport.tsx,AbcRevision.tsx,scope.tsx,charts.tsx,api.ts,import/*} | migrations 20261020120000_abc_domain_v1.sql e 20261021120000_abc_analytics_read_v1.sql; abc/abc_private, bucket abc-source-files; [brief](../briefs/ABC_DOMAIN_V1.md); tests/abc-*.test.*; tests/integration/abc.mjs | AS-IS integrado, aceite manual pendente |
| Unidade e imagens de capa | apps/web/src/core/unitCovers.ts, unitCoverImage.ts, apps/web/src/core/admin/UnitCoverEditor.tsx | [UNIT_COVER_V1](../modules/core/UNIT_COVER_V1.md); tests/integration/unit-cover.mjs | AS-IS |
| Infraestrutura mínima | infra/supabase/docker-compose.yml, scripts/ops/*, .github/workflows/infra-validate.yml | [infra/README](../../infra/README.md), [UPSTREAM](../../infra/supabase/UPSTREAM.md), ADR-006 Proposed | AS-IS **CI/lab**, NÃO PROD |
| Serviço privilegiado de criação/recuperação Auth | Nenhum runtime aprovado na main | [ACCOUNT_LIFECYCLE_V1](ACCOUNT_LIFECYCLE_V1.md), Issue #49; PR #24 fechado sem merge | **BLOQUEADO / DESIGN ONLY** |
| Agendamento de Salas AG-01/02/03 | apps/web/src/modules/rooms/; rota /rooms | migrations room_booking_foundation, room_booking_operations e room_booking_d5b_access; [separação D5-B e provisionamento](../modules/room-booking/D5B_ACCESS.md); [contrato e validação local](../modules/room-booking/AG02_AG03_LOCAL.md) | PR #88; funcional em desenvolvimento local, merge/homologação pendentes |
| Vendas / Maquininhas VEN-01/02/03/04A/04B | `sales` privado; `apps/web/src/modules/sales/`; `SalesModule`, `SalesPage`, `EntryEditor`, `SalesDashboardPage`, `DashboardCharts`; `/sales` como entrada, `/sales/entries` e `/sales/dashboard` no módulo Comercial expansível | mesmas sete RPCs; migration institucional `20261029180613`; `tests/sales-*`, job `sales-integration`; [operação](../modules/sales/VEN04A_OPERATIONS_UI.md) e [dashboard/matriz EQ01–22](../modules/sales/VEN04B_DASHBOARD_UI.md) | VEN-01/02/03/04A integradas #90–93; VEN-04B para revisão; não homologada |
| ISO, satisfação, frota, planejado-realizado, contratos | Sem integração desses domínios na main (ABC já integrada) | [roadmap de migração](../migration/MODULE_ROADMAP.md) e mapa de consumidores Core | **FUTURO** |

## Chamadas RPC representativas, verificadas nos adaptadores

| Domínio | Operações observadas | Notas |
| --- | --- | --- |
| Core/Sessão | my_access; leitura de profiles | Resolver permissões da sessão |
| Audit | units, inspection_summaries, create_inspection, finalize_inspection, reopen_inspection | Acesso por autorização/versão no backend |
| Checklist Evidence | checklist_evidence, checklist_evidence_pending_count, begin_checklist_evidence_upload, confirm_checklist_evidence_upload, remove_checklist_evidence | Reserva → Storage → confirmação |
| Action Plans | plan_summaries, creation_scopes, create_manual_plan, update_plan, set_plan_status, verify_plan | Dependências/transições regidas pelo domínio |
| Action Plan Evidence | plan_evidence, begin_evidence_upload, confirm_evidence_upload, remove_evidence | Bucket privado + download assinado |
| Curva ABC | units, unit_series, revision_detail, begin_source_upload, confirm_source_upload, publish_revision, record_file_check; v2 (leitura): overview, competency_products, product_history, compare, unit_revisions | Histórico imutável, upload privado e conferência posterior |

Este quadro é uma **amostra rastreada do frontend**, não um OpenAPI completo, autorização para chamada direta ou contrato de estabilidade de todas as assinaturas. As migrations SQL e as funções exportadas pelos adaptadores são a evidência executável; qualquer implementação nova exige consultar assinaturas/parâmetros reais e executar testes.

## Propriedade do dado

~~~mermaid
flowchart LR
  AUTH["auth — usuários/sessão"] --> CORE["core — perfis e escopos"]
  CORE --> AUD["audit — inspeções, respostas, checklist/evidence metadata"]
  CORE --> PLAN["action_plans — planos e evidence metadata"]
  AUD -. "origem rastreável de plano, contrato autorizado" .-> PLAN
  AUD --> S["Storage API — checklist-evidence"]
  PLAN --> S2["Storage API — action-plan-evidence"]
  CORE --> S3["Storage API — capas de unidade"]
  CORE --> ROOMS["room_booking — sala, pedidos e reservas privados"]
  API["public.room_booking_* — RPCs autorizadas"] --> ROOMS
  CORE --> ABC["abc — séries/revisões/linhas"]
  ABC --> S4["Storage API — abc-source-files"]
  CORE --> SALES["sales — agregados diários privados"]
  SALES_UI["Comercial /sales/entries — operações VEN-04A"] --> SALES_API
  SALES_DASH["Comercial /sales/dashboard — gerencial VEN-04B"] --> SALES_API
  SALES_API["public.sales_* — cinco RPCs VEN-02 + dashboard VEN-03 + referências VEN-04A"] --> SALES
~~~

Relações representam dependência/autorização, **não ownership compartilhado nem join livre**. Os quatro buckets privados e seus nomes/limites devem ser confirmados pelas migrations aplicáveis. **Audit (domínio de qualidade)** não é a mesma coisa que core.system_audit_log (trilha de segurança).

## Evidência e atualização

A evidência histórica de implementação fica em [QUALITY_COMPLETION_V1](../modules/audit/QUALITY_COMPLETION_V1.md) e briefs Core v2; a evidência de **aceite final** depende de [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md). Para cada funcionalidade nova, incluir neste mapa arquivo público, migration/RPC, grants/RLS, testes, usuário/fluxo e estado do gate. Não marcar implementação futura como presente por constar da navegação pretendida em [PRODUCT_STRUCTURE](PRODUCT_STRUCTURE.md).

GG-10 Entrega B: [persistência, autorização e fonte única](../modules/announcements/ADMINISTRATION_V1.md); migration append-only `20261105131548_announcements_administration.sql`; testes de domínio/API/UI e matriz real no CI existente.
