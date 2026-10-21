# Curva ABC — matriz de equivalência com o sistema antigo e diagnóstico da importação

**Data:** 21/10/2026 · **Base:** `main` em `dad63f7` (Gaúcha Gestão) e `b44c829` (`The-Vonky/CurvaABC-Gaucha`).
**Estado:** auditoria (Etapa 0) e correção P0 da importação (Etapa 1). Produção continua **NO-GO**.

## 1. Fontes e versão de referência de cada comportamento

O repositório de origem contém **duas gerações** que não devem ser misturadas:

| Geração | Local | Papel nesta transição |
| --- | --- | --- |
| **Desktop legado** (FastAPI + SQLite + React/MUI) | `backend/app/`, `frontend/src/pages/` | Fonte das **funcionalidades e fluxos** usados no dia a dia: painel, importação, comparações, relatórios, produtos, categorias, correções e exportações. Usa `float`, exclui períodos, tem usuários próprios e classifica categorias por prefixo/palavra-chave. |
| **Intranet** (reescrita, setembro/2026) | `intranet/` | Fonte das **regras de domínio rigorosas**: leitor XLSX limitado, parser `erp-curva-realizado-v1` validado contra as 4 amostras reais (234/234/234/206), aritmética `Decimal`, ABC `abc-70-90-inicio-v1`, regras de variação e ponte preço × quantidade (`04-METRICAS.md`). |

Regra adotada: **funcionalidade** vem do desktop; **regra de cálculo, validação e precisão** vem da intranet; **arquitetura, identidade, permissões, persistência e UI** vêm do Gaúcha Gestão. Onde desktop e intranet divergem, prevalece a intranet (por exemplo: ABC pelo acumulado *anterior* ao item; variação sem tolerância de R$ 0,01).

## 2. Matriz de equivalência

Situação no Gaúcha Gestão em `dad63f7`: **F** funcional · **P** parcial · **Q** quebrada · **A** ausente.

| # | Funcionalidade original | Código de origem | Regra de negócio | Implementação atual (`dad63f7`) | Sit. | Conflito arquitetural | Solução recomendada | Testes necessários | Dependência / aprovação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Prévia e importação do XLSX do ERP | desktop `services/excel_importer.py` (pandas, heurístico); intranet `ingestion/xlsx.py`, `parser.py` | Layout homologado, `Decimal`, bloqueios e avisos por célula | `modules/abc/import/*`, `AbcImport.tsx` | **Q** | Nenhum (leitura no navegador aprovada em D3) | Corrigido na Etapa 1 (seção 3) | Parser, Chromium inseguro, banco, integração Storage | — |
| 2 | Publicar período | desktop `routers/importacao.py /salvar` | Uma revisão vigente por unidade+competência+modalidade | `abc.publish_revision` | **F** após Etapa 1 | Desktop gravava `float` e substituía | Mantido: revisões imutáveis | Já cobertos + payload real do parser | — |
| 3 | Remover período | desktop `routers/periodos.py DELETE` | Excluía período e itens | — | **A (intencional)** | Exclusão destrutiva proibida | **Não migrar**: substituição por nova revisão com motivo | — | Não aplicável |
| 4 | Histórico de importações | desktop `Importacoes.tsx` | Lista de períodos e status | `AbcUnit`, histórico na revisão | **P** | — | Área "Importações" com autor, data, revisões, avisos | UI | Etapa 3 |
| 5 | Painel executivo | desktop `Dashboard.tsx` | Total, produtos, concentração A | — | **A** | — | RPC de visão geral por unidade autorizada | Banco + UI | Etapa 2/3 |
| 6 | Comparação de períodos | desktop `routers/comparativo.py`; intranet `04-METRICAS.md` §3–4 | Variação %, novos/ausentes, impacto de preço, alertas ≥ 300% / ≤ −75% | — | **A** | Desktop usa `float` e "estável" < R$ 0,01 | RPC em `numeric`, regra `metricas-v1` da intranet, sem tolerância oculta | Matemática exata, divisão por zero, novos/ausentes | Etapa 2/3 |
| 7 | Comparação de intervalos (vários meses) | desktop `comparativo.py` (intervalos) | Soma de meses da mesma filial | — | **A** | Classe ERP não é consolidável | Fase posterior; v2 compara competências individuais | — | Proposto |
| 8 | Relatórios gerenciais | desktop `routers/relatorios.py` | Gasto por unidade de medida, mais caros, aumentos, suspeitas, impacto, evolução | — | **A** | Categorias hardcoded | Relatórios sobre revisões vigentes publicadas; categoria só com modelo aprovado | Banco + UI | Etapa 2/3 |
| 9 | Exportação Excel (11 abas) e PDF | desktop `routers/exportacoes.py`, `utils/pdf` | Excel gerencial e PDF com gráficos | — | **A** | Permissão de exportação não existe | Exportar no navegador apenas dados já autorizados (`write-excel-file` já é dependência) | Teste de conteúdo | **Decisão D5** |
| 10 | Produtos do período | desktop `routers/produtos.py GET` | Lista por período, participação, acumulado | Tabela na revisão | **P** | — | Área "Produtos" com busca, filtros e histórico | Banco + UI | Etapa 2/3 |
| 11 | Histórico/evolução do produto | desktop `relatorios.py montar_evolucao_precos` | Produto associado entre períodos **pelo código** | — | **A** | Código igual em unidades diferentes não prova equivalência | Histórico **por unidade**, associação por código ERP exato | Banco + UI | Etapa 2/3 |
| 12 | "Categorias" (tela) | desktop `routers/categorias.py` | **Na verdade, distribuição por classe A/B/C** | Contagem A/B/C na revisão | **P** | Confunde classe ABC com categoria | Área "Categorias" com distribuição por classe; categoria comercial separada | Banco + UI | Etapa 2/3 |
| 13 | Categorias de negócio | desktop `services/classificacao.py` | Lista fixa (Proteína, Estocáveis, Hort, Panificação) por prefixo/palavra + override manual | — | **A** | Lista hardcoded; inferência silenciosa | Cadastro gerenciado, associação explícita, "Não classificado" | Banco + RLS + UI | **Decisão D3** (modelo + `abc.category.manage`) |
| 14 | Correção manual de item | desktop `produtos.py PUT /corrigir`, `AuditoriaCorrecao` | Sobrescrevia item e recalculava período | — | **A** | Revisões imutáveis | Correção = **nova revisão** (reexportação); ajuste auditável só com contrato novo | — | **Decisão D4** |
| 15 | Auditoria de correções | desktop `routers/auditoria.py` | Lista de correções | `core.system_audit_log` | **P** | Usuário fixo "Deywid" no legado | Log central do Core | — | — |
| 16 | Filiais | desktop `routers/filiais.py` | Cadastro próprio | `core.units` | **F** | Duplicaria Core | Não migrar | — | — |
| 17 | Usuários/login/backup | desktop `security.py`, `backup.py` | Próprios | Core/Auth | **F** | Duplicaria Core | Não migrar | — | — |
| 18 | Conferência do original | intranet `16-CONFERENCIA-EXCEL.md` | Reprocessar e comparar | "Conferir com o arquivo" | **Q → F** | — | Mesmo defeito do item 1; corrigido | Integração | — |
| 19 | Custo por refeição / compras | intranet `04-METRICAS.md` §5, §10 | Denominadores homologados | — | **A** | Sem fonte aprovada | Fora do escopo | — | Futuro |
| 20 | `.xls` | desktop (pandas) | Aceitava | Recusado | **A (intencional)** | Fora do contrato v1 | Manter recusa com mensagem clara | UI | **Decisão D2** |

## 3. Diagnóstico da importação (Etapa 1)

### 3.1 Defeito principal — reproduzido

**Causa concreta:** `parseReport` calcula o SHA-256 do arquivo com `crypto.subtle.digest`. A Web Crypto só existe em **contexto seguro** (HTTPS ou `localhost`). O DEV compartilhado ([Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68)) é acessado por `http://10.1.10.94:5173`, ou seja, HTTP num IP de LAN. Ali `crypto.subtle` é `undefined`, a leitura lança `TypeError: Cannot read properties of undefined (reading 'digest')` **antes** de abrir o ZIP, e um `catch {}` genérico mostrava "Não foi possível ler o arquivo. Verifique se é o relatório exportado do ERP." para **qualquer** planilha, inclusive válida. "Conferir com o arquivo" falhava pelo mesmo motivo.

**Reprodução (EXECUTADA):** Chromium 1194 com o mesmo bundle do parser servido por HTTP:

| Origem | `isSecureContext` | `crypto.subtle` | Resultado antes | Resultado depois |
| --- | --- | --- | --- | --- |
| `http://localhost` | `true` | `object` | prévia gerada | prévia gerada |
| `http://192.0.2.2` (IP de rede) | `false` | `undefined` | `TypeError … reading 'digest'` | prévia idêntica (mesmo SHA-256 e `content_hash`) |

**Correção:** `import/sha256.ts` implementa SHA-256 (FIPS 180-4) sem dependência, usado somente quando `crypto.subtle` não existe. O digest é impressão digital de integridade, não segredo; o resultado é idêntico (vetores FIPS e comparação com `node:crypto` em fronteiras de bloco e 1 MiB).

### 3.2 Defeitos que faziam uma prévia limpa falhar na publicação

| Defeito | Efeito | Correção |
| --- | --- | --- |
| Avisos do navegador enviados **um por linha** (ex.: "Linha sem preço analítico") | Relatório com > 50 linhas zero/zero recebia `Avisos inválidos` do banco, que aceita no máximo 50 avisos de até 200 caracteres | Avisos agregados por código, com as linhas listadas até 200 caracteres e "e mais N" |
| Prévia não verificava os limites de texto do banco (código ≤ 60, nome ≤ 500, unidade ≤ 40, filial ≤ 40, modalidade ≤ 200, sem caracteres de controle) | Quebra de linha num nome passava na prévia e falhava na publicação com mensagem genérica | Bloqueio `INVALID_TEXT` com célula |
| Limite de 20.000 produtos só no banco | Falha tardia | Bloqueio `TOO_MANY_PRODUCTS` na prévia |

### 3.3 Diagnóstico e mensagens

- Erros técnicos deixaram de ser engolidos: a tela informa "Falha técnica ao ler o arquivo neste navegador (causa)" e registra no console. Problemas do arquivo continuam como **bloqueios** na prévia.
- Códigos do leitor ganharam orientação. Exemplo: `unsupported_part` explica que a planilha provavelmente foi **aberta e salva no Excel** (que acrescenta tema/imagens) e pede reexportação do ERP.
- `.xls` recebe mensagem específica (formato fora do contrato v1).

### 3.4 Hipóteses avaliadas e descartadas

| Hipótese | Evidência | Conclusão |
| --- | --- | --- |
| Port TS diverge do leitor Python validado | Comparação linha a linha de `xlsx.py`/`parser.py`/`numbers.py` | Equivalentes (diferenças só documentadas no brief) |
| MIME do upload incorreto | `storage-js` 2.117 envia `Blob` em multipart com o tipo do Blob; harness confirmou `application/vnd…sheet` | Correto |
| `content_hash` TS ≠ SQL com dados reais | Payload do parser para 234 produtos com acentos, zeros à esquerda e 8 casas publicado em PGlite e PostgreSQL 16 | Iguais |

### 3.5 Risco remanescente que exige decisão

Uma planilha **salva novamente no Excel** é recusada (`unsupported_part`), conforme o perfil de segurança aprovado. A recusa agora é explicada. Aceitar partes inertes (tema, `docProps/custom.xml`) muda o perfil do leitor: **Decisão D1**.

## 4. Decisões que exigem aprovação

Registradas como D13–D19 no [registro de decisões](../../planning/DECISION_REGISTER.md) (D1 → D13 … D7 → D19).

| ID | Decisão | Recomendação | Impacto se aprovada |
| --- | --- | --- | --- |
| D1 | Aceitar partes inertes de planilhas salvas no Excel (`xl/theme/*`, `docProps/custom.xml`), sem lê-las | Aprovar somente após uma amostra real reexportada; manter recusa de imagens, macros, `calcChain`, vínculos | Nova `parser_version`, testes de rejeição mantidos |
| D2 | Suporte a `.xls` | **Não aprovar**: formato binário sem leitor seguro no navegador; o ERP exporta `.xlsx` | — |
| D3 | Categorias comerciais | Tabelas `abc.categories` e `abc.product_categories` (por código ERP, com vigência e autoria), permissão nova `abc.category.manage`, "Não classificado" explícito; nenhuma inferência por prefixo | Migration, RLS, telas de gestão |
| D4 | Correção manual de itens | Manter **somente** nova revisão por reexportação; se o negócio exigir ajuste, criar `abc.revision_adjustments` (valor original, ajustado, motivo, autor, data) com `abc.report.adjust`, sem alterar linhas publicadas | Migration, recálculo em leitura, telas |
| D5 | Exportação Excel/PDF | Exportar no navegador os dados já exibidos (mesma autorização de leitura); se a governança exigir controle separado, criar `abc.report.export` | Sem migration no primeiro caso |
| D6 | Comparação entre unidades | Permitir apenas se o usuário lê as duas unidades **e** o negócio confirmar que o código ERP identifica o mesmo produto em todas as filiais | RPC adicional |
| D7 | Repetir `PERIOD_NOT_CLOSED` no SQL | Aprovar (consistência da regra entre navegador e banco) | Migration pequena |

Itens D3, D4 e D6 **não foram implementados**. As áreas analíticas usam somente `abc.report.read`, já aprovada.
