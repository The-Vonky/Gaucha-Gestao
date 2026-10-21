# Implementation Brief — Curva ABC Domain v1

Status: APPROVED (2026-10-20) — implementado na branch `feat/abc-domain-v1`  
Date: 2026-10-19  
Baseline: `main` em `1e818a4`

> Este brief cria o módulo **Custos > Curva ABC** sobre a plataforma existente. Cobre a leitura do relatório ERP "Curva ABC Geral (Realizado)", a publicação de revisões imutáveis por unidade e competência e a consulta do que foi publicado. Comparações, exportação, correção manual, fechamento de período, categorias e produção ficam para briefs seguintes.

## Princípio de adaptação

A plataforma prevalece. O módulo foi desenhado antes em outro repositório (`The-Vonky/CurvaABC-Gaucha`, pasta `intranet/`) com FastAPI e identidade própria. Tudo que conflita com a plataforma é descartado ou adaptado no módulo; nada no Core, na stack ou na infraestrutura muda para acomodá-lo. Se a implementação encontrar um conflito não previsto aqui, adaptar o módulo e registrar a diferença neste brief.

Do repositório de origem se aproveitam somente as regras de negócio e os casos de teste:
- regras de métricas e ABC: `intranet/docs/04-METRICAS.md`;
- contrato de importação: `intranet/docs/06-IMPORTACAO.md`;
- casos do leitor e do parser: `intranet/backend/tests/unit/test_xlsx.py`, `test_import_parser.py`, `test_abc.py`.

O repositório de origem é privado; copiar para cá somente regras e casos sintéticos. Nenhuma planilha, valor ou nome real de produto entra neste repositório, que é público.

## Objective

Ao final deste brief, um usuário autorizado deve conseguir:

- abrir `Custos > Curva ABC`;
- ver somente as unidades cobertas por `abc.report.read` no seu escopo;
- selecionar um arquivo `.xlsx` exportado do ERP e ver a prévia no navegador, com diagnóstico por célula, antes de qualquer gravação;
- publicar a prévia aprovada como revisão da série unidade + competência + modalidade, com o arquivo original preservado;
- substituir a revisão vigente por uma nova, com motivo, sem perder as anteriores;
- receber conflito tratável se outra pessoa publicou na mesma série ao mesmo tempo;
- consultar uma revisão publicada: totais, itens, classe ERP e classe calculada, avisos e arquivo original;
- conferir que uma revisão corresponde ao arquivo guardado.

## Required reading

- `AGENTS.md`
- `docs/decisions/ADR-001-modular-monolith.md`
- `docs/decisions/ADR-002-core-and-module-ownership.md`
- `docs/decisions/ADR-004-platform-stack.md`
- `docs/decisions/ADR-005-core-authorization.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/SECURITY.md`
- `docs/architecture/PRODUCT_STRUCTURE.md`

Inspecionar, como referência de convenções: `supabase/migrations/202609250008_action_plans_evidence.sql` (bucket privado e upload em duas etapas) e `apps/web/src/modules/action-plans/` (estrutura de módulo no frontend).

## Decisões fixadas (2026-10-19)

| # | Decisão |
|---|---|
| D1 | O módulo é prioridade atual da plataforma (roadmap atualizado) |
| D2 | Regras de negócio seguem a origem: revisões imutáveis, `numeric`, ABC `abc-70-90-inicio-v1`, tolerâncias da seção "Validações" |
| D3 | A planilha é lida no navegador; o banco revalida e publica. Sem Edge Functions, worker ou novo runtime |
| D4 | O código de filial do ERP é o próprio `core.units.code`. Sem tabela de alias no módulo |
| D5 | Nenhum histórico do sistema desktop é migrado. O módulo começa vazio |
| D6 | O fluxo FastAPI da origem não é portado (sessões, CSRF, limite de login, filiais, papéis, fila, outbox) |

## Modelo de confiança da importação (D3)

O navegador não é fonte de confiança. Um usuário com `abc.report.publish` pode, tecnicamente, enviar linhas que não vieram do arquivo. O desenho reduz e torna detectável esse risco, sem nova infraestrutura:

1. **Prevenção no banco.** A RPC de publicação revalida tudo que é verificável a partir das linhas: soma de itens contra Total Geral e subtotais por classe ERP, residual de cada linha (`total − quantidade × unitário`), datas dentro de um único mês, código da unidade, duplicidade de códigos e limites numéricos. Linhas inconsistentes entre si não são publicadas.
2. **Vínculo com o original.** O original é enviado ao Storage antes da publicação. A revisão grava o SHA-256 do arquivo, a versão do parser e o hash do conteúdo normalizado (`content_hash`). A RPC recusa publicar se o objeto não existir ou se tamanho/hash não conferirem com o registro do upload.
3. **Detecção.** A tela da revisão oferece "Conferir com o arquivo": o navegador de quem consulta baixa o original, roda o mesmo parser e compara o `content_hash`. Divergência é exibida e registrada no log do sistema. Qualquer leitor pode conferir; não depende de quem publicou.
4. **Rastreio.** Toda publicação registra autor, motivo e request ID no `core.system_audit_log`.

Risco remanescente aceito: uma revisão adulterada fica publicada até alguém conferir. Revisitar com um runtime de servidor somente se a plataforma adotar um por outra razão.

## Permissions

Adicionar ao catálogo, nesta migration:

| Key | Descrição |
|---|---|
| `abc.report.read` | Consultar relatórios Curva ABC |
| `abc.report.publish` | Publicar e substituir relatórios Curva ABC |

Conceder a `platform_administrator` por inserção explícita em `core.role_permissions` (o cross join do catálogo inicial não alcança permissões novas). Criar os perfis de sistema `costs` (read + publish) e `costs_viewer` (read), seguindo o padrão `quality`/`quality_viewer`. Permissões de correção, fechamento e exportação entram com os briefs que as implementam.

Escopo: o recurso pertence a uma unidade. Usar `private.has_unit_permission`. Atribuição global cobre todas as unidades; atribuição de setor não concede acesso a relatórios da unidade inteira.

## Database model

Schemas `abc` (exposto) e `abc_private` (não exposto). Todas as tabelas com RLS, grants explícitos e `select` somente por `abc.report.read` na unidade. Escrita somente por RPC `security definer` com `search_path=''`. Sem `update`/`delete` para `authenticated`.

### abc.source_files

Metadados do original.

- `id uuid`, `unit_id uuid → core.units`;
- `object_key text` gerado (`units/<unit_id>/abc/<id>.xlsx`), único;
- `status`: `pending | ready`;
- `sha256 text` (64 hex), `byte_size integer` (1 a 10 MiB), `original_name text` (até 255, sem barras);
- `created_by`, `created_at`, `ready_at`.

### abc.report_series

- `id uuid`, `unit_id`, `competency date` (primeiro dia do mês), `cost_basis`: `NET_PERIOD | GROSS_PERIOD`;
- `current_revision_id uuid` (nulo até a primeira publicação), `version integer`;
- único `(unit_id, competency, cost_basis)`.

### abc.report_revisions

Imutável após inserção (trigger bloqueia update/delete, inclusive para o dono da função).

- `id`, `series_id`, `number integer` (1, 2, ...; único por série), `parent_revision_id`;
- `source_file_id`, `reason text` (obrigatório a partir da revisão 2);
- `period_start date`, `period_end date`, `cost_basis_text text` (texto original do ERP);
- `declared_total numeric`, `calculated_total numeric`, `difference numeric`;
- `parser_version text`, `abc_method text` (`abc-70-90-inicio-v1`), `content_hash text`;
- `warnings jsonb` (avisos aceitos na publicação);
- `published_by`, `published_at`.

### abc.revision_lines

- `revision_id`, `line_no integer` (ordem na planilha), único `(revision_id, product_code)`;
- `product_code text` (preservado como texto), `product_name text`, `unit_label text`;
- `quantity numeric`, `unit_cost numeric`, `total numeric`, `source_share numeric` (pontos percentuais);
- `erp_class text` (`A | B | C`, nulo se ausente), `calculated_class text` (nulo quando total = 0);
- `share numeric`, `cumulative_before numeric` (valores completos, sem arredondar);
- `source_sheet text`, `source_row integer`.

`numeric` sem escala fixa: não descartar casas da fonte. Classe calculada e participações são calculadas **no banco** pela RPC, nunca aceitas do cliente.

## RPCs

Todas com mensagens de erro em português, `errcode` estável e sem expor SQL.

- `abc.units()` — unidades em que o usuário tem `abc.report.read`, com contagem de séries.
- `abc.unit_series(p_unit uuid)` — séries da unidade com revisão vigente e totais.
- `abc.begin_source_upload(p_unit uuid, p_name text, p_sha256 text, p_size bigint)` — exige `abc.report.publish`; cria `source_files` pendente e devolve `object_key`.
- `abc.confirm_source_upload(p_file uuid)` — confere existência, tamanho e MIME do objeto no Storage; marca `ready`.
- `abc.publish_revision(p_file uuid, p_payload jsonb, p_expected_version integer, p_reason text)` — ver abaixo.
- `abc.revision_detail(p_revision uuid)` — cabeçalho, linhas e avisos. Valores `numeric` devolvidos como `text`, para o cliente não convertê-los em `Number`.

### abc.publish_revision

Numa única transação:

1. exigir `abc.report.publish` na unidade do arquivo; arquivo `ready` e não usado por outra revisão;
2. resolver a unidade por `core.units.code = payload.unit_code` (texto exato, zeros preservados); unidade inativa ou divergente da unidade do arquivo bloqueia;
3. validar o payload (seção "Validações"); qualquer bloqueio aborta sem gravar nada;
4. travar a série (`for update`), criando-a se não existir; `p_expected_version` diferente da versão atual devolve conflito `40001` com a revisão vigente;
5. calcular participações, acumulado e classe ABC em `numeric`;
6. recalcular o `content_hash` a partir das linhas canônicas e comparar com o enviado;
7. inserir revisão e linhas, mover o ponteiro, incrementar a versão;
8. registrar no `core.system_audit_log` (`module='abc'`, ação `revision.publish`, unidade, série, revisão, arquivo, motivo).

Mesmo arquivo publicado de novo na mesma série devolve a revisão existente, sem criar outra.

### Storage

Bucket privado `abc-source-files`, limite 10 MiB (limite global do Storage da plataforma), MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Políticas: inserir somente o `object_key` de um `source_files` pendente do próprio usuário; ler somente com `abc.report.read` na unidade. Sem update/delete pelo cliente. Seguir `action_plans_private.can_upload_evidence_object` como modelo.

## Validações

Mesmas regras e tolerâncias de `intranet/docs/06-IMPORTACAO.md` da origem. Executadas no parser (prévia) e repetidas na RPC (publicação), exceto as que dependem do XML.

Bloqueiam:
- arquivo acima dos limites, ZIP inválido ou com razão de compressão anômala, DTD, fórmulas em campos consumidos, relações externas, macros;
- aba ou cabeçalho ambíguos; linha com aparência de produto não reconhecida;
- unidade, período ou modalidade ausentes; modalidade fora de `NET_PERIOD`/`GROSS_PERIOD`; período fora de um único mês;
- código de produto duplicado, vazio ou numérico; número ausente, inválido, negativo ou não finito;
- quantidade zero com total positivo;
- `|Total Geral − soma| ≥ 0,05`; `|subtotal da classe − soma do grupo| ≥ 0,05`; `|total − quantidade × unitário| ≥ 0,01` em qualquer linha;
- percentual textual sem `%`.

Avisam (exigem aceite explícito na publicação, gravado em `warnings`):
- nome do arquivo diferente do período interno;
- percentual da fonte divergente do calculado em mais de 0,0001;
- linha com quantidade positiva e total zero;
- substituição de revisão vigente.

Limites do leitor: 10 MiB de arquivo, 200 MiB descompactados, 16 MiB por parte, 256 partes, razão 200, 20 abas, 100.000 linhas, 2.000.000 de células, 32.767 caracteres por texto.

## Regra ABC (`abc-70-90-inicio-v1`)

Ordenar por total decrescente; empate por código crescente. Classe pelo acumulado **antes** do item: `< 70%` A, `< 90%` B, demais C. Total zero: classe nula e sem posição. Total geral zero: tudo nulo. Comparar pela soma monetária acumulada, sem arredondar percentuais. Casos obrigatórios: 50/25/15/10 → A/A/B/C; 95/5 → A/C. A classe ERP é preservada como veio e nunca recalculada.

## Frontend

Módulo em `apps/web/src/modules/abc/`. Destino em `navigation.ts`: grupo `Custos`, rota `/abc`, permissão `abc.report.read`, escopo `any`, `nested: true`. Adicionar descrição do grupo `Custos`.

Componentes reutilizam `shared/ui.tsx` e os tokens do Design System Elo. Sem bibliotecas de gráfico neste brief.

### Leitor e parser

- `abc/import/xlsx.ts`: leitura do pacote com `fflate` (promover de `devDependencies` para dependência de `apps/web`; já auditado no repositório) e `DOMParser`. Rejeitar qualquer `<!DOCTYPE` antes de analisar o XML. Preservar o texto original de cada célula numérica.
- `abc/import/parser.ts`: metadados, linhas, marcadores de classe, subtotais, Total Geral, diagnóstico por célula.
- `abc/import/decimal.ts`: aritmética decimal com `BigInt` em ponto fixo, só para somas, produtos e comparações da prévia. **Proibido** usar `Number` em valor monetário. Sem nova dependência de decimal.
- O parser roda num Web Worker para não travar a tela com arquivos grandes.
- `content_hash`: SHA-256 (`crypto.subtle`) de uma serialização canônica das linhas, definida neste módulo e reproduzida no SQL. Mudar a serialização exige nova `parser_version`.

### Telas

- **Unidades** (`/abc`): unidades autorizadas, última competência publicada por modalidade.
- **Unidade** (`/abc/units/:unitId`): competências × modalidade, com situação "publicado" ou "sem relatório"; ação "Importar relatório" só com `abc.report.publish` (visibilidade é conveniência; o banco decide).
- **Importação**: escolher arquivo, prévia com totais, contagem de linhas por tipo, bloqueios e avisos; publicar só sem bloqueios e com avisos aceitos; motivo obrigatório ao substituir.
- **Revisão** (`/abc/revisions/:revisionId`): totais, diferença, tabela de itens com classe ERP e classe calculada lado a lado e metodologia indicada; histórico de revisões da série; baixar original; "Conferir com o arquivo".

Estados obrigatórios: carregando, vazio, erro, sem permissão, conflito de versão (mostrar a revisão que venceu e permitir revisar de novo). Teclado e leitor de tela em toda a importação; diagnósticos não dependem só de cor. Valores exibidos com `ROUND_HALF_UP`: R$ com 2 casas, unitários com 4, percentuais com 2.

## Concurrency

- Duas publicações na mesma série com a mesma `expected_version`: uma vence, a outra recebe conflito e nada grava.
- Upload pendente sem publicação fica órfão; reconciliação de órfãos segue o padrão de evidências (relatório, sem exclusão automática).

## Out of scope

Comparação entre competências e unidades, painel consolidado, exportação Excel/PDF, correção manual de linha, fechamento e reabertura de período, categorias, produtos canônicos, conversão de unidades, produção e custo por refeição, compras e fornecedores, importação em lote, `.xls`, migração de dados do desktop, Realtime.

## Automated tests

### Banco (Vitest + PGlite e integração `tests/integration/abc.mjs`)

- matriz de `AUTHORIZATION.md`: perfil inativo, sem perfil, sem permissão, global, unidade correta, outra unidade, setor sem acesso à unidade, ID adivinhado, `abc.report.read` sem `publish`;
- publicação atômica: falha injetada após inserir linhas não deixa revisão nem ponteiro;
- duas conexões publicando na mesma série: um sucesso e um conflito;
- revisão e linhas imutáveis (update/delete negados);
- cada validação bloqueante repetida na RPC com payload forjado;
- unidade por código: inexistente, inativa e divergente do arquivo bloqueiam;
- ABC: casos da origem (`test_abc.py`), incluindo empates, total zero e valores com mais de 15 dígitos;
- log do sistema gravado com autor e motivo;
- Storage: upload fora do `object_key` pendente negado; leitura de outra unidade negada.

### Frontend (Vitest)

- leitor e parser: tradução dos casos de `test_xlsx.py` e `test_import_parser.py` da origem, com fixtures OOXML sintéticas geradas em memória;
- decimal: somas e comparações nas fronteiras de 0,05 e 0,01; recusa de `Number` em valores monetários;
- `content_hash` igual no TypeScript e no SQL para o mesmo conjunto de linhas;
- navegação: grupo Custos aparece somente com `abc.report.read`;
- importação: bloqueios impedem publicar; avisos exigem aceite; conflito exibido.

### Validação manual antes do merge

Conferir as quatro amostras reais disponíveis com o responsável, **fora do repositório**: contagem de linhas e totais iguais aos registrados na validação da origem (234/234/234/206 produtos).

## Acceptance criteria

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:build` e as integrações do `validate.yml` passam;
- usuário sem `abc.report.read` não vê o grupo Custos e não lê nenhum dado `abc` pela API;
- usuário com `abc.report.read` numa unidade não lê outra;
- publicação inválida ou concorrente não deixa estado parcial;
- revisão publicada reproduz exatamente as linhas do arquivo ("Conferir com o arquivo" aprovado);
- classe calculada segue `abc-70-90-inicio-v1` e é exibida ao lado da classe ERP;
- nenhum dado real versionado.

## Implementation notes (2026-10-20)

Diferenças em relação ao texto acima, todas dentro do módulo, conforme o princípio de adaptação:

- **Sem Web Worker.** `DOMParser` não existe em Web Workers; o parser roda na página. Os relatórios têm centenas de linhas e são lidos em poucos milissegundos.
- **Código da unidade.** O payload envia o código da filial lido do arquivo; o banco exige que seja igual a `core.units.code` da unidade do upload. A tela também compara antes, com o aviso `BRANCH_MISMATCH`.
- **Modalidade.** Vem do arquivo, não de uma escolha do usuário.
- **Percentual da fonte.** O parser lê fração (0–1) e envia pontos percentuais (`source_share × 100`).
- **Casas decimais.** O limite no SQL é de 24 casas, igual ao parser.
- **XML não UTF-8.** É rejeitado como `invalid_xml`, mais restritivo que a origem, que aceitava UTF-16 sem DTD.
- **Avisos.** O navegador envia apenas os avisos que o banco não consegue derivar (nome do arquivo, percentual de subtotal, linha sem preço analítico). O banco acrescenta os seus e exige um único aceite.
- **Testes.** `tests/abc-database.test.ts` (PGlite e PostgreSQL real via `ABC_TEST_DATABASE_URL`), `tests/abc-import.test.ts` (leitor e parser traduzidos da origem), `tests/abc-ui.test.tsx` e `tests/integration/abc.mjs` (Supabase local real, no job `action-plans-integration`).

## Correções P0 da importação (21/10/2026)

Branch `fix/abc-import-p0-20261021`. Diagnóstico completo, reprodução e matriz em [MATRIZ_EQUIVALENCIA_LEGADO](../modules/abc/MATRIZ_EQUIVALENCIA_LEGADO.md). Nenhuma mudança de schema, RPC, permissão, regra ABC (`abc-70-90-inicio-v1`) ou `parser_version`; o `content_hash` produzido é o mesmo.

- **SHA-256 sem Web Crypto.** `crypto.subtle` só existe em contexto seguro (HTTPS ou `localhost`). Pelo HTTP de LAN do DEV compartilhado a leitura falhava para qualquer planilha. `import/sha256.ts` (FIPS 180-4, sem dependência) é usado quando `crypto.subtle` não existe; o resultado é idêntico.
- **Prévia alinhada aos limites da RPC.** Textos com caracteres de controle ou acima dos limites do banco (código 60, nome 500, unidade 40, filial 40, modalidade 200) e mais de 20.000 produtos agora bloqueiam na prévia (`INVALID_TEXT`, `TOO_MANY_PRODUCTS`), com célula.
- **Avisos do navegador agregados por código.** O banco aceita até 50 avisos de até 200 caracteres; o envio de um aviso por linha impedia publicar relatórios com muitas linhas zero/zero.
- **Mensagens.** Falha técnica no navegador é exibida com a causa (não mais "verifique se é o relatório"); códigos do leitor recebem orientação (por exemplo, planilha salva no Excel); `.xls` recebe mensagem própria.
- **Testes.** `tests/abc-import-regression.test.ts`, casos novos em `tests/abc-database.test.ts` (payload real do parser publicado em PGlite/PostgreSQL) e `tests/abc-ui.test.tsx`; fase Chromium em `tests/integration/abc.mjs` (XLSX real → Storage → RPC → "Conferir com o arquivo", com e sem `crypto.subtle`, 1280 e 375 px). Gerador sintético com forma de exportação ERP em `tests/abc-erp-workbook.mjs`.
