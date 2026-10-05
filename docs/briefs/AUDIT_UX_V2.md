# Implementation Brief — Audit UX v2 (experiência da Auditoria por unidade)

Status: IMPLEMENTADO na branch `design/audit-ux-v2` (pendente de PR, CI e merge; decisões D1–D7 fechadas em 2026-10-05, ver §2.2)
Data: 2026-10-05
Baseline: `main` em `e7253e088f27fa98aa810c4daaa7994d9a90345a` (Design System Elo v1 integrado pela PR #19; CI pós-merge verde)
Branch: `design/audit-ux-v2`
Risco: **MÉDIO-ALTO**. É redesenho de UX, navegação e composição visual, sem mudar dados, schema, RLS, autorização, RPCs, scoring ou lifecycle. O risco vem da reorganização de `InspectionPage`, que concentra autosave, concorrência, revisão de evidências e finalize/reopen.
Depende de: `DESIGN_SYSTEM_ELO_V1.md`, `QUALITY_UI_V1.md` (§1, §6–§9), `AUDIT_SOURCE_OF_TRUTH.md`, `CHECKLIST_EVIDENCE_V1.md`, ADR-003.

> Brief de apresentação e navegação. Não altera regras de negócio, scoring, lifecycle, RPCs, schema, RLS, autorização, Storage nem os contratos de Audit / Action Plans / Evidence / Reporting.

## 1. Objetivo

Reorganizar a Auditoria em torno da **unidade monitorada**, recuperando os pontos fortes da v2.9.1 (visão gerencial por unidade, histórico, abas Visão geral / Checklist / Plano de ação, densidade operacional do checklist) dentro do App Shell, do Design System Elo e do modelo atual (Unidade do Core, Planos de Ação transversais).

Fluxo aprovado:

```text
Auditorias (visão geral) → Unidade (resumo) → Histórico/Evolução → Auditoria → Visão geral | Checklist | Plano de ação
```

## 2. Decisões

### 2.1 Fechadas (direção do responsável pelo produto)

1. A entrada é orientada a **unidades monitoradas**, não a uma lista de inspeções.
2. Nenhum KPI inventado: todo número vem de um contrato existente (ver §4). Dado ausente é registrado como **não disponível no contrato atual**.
3. A terminologia é a da plataforma: **Unidade** (nunca "Cliente"), **Auditoria** para a experiência, inspeção como termo técnico.
4. O App Shell e o Design System Elo continuam sendo a navegação global. A sidebar da versão antiga não é copiada.
5. Não haverá segunda implementação de Planos de Ação. Os contratos existentes serão reutilizados (ADR-003).
6. O checklist preserva integralmente: 9 seções, 158 critérios, AT/AP/NAT/NAP, observações, autosave, evidências por critério, progresso, finalize/reopen, concorrência/stale e permissões.
7. Brand ≠ status, e as faixas de resultado (verde ≥76%, laranja 51–75,9%, vermelho <51%) aparecem **só em resultado final**. Rascunho usa estado neutro/info e conformidade "parcial" (QUALITY_UI_V1 §9). A `visualBand` da v2.7, que coloria resultados provisórios, **não** é reintroduzida.
8. Elos só em superfícies de marca (Elo §2.3). Cabeçalhos operacionais da Auditoria não recebem elos.

### 2.2 Decisões de implementação (aprovadas em 2026-10-05)

| ID | Decisão aprovada |
|---|---|
| D1 | A auditoria abre em **Visão geral**. Rotas: `/audit/inspections/:id` → Visão geral; `/audit/inspections/:id/checklist` → Checklist; `/audit/inspections/:id/plano` → Plano de ação. Os testes são atualizados deliberadamente para o novo fluxo, preservando integralmente o comportamento funcional do checklist |
| D2 | **Sem imagem na v2.** Identidade da unidade = monograma + código + nome. Nenhum campo, storage ou contrato de imagem no módulo Audit; nada de URL inventada, foto placeholder ou armazenamento local. O card de unidade reserva estruturalmente uma **área de mídia** (hoje ocupada pelo monograma) que poderá receber uma capa futura do Core sem reconstruir o card. A imagem de unidade é evolução futura do Core, em brief próprio |
| D3 | A **Conformidade média** do dashboard é visualmente **neutra**: indicador agregado, sem reutilizar as faixas semânticas do resultado de uma auditoria individual |
| D4 | Página da unidade com abas roteadas **`Resumo | Histórico`**. Resumo = leitura gerencial atual; Histórico = auditorias anteriores e evolução temporal |
| D5 | Evidências no checklist em **disclosure por critério "Evidências (n)"**, preservando comportamento, autorização e lifecycle do Checklist Evidence. Fechado, não é elemento visual dominante |
| D6 | **Ordenação gerencial padrão** dos cards: (1) **Em atenção**; (2) **Em andamento**; (3) **Adequadas**; (4) **Sem dados**. Alfabética pelo nome dentro de cada grupo. Filtros por situação mantidos. Só classificações deriváveis dos contratos atuais (ver §4.2, "Situação da unidade") |
| D7 | No mobile, **barra segmentada no topo do conteúdo** para `Visão geral | Checklist | Plano de ação`. Pode ser sticky quando necessário, desde que fique abaixo do header/safe-area, não esconda conteúdo, mantenha alvos ≥44 px, não cause overflow horizontal obrigatório e seja operável por teclado/foco |

**Atividade recente:** **não** usa `core.system_audit_log` (exigiria permissão administrativa inadequada ao usuário de Qualidade). Usa só os eventos que `inspection_summaries` (já autorizado) representa com confiança: auditoria iniciada (`created_at`) e auditoria finalizada (`finalized_at`). Se o recorte não for confiável, a seção é reduzida ou omitida, sem feed granular.

## 3. Estado atual (verificado em 2026-10-05)

### 3.1 Rotas e componentes

| Rota | Componente | O que faz hoje |
|---|---|---|
| `/audit` | `AuditOverview` | `PageTitle` + "Nova auditoria"; bloco "Em andamento (n)" em `record-list`; bloco "Unidades" com busca e cards simples (última aplicação, status, progresso, última finalizada + delta, "Ver histórico") |
| `/audit/units/:unitId` | `UnitHistory` | Breadcrumb; título da unidade; relatório do histórico (filtro de datas + Excel/PDF); lista de todas as auditorias da unidade com resultado/delta e "Abrir" |
| `/audit/inspections/:inspectionId` | `InspectionPage` | Breadcrumb; hero (status, datas, responsável, progresso, conformidade, Exportar/Imprimir, Finalizar/Reabrir, link "Planos de ação desta auditoria"); notices de estado; layout com `SectionNav` + checklist da seção atual; paginação de seções; `Confirm` de finalize (com revisão de evidências) e reopen |
| modal | `NewInspection` | Unidade (ativas + permissão de criar), data de aplicação, visita anterior (opcional) |

### 3.2 Comparação com o fluxo desejado

| Fluxo desejado | Hoje | Gap de UX |
|---|---|---|
| Visão geral por unidade com KPIs e atividade | Lista de rascunhos + cards simples | Sem KPIs, sem leitura de "em atenção", sem atividade recente; rascunhos separados das unidades |
| Unidade (resumo) | Só existe a lista de histórico | Sem situação atual consolidada, sem auditoria em andamento em destaque, sem evolução |
| Histórico/Evolução | Lista textual | Sem gráfico de evolução e sem leitura de tendência além do delta pontual |
| Auditoria → Visão geral | Não existe (o hero resume pouco) | Sem resumo por seção, contagens, pontos de atenção, evidências e planos |
| Auditoria → Checklist | É a página inteira | Funciona, mas cada critério é um card com observação e evidências sempre abertas, o que reduz a densidade |
| Auditoria → Plano de ação | Link para a fila filtrada | Sai do contexto da auditoria |

## 4. Inventário de dados (fonte de cada dado)

### 4.1 Contratos existentes utilizáveis

| Contrato | Origem | Campos | Observações |
|---|---|---|---|
| `audit.units()` | `api.units()` | `id, code, name, active` | Unidades com `audit.inspection.read` **ou** `audit.inspection.create`, ordenadas por nome |
| `audit.inspection_summaries(p_overview := true)` | `api.summaries({p_overview:true})` | `id, unit_id, unit_name, template_version, applied_on, previous_visit_on, responsible_id, responsible_name, status, final_score, final_classification, finalized_at, version, created_at, total_items, answered, at_count, ap_count, nat_count, nap_count` | **Todos os rascunhos + as 2 últimas finalizadas por unidade.** Suficiente para a conformidade atual, a anterior (delta) e as auditorias em andamento |
| `audit.inspection_summaries(p_unit)` | `api.summaries({p_unit})` | mesmos campos | Histórico completo da unidade (paginado, mais recente primeiro) |
| `audit.inspection_summaries(p_inspection)` | `api.inspection(id)` | mesmos campos | Cabeçalho da auditoria |
| `checklist_sections`, `checklist_items` | `api.checklist(template)` | seção (`key, position, name`), item (`key, section_key, number, text`) | Catálogo versionado |
| `inspection_answers` | `api.answers(id)` | `item_key, response, observation, version, updated_at, updated_by` | `updated_by` é só o ID (sem nome) |
| `audit.checklist_evidence(p_inspection, p_item_key?)` | `evidence.listEvidence` / `useChecklistEvidence` | `item_key, original_name, content_type, size_bytes, uploaded_by_name, uploaded_at` | Lista completa por auditoria |
| `audit.checklist_evidence_pending_count` | `evidence.pendingCount` | inteiro | Usado na revisão de finalização |
| `audit.inspection_export`, `audit.unit_history_export` | `reporting/api` | relatórios | Excel/PDF; **intocados** |
| `action_plans.plan_summaries(p_plan?, p_inspection?)` | `action-plans/api.summaries` | `plan` (status, `source_item_key`, `source_response`, `source_active`, `due_date`, `effectiveness`…), `unit_name`, `item_number`, `inspection_applied_on` | Filtro por auditoria já existe e é usado por `/action-plans?inspection=` |
| Permissões | `auth.can(perm, {unit_id})`, `hasAnyScope` | `audit.inspection.read/create/edit/finalize/reopen/export`, `action_plan.read` | Por escopo de unidade; a UI não é fronteira de autorização |

### 4.2 Indicadores derivados (sem contrato novo)

| Indicador | Cálculo | Fonte |
|---|---|---|
| Situação da unidade (D6) | **Em atenção:** a última finalizada tem `final_classification` `partial` ou `inadequate`. **Em andamento:** existe rascunho e não está em atenção. **Adequada:** a última finalizada tem `adequate` e não há rascunho. **Sem dados:** sem finalizada com score e sem rascunho (inclui finalizada sem critérios aplicáveis, `final_score` nulo). Uma unidade em atenção com rascunho aberto fica no grupo Em atenção e mostra também o rascunho no card | overview |
| Unidades monitoradas | Unidades visíveis que são ativas ou têm auditoria (mesma regra do `AuditOverview` atual); subtexto "n sem auditoria" | `units()` + overview |
| Conformidade média | Média simples de `final_score` da **última finalizada** de cada unidade, entre as que têm score; subtexto "de n unidades". Sem faixa (D3) | overview |
| Em atenção | Unidades cuja última finalizada tem classificação `partial` ou `inadequate`, contadas por faixa com rótulo textual | overview |
| Em andamento | Número de rascunhos (e de unidades com rascunho) | overview |
| Conformidade atual da unidade | `final_score` + `final_classification` da última finalizada | overview / `p_unit` |
| Tendência | `trend(atual, anterior)` entre as duas últimas finalizadas (função existente) | overview / `p_unit` |
| Progresso / parcial do rascunho | `answered/total_items`; `evaluate(tallyOf(summary))` (neutro) | summaries |
| Resultado por seção | `evaluate(tally(...))` por seção (já calculado em `InspectionPage`) | catálogo + answers |
| Pontos de atenção | Itens com resposta AP/NAT, com observação | catálogo + answers |
| Evidências da auditoria | Total e lista agrupada por critério | `checklist_evidence` |
| Planos da auditoria | Contagem por status e lista | `plan_summaries(p_inspection)` |
| Evolução da unidade | Série de `final_score` por `applied_on` das finalizadas | `p_unit` |
| Atividade recente | Eventos "Auditoria iniciada" (`created_at`) e "Auditoria finalizada" (`finalized_at`) dos registros do overview, ordenados por data, até 8 itens | overview (ver limitação em G6) |

### 4.3 Gaps reais de dados

| ID | Dado desejado | Situação | Encaminhamento |
|---|---|---|---|
| G1 | Imagem/capa/foto da unidade | **não disponível no contrato atual.** `core.units` tem só `code`, `name`, `active` | Decisão de produto/técnica pendente (D2). Se aprovada, é brief do **Core**: campo/objeto de capa, bucket, políticas, administração em Administração › Unidades. A Auditoria não cria armazenamento próprio (AUDIT_SOURCE_OF_TRUTH, "Platform adaptation") |
| G2 | Endereço, cidade, tipo, contexto descritivo da unidade | **não disponível no contrato atual** | Só código e nome. Nada de texto fictício |
| G3 | Setores da unidade na Auditoria | **não disponível no contrato atual** (`audit.units` não expõe `unit_sectors`) | Fora da v2 |
| G4 | Total de auditorias registradas (agregado global) | **não disponível no contrato atual** de forma eficiente: o overview limita a 2 finalizadas por unidade; o total exigiria paginar todo o histórico | KPI omitido na entrada. Na página da unidade, o total vem do histórico completo (`p_unit`) |
| G5 | Marcador "reaberta" e histórico de reaberturas | **não disponível no contrato atual.** O reopen volta para `draft` e zera os campos finais; o log (`core.system_audit_log`) exige `admin.audit_log.read` | A UI mostra "Em andamento" sem afirmar que foi reaberta |
| G6 | Atividade granular (respostas, evidências, planos) | **não disponível no contrato atual** de forma agregada | A atividade recente usa só início/finalização do overview. Limitação: até 2 finalizações por unidade entram no conjunto. Rótulo: "Auditorias iniciadas e finalizadas recentemente" |
| G7 | Observação geral / resumo textual da auditoria | **não disponível no contrato atual** (não há campo) | A visão geral usa os pontos de atenção (observações AP/NAT por critério) |
| G8 | Nome de quem finalizou | **não disponível no contrato atual** (`finalized_by` não é exposto pelo summary) | Mostrar data/hora da finalização e o responsável da auditoria |
| G9 | Evolução por seção ao longo do tempo | **não disponível no contrato atual** de forma agregada (exigiria respostas de cada auditoria) | Fora da v2. A evolução é só do score final |
| G10 | Planos de ação por unidade | **não disponível no contrato atual** como filtro (`plan_summaries` só aceita `p_plan`/`p_inspection`) | Fora da v2 na página da unidade; a fila de Planos de Ação continua sendo a visão por unidade |
| G11 | Contagem de evidências nos cards de unidade | **não disponível no contrato atual** sem uma chamada por auditoria | Fora da visão geral; aparece só dentro da auditoria |
| G12 | "Auditor responsável" diferente do criador | O contrato define `responsible_id = auth.uid()` na criação, sem edição | A UI chama de "Responsável" o valor atual, sem prometer reatribuição |

## 5. Rotas propostas

| Rota | Tela | Compatibilidade |
|---|---|---|
| `/audit` | Auditorias · Visão geral | mesma URL |
| `/audit/units/:unitId` | Unidade · Resumo | mesma URL (hoje mostra o histórico) |
| `/audit/units/:unitId/historico` | Unidade · Histórico/Evolução | nova |
| `/audit/inspections/:inspectionId` | Auditoria · Visão geral (D1) | mesma URL, conteúdo novo |
| `/audit/inspections/:inspectionId/checklist` | Auditoria · Checklist | nova |
| `/audit/inspections/:inspectionId/plano` | Auditoria · Plano de ação | nova |
| `*` | "Página não encontrada" atual | mantida |

As abas são **links roteados** com `aria-current="page"`, não `role="tablist"`: cada aba tem URL própria, funciona com voltar/avançar e recebe o foco no `main` que o shell já aplica na troca de rota. `/action-plans?inspection=` continua válido.

## 6. Telas

Convenções: **Reutilizar** = componente atual sem mudança funcional; **Adaptar** = mesmo componente/lógica com props ou markup ajustados; **Substituir** = composição nova (a lógica de dados existente é preservada). Todas as telas seguem os tokens Elo, 375 px sem overflow horizontal, alvos ≥44 px em toque/<1024 px, safe areas do shell, foco visível e `prefers-reduced-motion`.

### 6.1 Auditorias — Visão geral (`/audit`)
- **Objetivo:** responder em segundos quais unidades são monitoradas, como está a conformidade de cada uma, quais estão em atenção, o que está em andamento e o que aconteceu recentemente.
- **Dados:** `units()` + `summaries({p_overview:true})` (uma carga, como hoje); indicadores da §4.2.
- **Ações:** abrir unidade; continuar auditoria em andamento; "Nova auditoria" (`hasAnyScope('audit.inspection.create')`); buscar unidade; filtrar por situação (Todas · Em atenção · Em andamento · Adequadas · Sem dados). Ordenação padrão por situação (D6), alfabética dentro do grupo.
- **Permissões:** a lista vem do servidor (read ou create por unidade). "Nova auditoria" só aparece com create em algum escopo; no modal, só unidades ativas com create.
- **Estrutura visual:**
  1. `PageTitle` "Auditorias" com eyebrow "Qualidade" e ação primária;
  2. faixa de 4 KPIs (Unidades monitoradas · Conformidade média · Em atenção · Em andamento), com valores reais e subtextos honestos;
  3. seção "Unidades monitoradas": busca + filtros (chips com contagem) + grid de **cards de unidade**;
  4. coluna/seção "Atividade recente" (G6).
- **Card de unidade:**
  - área de mídia (D2): hoje o monograma do código; estruturalmente pronta para uma capa futura do Core;
  - identidade: nome + código, e "Inativa" quando for o caso;
  - conformidade atual em destaque, com cor da faixa e rótulo textual só para finalizada;
  - tendência (`Delta`);
  - se houver rascunho: badge "Em andamento", `Progress` neutro e "Continuar";
  - data da última auditoria e responsável;
  - o card inteiro tem um link principal para a unidade (um único alvo, sem links aninhados), e "Continuar" é ação secundária separada;
  - sem auditoria: "Nenhuma auditoria registrada", sem score.
- **Desktop (≥1024):** KPIs em 4 colunas; grid de cards `auto-fill minmax(300px,1fr)`; atividade em coluna lateral de ~320 px a partir de 1280 px e, abaixo disso, depois dos cards.
- **Mobile (<600):** KPIs em 2×2; filtros em linha com quebra (sem scroll horizontal obrigatório); cards em 1 coluna; atividade depois dos cards.
- **Estados:** loading (§6.11), sem unidades no acesso (texto atual), busca/filtro sem resultado, erro com "Tentar novamente".
- **Reutilizar:** carga de dados e busca do `AuditOverview`; `NewInspection`; `Progress`, `Result`, `Delta`, `StatusBadge`; `Notice`, `PageTitle`, `Metric`.
- **Adaptar:** `Metric` (subtexto e tom neutro).
- **Substituir:** layout atual (bloco "Em andamento" + cards simples) por `AuditKpis`, `UnitCard`, `UnitFilters`, `RecentActivity`.

### 6.2 Unidade — Resumo (`/audit/units/:unitId`)
- **Objetivo:** ser o elo entre a visão gerencial e a auditoria específica: situação atual, auditoria em andamento e acesso ao histórico.
- **Dados:** `units()` (localiza a unidade) + `summaries({p_unit})`.
- **Ações:** continuar o rascunho; abrir a última finalizada; "Nova auditoria" (unidade ativa + `can('audit.inspection.create',{unit_id})`); ir para Histórico.
- **Permissões:** como hoje; unidade inexistente ou sem acesso mostra o erro atual.
- **Estrutura:** breadcrumb `Auditorias / Unidade`; cabeçalho da unidade (monograma, nome, código, ativa/inativa, ação primária); abas `Resumo | Histórico` (D4). Conteúdo do Resumo:
  - card "Situação atual": última finalizada (score, faixa, rótulo, data, responsável, delta);
  - card "Em andamento" (se existir): progresso, parcial neutro, "Continuar";
  - indicadores da unidade: total de auditorias, finalizadas, última auditoria (data);
  - mini-evolução: as últimas 6 finalizadas (sparkline), com link para Histórico.
- **Desktop:** 2 colunas (situação + em andamento), indicadores em linha, evolução embaixo.
- **Mobile:** 1 coluna; ação primária com largura total abaixo do título.
- **Estados:** sem auditorias ("Nenhuma auditoria registrada para esta unidade.", com CTA se puder criar); unidade inativa (sem "Nova auditoria"); loading/erro.
- **Reutilizar:** carga do `UnitHistory`, `NewInspection` (`unitId`), `Result`, `Delta`, `Progress`.
- **Substituir:** `UnitHistory` por `UnitPage` (cabeçalho + abas) + `UnitSummary`.

### 6.3 Unidade — Histórico/Evolução (`/audit/units/:unitId/historico`)
- **Objetivo:** mostrar como a unidade evoluiu e permitir chegar a qualquer auditoria anterior.
- **Dados:** `summaries({p_unit})` (mesma carga da 6.2).
- **Ações:** abrir auditoria; exportar histórico (Excel) e imprimir/PDF com filtro de datas (`ReportingActions kind="unit_history"`, regras atuais).
- **Permissões:** relatório só com `read` + `export` na unidade (como hoje).
- **Estrutura:**
  - gráfico de evolução: `final_score` por `applied_on` das finalizadas, com linhas de referência em 51% e 76%, pontos com faixa + rótulo no tooltip/legenda, e tabela equivalente para leitores de tela;
  - lista/tabela do histórico: data, status, responsável, progresso (rascunho) ou resultado + faixa (finalizada), delta vs. finalizada anterior, "Abrir";
  - seção "Relatório do histórico".
- **Desktop:** gráfico com largura total (altura ~220 px); tabela densa.
- **Mobile:** gráfico com largura total (altura ~180 px), sem scroll horizontal; o histórico vira lista de linhas empilhadas.
- **Estados:** menos de 2 finalizadas mostra o gráfico com aviso "Evolução disponível a partir de 2 auditorias finalizadas" (sem série fictícia); sem auditorias; loading/erro; erro de intervalo de datas (texto atual).
- **Reutilizar:** `ReportingActions`, `Result`, `Delta`, `StatusBadge`, `Progress`, a lógica de "anterior finalizada" do `UnitHistory`.
- **Substituir:** lista atual por `UnitHistoryTable` + `ScoreTrend` (SVG inline, **sem dependência**, cores conforme a regra das faixas).

### 6.4 Nova auditoria (modal)
- **Objetivo:** iniciar uma auditoria com o mínimo de atrito.
- **Dados:** unidades ativas com create; última `applied_on` da unidade (já carregada) para sugerir a visita anterior.
- **Ações:** salvar (RPC `create_inspection`, inalterada); cancelar.
- **Permissões:** como hoje.
- **Estrutura:** `Modal` atual. Unidade (pré-selecionada e somente leitura quando aberta pela unidade), data de aplicação (hoje), visita anterior **sugerida** com a última data de aplicação da unidade (editável e opcional), texto "158 critérios".
- **Pós-sucesso:** navega para `/audit/inspections/:id/checklist` (início do preenchimento).
- **Mobile:** layout atual do `Modal` (largura total, 16 px nos campos, botões ≥44 px).
- **Estados:** sem unidade disponível (texto atual); erro do servidor (`Form` atual).
- **Adaptar:** `NewInspection` (prop de unidade fixa, valor sugerido, destino da navegação).

### 6.5 Auditoria — Visão geral (`/audit/inspections/:id`)
- **Objetivo:** dar o resumo operacional e servir de ponto de decisão (continuar, finalizar, reabrir, exportar, ver planos).
- **Dados:** os da carga atual de `InspectionPage` (summary + catálogo + answers) + `checklist_evidence` (já carregado pelo controller) + `plan_summaries(p_inspection)` quando houver `action_plan.read`.
- **Ações:** as do lifecycle atual no cabeçalho persistente (Finalizar / Reabrir / Exportar / Imprimir), "Ir para o checklist", "Ver planos".
- **Permissões:** as atuais (`edit`, `finalize`, `reopen`, `export`, `action_plan.read`).
- **Estrutura do cabeçalho persistente (todas as abas):**
  - breadcrumb `Auditorias / Unidade / dd/mm/aaaa`;
  - unidade, status, data de aplicação, responsável, visita anterior;
  - progresso `n/158`;
  - conformidade: parcial neutra no rascunho, e faixa + rótulo na finalizada;
  - ações;
  - abas `Visão geral | Checklist | Plano de ação`.
- **Conteúdo da Visão geral:**
  - resultado: final, ou parcial com "Parcial · em andamento";
  - contagens AT/AP/NAT/NAP com rótulo textual (nunca só cor) e "não respondidos";
  - resultado por seção: tabela com respondidos/total, score e classificação só quando a seção está completa (regra atual); cada linha abre o checklist naquela seção;
  - pontos de atenção: critérios AP/NAT com observação, número e seção, com link para o critério no checklist;
  - evidências: total e link para a lista;
  - planos: contagem por status (Pendente / Em andamento / Concluído) e link para a aba;
  - informações: criada em, finalizada em (quando houver), modelo do checklist.
- **Desktop:** cabeçalho compacto (≤ ~180 px); conteúdo em grid de 2 colunas (resultado + seções | pontos de atenção + planos).
- **Mobile:** cabeçalho compacto (unidade, status, progresso, conformidade); ações secundárias em "Mais ações" (sheet), com Finalizar visível; abas em barra segmentada (D7); 1 coluna.
- **Estados:** draft, finalized, conflict/stale e transição de lifecycle (§6.14–6.16); planos indisponíveis por permissão (seção oculta) ou por erro (aviso local, sem bloquear a página).
- **Reutilizar:** `Confirm` de finalize/reopen, `ReportingActions`, `Progress`, `StatusBadge`, `evaluate`/`tally`/`formatScore`.
- **Adaptar:** `InspectionPage` passa a ser o **dono do estado** (`InspectionShell`); hero vira `InspectionHeader`.
- **Substituir:** link "Planos de ação desta auditoria" (vira aba); novos `InspectionOverview`, `SectionResults`, `AttentionList`.

### 6.6 Auditoria — Checklist (`/audit/inspections/:id/checklist`)
- **Objetivo:** preencher e revisar os 158 critérios com densidade operacional.
- **Dados/ações/permissões:** **idênticos aos atuais.** `saveAnswer` otimista com `version`, fila por item, conflito PGRST116/40001, `onPending` bloqueando relatórios e finalize, evidências por critério, paginação de seções, foco no título da seção.
- **Estrutura:** `SectionNav` (lista sticky no desktop; barra + sheet no mobile) + seção atual. Critério em linha densa:
  - número e texto dominantes;
  - respostas AT/AP/NAT/NAP alinhadas à direita no desktop e em linha inteira abaixo do texto no mobile (≥44 px sempre);
  - observação compacta, que expande com AP/NAT (regra atual);
  - evidências em disclosure "Evidências (n)" (D5);
  - menos bordas/cartões: separadores entre critérios em vez de card por critério.
- **Opcional (sem dado novo, precisa de aprovação):** filtro "Somente não respondidos" na seção atual, só no cliente.
- **Estados:** os atuais (salvando/salvo/erro/conflito por item; stale global; somente leitura; finalizada).
- **Reutilizar:** `SectionNav`, lógica integral de `ChecklistItem`, `ChecklistEvidence`, `useChecklistEvidence`.
- **Adaptar:** markup/CSS de `ChecklistItem` (densidade, disclosure), sem tocar em `save()`/fila/conflito.
- **Requisito técnico:** a troca de aba não pode perder edição pendente. O estado continua no `InspectionShell`. Enquanto houver `pending.size > 0`, a aba Checklist permanece montada (oculta com `hidden`) ou a troca de aba espera o blur/salvamento. A implementação escolhe uma das duas e cobre com teste.

### 6.7 Auditoria — Plano de ação (`/audit/inspections/:id/plano`)
- **Objetivo:** ver, sem sair da auditoria, os planos gerados pelas não conformidades.
- **Dados:** `action_plans.plan_summaries(p_inspection)` (contrato existente), consumido por **um ponto público explícito do módulo de Planos de Ação** (ex.: `modules/action-plans/public.ts`, exportando a consulta por auditoria e os badges de status). A Auditoria não importa os internos de Action Plans (ADR-003, regra de integração).
- **Ações:** abrir plano (`/action-plans/:id`); "Abrir na fila de Planos de Ação" (`/action-plans?inspection=:id`). Sem criação/edição aqui: planos de checklist nascem das respostas AP/NAT, e planos manuais pertencem ao módulo de Planos de Ação.
- **Permissões:** aba visível só com `action_plan.read` na unidade.
- **Estrutura:** resumo por status; lista densa com nº do critério, ponto de melhoria, origem (AP/NAT, "origem inativa" quando `source_active=false`), status, prazo (com "atrasado" quando aplicável, regra existente) e responsável.
- **Desktop:** tabela densa. **Mobile:** lista empilhada; ações ≥44 px.
- **Estados:** sem planos ("Nenhum plano de ação para esta auditoria."); erro com retry; loading.
- **Reutilizar:** contrato `plan_summaries`, `PlanBadges`/rótulos de lifecycle via ponto público.
- **Adaptar:** criar o ponto público de leitura em Action Plans (reexportação, sem lógica nova).
- **Substituir:** nada no módulo de Planos de Ação.

### 6.8 Evidências
- **Objetivo:** manter a evidência por critério exatamente como está e dar visibilidade do conjunto.
- **Dados:** `checklist_evidence`, `pending_count` (já usados).
- **Ações:** anexar, baixar, remover, revisar na finalização: **inalteradas**.
- **Estrutura:** no checklist, disclosure por critério (D5); na visão geral, total + lista agrupada por critério (só download). A revisão do conjunto no `Confirm` de finalização continua idêntica.
- **Estados:** carregando, erro com retry, envio em andamento/erro (disclosure aberto automaticamente), conflito do conjunto (40001) com o aviso atual.
- **Reutilizar:** `ChecklistEvidence`, `useChecklistEvidence`, `evidence.ts`, `evidence.css`.
- **Evidências de planos:** continuam no módulo de Planos de Ação.

### 6.9 Navegação desktop
- O shell não muda: sidebar global com "Auditorias", breadcrumbs do topbar e foco/scroll do `main` na troca de rota.
- Dentro do módulo: breadcrumb local (`Auditorias / Unidade / Auditoria`); abas roteadas da unidade e da auditoria; cabeçalho da auditoria **não sticky** (o sticky é a `SectionNav`, como hoje, para não acumular camadas sob o topbar).
- Teclado: ordem natural (breadcrumb → cabeçalho → ações → abas → conteúdo); abas com `aria-current="page"`; entrada de página Elo inalterada.

### 6.10 Navegação mobile
- Shell inalterado (barra de marca, drawer, safe areas).
- Cabeçalho da auditoria compacto; "Mais ações" em sheet (`Drawer className="sheet"`, padrão existente) com Exportar, Imprimir e Reabrir; Finalizar visível no cabeçalho.
- Abas em barra segmentada com 3 itens de largura igual, ≥44 px e sem scroll horizontal (D7); sticky quando necessário, sempre abaixo do header/safe-area e sem cobrir conteúdo.
- Checklist: barra de seção sticky + sheet (atual), abaixo da altura real do header/safe area (invariante do aceite de Qualidade).
- Unidade: abas `Resumo | Histórico` em barra segmentada.
- Campos com 16 px (Elo); sem teclado aberto antes de interação explícita.

### 6.11 Loading
- Primeira carga: `Loader` Elo ou blocos esqueleto **sem números**. Nunca valores placeholder que pareçam dados.
- Recarga (retry/lifecycle): conteúdo anterior escondido pelo guard atual ("Atualizando estado da auditoria…").
- Dados secundários (planos, evidências) carregam por seção, sem bloquear a página.

### 6.12 Empty
| Contexto | Texto/ação |
|---|---|
| Sem unidades no acesso | texto atual (solicitar atribuição por unidade) |
| Busca/filtro sem resultado | "Nenhuma unidade encontrada." + limpar filtros |
| Unidade sem auditorias | "Nenhuma auditoria registrada para esta unidade." + "Nova auditoria" se permitido |
| Evolução com menos de 2 finalizadas | aviso, sem série fictícia |
| Sem atividade recente | "Nenhuma atividade recente." |
| Auditoria sem planos | "Nenhum plano de ação para esta auditoria." |
| Critério sem evidência | "Nenhuma evidência anexada." (atual) |

### 6.13 Error
- `Notice error` + "Tentar novamente" (padrão atual) por bloco; mensagens via `shared/errors`.
- Auditoria inexistente/sem acesso: "Auditoria indisponível" + voltar (atual).
- Unidade inexistente/sem acesso: aviso atual.
- Erros de save por critério, de relatório e de evidência: os atuais.

### 6.14 Draft
- Badge "Em andamento" (info); conformidade "parcial" neutra, sem faixa.
- Editável conforme `audit.inspection.edit`; sem permissão: aviso "Você pode consultar esta auditoria, mas não editá-la." (atual).
- Finalizar desabilitado até 158/158, sem pendências/stale/conflito; com explicação "Responda todos os critérios para finalizar (n restantes)" (atual).

### 6.15 Finalized
- Badge "Finalizada" (neutro); resultado com faixa + rótulo; "Auditoria finalizada em … Somente leitura." (atual).
- Checklist somente leitura (observações em texto, evidências só download).
- Reabrir conforme `audit.inspection.reopen`, com o `Confirm` atual.

### 6.16 Reopened / conflict
- **Reaberta:** pelo contrato, volta a ser rascunho; a UI trata como Draft e **não** mostra "reaberta" (G5).
- **Stale (outra sessão):** aviso atual "Esta auditoria foi alterada em outra sessão. Atualizar", com edição bloqueada até recarregar; vale em qualquer aba.
- **Conflito por critério:** mensagem atual no item, com o valor do servidor recarregado.
- **Conflito do conjunto de evidências (40001 na finalização):** aviso atual + "Recarregar evidências e revisar".
- **Transição de lifecycle:** guard atual impede exibir o summary antigo após finalizar/reabrir.

## 7. Matriz de componentes

| Atual | Decisão | Detalhe |
|---|---|---|
| `AuditModule` | **adaptar** | Novas rotas da §5; 404 mantido |
| `AuditOverview` | **substituir** | Nova composição (KPIs, filtros, `UnitCard`, atividade); preserva carga de dados, busca e regra de visibilidade das unidades |
| `UnitHistory` | **substituir** | Vira `UnitPage` (cabeçalho + abas) com `UnitSummary` e `UnitHistoryTable` + `ScoreTrend`; preserva carga, regra de "anterior finalizada" e relatório |
| `InspectionPage` | **adaptar** | Vira `InspectionShell`, dono de **todo** o estado atual (resource, saved answers, pending, stale, review, lifecycleTransition, evidence controller, Confirm); renderiza `InspectionHeader` + abas + painéis. Lógica preservada; mudança estrutural primeiro, sem mudança visual (§10, passo 2) |
| `NewInspection` | **adaptar** | Unidade fixa opcional, visita anterior sugerida, navegação para `/checklist` |
| `SectionNav` | **manter** | Ajustes de estilo apenas |
| `ChecklistItem` | **adaptar (só markup/CSS)** | Densidade e disclosure de evidências; `save()`, fila, conflito e `onPending` intocados |
| `Result` (`Progress`, `Result`, `Delta`, `StatusBadge`, `tallyOf`) | **manter** | Reutilizados em cards, unidade e cabeçalho |
| `ChecklistEvidence` | **manter** | Envolvido pelo disclosure; comportamento inalterado |
| `useChecklistEvidence`, `evidence.ts`, `evidence.css` | **manter** | — |
| `ReportingActions` | **manter** | Reposicionado (cabeçalho da auditoria; aba Histórico); no mobile, dentro de "Mais ações" |
| `PrintSurface`, `print.css`, `workbook.ts`, `reporting/*` | **manter (intocados)** | Print e Excel idênticos |
| `api.ts`, `types.ts`, `scoring.ts` | **manter** | Helpers derivados puros podem ser adicionados (ex.: agrupar overview por unidade); nenhum contrato novo |
| Bloco "Em andamento" do overview | **remover** | Absorvido por cards + filtro "Em andamento" |
| Link "Planos de ação desta auditoria" | **remover** | Substituído pela aba Plano de ação (que mantém o link para a fila) |
| Hero `.audit-hero` | **substituir** | `InspectionHeader` compacto e persistente |
| Novos | **criar** | `AuditKpis`, `UnitCard`, `UnitIdentity`, `UnitFilters`, `RecentActivity`, `UnitPage`, `UnitSummary`, `UnitHistoryTable`, `ScoreTrend`, `InspectionHeader`, `InspectionTabs`, `InspectionOverview`, `SectionResults`, `AttentionList`, `InspectionPlans` |
| `modules/action-plans` | **adaptar (mínimo)** | Ponto público de leitura (`public.ts`) reexportando a consulta por auditoria e os badges; sem lógica nova |

## 8. Invariantes e fora de escopo

- Não mudam: schema, migrations aplicadas, RLS, modelo de autorização, Core/Units, scoring, lifecycle, finalize/reopen, concorrência, evidências, Action Plans, reporting, Excel, print/PDF, Supabase e contratos de API.
- Não há RPC, view nem coluna nova. Se a aprovação de algum gap (G1–G12) exigir contrato novo, ele vai para brief separado.
- Nada de dependências novas (gráfico em SVG inline), fontes web ou frameworks de CSS.
- Não copiar: sidebar/rail da v2.9.1, termo "Cliente", exclusão de unidade em cascata, `visualBand` em rascunho, armazenamento local de capas.
- A Auditoria não cria fonte própria de unidade nem de imagem.
- A Home, a Administração e o Login não mudam.

## 9. Impacto em testes (a atualizar na mesma série de commits)

| Arquivo | Dependência atual | Ajuste |
|---|---|---|
| `tests/audit-ui.test.tsx` | Renderiza `/audit/inspections/i1` e espera checklist, "Finalizar", "Anexar arquivo…" visíveis | Usar `/checklist` (D1) e abrir o disclosure (D5); asserções de comportamento mantidas |
| `tests/integration/audit.mjs` (~L2000–2290) | `/audit/units/:id`, `/audit/inspections/:id`, "Finalizar"/"Reabrir", alvos de toque, overflow 375 | Rotas novas; mesmas asserções de lifecycle, toque e overflow em todas as telas novas |
| `tests/integration/audit-evidence-browser.mjs` | `/audit/inspections/:id` com evidências e finalize/reopen | `/checklist` + disclosure; revisão de evidências inalterada |
| `tests/integration/quality-touch.mjs` | Alvos de toque | Incluir abas, filtros, cards, "Mais ações" |
| `tests/audit-reporting-actions.test.tsx` | `ReportingActions` | Sem mudança esperada (componente mantido) |

Nenhuma asserção de comportamento (concorrência, stale, evidências, permissões, scoring) pode ser removida. Ajustes só de navegação e seletores.

## 10. Sequência de implementação (commits atômicos)

1. `docs(briefs): add Audit UX v2 brief` (este arquivo, após aprovação das decisões D1–D7)
2. `refactor(audit): extract inspection shell state owner and nested routes`: sem mudança visual; checklist continua na rota atual; testes verdes sem alteração
3. `feat(audit): add inspection header and routed tabs`: abas, cabeçalho compacto, "Mais ações" mobile, rota padrão conforme D1, testes de navegação atualizados
4. `feat(audit): add inspection overview tab`: resultado, contagens, seções, pontos de atenção, evidências, informações
5. `feat(action-plans): expose public read contract for inspection plans`: reexportação, sem lógica nova
6. `feat(audit): add inspection action plan tab`
7. `style(audit): densify checklist rows and collapse criterion evidence`: só markup/CSS; D5
8. `feat(audit): add unit page with summary and history tabs`: `ScoreTrend` SVG, relatório movido
9. `feat(audit): rebuild overview around monitored units`: KPIs, filtros, cards, atividade recente
10. `feat(audit): adapt new inspection flow`: unidade fixa, visita sugerida, destino checklist
11. `test(audit): cover new routes, tabs, touch targets and overflow`
12. `docs(audit): sync Quality docs and brief status`

Cada commit mantém typecheck, lint, testes e build verdes. O passo 2 é o gate de segurança: só seguir se as integrações de Auditoria (`audit.mjs`, `audit-evidence.mjs`) passarem sem mudança de asserções.

## 11. Critérios de aceite

1. Fluxo `/audit → unidade → histórico → auditoria (Visão geral | Checklist | Plano de ação)` navegável por mouse, toque e teclado, em 375/768/1024/1440, sem overflow horizontal.
2. Todo número exibido é rastreável a um contrato da §4.1 ou a um derivado da §4.2; nenhum placeholder apresentado como dado.
3. Faixas de resultado só em finalizadas; rascunho sempre "parcial" neutro; status nunca só por cor.
4. Checklist com comportamento idêntico: 9 seções, 158 critérios, AT/AP/NAT/NAP, observações, autosave, conflito/stale, evidências, finalize/reopen e permissões. Integrações de Auditoria e Evidências verdes com as asserções preservadas.
5. Troca de aba não perde edição pendente (teste dedicado).
6. Aba Plano de ação usa só `plan_summaries(p_inspection)` via ponto público de Action Plans; nenhuma escrita em Action Plans pela Auditoria.
7. Excel, print/PDF e `print.css` idênticos.
8. Alvos ≥44 px em toque/<1024 px, safe areas, foco visível e `prefers-reduced-motion` respeitados nas telas novas.
9. Gaps G1–G12 não são preenchidos com dados fictícios.
10. Validação completa: typecheck, lint, testes, build (variáveis fictícias da CI), verify:build, audit e integrações de browser na CI.

## 12. Fontes consultadas

- Código: `modules/audit/*` (incl. `reporting/ReportingActions.tsx`), `modules/action-plans/{api,types,lifecycle,ActionPlansOverview}.ts(x)`, `app/App.tsx` (foco/scroll na troca de rota).
- SQL: `202609240001_core_foundation.sql` (`core.units`), `202609240004_audit_domain.sql` (`units`, `inspection_summaries`, `create/finalize/reopen`), `202609250009_audit_authorization.sql`, `202609240006_action_plans_domain.sql` (`plan_summaries`).
- Docs: `AUDIT_SOURCE_OF_TRUTH.md` (Unit experience, Platform adaptation), `QUALITY_UI_V1.md` §1, §6–§9, `DESIGN_SYSTEM_ELO_V1.md`, ADR-003.
- Referência original v2.9.1 (local, fora do repositório): `DOCUMENTACAO_TECNICA.md` (Interface v2.2/v2.3/v2.6/v2.7) e `Sistema_Checklist_Qualidade.html`: KPIs "Unidades monitoradas", "Auditorias registradas", "Conformidade média", "Inspeções em preenchimento"; "Atividade recente"; abas "Visão geral / Checklist / Plano de ação"; capas por unidade em data URL (não reaproveitável).
- Testes: `tests/audit-ui.test.tsx`, `tests/integration/{audit,audit-evidence-browser,quality-touch}.mjs`.

## 13. Notas de implementação

Desvios conscientes em relação ao texto das telas, todos dentro das decisões D1–D7:

- **"Mais ações" no mobile (§6.5/§6.10):** é um disclosure inline, não um sheet. `ReportingActions` mantém estado e a prévia de impressão; dentro de um sheet que fecha, a prévia seria desmontada. O controle continua montado quando recolhido.
- **Abas da auditoria não são sticky (D7):** a barra de seção do checklist já é sticky abaixo do header/safe-area; empilhar duas barras esconderia conteúdo. D7 permite sticky "quando necessário".
- **Checklist sempre montado:** fora da aba Checklist, o painel fica oculto (`hidden`) para que filas de salvamento por critério e texto em digitação sobrevivam à troca de aba. Coberto por teste unitário dedicado.
- **Atividade recente → "Auditorias recentes":** a seção lista auditorias por data de aplicação e declara na própria tela o que o contrato inclui (em andamento + as duas últimas finalizadas de cada unidade). Não há feed de eventos nem uso de `core.system_audit_log`.
- **Evolução no Resumo da unidade:** as últimas 6 auditorias finalizadas; o gráfico completo fica no Histórico.
- **`verify:build`:** o marcador de texto de Planos de Ação passou a ser `"Novo plano de ação"` (do próprio módulo), porque o link "Planos de ação desta auditoria" virou a aba.

