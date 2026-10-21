# Mapa rastreável: funcionalidades, contratos e código

**Fotografia:** main após PR #69 (`fed0e0f`, 20/10/2026). Inventário de arquivos/contratos, **não relatório de aprovação de deploy ou de testes executados agora**.

## Limites da implementação atual

| Superfície | Implementação encontrada | Contratos/DDL e testes correspondentes | Estado |
| --- | --- | --- | --- |
| Shell, login e navegação | apps/web/src/app/{App.tsx,navigation.ts}; core/auth/{AuthProvider.tsx,Login.tsx}; core/client.ts | core.profiles, core.my_access, [autorização](AUTHORIZATION.md); tests/login.test.tsx, tests/authorization.test.ts | AS-IS |
| Administração Core | apps/web/src/core/admin/ (usuários, papéis, permissões, unidades, setores, logs, revisões de acesso) | supabase/migrations/*core*.sql; [ACCESS_GOVERNANCE_READ](../modules/core/ACCESS_GOVERNANCE_READ_V1.md); tests/admin*.test.*, tests/integration/admin.mjs | AS-IS |
| Auditorias | apps/web/src/modules/audit/; api.ts (create_inspection, finalize_inspection, reopen_inspection, inspection_summaries), scoring.ts | supabase/migrations/*audit*.sql; [fonte funcional](../modules/audit/AUDIT_SOURCE_OF_TRUTH.md); tests/audit*.test.*, tests/integration/audit.mjs | AS-IS |
| Checklist e suas evidências | apps/web/src/modules/audit/{InspectionChecklist.tsx,evidence.ts,useChecklistEvidence.ts}; RPCs begin/confirm/remove | [CHECKLIST_EVIDENCE_V1](../modules/audit/CHECKLIST_EVIDENCE_V1.md); tests/integration/audit-evidence.mjs | AS-IS |
| Planos de Ação | apps/web/src/modules/action-plans/{api.ts,lifecycle.ts,ActionPlanPage.tsx} | schemas/migrations action_plans; [brief](../briefs/ACTION_PLAN_DOMAIN_V1.md); tests/action-plans*.test.*, tests/integration/action-plans.mjs | AS-IS |
| Evidências dos planos | apps/web/src/modules/action-plans/evidence.ts, PlanEvidence.tsx; begin/confirm/remove | [evidence brief](../briefs/EVIDENCE_STORAGE_V1.md); tests/integration/evidence.mjs | AS-IS |
| Relatórios / exportação | apps/web/src/modules/audit/reporting/{api.ts,workbook.ts,PrintSurface.tsx,download.ts} | [reporting brief](../briefs/AUDIT_EXPORT_REPORTING_V1.md); tests/audit-reporting*.test.*, tests/integration/reporting.mjs | AS-IS |
| Curva ABC v1 + áreas v2 (em PR) | apps/web/src/modules/abc/{AbcModule.tsx,AbcOverview.tsx,AbcImports.tsx,AbcCompare.tsx,AbcReports.tsx,AbcProducts.tsx,AbcCategories.tsx,AbcImport.tsx,AbcRevision.tsx,scope.tsx,charts.tsx,api.ts,import/*} | migrations 20261020120000_abc_domain_v1.sql e 20261021120000_abc_analytics_read_v1.sql; abc/abc_private, bucket abc-source-files; [brief](../briefs/ABC_DOMAIN_V1.md); tests/abc-*.test.*; tests/integration/abc.mjs | AS-IS integrado, aceite manual pendente |
| Unidade e imagens de capa | apps/web/src/core/unitCovers.ts, unitCoverImage.ts, apps/web/src/core/admin/UnitCoverEditor.tsx | [UNIT_COVER_V1](../modules/core/UNIT_COVER_V1.md); tests/integration/unit-cover.mjs | AS-IS |
| Infraestrutura mínima | infra/supabase/docker-compose.yml, scripts/ops/*, .github/workflows/infra-validate.yml | [infra/README](../../infra/README.md), [UPSTREAM](../../infra/supabase/UPSTREAM.md), ADR-006 Proposed | AS-IS **CI/lab**, NÃO PROD |
| Serviço privilegiado de criação/recuperação Auth | Nenhum runtime aprovado na main | [ACCOUNT_LIFECYCLE_V1](ACCOUNT_LIFECYCLE_V1.md), Issue #49; PR #24 fechado sem merge | **BLOQUEADO / DESIGN ONLY** |
| ISO, vendas, satisfação, salas, frota, planejado-realizado, contratos | Sem integração desses domínios na main (ABC já integrada) | [roadmap de migração](../migration/MODULE_ROADMAP.md) e mapa de consumidores Core | **FUTURO** |

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
  CORE --> ABC["abc — séries/revisões/linhas"]
  ABC --> S4["Storage API — abc-source-files"]
~~~

Relações representam dependência/autorização, **não ownership compartilhado nem join livre**. Os quatro buckets privados e seus nomes/limites devem ser confirmados pelas migrations aplicáveis. **Audit (domínio de qualidade)** não é a mesma coisa que core.system_audit_log (trilha de segurança).

## Evidência e atualização

A evidência histórica de implementação fica em [QUALITY_COMPLETION_V1](../modules/audit/QUALITY_COMPLETION_V1.md) e briefs Core v2; a evidência de **aceite final** depende de [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md). Para cada funcionalidade nova, incluir neste mapa arquivo público, migration/RPC, grants/RLS, testes, usuário/fluxo e estado do gate. Não marcar implementação futura como presente por constar da navegação pretendida em [PRODUCT_STRUCTURE](PRODUCT_STRUCTURE.md).
