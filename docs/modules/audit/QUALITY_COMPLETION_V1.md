# Qualidade v1 — matriz factual e escopo restante

Revisão documental: 2026-09-30 sobre `main` em `db35fa5088adcd98ef758cd211c80159f0ff8169`, o merge da PR #9 (Audit Export & Reporting) em 2026-09-29, que já inclui a PR #8 (Admin polish). O desenvolvimento de reporting começou sobre `74f7d2be7e946a8d36f27aac3b6aba22de92cc06` e foi validado sobre `516b59b505eafe12ecf5dc578a1b529384cde4fb` antes do merge. Este retrato não afirma que a plataforma esteja implantada em produção. E1–E3 e o contrato de relatórios foram aprovados em 2026-09-29.

## Como ler

**Implementado** significa caminho funcional encontrado no código do commit, não homologação completa nem produção. **Parcialmente implementado** separa o que existe do restante. **Ausente** foi confirmado no inventário e nos caminhos relevantes de UI/API/migrations, não inferido de um brief antigo. **Decisão de produto necessária** identifica política ainda não aprovada; requisitos já aceitos não são reabertos.

Os documentos de origem comparam o legado v2.9.1 e Controle_Auditoria em `b916ba8`; isso não descreve o estado atual de Gaúcha Gestão. Briefs antigos com itens “fora de escopo” delimitam sua entrega original, não proíbem entregas posteriores.

## Matriz

Caminhos de UI abaixo são relativos a `apps/web/src/modules/`; migrations ficam em `supabase/migrations/` (prefixos 0001–0010 referem-se ao sufixo numérico dos arquivos datados).

| Área | Classificação | Evidência atual | Restante / aceite |
| --- | --- | --- | --- |
| Catálogo e scoring | Implementado | `audit/scoring.ts`, migrations `202609240004_audit_domain.sql`, `202609240005_audit_checklist_v1.sql`, `202609250010_audit_template_immutability.sql`; `tests/audit-scoring.test.ts`, `audit-database.test.ts` | Preservar 9 seções/158 critérios, números ausentes, NAP/score indefinido e imutabilidade; não refazer |
| Audit lifecycle | Implementado | `audit/api.ts`, `InspectionPage.tsx`, migrations 0004/0009: criar, responder, finalizar, reabrir; versões, score no banco, bloqueio após finalizar e log | Anexos futuros devem participar do bloqueio/finalização; reopen não é decisão pendente |
| Visão por unidade/histórico | Implementado | `AuditOverview.tsx`, `UnitHistory.tsx`, `audit.inspection_summaries` e `audit.units`; RPC de exportação usa conjunto completo e filtros inclusivos | Overview mantém seu resumo limitado para a tela; não serve de fonte ao relatório |
| Action Plans | Implementado | migration `202609240006_action_plans_domain.sql`, 0007; `action-plans/api.ts`, `ActionPlanPage.tsx`, `ActionPlansOverview.tsx` | Manual/checklist, AP/NAT idempotente, source_active, planejamento/execução/verificação e escopo próprio; novas origens fora de v1 |
| Action Plan Evidence | Implementado | migration `202609250008_action_plans_evidence.sql`; `action-plans/evidence.ts`, `PlanEvidence.tsx`; RPCs begin/confirm/remove/list, Storage privado, rounds e expected evidence IDs | Preservar locks de execução/verificação, 10 MiB/20 itens e remoção lógica; não confundir com anexo de critério |
| Checklist evidence/attachments | Ausente | Inventário Audit contém catálogo/inspeções/respostas; `ChecklistItem.tsx`, `InspectionPage.tsx`, `api.ts` sem upload/lista de arquivos; único bucket/metadados de evidências em 0008 pertence a Action Plans | Implementar [Audit Checklist Evidence v1](../../briefs/AUDIT_CHECKLIST_EVIDENCE_V1.md), conforme E1–E3 aprovadas |
| Exports/reporting | Implementado e integrado na `main` (PR #9); aceite físico pendente | Migration `20260929172805_audit_export_reporting_v1.sql`; `audit/reporting/`, ações em `InspectionPage.tsx`/`UnitHistory.tsx`; XLSX de inspeção/histórico e print surface dedicada; benchmark representativo de 5.000 em `tests/performance/reporting-history.mjs` | Impressão/salvamento em iOS Safari e Android Chrome pendentes; [brief](../../briefs/AUDIT_EXPORT_REPORTING_V1.md) |
| UI/UX | Fases 2–3 integradas; aceite móvel pendente | Páginas Audit/Action Plans/Evidence e navegação por seções no `InspectionPage.tsx` pós-PR #7; filtros/ações de relatório na PR #9 | Verificação manual de dispositivo real e PDF físico; `InspectionPage.tsx` não usa mais `<select>` |
| Autorização/RLS | Implementado para recursos existentes e reporting | Core 0001–0003; Audit 0004/0009 e migration incremental de reporting; Action Plans 0006/0007; Storage/evidence 0008. Reporting repete read+export na mesma unidade, default deny e EXECUTE autenticado | Anexos de checklist ainda exigem políticas próprias; integração JWT do relatório passou na CI da PR #9 e da `main` `db35fa5` |
| Testes automatizados | Implementado para reporting | PGlite, workbook independente/ZIP, print DOM e estado de salvamento em `audit-reporting-*`; integração `reporting.mjs` e navegação/375px/download em `audit.mjs` no workflow; `admin.mjs` (Admin UI a 375/768/1024/1440) também no workflow | Integrações Supabase rodam no runner descartável da CI, não no stack local da estação de revisão; testes físicos aguardam registro |
| Mobile real | Parcialmente implementado/validado | Integração Audit passa a testar print portal e XLSX em Chromium a 375px | Emulação não comprova iOS Safari/Android Chrome físicos. Aceites manuais e captura/download permanecem necessários |
| Segurança dos arquivos | Parcialmente implementado | RPC/bucket validam tamanho/MIME/extensão; cliente `checkFile` valida assinatura; URLs 60s, attachment-only e remoção lógica | Bytes não são atestados pelo servidor; ZIP magic não distingue OOXML seguro. E3 aprovada aceita explicitamente o risco residual no novo Audit; arquivos continuam não confiáveis, sem preview inline e com download attachment; nosniff/cache/EXIF têm limites explícitos |
| Produção/operação | Parcialmente documentado; operação não verificada | ADR-004, BACKUP_RECOVERY.md e gates de EVIDENCE_STORAGE_V1.md; 0008 contém função privada de reconciliação | Não foi inspecionado servidor/deploy. Exigir evidências de backup independente, restore com download, RPO/RTO/retenção, cabeçalhos, alertas, runbook e autorização operacional; não marcar infraestrutura como inexistente |
| Política de checklist evidence | Decisões de produto aprovadas; implementação ausente | E1–E3 aprovadas em 2026-09-29: anexos opcionais, 10 MiB/arquivo, 10 ativos/critério e 100/auditoria; edição após reopen; risco residual de bytes/EXIF aceito | Implementar conforme o brief, preservando restrições, histórico e IDs disponíveis de cada finalização |

## Evidência de CI disponível

Checks da `main` `db35fa5088adcd98ef758cd211c80159f0ff8169` (merge da PR #9): `validate` e `action-plans-integration` concluídos com `success` na [execução 36626158089](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/36626158089).

O workflow executa typecheck, lint, unit tests, build/verify:build e integrações reais locais de Action Plans, Evidence, Reporting, Audit e Admin UI (Storage habilitado; Chromium), no runner descartável em `127.0.0.1`. Sobre `db35fa5`, `npm ci`, typecheck, lint, `npm test` (16 arquivos, 165 testes), build com variáveis públicas fictícias, verify:build e `npm audit --omit=dev` (0 vulnerabilidades) passaram localmente em 2026-09-30; as integrações não foram rodadas no stack local da estação, que contém dados de desenvolvimento. Na execução da `main`, o Storage local respondeu sem `Cache-Control` e sem `X-Content-Type-Options` no download de evidência; conforme EVIDENCE_STORAGE_V1.md, isso mantém nosniff/cache como gate de produção. Nenhum resultado de CI é teste físico de celular, restore de produção ou aceite operacional. `npm run test:rls` isoladamente roda apenas `tests/database.test.ts`.

## Fechamento — pendências finais

Retrato de `db35fa5`. Classifica o que os contratos existentes já exigem; não cria requisitos nem escolhe valores operacionais. "Bloqueia produção" segue os gates de FOUNDATION_GATES.md (6–9), EVIDENCE_STORAGE_V1.md e os critérios de aceite dos briefs. Nenhum item abaixo bloqueia o merge de uma funcionalidade isolada, desde que a respectiva CI passe e o item continue registrado.

| Item | Já automatizado | Exige dispositivo físico | Exige evidência operacional | Bloqueia produção / fechamento | Contrato |
| --- | --- | --- | --- | --- | --- |
| Checklist Evidence | Não: ausente na `main` | Sim, após implementar | Sim, backup/restore dos objetos | Sim: Qualidade v1 incompleta sem ele | AUDIT_CHECKLIST_EVIDENCE_V1.md |
| iOS Safari real | Parcial: Chromium emulado a 375px (Audit, Action Plans, Evidence) e Admin a 375–1440 | Sim | Registro de navegador/dispositivo/resultado | Sim: aceite mobile | AUDIT_EXPORT_REPORTING_V1.md, AUDIT_CHECKLIST_EVIDENCE_V1.md |
| Android Chrome real | Parcial: idem | Sim | Registro de navegador/dispositivo/resultado | Sim: aceite mobile | idem |
| XLSX save/open real | Parcial: download e leitura independente do workbook em Chromium/testes | Sim: salvar e abrir no aparelho | Registro | Sim: aceite de reporting | AUDIT_EXPORT_REPORTING_V1.md |
| Print/save-to-PDF real | Parcial: print portal renderizado em Chromium a 375px e DOM de impressão em testes unitários | Sim: impressão/compartilhar como PDF | Registro | Sim: aceite de reporting | AUDIT_EXPORT_REPORTING_V1.md |
| Camera/galeria/arquivos do Evidence | Parcial: upload/download/rejeição de assinatura falsa em Chromium 375px (Action Plans) | Sim: câmera, galeria e arquivos (Action Plans e, futuramente, checklist) | Registro | Sim: aceite mobile | EVIDENCE_STORAGE_V1.md, AUDIT_CHECKLIST_EVIDENCE_V1.md |
| Backup independente de DB + objetos | Não | Não | Sim: ferramenta, destino e cópia independente com credenciais separadas | Sim | Gate 8, BACKUP_RECOVERY.md, EVIDENCE_STORAGE_V1.md |
| Restore com downloads reais | Não | Não | Sim: restore DB em T + objetos, reconciliação e downloads autorizados/negação cruzada em ambiente isolado | Sim | Gate 8, AUDIT_CHECKLIST_EVIDENCE_V1.md |
| RPO/RTO | Não | Não | Sim: valores definidos pelo dono operacional (não escolhidos aqui) | Sim | Gate 8 |
| Retenção | Não | Não | Sim: backup, log do sistema e objetos removidos; sem prazo inventado | Sim | Gates 6–8, EVIDENCE_STORAGE_V1.md |
| Purge: autorização e runbook | Não | Não | Sim: registro de autorização humana, remoção via Storage API e evento de auditoria | Sim | Gates 6–7, EVIDENCE_STORAGE_V1.md |
| nosniff/cache | Observado na CI: Storage local sem `X-Content-Type-Options` e sem `Cache-Control` | Não | Sim: garantir no Storage/edge e bypass de cache de CDN | Sim | EVIDENCE_STORAGE_V1.md |
| Monitoramento da reconciliação | Parcial: função privada de reconciliação testada na integração Evidence | Não | Sim: execução agendada com alerta | Sim | EVIDENCE_STORAGE_V1.md, Gate 6 |
| Observabilidade/rollback | Não | Não | Sim: métricas, health checks, alertas e procedimento de rollback | Sim | Gate 9 |

Já automatizado e fora desta lista de pendências: Core/RLS, Audit lifecycle/scoring, Action Plans, Action Plan Evidence, reporting (RPC/JWT/XLSX/print DOM) e Admin UI responsiva, na CI com PGlite e Supabase local descartável. Isso não substitui os aceites acima.

## Inconsistências documentais corrigidas

| Documento | Inconsistência | Correção |
| --- | --- | --- |
| README.md, AGENTS.md | Apenas arquitetura/fundação | Identifica domínios implementados e aponta esta matriz |
| LOCAL_FOUNDATION.md | Planos/Evidências não implementados; lista de schemas incompleta | Separa evidências dos planos de anexos Audit e descreve cobertura real de CI/stubs |
| FOUNDATION_GATES.md | Reopen/brief Audit/event model/file rules como decisões ainda iniciais | Referencia contratos/migrations existentes; mantém pendências operacionais sem inferir produção |
| OVERVIEW.md | RBAC, catálogo e Core físico abertos; attachment metadata como candidato Core | Remete a ADR-005/migrations e ownership por módulo, inclui Action Plans transversal |
| SECURITY.md | Autenticação ainda não selecionada | Supabase Auth conforme ADR-004/005 e implementação |
| FOUNDATION_GATES.md, LOCAL_FOUNDATION.md, AUDIT_EXPORT_REPORTING_V1.md, AUDIT_CHECKLIST_EVIDENCE_V1.md (2026-09-30) | PR #9 descrita como sem merge ou reporting pendente; baseline antiga do Checklist Evidence | Reporting integrado na `main` `db35fa5`; baseline de implementação do Checklist Evidence em `db35fa5`, ainda não implementado |
| AUDIT_SOURCE_OF_TRUTH.md, MIGRATION_MAP.md | Estado legado podia ser confundido com plataforma atual | Adiciona contexto temporal, decisões resolvidas e links para os briefs, preservando proveniência histórica |

Os três briefs de domínio anteriores permanecem como contratos das respectivas fatias; suas exclusões de anexos/exportações não significam exclusão do módulo completo. QUALITY_UI_V1.md permanece intocado.

## Escopo restante fechado por entregas

1. **Checklist Evidence:** contrato Audit próprio, autorização/lifecycle, upload/download/remoção, finalização consistente, recuperação e testes. E1–E3 estão aprovadas, sem pendência de decisão de produto/segurança para esse contrato; nenhuma dependência de internals de Action Plans.
2. **Export & Reporting:** a PR #9 preserva Excel da inspeção, Excel do histórico e impressão/PDF no navegador, independente dos anexos e sem dados de Action Plans. Integrado na `main` em 2026-09-29 (`db35fa5`); aguarda aceite em dispositivos reais.
3. **UI/UX:** fases 2–3 já integradas na base; conciliar Checklist Evidence com a UI quando for implementado e registrar homologação visual/mobile.
4. **Aceite integrado:** preservar o resultado da regressão em CI dos três domínios, reporting JWT/concorrência, conteúdo exportado e registrar mobile real; não fechar apenas porque existem testes.
5. **Liberação operacional:** responsabilidade do processo de produção, separada desta PR; exigir os gates documentados e aprovação humana de rollout.

Não entram: novos módulos/origens, Realtime, arquivo portátil ZIP, importação de legado, dashboards executivos, export de Action Plans, infraestrutura, servidor, Cloudflare, Supabase self-hosted, deploy ou produção. Unit cover/banner do legado não é retomado como novo recurso nesta rodada; eventual requisito funcional além da direção visual atual precisa de decisão própria.

## Decisões aprovadas e pendências operacionais

- **E1 aprovada:** anexos opcionais; máximo 10 MiB por arquivo, 10 arquivos ativos por critério e 100 por auditoria.
- **E2 aprovada:** após reopen, o conjunto atual volta a ser editável com `audit.inspection.edit`; evidências existentes permanecem, removidas mantêm registro histórico e não são restauradas automaticamente. Cada finalização registra os IDs das evidências disponíveis naquele momento; sem navegador de revisões históricas em v1.
- **E3 aprovada para v1:** risco residual da validação de bytes no cliente e preservação de EXIF explicitamente aceito. Arquivos continuam não confiáveis, sem preview inline, download como attachment e tipos/tamanho/MIME/extensão restritos. Não declarar antivírus, sanitização ou validação de bytes no servidor. Validação/quarentena confiável fica como evolução futura separada.
- **Relatórios aprovados:** conteúdo especificado, Excel da inspeção, Excel do histórico, impressão/save-as-PDF pelo navegador e máximo 5.000 summaries por geração. Sem PDF server-side, assinatura digital ou armazenamento de relatórios em v1.
- **Operação:** dono, retenção/purge, RPO/RTO, comprovação de restore e liberação de produção. Não supor que ausência de evidência neste repositório significa ausência de configuração no servidor.

E1–E3 e relatórios não têm decisões de produto pendentes. Reporting está integrado na `main` (PR #9); Checklist Evidence, aceite físico/mobile integrado e operação continuam pendentes. Não declarar Qualidade 100% nem autorizar produção com base nesta matriz.
