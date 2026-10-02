# Qualidade v1 — matriz factual e escopo restante

Revisão documental: 2026-10-02 sobre `main` em `32540028119ecd0ac13bcec13d69c1d55e67d834`, após PR #17 (Login v3 · Elo) e PR #16 (stack self-hosted mínimo reproduzível). O software funcional e o hardening da Qualidade v1 continuam os mesmos contratos já integrados; esta revisão sincroniza baseline, CI e o fechamento visual/documental. A CI de aplicação pós-merge passou em `37012575081` e a CI de infraestrutura reproduzível em `37012575111`. Nenhuma delas comprova produção. O checklist operacional/físico nominal P1–P9/O1–O8 está em [QUALITY_ACCEPTANCE_V1.md](QUALITY_ACCEPTANCE_V1.md).

## Estado pós-PR #14

| Frente | Estado |
| --- | --- |
| Software funcional da Qualidade v1 | Concluído |
| Hardening pré-homologação | Concluído e integrado pela PR #14 |
| CI da `main` | Verde: execução `37012575081` em `32540028119ecd0ac13bcec13d69c1d55e67d834` |
| Homologação física P1–P9 | Pendente |
| Prontidão operacional O1–O8 | Pendente/parcial; classificação abaixo |
| Production ready | **NÃO** |

A PR #14 concluiu o hardening de touch targets/mobile, o tratamento do limite >5.000 no Reporting, a preservação dos códigos de erro de Checklist Evidence, a proteção visual de finalize/reopen durante reload e o teste concorrente reforçado de Reporting. Os contratos funcionais existentes permanecem os mesmos.

### Classificação operacional da auditoria atual

| Item | Estado |
| --- | --- |
| O1 | PARTIAL |
| O2 | UNKNOWN / requires environment check |
| O3 | OPEN |
| O4 | OPEN |
| O5 | PARTIAL |
| O6 | PARTIAL |
| O7 | OPEN |
| O8 | OPEN |

O1 permanece PARTIAL: responsáveis e janela provisória foram definidos, mas faltam RPO/RTO numéricos e retenções. O2 continua exigindo verificação do ambiente real; a PR #16 validou somente um stack descartável/reproduzível e não fecha esse gate. Decisões/provisões operacionais e o requisito de preservação dos dados confirmados como salvos estão em [Backup and Recovery](../../architecture/BACKUP_RECOVERY.md#operational-decisions-and-provisions--2026-10-01). A infraestrutura esperada ligada 24x7 não comprova disponibilidade nem atendimento contínuo.

## Como ler

**Implementado** significa caminho funcional encontrado no código do commit, não homologação completa nem produção. **Parcialmente implementado** separa o que existe do restante. **Ausente** foi confirmado no inventário e nos caminhos relevantes de UI/API/migrations, não inferido de um brief antigo. **Decisão de produto necessária** identifica política ainda não aprovada; requisitos já aceitos não são reabertos.

Os documentos de origem comparam o legado v2.9.1 e Controle_Auditoria em `b916ba8`; isso não descreve o estado atual de Gaúcha Gestão. Briefs antigos com itens “fora de escopo” delimitam sua entrega original, não proíbem entregas posteriores.

## Matriz

Caminhos de UI abaixo são relativos a `apps/web/src/modules/`; migrations ficam em `supabase/migrations/` (prefixos 0001–0010 referem-se ao sufixo numérico dos arquivos datados).

| Área | Classificação | Evidência atual | Restante / aceite |
| --- | --- | --- | --- |
| Catálogo e scoring | Implementado | `audit/scoring.ts`, migrations `202609240004_audit_domain.sql`, `202609240005_audit_checklist_v1.sql`, `202609250010_audit_template_immutability.sql`; `tests/audit-scoring.test.ts`, `audit-database.test.ts` | Preservar 9 seções/158 critérios, números ausentes, NAP/score indefinido e imutabilidade; não refazer |
| Audit lifecycle | Implementado | `audit/api.ts`, `InspectionPage.tsx`, migrations 0004/0009 e Checklist Evidence: criar, responder, finalizar, reabrir; versões, score no banco, bloqueio após finalizar e log | Finalização já vincula atomicamente o conjunto completo de evidências disponíveis; reopen não é decisão pendente |
| Visão por unidade/histórico | Implementado | `AuditOverview.tsx`, `UnitHistory.tsx`, `audit.inspection_summaries` e `audit.units`; PR #13 pagina `inspection_summaries` em blocos de 500, com ordenação determinística, deduplicação e falha total se uma página falhar; RPC de exportação usa conjunto completo e filtros inclusivos | Paginação por offset não é snapshot entre páginas, mas remove o truncamento determinístico do limite Data API; overview mantém seu resumo server-side e não serve de fonte ao relatório |
| Action Plans | Implementado | migration `202609240006_action_plans_domain.sql`, 0007; `action-plans/api.ts`, `ActionPlanPage.tsx`, `ActionPlansOverview.tsx` | Manual/checklist, AP/NAT idempotente, source_active, planejamento/execução/verificação e escopo próprio; novas origens fora de v1 |
| Action Plan Evidence | Implementado | migration `202609250008_action_plans_evidence.sql`; `action-plans/evidence.ts`, `PlanEvidence.tsx`; RPCs begin/confirm/remove/list, Storage privado, rounds e expected evidence IDs | Preservar locks de execução/verificação, 10 MiB/20 itens e remoção lógica; não confundir com anexo de critério |
| Checklist evidence/attachments | Implementado e integrado na `main` (PR #11); aceite físico/operacional pendente | Migration `20260930114000_audit_checklist_evidence_v1.sql`; `audit.checklist_evidence`, bucket privado `audit-checklist-evidence`, `audit/evidence.ts`, UI por critério e suíte `audit-evidence.mjs`; finalização exige o conjunto completo esperado | Validar câmera/galeria/arquivos e downloads em iOS Safari/Android Chrome físicos; cumprir backup/restore, headers, retenção, reconciliação e demais gates operacionais |
| Exports/reporting | Implementado e integrado na `main` (PR #9); aceite físico pendente | Migration `20260929172805_audit_export_reporting_v1.sql`; `audit/reporting/`, ações em `InspectionPage.tsx`/`UnitHistory.tsx`; XLSX de inspeção/histórico e print surface dedicada; benchmark representativo de 5.000 em `tests/performance/reporting-history.mjs` | Impressão/salvamento em iOS Safari e Android Chrome pendentes; [brief](../../briefs/AUDIT_EXPORT_REPORTING_V1.md) |
| UI/UX | Fases 2–3 integradas; aceite móvel pendente | Páginas Audit/Action Plans/Evidence e navegação por seções no `InspectionPage.tsx` pós-PR #7; filtros/ações de relatório na PR #9 | Verificação manual de dispositivo real e PDF físico; `InspectionPage.tsx` não usa mais `<select>` |
| Autorização/RLS | Implementado para o escopo funcional de Qualidade | Core 0001–0003; Audit 0004/0009, reporting e Checklist Evidence; Action Plans 0006/0007; Storage/evidence 0008. Checklist Evidence aplica default deny, escopo da unidade, separação read/edit e políticas próprias de Storage/RLS | CI pós-merge `36728754202` comprovou JWT/PostgREST/Storage, wrong-unit/sector/anon/inactive denial e revogação sob espera de lock; produção continua sujeita aos gates operacionais |
| Testes automatizados | Implementado para o escopo funcional de Qualidade | `npm test` inclui 9 testes de paginação Audit com 1.001 summaries; workflow executa Action Plans, Evidence, Reporting, Audit, Checklist Evidence e Admin em Supabase descartável com Storage/Chromium. `audit-evidence.mjs` inclui bytes reais, bypasses, concorrência PostgreSQL e 375px | CI atual da `main` passou em `37012575081`; testes físicos e operação continuam separados |
| Mobile real | Parcialmente implementado/validado | Integrações Audit/Reporting e Checklist Evidence exercitam Chromium a 375px, incluindo print portal, XLSX e upload/download/remove de evidências | Emulação não comprova iOS Safari/Android Chrome físicos. Aceites manuais de câmera/galeria/arquivos, download, XLSX e print/PDF permanecem necessários |
| Segurança dos arquivos | Parcialmente implementado | RPC/bucket validam tamanho/MIME/extensão; cliente `checkFile` valida assinatura; URLs 60s, attachment-only e remoção lógica | Bytes não são atestados pelo servidor; ZIP magic não distingue OOXML seguro. E3 aprovada aceita explicitamente o risco residual no novo Audit; arquivos continuam não confiáveis, sem preview inline e com download attachment; nosniff/cache/EXIF têm limites explícitos |
| Produção/operação | Parcialmente documentado; operação não verificada | ADR-004, BACKUP_RECOVERY.md e gates de EVIDENCE_STORAGE_V1.md; migration 0008 e `20260930114000_audit_checklist_evidence_v1.sql` contêm reconciliação privada para seus respectivos domínios | Não foi inspecionado servidor/deploy. Exigir evidências de backup independente, restore com download, RPO/RTO/retenção, cabeçalhos, alertas, runbook e autorização operacional; não marcar infraestrutura como inexistente |
| Política de checklist evidence | Decisões aprovadas e implementação integrada | E1–E3 aprovadas em 2026-09-29 e implementadas na PR #11: anexos opcionais, 10 MiB/arquivo, 10 ativos/critério e 100/auditoria; edição após reopen; histórico por finalização; risco residual de bytes/EXIF mantido conforme contrato | Não ampliar silenciosamente o contrato; aceite físico e operação permanecem pendentes |

## Evidência de CI disponível

Baseline anterior à PR #18: `main` em `32540028119ecd0ac13bcec13d69c1d55e67d834` (merge da PR #17), com `validate` + `action-plans-integration` em `37012575081` e infraestrutura reproduzível em `37012575111`, ambos `success`. A rodada final acrescenta um teste dedicado ao Login v3; o candidato passa a possuir 236 testes unitários quando a CI do head atual estiver verde. Esses resultados são repositório/runner descartável, não produção.

O workflow executa `npm ci`, typecheck, lint, `npm test`, build, verify:build e `npm audit --omit=dev`, além das integrações reais de Action Plans, Evidence, Reporting, Audit, Checklist Evidence e Admin UI em Supabase descartável com Storage e Chromium. A PR #18 acrescenta `tests/login.test.tsx`, elevando a suíte unitária de 235 para 236 testes no candidato final. A correção da PR #13 acrescenta 9 testes de API que comprovam 1.001 summaries, ranges/filtros, ordenação, deduplicação de fronteira, erro em página posterior e compatibilidade de inspection/overview; as integrações reais confirmam que as consultas Audit continuam válidas no PostgREST, embora não criem >500 summaries no stack real. Na validação anteriormente registrada, o Storage local respondeu sem `Cache-Control` e sem `X-Content-Type-Options`; isso mantém nosniff/cache como gate de produção. Nenhum resultado de CI é teste físico de celular, restore de produção ou aceite operacional. `npm run test:rls` isoladamente roda apenas `tests/database.test.ts`.

## Fechamento — pendências finais

Esta seção é a classificação operacional do fechamento atual; não cria requisitos nem escolhe valores operacionais. "Bloqueia produção" segue os gates de FOUNDATION_GATES.md (6–9), EVIDENCE_STORAGE_V1.md e os critérios de aceite dos briefs. Nenhum item abaixo bloqueia o merge de uma funcionalidade isolada, desde que a respectiva CI passe e o item continue registrado.

| Item | Já automatizado | Exige dispositivo físico | Exige evidência operacional | Bloqueia produção / fechamento | Contrato |
| --- | --- | --- | --- | --- | --- |
| Checklist Evidence | Sim: SQL/PGlite + Supabase/Auth/PostgREST/Storage/Chromium em `audit-evidence.mjs` | Sim: câmera/galeria/arquivos/download em iOS/Android físicos | Sim: backup/restore dos objetos e gates de Storage | Sim: implementação concluída; aceite físico/operacional ainda aberto | AUDIT_CHECKLIST_EVIDENCE_V1.md |
| iOS Safari real | Parcial: Chromium emulado a 375px (Audit, Action Plans, Evidence) e Admin a 375–1440 | Sim | Registro de navegador/dispositivo/resultado | Sim: aceite mobile | AUDIT_EXPORT_REPORTING_V1.md, AUDIT_CHECKLIST_EVIDENCE_V1.md |
| Android Chrome real | Parcial: idem | Sim | Registro de navegador/dispositivo/resultado | Sim: aceite mobile | idem |
| XLSX save/open real | Parcial: download e leitura independente do workbook em Chromium/testes | Sim: salvar e abrir no aparelho | Registro | Sim: aceite de reporting | AUDIT_EXPORT_REPORTING_V1.md |
| Print/save-to-PDF real | Parcial: print portal renderizado em Chromium a 375px e DOM de impressão em testes unitários | Sim: impressão/compartilhar como PDF | Registro | Sim: aceite de reporting | AUDIT_EXPORT_REPORTING_V1.md |
| Camera/galeria/arquivos do Evidence | Parcial: Action Plans e Checklist Evidence exercitam upload/download/rejeições em Chromium 375px | Sim: câmera, galeria e arquivos para ambos os fluxos em dispositivos físicos | Registro | Sim: aceite mobile | EVIDENCE_STORAGE_V1.md, AUDIT_CHECKLIST_EVIDENCE_V1.md |
| Backup independente de DB + objetos | Não | Não | Sim: ferramenta, destino e cópia independente com credenciais separadas | Sim | Gate 8, BACKUP_RECOVERY.md, EVIDENCE_STORAGE_V1.md |
| Restore com downloads reais | Não | Não | Sim: restore DB em T + objetos, reconciliação e downloads autorizados/negação cruzada em ambiente isolado | Sim | Gate 8, AUDIT_CHECKLIST_EVIDENCE_V1.md |
| RPO/RTO | Não | Não | Sim: valores definidos pelo dono operacional (não escolhidos aqui) | Sim | Gate 8 |
| Retenção | Não | Não | Sim: backup, log do sistema e objetos removidos; sem prazo inventado | Sim | Gates 6–8, EVIDENCE_STORAGE_V1.md |
| Purge: autorização e runbook | Não | Não | Sim: registro de autorização humana, remoção via Storage API e evento de auditoria | Sim | Gates 6–7, EVIDENCE_STORAGE_V1.md |
| nosniff/cache | Observado na CI: Storage local sem `X-Content-Type-Options` e sem `Cache-Control` | Não | Sim: garantir no Storage/edge e bypass de cache de CDN | Sim | EVIDENCE_STORAGE_V1.md |
| Monitoramento da reconciliação | Parcial: reconciliação de Action Plan Evidence é testada em `evidence.mjs` e a de Checklist Evidence em `audit-evidence.mjs`; não há agendamento/alerta operacional | Não | Sim: execução agendada com alerta | Sim | EVIDENCE_STORAGE_V1.md, AUDIT_CHECKLIST_EVIDENCE_V1.md, Gate 6 |
| Observabilidade/rollback | Não | Não | Sim: métricas, health checks, alertas e procedimento de rollback | Sim | Gate 9 |

Já automatizado e fora desta lista de pendências funcionais: Core/RLS, Audit lifecycle/scoring, Action Plans, Action Plan Evidence, Checklist Evidence, reporting (RPC/JWT/XLSX/print DOM) e Admin UI responsiva, na CI com PGlite e Supabase local descartável. Isso não substitui os aceites físicos e operacionais acima.

## Inconsistências documentais corrigidas

| Documento | Inconsistência | Correção |
| --- | --- | --- |
| README.md, AGENTS.md | Apenas arquitetura/fundação | Identifica domínios implementados e aponta esta matriz |
| LOCAL_FOUNDATION.md | Planos/Evidências não implementados; lista de schemas incompleta | Separa evidências dos planos de anexos Audit e descreve cobertura real de CI/stubs |
| FOUNDATION_GATES.md | Reopen/brief Audit/event model/file rules como decisões ainda iniciais | Referencia contratos/migrations existentes; mantém pendências operacionais sem inferir produção |
| OVERVIEW.md | RBAC, catálogo e Core físico abertos; attachment metadata como candidato Core | Remete a ADR-005/migrations e ownership por módulo, inclui Action Plans transversal |
| SECURITY.md | Autenticação ainda não selecionada | Supabase Auth conforme ADR-004/005 e implementação |
| FOUNDATION_GATES.md, LOCAL_FOUNDATION.md, README.md, AGENTS.md, AUDIT_CHECKLIST_EVIDENCE_V1.md (2026-09-30 pós-PR #11/#13) | Checklist Evidence ainda descrito como branch/ausente, baseline da `main` anterior e histórico de unidade sem registrar a correção de paginação | Checklist Evidence registrado como integrado; PR #13 registrada como correção do truncamento >1.000; baseline então revisada `fdae41a` com CI pós-merge verde; somente aceite físico e operação permanecem abertos |
| AUDIT_SOURCE_OF_TRUTH.md, MIGRATION_MAP.md | Estado legado podia ser confundido com plataforma atual | Adiciona contexto temporal, decisões resolvidas e links para os briefs, preservando proveniência histórica |

Os três briefs de domínio anteriores permanecem como contratos das respectivas fatias; suas exclusões de anexos/exportações não significam exclusão do módulo completo. `QUALITY_UI_V1.md` foi sincronizado nesta rodada para refletir Login v3 · Elo e o polish final.

## Escopo restante fechado por entregas

1. **Checklist Evidence:** implementado e integrado pela PR #11 com contrato Audit próprio, autorização/lifecycle, upload/download/remoção, finalização consistente, reconciliação e testes; aguarda apenas aceite físico e gates operacionais.
2. **Export & Reporting:** a PR #9 preserva Excel da inspeção, Excel do histórico e impressão/PDF no navegador, independente dos anexos e sem dados de Action Plans. Integrado na `main`; aguarda aceite em dispositivos reais.
3. **UI/UX:** fases 2–3 e Checklist Evidence já estão integrados; resta registrar homologação visual/mobile em dispositivos reais.
4. **Aceite integrado:** preservar o resultado da regressão em CI dos três domínios, reporting JWT/concorrência, conteúdo exportado e registrar mobile real; não fechar apenas porque existem testes.
5. **Liberação operacional:** responsabilidade do processo de produção, separada desta PR; exigir os gates documentados e aprovação humana de rollout.

Não entram: novos módulos/origens, Realtime, arquivo portátil ZIP, importação de legado, dashboards executivos, export de Action Plans, infraestrutura, servidor, Cloudflare, Supabase self-hosted, deploy ou produção. Unit cover/banner do legado não é retomado como novo recurso nesta rodada; eventual requisito funcional além da direção visual atual precisa de decisão própria.

## Decisões aprovadas e pendências operacionais

- **E1 aprovada:** anexos opcionais; máximo 10 MiB por arquivo, 10 arquivos ativos por critério e 100 por auditoria.
- **E2 aprovada:** após reopen, o conjunto atual volta a ser editável com `audit.inspection.edit`; evidências existentes permanecem, removidas mantêm registro histórico e não são restauradas automaticamente. Cada finalização registra os IDs das evidências disponíveis naquele momento; sem navegador de revisões históricas em v1.
- **E3 aprovada para v1:** risco residual da validação de bytes no cliente e preservação de EXIF explicitamente aceito. Arquivos continuam não confiáveis, sem preview inline, download como attachment e tipos/tamanho/MIME/extensão restritos. Não declarar antivírus, sanitização ou validação de bytes no servidor. Validação/quarentena confiável fica como evolução futura separada.
- **Relatórios aprovados:** conteúdo especificado, Excel da inspeção, Excel do histórico, impressão/save-as-PDF pelo navegador e máximo 5.000 summaries por geração. Sem PDF server-side, assinatura digital ou armazenamento de relatórios em v1.
- **Operação:** responsáveis e janela provisória definidos em BACKUP_RECOVERY.md; retenção/purge, RPO técnico, RTO dentro/fora do expediente, comprovação de restore e liberação de produção permanecem pendentes. Não supor que ausência de evidência neste repositório significa ausência de configuração no servidor.

E1–E3 e relatórios não têm decisões de produto pendentes. Reporting (PR #9), Checklist Evidence (PR #11), paginação do histórico (PR #13), hardening pré-homologação (PR #14) e Login v3 (PR #17) estão integrados na `main`; a CI atual está verde. Não há blocker funcional de código conhecido registrado nesta matriz. O fechamento de repositório inclui a rodada final de consistência visual/documental, mas **Qualidade só pode ser chamada de 100%/production-ready depois que os aceites P1–P9 e O1–O8 de `QUALITY_ACCEPTANCE_V1.md` forem realmente executados e registrados.**
