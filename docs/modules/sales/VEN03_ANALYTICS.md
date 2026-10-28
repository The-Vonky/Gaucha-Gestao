# VEN-03 — Motor analítico de Vendas / Maquininhas

**Estado:** implementada para revisão; merge e homologação pendentes. Autorização
expressa do mantenedor em 28/10/2026 para código, PR e testes no notebook local.
**Baseline:** `main` `72ae883ba279069d961b40054d68012d34ed3f8c`, merge da PR #91
(VEN-02). VEN-01 foi integrada na PR #90. Merge não comprova implantação.
**Fontes:** [VEN-00 aprovada](../../briefs/VEN-00_consolidada_vendas_maquininhas_2026-10-28.md),
VEN-D01–D12, [VEN-01](VEN01_FOUNDATION.md), [VEN-02](VEN02_OPERATIONS.md), ADR-001/002/004/005.
**Evidência local e comandos:** [registro da validação](VEN03_LOCAL_VALIDATION.md).

## API e limites

Uma RPC reúne as regras para evitar divergências entre componentes:

```sql
public.sales_dashboard(
 p_from date, p_to date, p_units uuid[] default null,
 p_scope text default 'stone', p_daily_month date default null
) returns jsonb;
```

`p_from`/`p_to` são primeiros dias de competências civis ISO, inclusivos, finitos,
entre `0001-01-01` e `9999-12-01`. Até **24 competências calendárias** por chamada,
inclusive lacunas. Unidade nula = todas as autorizadas, inclusive inativas; lista
explícita não vazia, unidimensional, até **100 UUIDs**, sem nulos. Qualquer UUID
sem autorização nega a chamada inteira. Duplicatas são deduplicadas. Se o conjunto
autorizado exceder 100 unidades, exigir seleção explícita. Não há paginação parcial
de totais: o envelope inteiro é limitado, até 2.400 células mensais e 6.200 pontos
diários por unidade (dois meses de até 31 dias × 100). Uma nova janela/foco solicita
outra leitura. O custo de busca da referência inclui o histórico autorizado anterior.

`p_scope='stone'` é o padrão; `combined` inclui PIX no valor exibido. Ambos os
componentes são retornados separadamente. `p_daily_month` deve estar no intervalo;
quando nulo, usa a última competência disponível da janela. Se não há dados nessa
competência selecionada, o detalhamento fica vazio. Disponibilidade é a união de
movimentos autorizados Stone/PIX, ajustes e, **somente com permissão global**, status
globais. PIX não desaparece da série por selecionar Stone. Não há cache materializado.

Adaptador: `salesDashboard(DashboardFilters)` em `modules/sales/api.ts`;
`SalesDashboard` e tipos associados em `types.ts`; guarda monetária de transporte
em `analytics.ts`. Nenhuma tela, rota, menu, CSS ou biblioteca foi acrescentada.

| Campo | Contrato / uso futuro |
| --- | --- |
| `contract_version`, `filters`, `units` | Versão 1, filtros efetivos e catálogo Core autorizado, com flag de atividade |
| `metadata` | Escalas, rounding, visibilidade do status global; primeira/última competência disponível **até p_to**, lacunas calendárias da janela |
| `summary` | Total selecionado, Stone, PIX, diário, ajuste, média por dia considerado e média dos totais mensais disponíveis; última competência, melhor fechada confirmada, líder, concentração das duas maiores |
| `months` | Série ordenada; totais, dias, status, comparação, média, projeção estimada, reconciliação |
| `unit_months` | Uma matriz comum, inclusive zeros, para evolução por unidade, barras empilhadas e heatmap; intensidade relativa ao maior valor, com piso 1 real como no legado |
| `ranking` | Somente valores exibidos positivos; participação no total selecionado; ordem `total DESC, unit_id ASC` e posição sequencial |
| `payment_mix` | Stone e PIX, com participações no total dos **dois métodos**, independentemente da alternância; não altera `summary.total` |
| `daily.points` | Por dia/unidade: Stone, PIX, valor selecionado e acumulados separados; data, dia, competência e sinal de cobertura `has_elapsed` |
| `daily.totals` | Os mesmos montantes consolidados no SQL, sem unidade; evita somas financeiras em `Number` no futuro gráfico |
| `daily.competency/reference_month/cutoff_day` | Mês selecionado e referência anterior disponível, podendo sair da janela; ambas as séries completas são retornadas |
| `insights` | Maior movimento entre fechados comparáveis, recuo negativo e ritmo/projeção, sem texto visual ou persistência |

Os pontos têm zeros nos dias sem lançamento, **sem inventar transações**; a UI deve
respeitar `has_elapsed` e o limite do mês parcial ao traçar a curva. O drill-down usa
`unit_id`, competência e `sale_date`; dados de lançamentos individuais continuam
exigindo **sales.entry.read** nas RPCs VEN-02. Dashboard não concede leitura bruta.
Ocultar uma série é estado da VEN-04; para recalcular o recorte, reenviar as unidades.

## Fórmulas e precisão

- Total mensal = lançamentos ativos + ajustes válidos, por unidade/método. Diário e
  acumulado **não** recebem ajuste sem data. Excluídos não participam de disponibilidade,
  totais, referências ou séries. Inativar unidade não apaga histórico autorizado.
- Anterior = última competência disponível no conjunto autorizado/selecionado antes
  da atual, independentemente de lacunas ou limite inicial visível.
- Comparação fechada: `(atual-anterior)/abs(anterior)*100`; parcial: corte
  `min(last_day_with_data, reference_days)`, somas diárias de ambos até esse dia.
  Referência inexistente, base zero ou status atual indeterminado: `available=false`,
  percentual nulo. Metadados da referência e valores autorizados permanecem explícitos.
- Snapshot: `last_day_with_data=max(dia dos lançamentos autorizados, dia histórico)`;
  `partial=(NOT is_closed) AND last_day_with_data<days_in_month`. `is_closed=false`
  no último dia não implica parcialidade. Sem snapshot e com acesso global, derivar
  parcialidade somente na competência corrente em **America/Sao_Paulo**, como no legado.
  Mês confirmado completo sem dia de dado recebe `days_in_month` no metadado de cobertura.
- Média mensal = total exibido / (parcial ? último dia : dias do mês); divisor zero
  ou status indeterminado → nulo. Média diária do período usa a soma desses divisores;
  se qualquer competência tem status indeterminado, retorna nulo. Média mensal da série
  = total / quantidade de competências disponíveis, sem preencher lacunas financeiras.
- Projeção = diário / último dia × dias do mês, somente parcial confirmado e dia > 0.
  `projection_is_estimate` e `is_estimate` identificam estimativa. A comparação projetada
  usa o total mensal da referência, como no legado.
- NUMERIC em todos os cálculos. Dinheiro JSON é **string com duas casas**, sem limite
  artificial de precisão da soma. Percentuais e intensidades são strings com seis
  casas; ausência de base → nulo. PostgreSQL `round(NUMERIC,n)` na fronteira JSON:
  empates afastam de zero. Não arredondar linhas intermediárias nem somar strings
  convertidas a float. A VEN-04 pode formatar ratios para exibição, sem recalcular totais.
- Tendência segue limiar legado ±0,05 ponto percentual (`up`, `down`, `neutral`),
  calculada sobre percentual não arredondado; sem base → `unavailable`.
- Melhor fechada e movimentos empatados usam competência crescente. Maior avanço
  retorna o maior movimento comparável, **inclusive negativo se todos recuam**, como
  a seleção do legado; a futura UI deve ler seu sinal. Recuo só existe com percentual
  negativo. Insights consideram referências fechadas dentro da janela, como no legado;
  a comparação de cada mês pode buscar referência fora dela.

Reconciliação expõe `total-daily_total-adjustment_total`, não um literal zero. O
oráculo e a fixture usam **BigInt de centavos independente** para confrontar o SQL.
Isso não prova reconciliação de um histórico real, ainda não migrado.

## Segurança e decisão sobre status global

Permissão obrigatória **sales.dashboard.read**, identidade e perfil ativos, capacidade
atual e grant global ou por unidade. Só setor é negado. Reutiliza bloqueios e a
revalidação de `sales_private.authorize` da VEN-02. Um único comando SQL reúne todos
os componentes num snapshot; a autorização é reavaliada por chamada. Sem novas
permissões, papéis, concessões automáticas, tabelas públicas ou SQL dinâmico.

SECURITY DEFINER justifica a leitura das tabelas privadas sem abrir SELECT ao cliente.
`search_path=''`, objetos qualificados, helpers sem EXECUTE público, somente a
assinatura pública recebe EXECUTE de authenticated; anon/PUBLIC não recebem.
RLS restritiva e revogação de USAGE/DML nas tabelas anteriores permanecem intactas.

**Decisão expressa do mantenedor em 28/10/2026, durante VEN-03:**

| Acesso | Status e métricas dependentes |
| --- | --- |
| Permissão global | Snapshot histórico original; regra VEN-D07 preservada; sem snapshot, regra legada de derivação |
| Somente unidade, mês histórico (ou não corrente) | `status_basis='historical_unavailable'`, `partial=null`, `is_closed=null`; não expõe nem existência, último dia ou fonte do snapshot global; média diária, comparação mensal e projeção indisponíveis |
| Somente unidade, mês corrente | `status_basis='scoped_dates'`; parcialidade derivada **apenas** das datas autorizadas Stone/PIX, sem consultar snapshot global |

**Impacto explícito na paridade:** o dashboard legado tinha leitura global; seus
indicadores históricos dependentes de status não podem ser reproduzidos com segurança
para um leitor por unidade. Não presumir fechamento por antiguidade. Totais, mix,
ranking, diário/acumulado e ajustes continuam exatos e autorizados. Esta limitação foi
sinalizada e o mantenedor autorizou continuar sob essas condições; não fecha homologação
VEN-07. Qualquer futura disponibilização de status unitário exige decisão e contrato
próprios; não duplicamos `month_statuses` por unidade.

A prova de não interferência compara **todo** o payload de A antes/depois de inserir
movimentos e snapshots de B, incluindo mês novo, ranking, heatmap, referência, dias
e metadados. O teste real de PostgREST também confronta os payloads com o mesmo JWT.

## Equivalência e diferenças registradas

Leitura estática do legado no commit `caa4236e8010cae48236e07ba033493b4d3ef80d`:
[dashboard.py](https://github.com/The-Vonky/dashboard_vendas-Gaucha/blob/caa4236e8010cae48236e07ba033493b4d3ef80d/backend/app/services/dashboard.py),
[dashboard-enhancements.js](https://github.com/The-Vonky/dashboard_vendas-Gaucha/blob/caa4236e8010cae48236e07ba033493b4d3ef80d/frontend/dashboard-enhancements.js),
[rota backend](https://github.com/The-Vonky/dashboard_vendas-Gaucha/blob/caa4236e8010cae48236e07ba033493b4d3ef80d/backend/app/api/dashboard.py)
e `backend/app/schemas.py` (sem schema tipado de dashboard; rota retorna dict).
Nenhum dado financeiro legado foi acessado.

| VEN-F / EQ | Fonte legada e contrato VEN-03 |
| --- | --- |
| F07/F08/F15; EQ-01/04/18/20/29 | `build_dashboard_data`, `renderPaymentMix`, `renderQualityFull`: mensal inclui ajuste; diário não; Stone inicial, mix separado |
| F09/F10/F16; EQ-05/06/07/08/15/19 | `latestComparisonFull`, `renderMonthlyTable`: referência disponível, corte equivalente, divisor e status |
| F11/F12/F13; EQ-09/10/11/12/13/14 | `unitRankingsFull`, gráficos/heatmap: ranking e matriz comuns; cores/interação ficam na VEN-04 |
| F14; EQ-16/17 | `dailyValueFull`, `cumulativeSeriesFull`, `renderDaily`: acumulados e projeção sem ajuste |
| EQ-02/03/21/22 | Filtros e identificadores para foco/drill-down; estado/navegação só VEN-04 |

Diferenças deliberadas: NUMERIC/strings substituem floats do legado (D12); UUID Core
substitui nome como identidade (D09); referência e totais respeitam autorização;
limitação histórica unitária acima; ranking/ties documentados; sem fallback de “melhor
fechado” para um mês parcial quando não existe fechado confirmado. `difference=0.0`
constante do legado foi substituído por identidade algébrica e prova independente.
As fórmulas financeiras aprovadas não foram modificadas.

## Limites e reversão

VEN-03 não conclui V1: VEN-04–08 não implementadas por esta PR; sem UI, Excel,
print, importação real, homologação ou cutover. Aprovação/merge são do mantenedor,
sem alegar segunda revisão humana. Nenhuma operação em STAGING ou PROD.

Migration `20261028163941_sales_analytics.sql` append-only, aplicada no notebook
após testes em memória; anteriores intactas. Reversão operacional, se necessária:
primeiro revogar EXECUTE da RPC por intervenção autorizada e nova migration;
forward-fix append-only para correções. Não apagar migrations, tabelas, histórico
ou fixtures persistidas mediante limpeza geral. Auth sintético permanece inativo,
lançamentos de teste são soft-deleted e auditoria preservada.
