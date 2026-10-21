# Guia do operador — Curva ABC v1

**AS-IS:** módulo integrado à `main` pela [PR #69](https://github.com/The-Vonky/Gaucha-Gestao/pull/69), 20/10/2026. **Não homologado em produção.** Usar somente ambiente autorizado e dados aprovados. Referências: [brief](../../briefs/ABC_DOMAIN_V1.md), [autorização](../../architecture/AUTHORIZATION.md) e [testes compartilhados #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70).

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

## Mensagens da importação e o que fazer

| Mensagem | Significado | Ação |
| --- | --- | --- |
| "O formato .xls (Excel 97-2003) não é aceito" | Arquivo no formato antigo | Exportar o relatório do ERP em `.xlsx` |
| "…partes que o relatório do ERP não tem… (código: unsupported_part)" | A planilha foi aberta e **salva** no Excel (ou editada), que acrescenta tema/imagens | Exportar de novo do ERP e enviar **sem salvar** no Excel |
| "…contém fórmulas" / "…vínculos externos" / "…protegido por senha" | Conteúdo fora do perfil estático do ERP | Reexportar do ERP |
| Bloqueio `INVALID_TEXT` numa célula | Texto com quebra de linha/caractere de controle ou acima do limite do banco | Corrigir o cadastro no ERP e reexportar |
| "Falha técnica ao ler o arquivo neste navegador (…)" | Problema do navegador ou do sistema, não do arquivo | Atualizar a página; persistindo, enviar a mensagem ao suporte |

Até 21/10/2026, abrir o sistema por **HTTP num IP de rede** (ex.: DEV compartilhado em `http://10.1.10.94:5173`) fazia qualquer importação falhar com "Não foi possível ler o arquivo". Corrigido na branch `fix/abc-import-p0-20261021`; detalhes em [MATRIZ_EQUIVALENCIA_LEGADO](MATRIZ_EQUIVALENCIA_LEGADO.md).

## Integridade — não confundir prévia com garantia do servidor

A `confirm_source_upload` verifica **existência, tamanho e MIME** do Storage; **não recalcula o SHA-256 dos bytes no servidor**. A `publish_revision` revalida o payload e o `content_hash`, mas não prova que ele corresponde aos bytes do XLSX. O browser faz a conferência posterior; um publicador autorizado poderia enviar linhas falsas coerentes. Algumas regras do parser (ex.: período fechado) não estão repetidas identicamente no SQL.

O teste `tests/integration/abc.mjs` cobre Auth, RLS, Storage e concorrência com **bytes sintéticos**, não uma importação completa de XLSX legítimo. Antes de uso real, validar as quatro amostras ERP (234/234/234/206 produtos) apenas em ambiente aprovado; registrar evidência **sem anexar dados reais ao GitHub público**. A [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) trata os testes dos dois operadores e da integridade.

**Fora da v1:** comparação de períodos, exportação própria de ABC, correção manual, fechamento administrativo e migração de histórico do standalone. Toda evolução requer brief e testes novos. Produção permanece **NO-GO**.
