# Qualidade v1 — matriz factual e escopo restante

Revisão documental: 2026-09-29. Base: `main` em `3f158d36c6c087a560fd464e7c60bcdee2e7fae7` (merge da PR #5, fundação visual). Este retrato não inclui branches paralelas nem afirma que a plataforma esteja implantada em produção. E1–E3 e o contrato de relatórios foram aprovados pelo responsável de produto em 2026-09-29, no ajuste documental da PR #6; isso não altera o estado de implementação.

## Como ler

**Implementado** significa caminho funcional encontrado no código do commit, não homologação completa nem produção. **Parcialmente implementado** separa o que existe do restante. **Ausente** foi confirmado no inventário e nos caminhos relevantes de UI/API/migrations, não inferido de um brief antigo. **Decisão de produto necessária** identifica política ainda não aprovada; requisitos já aceitos não são reabertos.

Os documentos de origem comparam o legado v2.9.1 e Controle_Auditoria em `b916ba8`; isso não descreve o estado atual de Gaúcha Gestão. Briefs antigos com itens “fora de escopo” delimitam sua entrega original, não proíbem entregas posteriores.

## Matriz

Caminhos de UI abaixo são relativos a `apps/web/src/modules/`; migrations ficam em `supabase/migrations/` (prefixos 0001–0010 referem-se ao sufixo numérico dos arquivos datados).

| Área | Classificação | Evidência atual | Restante / aceite |
| --- | --- | --- | --- |
| Catálogo e scoring | Implementado | `audit/scoring.ts`, migrations `202609240004_audit_domain.sql`, `202609240005_audit_checklist_v1.sql`, `202609250010_audit_template_immutability.sql`; `tests/audit-scoring.test.ts`, `audit-database.test.ts` | Preservar 9 seções/158 critérios, números ausentes, NAP/score indefinido e imutabilidade; não refazer |
| Audit lifecycle | Implementado | `audit/api.ts`, `InspectionPage.tsx`, migrations 0004/0009: criar, responder, finalizar, reabrir; versões, score no banco, bloqueio após finalizar e log | Anexos futuros devem participar do bloqueio/finalização; reopen não é decisão pendente |
| Visão por unidade/histórico | Implementado | `AuditOverview.tsx`, `UnitHistory.tsx`, `audit.inspection_summaries` e `audit.units` | Exportar histórico ainda ausente; resumo limitado da overview não é fonte de exportação completa |
| Action Plans | Implementado | migration `202609240006_action_plans_domain.sql`, 0007; `action-plans/api.ts`, `ActionPlanPage.tsx`, `ActionPlansOverview.tsx` | Manual/checklist, AP/NAT idempotente, source_active, planejamento/execução/verificação e escopo próprio; novas origens fora de v1 |
| Action Plan Evidence | Implementado | migration `202609250008_action_plans_evidence.sql`; `action-plans/evidence.ts`, `PlanEvidence.tsx`; RPCs begin/confirm/remove/list, Storage privado, rounds e expected evidence IDs | Preservar locks de execução/verificação, 10 MiB/20 itens e remoção lógica; não confundir com anexo de critério |
| Checklist evidence/attachments | Ausente | Inventário Audit contém catálogo/inspeções/respostas; `ChecklistItem.tsx`, `InspectionPage.tsx`, `api.ts` sem upload/lista de arquivos; único bucket/metadados de evidências em 0008 pertence a Action Plans | Implementar [Audit Checklist Evidence v1](../../briefs/AUDIT_CHECKLIST_EVIDENCE_V1.md), conforme E1–E3 aprovadas |
| Exports/reporting | Parcialmente implementado | `audit.inspection.export` existe em `202609240002_permission_catalog.sql`; resumos/dados de leitura existem | Geração XLSX de inspeção/histórico, report RPCs e impressão/PDF próprios estão ausentes nos caminhos Audit. Três saídas aprovadas; [brief](../../briefs/AUDIT_EXPORT_REPORTING_V1.md) |
| UI/UX | Parcialmente implementado | Páginas funcionais Audit/Action Plans/Evidence; PR #5 integra tokens, shell e Shared. `InspectionPage.tsx` ainda usa seletor nativo; `PlanEvidence.tsx` mantém fluxo funcional existente | Fases 2–3 de QUALITY_UI_V1.md e homologação visual/mobile continuam separadas. Não editar esse brief nesta tarefa |
| Autorização/RLS | Implementado para recursos existentes | Core 0001–0003; Audit 0004/0009; Action Plans 0006/0007; Storage/evidence 0008. Escopo unitário vs setor, inactive deny, grants restritos e reautorização após locks | Novos anexos/export APIs ainda precisam de políticas/testes próprios; permissão export seed não prova enforcement de exportação |
| Testes automatizados | Implementado para fluxos existentes | `tests/audit-*`, `action-plans-*`, `evidence-client.test.ts`, `evidence-backfill.test.ts`; integrações `audit.mjs`, `action-plans.mjs`, `evidence.mjs`; workflow `validate.yml` | Novas funcionalidades terão testes novos; não há alegação de executar essas suítes nesta revisão documental |
| Mobile real | Parcialmente implementado/validado | Integrações existentes usam Chromium a 375px com Auth/Data API/Storage; assertions de overflow e fluxo | Emulação não comprova iOS Safari/Android Chrome físicos. Aceites manuais e captura/download permanecem necessários |
| Segurança dos arquivos | Parcialmente implementado | RPC/bucket validam tamanho/MIME/extensão; cliente `checkFile` valida assinatura; URLs 60s, attachment-only e remoção lógica | Bytes não são atestados pelo servidor; ZIP magic não distingue OOXML seguro. E3 aprovada aceita explicitamente o risco residual no novo Audit; arquivos continuam não confiáveis, sem preview inline e com download attachment; nosniff/cache/EXIF têm limites explícitos |
| Produção/operação | Parcialmente documentado; operação não verificada | ADR-004, BACKUP_RECOVERY.md e gates de EVIDENCE_STORAGE_V1.md; 0008 contém função privada de reconciliação | Não foi inspecionado servidor/deploy. Exigir evidências de backup independente, restore com download, RPO/RTO/retenção, cabeçalhos, alertas, runbook e autorização operacional; não marcar infraestrutura como inexistente |
| Política de checklist evidence | Decisões de produto aprovadas; implementação ausente | E1–E3 aprovadas em 2026-09-29: anexos opcionais, 10 MiB/arquivo, 10 ativos/critério e 100/auditoria; edição após reopen; risco residual de bytes/EXIF aceito | Implementar conforme o brief, preservando restrições, histórico e IDs disponíveis de cada finalização |

## Evidência de CI disponível

Consultados os checks do SHA-base em 2026-09-29: `validate` e `action-plans-integration` concluídos com `success` em 2026-09-28. [Execução 36416492152](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/36416492152).

O workflow inspecionado executa typecheck, lint, unit tests, build/verify:build e integrações reais locais de Action Plans, Evidence e Audit (Storage habilitado; Chromium). Isso comprova o resultado registrado da CI nesse commit; não constitui execução local nova, teste físico de celular, restore de produção ou aceite operacional. `npm run test:rls` isoladamente roda apenas `tests/database.test.ts`, não toda a cobertura de domínio.

## Inconsistências documentais corrigidas

| Documento | Inconsistência | Correção |
| --- | --- | --- |
| README.md, AGENTS.md | Apenas arquitetura/fundação | Identifica domínios implementados e aponta esta matriz |
| LOCAL_FOUNDATION.md | Planos/Evidências não implementados; lista de schemas incompleta | Separa evidências dos planos de anexos Audit e descreve cobertura real de CI/stubs |
| FOUNDATION_GATES.md | Reopen/brief Audit/event model/file rules como decisões ainda iniciais | Referencia contratos/migrations existentes; mantém pendências operacionais sem inferir produção |
| OVERVIEW.md | RBAC, catálogo e Core físico abertos; attachment metadata como candidato Core | Remete a ADR-005/migrations e ownership por módulo, inclui Action Plans transversal |
| SECURITY.md | Autenticação ainda não selecionada | Supabase Auth conforme ADR-004/005 e implementação |
| AUDIT_SOURCE_OF_TRUTH.md, MIGRATION_MAP.md | Estado legado podia ser confundido com plataforma atual | Adiciona contexto temporal, decisões resolvidas e links para os briefs, preservando proveniência histórica |

Os três briefs de domínio anteriores permanecem como contratos das respectivas fatias; suas exclusões de anexos/exportações não significam exclusão do módulo completo. QUALITY_UI_V1.md permanece intocado.

## Escopo restante fechado por entregas

1. **Checklist Evidence:** contrato Audit próprio, autorização/lifecycle, upload/download/remoção, finalização consistente, recuperação e testes. E1–E3 estão aprovadas, sem pendência de decisão de produto/segurança para esse contrato; nenhuma dependência de internals de Action Plans.
2. **Export & Reporting:** Excel da inspeção, Excel do histórico e impressão/PDF preservados. Dataset no servidor com read+export e renderização no cliente, conteúdo/testes definidos. Independente dos anexos e sem dados de Action Plans.
3. **UI/UX:** continuar as fases já previstas no brief visual, em trabalho separado. Conciliar os componentes de anexos/relatórios com a UI existente quando implementados.
4. **Aceite integrado:** rodar regressão dos três domínios, novas suítes, permissões/revogação/concorrência, conteúdo exportado e mobile real. Registrar resultados por commit; não fechar apenas porque existem testes.
5. **Liberação operacional:** responsabilidade do processo de produção, separada desta PR; exigir os gates documentados e aprovação humana de rollout.

Não entram: novos módulos/origens, Realtime, arquivo portátil ZIP, importação de legado, dashboards executivos, export de Action Plans, infraestrutura, servidor, Cloudflare, Supabase self-hosted, deploy ou produção. Unit cover/banner do legado não é retomado como novo recurso nesta rodada; eventual requisito funcional além da direção visual atual precisa de decisão própria.

## Decisões aprovadas e pendências operacionais

- **E1 aprovada:** anexos opcionais; máximo 10 MiB por arquivo, 10 arquivos ativos por critério e 100 por auditoria.
- **E2 aprovada:** após reopen, o conjunto atual volta a ser editável com `audit.inspection.edit`; evidências existentes permanecem, removidas mantêm registro histórico e não são restauradas automaticamente. Cada finalização registra os IDs das evidências disponíveis naquele momento; sem navegador de revisões históricas em v1.
- **E3 aprovada para v1:** risco residual da validação de bytes no cliente e preservação de EXIF explicitamente aceito. Arquivos continuam não confiáveis, sem preview inline, download como attachment e tipos/tamanho/MIME/extensão restritos. Não declarar antivírus, sanitização ou validação de bytes no servidor. Validação/quarentena confiável fica como evolução futura separada.
- **Relatórios aprovados:** conteúdo especificado, Excel da inspeção, Excel do histórico, impressão/save-as-PDF pelo navegador e máximo 5.000 summaries por geração. Sem PDF server-side, assinatura digital ou armazenamento de relatórios em v1.
- **Operação:** dono, retenção/purge, RPO/RTO, comprovação de restore e liberação de produção. Não supor que ausência de evidência neste repositório significa ausência de configuração no servidor.

E1–E3 e relatórios não têm mais decisões de aprovação pendentes. Este único ajuste documental adicional registra as aprovações e aguarda revisão da PR; não implementa recursos, não declara Qualidade funcionalmente completo e não autoriza produção.
