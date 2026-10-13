# Auditoria de prontidão de consolidação — Fundação Core v2

Revisão: **2026-10-13**. Estado: **candidata à consolidação em `main`, sob revisão**, sem deploy de produção e sem autorização implícita para mesclar na `main`. Registro detalhado: [Issue #34](https://github.com/The-Vonky/Gaucha-Gestao/issues/34).

## Baseline antes desta atualização documental

- `main`: `70cfbae24d10093d1ee94a8e87ce4d0a4af117e5`.
- `integration/core-foundation-v2-wave2`: `14900b63cacfab79d5bb398c9d9a8d6bfe3deab2`, depois dos merges #35 e #36.
- Comparação GitHub `main...integration`: **81 commits adiante, zero atrás, 91 arquivos distintos** antes do commit documental. Recalcular para qualquer PR final; nunca tratar estes números como invariantes.
- PRs #25–#33, [#35](https://github.com/The-Vonky/Gaucha-Gestao/pull/35) e [#36](https://github.com/The-Vonky/Gaucha-Gestao/pull/36) integrados **somente na branch de integração**. [PR #24](https://github.com/The-Vonky/Gaucha-Gestao/pull/24) continua aberto e propõe uma fronteira de identidade privilegiada (ADR-007), **não implementada**.
- PR #35 corrige dependências dev (`vitest@5.0.4`, `@vitest/mocker@5.0.4`, `source-map-js@1.2.2`) e adapta nove suítes; auditoria npm completa com **zero vulnerabilidades** no diagnóstico validado e 483/483 testes. Evidências: [CI #38396140782](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/38396140782) e [infra #38396140662](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/38396140662), verdes.
- PR #36 agrega testes de autorização negativa por JWT/PostgREST reais para usuários anônimos, inativos, com papéis parciais e permissões revogadas. Evidências: [CI #38397119936](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/38397119936) e [infra #38397119924](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/38397119924), verdes.
- **Pendente comprovação da CI do HEAD combinado** após os dois merges e esta documentação.

## Inventário e avaliação

Inventário da comparação anterior: 20 arquivos de Core/Admin frontend; 16 de App Shell, Shared e Qualidade; 23 documentos; 4 migrações SQL; 22 testes; 1 workflow; `README.md` e `AGENTS.md`. Após os PRs #35/#36, há mais mudanças de testes e dependências. Inspecionados os quatro contratos SQL do Core v2, proteções RLS relevantes, APIs administrativas e alterações funcionais nos consumidores; **não foi realizado parecer de revisão independente linha a linha dos 91 arquivos**, e não é correto afirmar revisão exaustiva.

Alterações de consumo a aceitar expressamente:
- `PlanFields.tsx`: datas do período de acompanhamento em par e ordenadas (teste automatizado disponível).
- `Result.tsx`, `AuditOverview.tsx`, `UnitPage.tsx`: rascunhos levam editores ao checklist; leitores à visão geral.
- App Shell/Shared: estados de carregamento e vazio, foco, responsividade, mensagens seguras.

Os logs têm RLS para o leitor autorizado, mas `before_data` e `after_data` são históricos brutos, exigindo política de retenção/privacidade antes de produção.

## Gates da Issue #34

| Gate | Situação em 2026-10-13 |
| --- | --- |
| S1 dependências | **PASS** no patch testado do PR #35; confirmar novamente no HEAD combinado |
| S2 proteção da `main` | **ADIADO POR DECISÃO DO RESPONSÁVEL** nesta etapa; `main.protected=false`, sem rulesets; risco residual explícito, não equivale a PASS |
| A1 inventário / alterações externas | **Inventário completo; revisão focal feita**. Aceite independente do delta completo pendente |
| A2 RBAC / RLS | **Testes negativos e inspeção focal PASS**, incluindo JWT reais do PR #36. Revisão de segurança final/escopo total pendente |
| A3 regressões em consumidores | **Revisão focal e automação PASS**; aceite manual foi reportado pelo responsável sem relatório detalhado anexado |
| Q1 manual PC / Android | **CONCLUÍDO CONFORME DECLARAÇÃO DO RESPONSÁVEL em 2026-10-13**. Não foram fornecidos ao repositório, nesta etapa, dispositivos, ambiente, matriz por perfil ou capturas de tela; resultado não auditado independentemente. Não confundir com P1–P9 |
| Q2 `CHECK_FAILED` antigo | **CAUSA INDETERMINADA**: tentativa 1 de [run #37669780765](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/37669780765) falhou em `audit-evidence.mjs`; nova tentativa aprovou. Há `toomanyrequests` Docker no log, mas nexo causal não comprovado. Risco histórico ainda documentado |
| D1 documentação | **Atualizada nesta PR documental**; revalidar antes do merge à `main` |
| C1 CI final | **PENDENTE do HEAD exato após os merges e documentação** |
| M1 PR para `main` | **[PR #38 aberto em Draft](https://github.com/The-Vonky/Gaucha-Gestao/pull/38)**; merge depende de revisão e autorização humana específica |
| Produção P1–P9/O1–O8 | **SEPARADA / PENDENTE**, nunca promovida automaticamente |

## Restrições operacionais

Não executar `supabase db reset`, `db push`, seed, migrações nem consultas destrutivas em ambientes compartilhados ou produção. Não realizar force-push, deploy, release ou promover `main` sem decisão final. A ausência de ruleset significa **risco de governança aceito temporariamente** e deverá ser sanado depois. CI verde não é prova de produção pronta.

O checklist de PC/Android é `docs/development/CORE_V2_MANUAL_TEST.md`. Para liberação operacional, exigir aceites P1–P9 e O1–O8 em `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md`.
