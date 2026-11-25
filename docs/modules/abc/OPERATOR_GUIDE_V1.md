# Guia do operador — Curva ABC v1

**AS-IS:** módulo integrado à `main` pela [PR #69](https://github.com/The-Vonky/Gaucha-Gestao/pull/69), 20/10/2026. **Não homologado em produção.** Usar somente ambiente autorizado e dados aprovados. Referências: [brief](../../briefs/ABC_DOMAIN_V1.md), [autorização](../../architecture/AUTHORIZATION.md) e [homologação D13/#86](https://github.com/The-Vonky/Gaucha-Gestao/issues/86).

## Quem pode acessar

- `abc.report.read` (papel `costs_viewer` com escopo de unidade) consulta séries, detalhes, histórico e arquivo original permitido; não publica.
- `abc.report.publish` (papel `costs` com escopo de unidade) publica/substitui; não libera outras unidades. Atribuição restrita a setor não autoriza o relatório da unidade inteira.
- Sem perfil ativo, sem permissão ou em unidade diferente, o banco deve negar independentemente de atalhos de URL. Não resolver isso desabilitando RLS.

## Fluxo de trabalho

~~~mermaid
flowchart TD
  U["Custos > Curva ABC: selecionar unidade"] --> F["Importar relatório XLSX do ERP"]
  F --> P["Prévia: competência, filial, somas, itens, bloqueios/avisos"]
  P --> B{"Há bloqueio?"}
  B -- "Sim" --> X["Corrigir/exportar novamente no ERP"]
  X --> F
  B -- "Não" --> R{"Já existe revisão / há avisos?"}
  R -- "Sim" --> A["Aceitar avisos; motivo obrigatório ao substituir"]
  R -- "Não" --> PUB["Publicar"]
  A --> PUB
  PUB --> SQL["Reserva e upload; confirmação; transação SQL"]
  SQL --> CON{"Conflito de versão 40001?"}
  CON -- "Sim" --> RE["Recarregar série; rever o vigente"]
  CON -- "Não" --> H["Revisão preservada no histórico"]
  H --> C["Baixar original / Conferir com o arquivo"]
~~~

1. Abra **Custos → Curva ABC** (`/abc`), escolha sua unidade e selecione **Importar relatório**.
2. Escolha o relatório ERP **Curva ABC Geral (Realizado)** em `.xlsx`, até **10 MiB**. Na prévia local, examine filial, período/competência, modalidade de custo, somas e mensagens de linha/célula. Selecionar a planilha **não a publica**.
3. Se houver **bloqueios**, reexporte do ERP; não altere planilha para ocultar inconsistências. Leia e aceite **avisos** quando exigido.
4. Se a série (unidade + competência + modalidade) já tem revisão, a substituição exige **motivo** e cria nova revisão imutável. Uma versão concorrente desatualizada retorna **40001** e exige reconsulta.
5. Após a publicação, consulte total, itens, classe informada pelo ERP e **classe calculada** (`abc-70-90-inicio-v1`, acumulado anterior ao item), revisões anteriores e autoria.
6. Use **Baixar original** e **Conferir com o arquivo**. Esta última opção baixa o XLSX, reprocessa e compara o conteúdo, registrando o resultado em log.

## Áreas analíticas (v2 — em revisão nas PRs #79 e seguinte)

Menu **Custos → Curva ABC**, com as mesmas abas no topo de cada tela. Unidade e modalidade escolhidas ficam no endereço (`?unidade=…&modalidade=…`) e acompanham a navegação entre áreas. Tudo usa somente **revisões vigentes publicadas** e a permissão `abc.report.read` da unidade; nenhuma área grava dados.

| Área | Para que serve | Observações |
| --- | --- | --- |
| **Visão geral** | Última competência: consumo valorizado, produtos, divisão A/B/C, evolução, maiores produtos, aumentos e reduções contra a competência anterior | Sem publicação, orienta a primeira importação (quem publica) |
| **Importações** | Todas as revisões, vigentes e substituídas, com autor, data, motivo, avisos e arquivo | "Importar relatório" só aparece para quem publica; substituir cria nova revisão, nada é apagado |
| **Comparações** | Base × atual: diferença no total, efeitos de preço e quantidade, novos, ausentes, não comparáveis, rankings, filtros | Produtos casam **somente pelo código do ERP**; unidade de medida diferente ou quantidade zero = "não comparável" |
| **Relatórios** | Distribuição por classe, ERP × calculada, principais produtos, custos médios, gasto por unidade de medida, evolução, variações, impactos e itens para conferir | "Imprimir ou salvar em PDF" usa o navegador; planilha aguarda decisão D5 |
| **Produtos** | Busca por código/descrição, filtros por classe calculada e do ERP, histórico do produto por competência com a revisão e linha de origem | Categoria comercial ainda não disponível (D3) |
| **Categorias** | Distribuição financeira entre as **classes** A, B e C por competência | Classe ABC **não** é categoria comercial |

**Como ler a comparação:** custo médio = custo total ÷ quantidade. Efeito de preço = (custo médio atual − base) × quantidade atual; efeito de quantidade = custo médio base × variação da quantidade. A soma dos efeitos com novos, ausentes e não comparáveis fecha a diferença do total (resíduo exibido, esperado R$ 0,00). Alertas de +300% / −75% pedem conferência no ERP; não provam erro. Regras completas no [brief v2](../../briefs/ABC_ANALYTICS_V2.md).

## Mensagens da importação e o que fazer

| Mensagem | Significado | Ação |
| --- | --- | --- |
| "O formato .xls (Excel 97-2003) não é aceito" | Arquivo no formato antigo | Exportar o relatório do ERP em `.xlsx` |
| "…componentes não permitidos… (código: unsupported_part)" | XLSX contém partes adicionais não aceitas. Com a PR #81, apenas `xl/theme/theme1.xml` passa a ser admitido, com tipo e vínculo internos canônicos | Reexportar do ERP caso existam imagens, macros, `calcChain`, vínculos externos ou outras partes extras; não remover validações |
| "…contém fórmulas" / "…vínculos externos" / "…protegido por senha" | Conteúdo fora do perfil estático do ERP | Reexportar do ERP |
| Bloqueio `INVALID_TEXT` numa célula | Texto com quebra de linha/caractere de controle ou acima do limite do banco | Corrigir o cadastro no ERP e reexportar |
| "Falha técnica ao ler o arquivo neste navegador (…)" | Problema do navegador ou do sistema, não do arquivo | Atualizar a página; persistindo, enviar a mensagem ao suporte |

Até 21/10/2026, a abertura por HTTP num IP de rede fazia a importação falhar com "Não foi possível ler o arquivo". Correção integrada pela PR #78. Veja os detalhes em [MATRIZ_EQUIVALENCIA_LEGADO](MATRIZ_EQUIVALENCIA_LEGADO.md).

## Perfil XLSX com tema canônico — PR #81 integrada

Os nove relatórios de teste listados pelo operador em 21/10/2026 apresentam como **única parte fora da allowlist** o caminho `xl/theme/theme1.xml`. Esse diagnóstico de nomes de partes não prova, por si só, que todo o conteúdo seja válido.

O contrato integrado limita a aceitação **exclusivamente** a `xl/theme/theme1.xml`, com Content-Type e relacionamento interno do workbook canônicos. O tema é tratado como **inerte**: não altera produto, período, quantidade, valor nem classe. O XLSX original e seu SHA-256 são preservados, e a versão do parser passa a `erp-curva-realizado-v2`.

Continuam bloqueados macros, fórmulas, imagens, vínculos externos, `calcChain`, outras partes, caminhos inseguros, conteúdo excessivo e relações inválidas. A homologação [D13/#86](https://github.com/The-Vonky/Gaucha-Gestao/issues/86) ainda requer amostras aprovadas e confronto de somatórios, competência e unidade.

## Integridade — não confundir prévia com garantia do servidor

A `confirm_source_upload` verifica **existência, tamanho e MIME** do Storage; **não recalcula o SHA-256 dos bytes no servidor**. A `publish_revision` revalida o payload e o `content_hash`, mas não prova que ele corresponde aos bytes do XLSX. O browser faz a conferência posterior; um publicador autorizado poderia enviar linhas falsas coerentes. Algumas regras do parser (ex.: período fechado) não estão repetidas identicamente no SQL.

O teste `tests/integration/abc.mjs` cobre Auth, RLS, Storage e concorrência com **bytes sintéticos**, não uma importação completa de XLSX legítimo. Antes de uso real, validar as quatro amostras ERP (234/234/234/206 produtos) apenas em ambiente aprovado; registrar evidência **sem anexar dados reais ao GitHub público**. A [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) encerrou o acompanhamento anterior. A homologação D13 e as lacunas da matriz de equivalência seguem como evidências próprias.

**Fora do escopo atual:** exportação em planilha (D5), correção manual (D4), categorias comerciais (D3), comparação entre unidades (D6), fechamento administrativo e migração de histórico do standalone ([matriz](MATRIZ_EQUIVALENCIA_LEGADO.md)). Toda evolução requer brief e testes novos. Produção permanece **NO-GO**.
