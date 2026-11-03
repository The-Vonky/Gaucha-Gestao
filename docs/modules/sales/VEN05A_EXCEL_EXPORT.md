# VEN-05A — Exportação Excel autorizada

**Estado em 03/11/2026:** implementada para revisão do mantenedor; sem homologação,
aplicação da migration em banco persistente, deploy, migração financeira ou cutover.
VEN-05B (impressão/PDF) permanece fora de escopo. **PROD NO-GO.**

**Autorização:** pedido expresso do titular de 03/11 para limpar dez branches
integradas, implementar VEN-05A, testar com dados sintéticos e abrir PR sem merge.
Base: `91bd16b4344ab0be6ecea7f5f2067c3cbd2c3183`, merge da PR #94 (VEN-04B).
Branch: `codex/ven-05a-sales-xlsx`. A pasta preexistente `supabase/snippets/`, não
rastreada, foi preservada. Nenhum worktree, container, volume ou banco foi criado.

## Referências e equivalência

[VEN-00](../../briefs/VEN-00_consolidada_vendas_maquininhas_2026-10-28.md),
VEN-D01/02/08/09/11/12; VEN-F18, F15 e F22; EQ-30/35; A2/5/7/11.
[VEN-01](VEN01_FOUNDATION.md), [VEN-02](VEN02_OPERATIONS.md),
[VEN-03](VEN03_ANALYTICS.md), [VEN-04B](VEN04B_DASHBOARD_UI.md),
[autorização Core](../../architecture/AUTHORIZATION.md) e ADR-001/002/004/005.

Foram consultados no repositório `The-Vonky/dashboard_vendas-Gaucha`:

| Arquivo | Blob consultado | Evidência funcional |
| --- | --- | --- |
| `backend/app/services/excel_export.py` | `80d40566522e3f3032499323e3a0cfe2a69cce3f` | Lançamentos: data, unidade, forma, valor, última atualização; ajustes: competência, unidade, forma, valor e motivo; títulos, BRL, painéis congelados; arquivo integral sem filtros, conversão `float` e fórmula SUM |
| `frontend/print-tools.js` | `f9346b86b9035c0279d3ef62c7f4396fb467ae25` | Preparação de impressão e rótulos; sem contrato de Excel filtrado; impressão não portada nesta etapa |
| `frontend/app.js` | `00fd7264fb66fefdcca900cdb226d1697ae38740` | Não contém tratamento próprio de Excel no arquivo consultado; não inferir que transporta os filtros para o exportador |
| `docs/GUIA_USO.md` | `ac9811bd07aabe94937c9ba0f6506c1b08806455` | Dashboard/Dados & Backup iniciam download nativo em Downloads do Windows e exibem caminho; ajustes em aba separada |

A plataforma preserva a utilidade das abas, substitui caminhos Windows por download
web e acrescenta código/UUID da unidade, versão, contexto e reconciliação. Não copia
exportação irrestrita, aritmética `float` ou fórmulas do legado. Os padrões de
`audit/reporting/{workbook,download,ReportingActions}` foram examinados; usa-se a
mesma biblioteca instalada `write-excel-file@4.1.1` e tipagem explícita, sem importar
internals de outro módulo e sem alterar Auditoria ou dependências.

## Interface e recorte aplicado

Os mesmos controles aparecem em Lançamentos e Dashboard quando há interseção de
leitura detalhada e capacidade de exportação. As permissões da tela continuam
independentes das permissões do arquivo. Apenas dashboard não habilita exportação.

- **Exportar período filtrado:** datas inclusivas, unidades e Stone/PIX do recorte
  aplicado. Em Lançamentos, usa a URL confirmada, sem limitar à página visível.
  No Dashboard, usa `data.filters` da resposta atual e estende a competência final
  ao último dia civil do mês. Foco em dia e ocultação de séries são destaques
  visuais; não mudam o total do recorte principal nem o período exportado.
  Rascunhos ainda não confirmados nos controles não afetam o arquivo.
- **Exportar histórico completo autorizado:** todas as datas, unidades e formas
  cobertas simultaneamente por `sales.entry.read` e `sales.export.full`, inclusive
  unidades inativas. Não herda os filtros do dashboard. Não significa banco inteiro.

A tela explica que ajustes exigem também leitura gerencial e competências inteiras.
Um recorte diário incompleto não pode atribuir um ajuste a um dia: somente meses
inteiramente cobertos pelos extremos entram na aba/totais. Por exemplo, 02/09–30/09
inclui os lançamentos desses dias e **não** inclui o ajuste de setembro. 01/09–30/09
inclui esse ajuste autorizado. Limites nulos abrem a extremidade correspondente.
Datas/meses sem dados não criam linhas financeiras fictícias.

Estados: preparando, download iniciado, nenhum dado, autorização/sessão recusada,
falha de consulta, limite de volume e nova tentativa explícita. Não há retry
automático nem arquivo parcial. Troca de filtros aplicados, identidade, grants,
bloqueio ou desmontagem invalida a preparação pendente. Depois de gerar o Blob,
a interface reautoriza e confere o conjunto no banco antes de iniciar o download.

## Matriz de autorização

| Dado/ação por unidade | Capacidades simultâneas necessárias |
| --- | --- |
| Lançamentos no período | `sales.entry.read` + `sales.export.filtered` |
| Lançamentos no histórico | `sales.entry.read` + `sales.export.full` |
| Ajustes e justificativas no período | As duas anteriores do período + `sales.dashboard.read` |
| Ajustes e justificativas no histórico | As duas anteriores do histórico + `sales.dashboard.read` |

O direito de exportação é necessário também para justificar a saída de campos
textuais detalhados dos ajustes. Não se presume que o dashboard sozinho autorize
esse detalhe. Sem `sales.dashboard.read` na unidade, ajustes/justificativas não são
consultados nem incluídos nos totais; a unidade recebe `adjustments_authorized=false`
e o Resumo explicita a exclusão. Não se informa quantidade/valor de dados recusados.
Um usuário de leitura operacional + exportação pode, portanto, gerar relatório
operacional cujo total difere do dashboard por falta de acesso aos ajustes.

Cada capacidade usa seu escopo próprio: grant exportador em A e leitor em B não
se combinam. `global` cobre as unidades pertinentes; `unit` apenas sua unidade;
`sector` não cobre agregado unitário. Seleção explícita com qualquer UUID fora da
interseção nega a chamada inteira, sem revelar sua existência. Perfil inativo,
sessão sem identidade ou concessão revogada negam no banco, inclusive sem dados.
Histórico de unidade inativa mantém o mesmo contrato de autorização Core.

Nenhuma capacidade, papel ou atribuição foi criada/concedida. As sete capacidades
já existiam; a composição institucional da VEN-04B permanece intacta. Tabelas,
schemas privados e RLS restritiva continuam sem grants de leitura direta.

## RPC e paginação

Migration append-only gerada pelo CLI, sem execução persistente:
`20261103175405_sales_excel_export.sql`.

```sql
public.sales_export_page(
 p_mode text, p_from date default null, p_to date default null,
 p_units uuid[] default null, p_method text default null,
 p_offset integer default 0, p_limit integer default 500, p_token text default null
) returns jsonb;
```

`p_mode`: `filtered` ou `full`; `full` **recusa** datas/unidades/método não nulos,
evitando chamar um recorte restrito de histórico completo. Método nulo = Stone+PIX.
Datas finitas de `0001-01-01` a `9999-12-31`; início <= fim. `p_units` nulo = todas
as unidades da interseção; array explícito unidimensional não vazio, até 1.000 UUIDs,
sem nulos. Duplicatas são deduplicadas pelo catálogo. Limite por página 1–500;
offset 0–20.000, token obrigatório após a primeira página. Sem SQL dinâmico.

Resposta versionada com catálogo Core, permissibilidade de ajustes, filtros
efetivos, contagens, totais `numeric` como strings de duas casas e limites dos
dados disponíveis. Linhas contêm somente: tipo, UUID, data ou competência, UUID
da unidade, forma e valor; lançamento acrescenta versão/última atualização;
ajuste acrescenta justificativa. Não retorna autores, e-mails, lotes ou `source_ref`.

`SECURITY DEFINER` é necessário para acessar as tabelas privadas; `search_path=''`,
objetos qualificados, validação ativa via helpers Core e EXECUTE somente para
`authenticated`. PUBLIC/anon ficam sem EXECUTE. A autorização usa os bloqueios
do contrato VEN-02, com bloqueio adicional das relações de leitura gerencial.

### Consistência e custo

Ordem: lançamentos antes dos ajustes; dentro de cada família, data/competência e
UUID ascendentes. Catálogo, linhas e totais são lidos por **uma instrução SQL com
CTEs materializadas**, no mesmo snapshot MVCC. Cada família é limitada a 20.001
linhas; a união também tem sentinela de 20.001. O limite nunca corta um sucesso:
excesso gera `54000` sem dados/totais parciais.

Escolheu-se offset sobre um conjunto **conferido por conteúdo**, em vez de cursor
isolado: cursor evita deslocamento de posição, mas sozinho não detecta mudanças
de valor, exclusão ou escopo durante a leitura. O SHA-256 do JSONB canônico cobre
linhas, IDs, versões, valores, datas, motivos, catálogo, visibilidade de ajustes,
modo e filtros; timestamps de requisição ficam fora do digest. Cada página refaz
o conjunto limitado e exige o token original. Chamada final no offset total faz
a mesma revalidação depois de gerar o arquivo. O cliente também verifica ordem,
unicidade, avanço, quantidades e reconciliação independente em BigInt.

O token é detector de mudança, **não** credencial, assinatura de autenticidade ou
capacidade privilegiada. A autorização atual é executada em cada chamada. Mudança
relevante resulta em `40001` e descarte integral. Revogação total resulta em `42501`.
O arquivo representa o mesmo conjunto observado nas chamadas bem-sucedidas; não
mantém uma transação/snapshot MVCC aberto entre requisições. Mudanças que aconteçam
e sejam integralmente revertidas entre observações não são detectadas. Alterações
após a última validação não atualizam um arquivo já autorizado. Não se declara
snapshot histórico de um instante fixado nem se congelam as escritas de Vendas.

Reprocessamento custa O(páginas × conjunto limitado), com hashes/JSON em cada
chamada. Até 40 páginas de 500 + conferência final. A favor: sem tabela de snapshots,
job persistente, retenção nova, backend privilegiado ou armazenamento temporário
de dados financeiros no servidor. Bases maiores devem receber solução própria
aprovada; o erro atual é explícito e o limite fica pendente do aceite operacional.

| Limite | Conduta |
| --- | --- |
| 20.000 linhas somando lançamentos e ajustes | `54000`; reduzir período/unidades, jamais download parcial |
| 1.000 unidades | `54000`; seleção menor para recorte; histórico não é fracionado silenciosamente |
| 8 MiB de JSONB canônico | `54000`; inclui todas as linhas/metadados, mesmo com poucas linhas |
| 20 MiB de XLSX final | Descartar Blob e informar limite |
| 32.767 unidades UTF-16 por célula | Recusar texto excessivo; sem truncar nomes/justificativas |

Esses limites delimitam processamento em memória; não são promessa de consumo
máximo do navegador, pois o writer mantém dados/XML/ZIP intermediários. Homologar
hardware e bases representativas antes de uso real. Downloads usam ObjectURL,
âncora temporária e revogação em 30s; nome fixo com modalidade e timestamp numérico,
sem nome de pessoa/unidade ou caminhos locais. O navegador define onde salvar.

## Formato e precisão

| Aba | Colunas |
| --- | --- |
| Lançamentos | Data civil dd/mm/aaaa; unidade; código; forma; valor BRL; valor exato textual BRL; UUID do lançamento; UUID da unidade; versão; atualização em America/Sao_Paulo |
| Ajustes mensais (se houver autorizados) | Competência mm/aaaa, sem dia inventado; unidade; código; forma; valor do ajuste BRL; valor exato textual BRL; justificativa; UUID do ajuste; UUID da unidade |
| Resumo | Modalidade; datas aplicadas; formas; geração/fuso; unidades com estado e cobertura de ajustes; quantidades; limites disponíveis de lançamentos/competências; totais separados e consolidado; reconciliação; consistência e limitações |

No SQL, somas `numeric` exatas de **somente ativos** e ajustes autorizados. JSON usa
strings canônicas com duas casas. JavaScript soma/verifica exclusivamente `BigInt`
em centavos. Sem `Number`, `parseFloat` ou fórmulas para acumular valores.

A única conversão para `Number` ocorre ao serializar uma célula: até **15 dígitos
no inteiro de centavos**, roundtrip de `toFixed(2)` e de `toPrecision(15)` devem
preservar a string canônica. Se não preservarem, a célula é **String decimal**, sem
arredondamento silencioso. Cada linha acompanha também coluna textual exata BRL.
Totais têm contraparte textual explícita no Resumo. Valores individuais até
`999999999999.99` permanecem numéricos e em centavos exatos no readback; somas maiores
podem virar texto. BRL textual usa ponto decimal canônico, identificado no cabeçalho.

Excel usa ponto flutuante e suas fórmulas manuais não são prova de reconciliação.
Os totais gravados já foram conferidos contra o SQL com diferença **zero centavos**.
Não se alteraram fórmulas gerenciais VEN-03 nem se introduziu tolerância financeira.

Todo texto usa `type:String`, inclusive prefixos `=`, `+`, `-`, `@`, espaços,
tabulações e quebras de linha. Não há fórmulas, APIs de hyperlink, macros, vínculos
externos ou recursos executáveis. Controles inválidos para XML e surrogates
isolados viram `□`, com política explícita no Resumo; Unicode válido é preservado.
Testes abrem o ZIP/XLSX e rejeitam tags `<f>`, hyperlinks, vínculos externos e DDE.

## Evidências e reprodução

| Camada | Evidência |
| --- | --- |
| Banco em memória | `tests/sales-export-database.test.ts`: migrations reais, identidade ativa, global/A/A+B, negação de C/UUID inexistente, unidade inativa, read sem export, dashboard+export sem read, escopos distintos, revogação, inserts/updates/deletes/ajustes/catálogo entre páginas, limites e somas exatas |
| API | `tests/sales-export-api.test.ts`: paginação, contrato/tipos, duplicações/ordem, totais inconsistentes, cancelamento, token alterado, sessão expirada e erros sem detalhes SQL |
| XLSX real | `tests/sales-export-workbook.test.ts`: writer instalado + `read-excel-file`, XML interno, tipos, limites, injeção nos três campos, Unicode/controles, abas, datas/fuso e 20.000 linhas |
| UI/download | `tests/sales-export-ui.test.tsx`, `tests/sales-export-download.test.ts`: aplicado vs rascunho, fim de mês, Stone, histórico sem filtros, negações, estados, recuperação, revogação final, troca de identidade e ObjectURL |
| PostgreSQL17 real no CI | matriz `sales-integration` acrescenta `export`, roda a mesma suíte de banco em serviço vazio do runner |
| Auth/PostgREST/Chromium no CI | `tests/integration/sales-export.mjs`, guarda exclusiva de runner hospedado antes de ler configuração; JWTs reais, >1.000 registros, unidades autorizadas, mutação, bloqueio Core observado nas duas ordens e download/readback/XML pelo navegador |

Oráculos sintéticos, independentes do payload: setembro Stone `250.00+50.00=300.00`;
Stone+PIX `300.00+50.00=350.00`; conjunto global incluindo máximo individual
`1000000000300.10+50.01=1000000000350.11`; muitas linhas 0,01/0,10/0,29 somam 133,41.
Readback de 20.000 linhas de `999999999999.99` soma `19999999999999800.00` por BigInt;
total Excel correspondente deve ser texto, sem perda de centavos.

Comandos locais usam somente PGlite em memória, sem flags de ensaio persistente:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:build
npm audit --audit-level=moderate
```

O registro final de comandos/quantidades, SHA e checks GitHub será atualizado após
as execuções. Nenhuma execução no banco do notebook, C30, STAGING ou PROD é
autorizada por este contrato. O CI aplica migrations exclusivamente nos seus
serviços efêmeros. Não é prova de aplicação persistente nem de login em produção.

## Limitações, reversão e próximo gate

Pendente homologação humana no Excel/LibreOffice real, navegação responsiva,
download nos navegadores usados pela equipe, limites em hardware representativo,
matriz de concessões reais, revisão dos ajustes/justificativas e da política de
competências inteiras. A revisão do mantenedor deve aceitar os limites explícitos;
volume que excede o limite não recebe alegação de histórico completo exportado.
Sessão sem identidade/inválida é testada no transporte; códigos de expiração no
adaptador. Não se declara ter aguardado expiração de um JWT real.

Reversão **em código antes de aplicação persistente**: reverter os commits desta
feature em PR, incluindo controles, módulo export, testes e alteração do workflow.
Depois de eventual aplicação aprovada em ambiente persistente, **não remover ou
editar migration histórica**: nova migration deve revogar EXECUTE desta assinatura
e/ou corrigir por forward-fix, preservando dados/auditoria e seguindo GO próprio.
Nenhum rollback operacional foi executado nesta tarefa.

O mantenedor único revisa diff, CI, negativos de permissão e os riscos antes de
decidir merge. Não houve segunda revisão humana nem review formal inventado.
VEN-05B, homologação VEN-07, migração real e cutover têm autorizações separadas.

## Limpeza Git comprovada

Após `git fetch origin --prune`, `origin/main` era `91bd16b`. `gh pr list --state
open` retornou vazio; `git merge-base --is-ancestor` confirmou cada candidata.
Foram excluídas com `git push origin --delete`:

```text
codex/fix-ci-vite-6-4-5
codex/ven-02-sales-operations
codex/ven-03-sales-analytics
codex/ven-04a-sales-ui
codex/ven-04b-sales-dashboard
docs/c30-staging-cloudflare-20261030
docs/ven-00-vendas-aprovada-20261028
feat/ag-01-room-booking-schema-20261023
feat/ven-01-sales-foundation-20261028
fix/ci-minimatch-audit-20261103
```

`git ls-remote --heads origin` confirmou apenas `main` antes da criação da nova
branch. `main` local atualizada por fast-forward e igual a `origin/main`. Branches
locais foram preservadas; sem reset, force-push, remoção de arquivos ou worktrees.
