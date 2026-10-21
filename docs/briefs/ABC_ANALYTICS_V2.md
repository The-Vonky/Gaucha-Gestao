# Brief — Curva ABC v2: áreas analíticas

**Status:** escopo funcional **solicitado pelo responsável em 21/10/2026** (missão "recuperar e integrar a Curva ABC"); contratos de leitura implementados nas branches `feat/abc-analytics-read-20261021` e seguintes, **aguardando revisão humana nas PRs**. Decisões D1–D7 da [matriz](../modules/abc/MATRIZ_EQUIVALENCIA_LEGADO.md#4-decisoes-que-exigem-aprovacao) continuam **PENDENTES**.
**Depende de:** [brief v1](ABC_DOMAIN_V1.md) e da correção P0 da importação ([PR #78](https://github.com/The-Vonky/Gaucha-Gestao/pull/78)).
**Produção:** NO-GO.

## Objetivo

Recuperar as capacidades analíticas do sistema antigo dentro de **Custos → Curva ABC**, sobre revisões publicadas e imutáveis, com a mesma autorização da consulta v1. Seis áreas: **Visão geral, Importações, Comparações, Relatórios, Produtos e Categorias**.

## Princípios

1. **Somente leitura.** Nenhuma tabela, permissão ou caminho de escrita novo. Todas as funções exigem `abc.report.read` **na unidade pedida** (`private.has_unit_permission`), como `unit_series` e `revision_detail`. Atribuição de setor não concede a unidade; perfil inativo não lê.
2. **Uma unidade por consulta.** Não há agregado entre unidades: comparação entre unidades depende da Decisão D6.
3. **Somente revisão vigente.** Indicadores usam a revisão vigente de cada série (unidade + competência + modalidade). Revisões substituídas continuam consultáveis no histórico e na área Importações.
4. **Fórmulas no banco.** Somas, razões, classes e comparações são calculadas em `numeric` pelo PostgreSQL. O navegador ordena, filtra e formata. Valores trafegam como texto.
5. **Modalidades separadas.** Líquido e bruto nunca são somados nem comparados entre si.

## Política de precisão

- Valores fonte e somas: `numeric` sem escala fixa, exatos.
- Razões (custo médio `T/Q`, participações, variações): `abc_private.ratio`, **20 casas decimais**, arredondamento half-up, `trim_scale`. Somar ao divisor um zero com 30 casas eleva a escala da divisão sem arredondar o divisor; assim a divisão não para nos 16 dígitos significativos padrão e um divisor muito pequeno, mas não nulo, nunca vira zero.
- Divisão por zero devolve `null`, nunca erro nem infinito.
- Exibição: R$ com 2 casas, custos unitários com 4, percentuais com 2 (`ROUND_HALF_UP` sobre texto, `format.ts`).

## Regras de comparação (`metricas-v1` da origem)

Referência: `intranet/docs/04-METRICAS.md` da origem, seções 3 e 4. Divergências em relação ao desktop legado são intencionais e estão na última coluna.

| Situação | Estado | Variação do custo médio | Efeitos | Diferença do legado |
| --- | --- | --- | --- | --- |
| Código só na competência atual | `new` | nula | entra na ponte como `+T1` | legado: "Novo item" |
| Código só na base | `absent` | nula | entra na ponte como `−T0` | legado: "Removido" |
| Unidade de medida diferente (após LT→L, UND→UN) ou quantidade zero em uma das pontas | `not_comparable` | nula | `T1 − T0` na linha "não comparáveis" | legado comparava preços mesmo assim |
| Custo médio maior / menor / igual (sinal exato de `T1·Q0 − T0·Q1`) | `up` / `down` / `unchanged` | `100·(T1·Q0 − T0·Q1)/(T0·Q1)` | preço `T1 − r`, quantidade `r − T0`, com `r = T0·Q1/Q0` | legado usava tolerância de R$ 0,01 para "Estável" e o custo unitário do ERP |

- **Associação de produtos:** somente pelo **código ERP exato**, inclusive zeros à esquerda (`001` ≠ `1`). Nomes parecidos nunca associam produtos.
- **Custo médio analítico:** `P = T/Q` (total ÷ quantidade). O custo unitário informado pelo ERP é exibido no detalhe, mas não é a base da variação.
- **Ponte do total:** `ΔT = Σ efeito preço + Σ efeito quantidade + Σ novos − Σ ausentes + Σ não comparáveis + resíduo`. Com uma única divisão por item, o resíduo é **zero por construção** e continua exposto para detectar regressões.
- **Alertas de conferência:** variação do custo médio `≥ +300%` ou `≤ −75%`, ou custo base zero com custo atual positivo (não há percentual possível). São heurísticas, não prova de erro; os itens não são excluídos de totais.
- **Índice da carteira comum:** `100·(Σ T1 / Σ r − 1)` sobre itens comparáveis, com a quantidade de itens informada.
- **Impacto por classe:** agrupado pela **classe calculada da base**; novos ficam em `NEW` e linhas sem classe em `NONE`.
- **Competência sem publicação** na modalidade: erro `P0002`. Competências iguais: `23514`.

## Contratos (schema `abc`)

| Função | Retorno (jsonb) | Uso |
| --- | --- | --- |
| `overview(p_unit, p_cost_basis)` | unidade, modalidades com publicação, competências com totais, revisão vigente e divisão por classe calculada (`classes[A,B,C]`, `unclassified`) | Visão geral, evolução, Categorias |
| `competency_products(p_unit, p_cost_basis, p_competency)` | revisão vigente; `lines` com posição, custo médio, participação, participação acumulada anterior, classes ERP e calculada, linha da planilha; `summary` com classes, matriz ERP × calculada e gasto por unidade de medida | Produtos, Relatórios, Categorias |
| `product_history(p_unit, p_cost_basis, p_code)` | evolução do produto por competência, com a revisão de origem | Produtos |
| `compare(p_unit, p_cost_basis, p_base, p_current)` | revisões comparadas, `total_delta`, `total_variation`, `summary` (contagens, ponte, carteira comum, impacto por classe) e `items` | Comparações, Visão geral, Relatórios |
| `unit_revisions(p_unit)` | todas as revisões da unidade, vigentes e substituídas, com autor, motivo, avisos e arquivo | Importações |

Erros: `42501` sem permissão ou fora do escopo; `23514` parâmetro inválido; `P0002` competência sem publicação. Migration: `supabase/migrations/20261021120000_abc_analytics_read_v1.sql` (append-only).

## Áreas da interface

| Área | Rota | Conteúdo |
| --- | --- | --- |
| Visão geral | `/abc` | Unidade e modalidade, última competência, total valorizado, produtos, divisão A/B/C, evolução entre competências, maiores produtos, aumentos e reduções contra a competência anterior, atalhos; orientação para a primeira importação quando não há dados |
| Importações | `/abc/imports` | Importar (unidades com `abc.report.publish`), revisões vigentes e substituídas com autor, data, motivo, avisos, arquivo e conferência |
| Comparações | `/abc/compare` | Base × atual, ponte, rankings, filtros por estado, classe e busca |
| Relatórios | `/abc/reports` | Distribuição por classe, principais produtos, gasto por unidade de medida, ERP × calculada, evolução, variações e impactos |
| Produtos | `/abc/products` | Busca por código/descrição, filtros por classe, histórico e evolução do produto, link para a revisão de origem |
| Categorias | `/abc/categories` | Distribuição por **classe ABC** (não é categoria comercial) por competência; categoria comercial somente após a Decisão D3 |

## Fora do escopo desta versão (aguardam decisão)

Categorias comerciais e associação de produtos (D3), ajuste manual de itens (D4), exportação Excel/PDF (D5), comparação entre unidades (D6), intervalos de vários meses, custo por refeição, compras e fornecedores. Exclusão de períodos **não será implementada**: correções viram nova revisão.

## Critérios de aceite

1. Leitura negada (`42501`) para outra unidade, setor sem unidade, outro módulo, perfil inativo, sem perfil e `anon`, em todas as funções.
2. Comparação reproduz os exemplos da metodologia (100 kg × R$ 10 → 80 kg × R$ 12: +20% no custo médio, −R$ 40 no total, preço +R$ 160, quantidade −R$ 200) e fecha a ponte com resíduo zero.
3. Associação somente por código exato; LT/L e UND/UN normalizados; divisões por zero nulas.
4. Indicadores iguais aos totais das revisões publicadas.
5. Seis áreas navegáveis, com carregamento, vazio, erro e sem permissão, sem estouro horizontal em 375 px.
6. `npm run typecheck`, `lint`, `test`, `build`, `verify:build`, `audit` e as integrações do `validate.yml` aprovados.
