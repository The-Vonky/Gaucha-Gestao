# Mapa de execução — engenharia, dependências, owners e gates

**Documento de coordenação; não substitui o [Plano Diretor 2026 v1.3](PLANO_DIRETOR_2026.md).** Fotografia reconciliada: main após PR #69 (`fed0e0f`, **20/10/2026**); pendências operacionais exigem evidência. **PROD: NO-GO**. Não contém promessa de prazo/custo.

## 1. Resultado desejado e definição de pronto

Primeira entrega operacional: **Qualidade v1** (Auditorias, 9 seções/158 critérios, Planos de Ação, evidências, exportação XLSX e impressão/PDF, administração Core, autenticação). O software está integrado na main; falta liberação operacional, não reescrita. Demais domínios entram depois por migração gradual.

**GO de produção** exige, cumulativamente: commit fixo com CI verde e sem blockers, identidade privilegiada aprovada quando aplicável, P1–P9 com evidência física, O1–O8 com evidência operacional, host/infra seguros, backup independente e restore, parâmetros de capacidade/RPO/RTO aprovados, plano de rollback, responsável humano autorizando cutover. CI verde isoladamente é **insuficiente**. Referência canônica: [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md).

## 2. Mapa de precedência

~~~mermaid
flowchart TD
  BASE["Etapa 0 — baseline SHA / inventário / preservação"] --> REST["Etapa 1 — preservação e restore isolado"]
  BASE --> IAM["Etapa 2 — ADR-007, decisão e revisão independente"]
  REST --> HOST["Etapa 4 — gate físico da C30, autorização antes de reinstalar"]
  MET["Etapa 3 — metas de RPO/RTO, retenção, p95 e carga"] --> HOST
  IAM --> STAGE["Etapa 5 — STAGING reproduzível"]
  HOST --> STAGE
  STAGE --> PHY["Etapa 6 — P1–P9 em Android/iOS"]
  STAGE --> BAK["Etapa 7 — backup produtivo e configuração segura"]
  MET --> BAK
  BAK --> DR["Etapa 8 — O1–O8, restore, incidentes, carga"]
  PHY --> GATE{"Etapa 9 — GO humano?"}
  DR --> GATE
  GATE -- "GO documentado" --> LIVE["Cutover controlado"]
  GATE -- "NO-GO" --> HOLD["Preservar estado atual, corrigir lacunas"]
  LIVE --> MIG["Etapa 10 — operação assistida e módulos futuros"]
~~~

A figura representa **dependências lógicas e gates**, não um cronograma com datas firmes. O plano oficial detalha a ordem e pode impor dependências adicionais. A etapa 4 não deve avançar para escrita em disco sem autorização e preservação verificável.

## 3. Work packages auditáveis

| Frente | Responsabilidade registrada | Evidência esperada / definição de concluído | Estado nesta fotografia |
| --- | --- | --- | --- |
| Baseline, worktrees e CI | Dev A; [issue #47](https://github.com/The-Vonky/Gaucha-Gestao/issues/47) | SHA, branches, riscos, CI da mesma versão e rollback de alterações de código | Histórico documentado; revalidar commit candidato |
| Preservação C30 / HD / ERP | Dev A + Matheus; [#48](https://github.com/The-Vonky/Gaucha-Gestao/issues/48) | Inventário somente leitura, classificação de todos os discos/volumes, backup/restore de dados essenciais, autorização explícita para descarte | **ABERTO**; sem permissão implícita para formatar |
| Restore sintético | Dev A; [#51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51), [PR #62](https://github.com/The-Vonky/Gaucha-Gestao/pull/62) e [relatório de evidências](02_RESTORE_DRILL.md) | DB/Auth/objetos restaurados em stack independente, integridade, RLS negativas, tempos e limites do ensaio | **Em curso**: issue relata ensaio sintético a frio PASS parcial; evidências no relatório com 8 PASS/1 PARCIAL (DR-08); versão histórica com 17 migrations, sem ABC; ainda não substitui backup PROD/PITR |
| Identity Boundary | Dev A + parecer independente; [#49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) | ADR substituto ou decisão NO-GO, testes de GoTrue/locks/último admin, GO humano antes de migrations/runtime | **P0 BLOQUEADO**; PR #24 encerrado sem merge |
| Gate C30 e provisioning | Dev A + Matheus; [#52](https://github.com/The-Vonky/Gaucha-Gestao/issues/52) | Laudo, preservação, aprovação, Ubuntu/Compose com medições reais/rollback | **ABERTO**; trilha B isolada permitida |
| Curva ABC v1 | [PR #69](https://github.com/The-Vonky/Gaucha-Gestao/pull/69) e [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) | Código integrado; testar amostras ERP, concorrência, arquivos originais, RLS e usuários distintos | **INTEGRADO AO REPOSITÓRIO**; homologação pendente |
| DEV compartilhado | [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68) | Acesso de dois operadores, autoria/RLS/firewall e reinício seguro | Funcional conforme Issue; pendências abertas |
| Setup, fluxos e testes Qualidade | Dev B; [#54](https://github.com/The-Vonky/Gaucha-Gestao/issues/54), [#55](https://github.com/The-Vonky/Gaucha-Gestao/issues/55), [#56](https://github.com/The-Vonky/Gaucha-Gestao/issues/56) | Reproduzir stack, mapa de fluxo e evidência de testes/RLS reais | **ABERTO** |
| Regressões de testes | Dev B; [#57](https://github.com/The-Vonky/Gaucha-Gestao/issues/57) | CI, reprodução/triagem do CHECK_FAILED e correções rastreáveis | **ABERTO**; não interpretar fechamento de issue antiga como correção |
| Homologação física | Dev B; [#58](https://github.com/The-Vonky/Gaucha-Gestao/issues/58) | P1–P9 executados em Android Chrome e iOS Safari com dispositivo/versão/evidência | **PENDENTE** |
| Handover e operação | Dev A, Dev B; [#53](https://github.com/The-Vonky/Gaucha-Gestao/issues/53), [#59](https://github.com/The-Vonky/Gaucha-Gestao/issues/59) | Handover independente, runbooks, permissões e resposta a incidentes | **ABERTO** |
| PROD limpo | Responsável humano; [01_DADOS_LIMPOS](01_DADOS_LIMPOS.md) | Sem dados de laboratório, migrar somente o autorizado; bootstrap singular após GO de identidade | **POLÍTICA PROPOSTA**, não provisionada |

A divisão Dev A / Dev B / Matheus foi extraída das issues; **não implica aceitação de responsabilidades fora das issues**. A proteção técnica de main está adiada por decisão registrada; revisão humana, PR e CI permanecem controles manuais obrigatórios.

## 4. Sequência por entregáveis e critérios de aceite

| Marco / gate | Entradas | Saída comprovável | Bloqueio que não pode ser ignorado |
| --- | --- | --- | --- |
| G0 — baseline | main exata, árvore, PRs abertos, volumes existentes | Inventário auditável com SHA e recursos intocáveis | Perda de trilha/histórico |
| G1 — preservação | inventário C30, ERP/dados de terceiros, armazenamento externo | Restore isolado comprovado dos dados sujeitos a preservação; liberação humana | Não formatar/limpar sem autorização |
| G2 — IAM | contrato GoTrue pinado, ADR-007 e parecer | Decisão assinada e gates de implementação | Serviço privilegiado proibido sem GO |
| G3 — capacidade | metas aceitas pelo responsável, C30 preparada mediante autorização | CPU/RAM/disco/SMART/temperatura/carga e comparação com metas | 8 GB/SSD histórico não provam capacidade |
| G4 — staging | infra versionada + segredos externos + isolamento | Ambiente persistente/reproduzível e smoke/URL/TLS testados | Não reutilizar volumes ou segredos |
| G5 — experiência real | staging candidato estável, contas de teste, aparelhos | P1–P9 com PASS/FAIL/BLOCKED, bugs vinculados | Chromium não substitui mobile físico |
| G6 — continuidade | ferramentas, retenção, destino off-site, segredo/backup de objetos | Restauração independente e mensurada, headers/alertas/reconciliação | Ensaio sintético a frio não prova PITR ou operação |
| G7 — release | G0–G6, O1–O8 e checklist | Parecer formal GO/NO-GO, rollback, janela e owner | Sem GO explícito = sem deploy |
| G8 — expansão | Qualidade aceita e legado inventariado | Brief de módulo, paridade, dados, migração, aceite | Não iniciar migração big bang |

Nenhum gate de produção foi marcado como aprovado por esta PR documental.

## 5. Padrão de issue para módulo novo

Toda migração futura deve abrir uma issue/brief contendo: dono funcional; origem/versão; objetivos e não objetivos; casos de uso; regras e cálculos testáveis; dados de entrada, classificação e retenção; entidades Core usadas; tabela de permissões/escopos; contratos RPC/Storage; desenho de telas; testes unitário, RLS, integração e mobile; mapeamento e reconciliação de dados; estratégia de cutover e rollback; dependências; estimativa **apenas depois** de requisitos; gate de aceite humano. Não criar o código antes de fechar as dependências e o ownership funcional.

## 6. Política de atualização

Plano Diretor é **canônico** para etapas. Este arquivo é uma visão de execução, indexando decisões e links, sem substituir as issues. Ao encerrar uma issue, registrar a evidência e o SHA, não apenas mover um marcador. Ao obter GO formal, atualizar [DECISION_REGISTER](DECISION_REGISTER.md), [OPERATIONS_MATRIX](../operations/OPERATIONS_MATRIX.md), [DIAGRAMS](../architecture/DIAGRAMS.md) e README no mesmo PR.
