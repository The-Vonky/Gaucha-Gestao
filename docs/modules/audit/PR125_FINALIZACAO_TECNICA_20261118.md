# PR #125 — integração e diagnóstico de dependências

Registro de 18/11/2026. Pedido autorizado: finalizar tecnicamente a PR #125, incorporar a #124 já homologada e integrada à `main`, investigar o audit e revalidar sem merge da PR, alteração de CI ou intervenção em C30/STAGING/PROD.

## Integração

- Branch: `codex/auditoria-exportacao-evidencias`; HEAD anterior: `287d4a62f646bfd9e6d1a6476c13e63c14c5cf62`.
- `origin/main`: `cb6344c65a8dbefce2e68a8de2b0b19f60881612`, merge da #124 (`d8e25e0`).
- Merge normal, sem rebase/force push: `ad46590dd9be40cc2ee6474dc69acf964f01b837`. Sem conflitos. Não houve alteração funcional adicional nesta finalização.
- Treze dos catorze arquivos da #124 permanecem idênticos à `main`, incluindo UI, hover transparente, agrupamento/filtro, catálogo das 14 redações, migration v2 e testes. O único arquivo compartilhado, `tests/integration/audit.mjs`, preserva integralmente as mudanças da #124 e acrescenta apenas a asserção das quatro abas da exportação e do cabeçalho de Evidências sem anexos.
- `package.json`, `apps/web/package.json` e `package-lock.json` permanecem idênticos à `main` e ao HEAD anterior da #125. A vulnerabilidade não foi introduzida por esta PR.
- Diretórios locais não rastreados preservados: `infra/local/windows/`, `supabase/snippets/` e `tests/labs/gg02c/__pycache__/`.

## picomatch — evidência e exposição

Ambiente de diagnóstico: Node `22.23.4`, npm `10.9.9`, lockfile existente, registry oficial `https://registry.npmjs.org/`.

Comandos executados:

```sh
npm explain picomatch
npm ls picomatch --all
npm audit --json
npm audit --omit=dev
npm view picomatch version dist-tags time.modified --json
npm ls picomatch --all --omit=dev
npm audit --audit-level=moderate
```

Uma versão instalada: **`picomatch@4.0.7`**, marcada `dev` no lockfile. Cadeias principais:

| Origem | Caminho até picomatch |
| --- | --- |
| Vite `6.4.5` | direto; também `tinyglobby@0.2.17` e peer opcional de `fdir@6.5.0` |
| Vitest `5.0.4` | direto; também Vite e tinyglobby |
| typescript-eslint `8.70.1` | parser/type-utils/utils → typescript-estree → tinyglobby |
| Plugins Vite de React/Tailwind e mocker Vitest | utilizam o Vite existente |

O JSON do audit contém **11 pacotes com severidade high**, propagados a partir de um advisory de picomatch, não onze falhas independentes no código de exportação. São eles: picomatch, fdir, tinyglobby, vite, vitest, typescript-eslint e cinco pacotes `@typescript-eslint` (eslint-plugin, parser, type-utils, typescript-estree e utils). `npm audit --omit=dev` retorna **zero vulnerabilidades**; `npm ls picomatch --all --omit=dev` retorna árvore vazia.

O [advisory oficial GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), atualizado em 17/11/2026, afeta versões `<=4.0.7` e informa **nenhuma versão corrigida**. O problema é ReDoS: padrões extglob repetidos de um único ramo, como `+(*)` ou `+(*a)`, podem gerar backtracking exponencial e bloquear o event loop diante de uma entrada preparada.

Na consulta de 18/11/2026, `npm view` informa `version=4.0.7`, `latest=4.0.7` e última modificação em `2026-08-24T14:36:23.879Z`. A [última release upstream](https://github.com/micromatch/picomatch/releases/tag/4.0.7) também é 4.0.7. A [lista de propostas upstream](https://github.com/micromatch/picomatch/pulls) contém correções ainda abertas para o advisory (por exemplo, #273, #270 e #267); uma proposta aberta não comprova correção publicada. A referência #194 do advisory aponta a outra proposta aberta sobre wildcard inicial `?`, e não constitui release corrigida.

**Exposição deste projeto:** picomatch atua nas ferramentas Node de desenvolvimento, seleção de arquivos, testes e build/lint. A aplicação não importa picomatch/tinyglobby/fdir em `apps/web/src`. Uma inspeção adicional do grafo Rollup, usando a configuração Vite existente com `write:false` e sem mudar o repositório, examinou **291 módulos emitidos e encontrou zero módulos desses três pacotes**. Portanto, não participam do bundle/runtime de produção do frontend atual. PDF/XLSX, nomes dos anexos, filtros da aplicação e dados recebidos do usuário não são encaminhados a picomatch pelo código de runtime inspecionado.

A exploração requer que padrões e entradas controlados por atacante alcancem o matcher vulnerável. Não foi identificado esse caminho a partir das telas/dados do aplicativo. Isso reduz a exposição do frontend entregue, mas **não elimina a vulnerabilidade nas ferramentas de desenvolvimento/CI**, que processam código e configurações do checkout. O Vite local foi confirmado escutando em `127.0.0.1:5173`; não há exposição adicional autorizada nesta tarefa. Não foi executado exploit nem se afirma ausência universal de exploração.

## Decisão técnica e opções seguras

**Nenhuma correção de dependência aplicada:** não existe versão oficialmente corrigida disponível na consulta. Preservados manifests, lockfile, audit e CI. O campo `fixAvailable` do npm sugere downgrades de Vitest para `3.1.4`, Vite para `6.2.7` e typescript-eslint para `8.47.0`; é uma sugestão de resolução de grafo, não uma prova de correção do advisory. Não foi aplicada: não garante eliminação de picomatch vulnerável e regressa versões deliberadamente atualizadas.

Opções seguras:

1. Aguardar release oficial corrigida, atualizar somente os consumidores/lockfile necessários e repetir audit, suíte e CI; esta é a recomendação.
2. Avaliar uma atualização oficial dos consumidores que remova integralmente a cadeia, com prova da árvore e compatibilidade. Não foi encontrada nesta investigação uma substituição já publicada que resolva o conjunto atual.
3. Se houver urgência, uma correção mantida em fork exigiria escopo próprio, análise de segurança, manutenção e validação; não foi aplicada nem é apresentada como correção oficial. Alteração de gate ou aceite excepcional de risco exige decisão explícita separada do mantenedor e não torna o audit verde.

**Bloqueio vigente:** `npm audit --audit-level=moderate` continua reprovando por 11 high; logo, o job `validate` não pode ser declarado aprovado. Não houve `audit fix --force`, downgrade, supressão, exclusão de dependências do gate ou alteração da configuração de CI.

## Validação e entrega

As provas locais executaram o código integrado em `ad46590dd9be40cc2ee6474dc69acf964f01b837`; o commit subsequente desta finalização altera somente documentação/evidências. O resultado remoto do novo HEAD fica na PR #125, sem presumir aprovação.

| Check local | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint -- --ignore-pattern 'tmp/**'` | PASS; exclui somente scripts locais preexistentes ignorados pelo Git; configuração versionada e CI preservados |
| `npm test -- --maxWorkers=2` | **1.164 PASS, 82 arquivos**, 161,22 s, fora do sandbox; bancos dos testes em memória |
| `npm run build` | PASS; aviso conhecido de chunk >500 kB |
| `npm run verify:build` | PASS |
| `npm audit --json` / `npm audit --audit-level=moderate` | FAIL; 11 high na cadeia de picomatch |
| `npm audit --omit=dev` | PASS; zero vulnerabilidades |
| Grafo do bundle Vite/Rollup em memória | 291 módulos emitidos; zero picomatch/tinyglobby/fdir |
| `node tests/integration/audit-reporting-evidence-browser.mjs` | PASS; oito cenários v1/v2 × 0/1/5/100, mais falhas de acesso/conexão |
| Poppler `pdfinfo` / `pdfimages -list` nos PDFs recém-gerados | PASS; 0/1/5/100 imagens, mesma quantidade de objetos únicos, 3/4/7/100 páginas em cada versão |
| `git diff --check` e revisão da integração | PASS; arquivos da #124 preservados e alteração compartilhada limitada à quarta aba |

Os testes de exportação incluídos na suíte conferem igualdade integral das três primeiras abas (`Resumo`, `Checklist`, `Secoes`), imagens incorporadas em `xl/media` com os bytes esperados, âncoras/linhas e ausência de links externos/fórmulas. A matriz Chromium reabre os XLSX com leitor independente e confere as quatro abas, metadados e a quantidade de imagens incorporadas. A conferência dos PDFs detecta omissão de fotografias e imagens fragmentadas entre páginas nos oito cenários. Testes de prévia impedem impressão enquanto as imagens não carregam, em falha e após revogação de autorização; não há caminho autorizado de omissão silenciosa.

As regressões da #124 integram os 1.164 testes: catálogo v1 preservado, v2 ativa com **exatamente 14 alterações**, IDs/posições/seções mantidos, auditorias antigas conservadas, agrupamento/filtro/expansão de evidências e casos negativos de autorização. Os arquivos de hover/CSS e o driver E2E da #124 permanecem idênticos à `main`; a execução real com Auth/RLS/Storage é acompanhada no CI, sem executar no DEV pessoal os drivers que criam fixtures no banco.

As ferramentas de navegador/Poppler inicialmente não localizaram bibliotecas de sistema (`libnspr4.so`/`libnss3.so`). A execução aprovada reutilizou as bibliotecas já existentes em `/tmp/gg-report-browser-deps/root/usr/lib/x86_64-linux-gnu` e `/tmp/gg-report-pdf-tools/root/usr/lib/x86_64-linux-gnu` por `LD_LIBRARY_PATH`, sem instalar pacotes ou criar containers. O transporte REST/Storage do ensaio Chromium é interceptado com dados sintéticos; não comprova integração local com RLS/Storage reais. Artefatos sanitizados desta revalidação: [evidências técnicas](evidence/pr125-finalizacao-20261118/).

O mantenedor informou neste pedido que **aprovou visualmente o PDF e o XLSX importado no Google Planilhas**. Este é aceite relatado pelo titular, não review formal `APPROVED`. A compatibilidade específica com Microsoft Excel desktop **ainda não foi homologada**; sua instalação não é condição automática para esta finalização.

Checkout ativo: `/home/bernardodev/projetos/Gaucha-Gestao`; Vite existente com cwd `apps/web`, HTTP 200 em `http://127.0.0.1:5173`. O Supabase local `gaucha-gestao-local` possui oito serviços saudáveis. Ledger consultado em transação `READ ONLY`: **42 migrations**, última `20261113182401`, já aplicada antes desta tarefa. Nenhuma migration necessária/aplicada. Os três volumes existentes foram listados e preservados: `gaucha-gestao-local_db-data`, `gaucha-gestao-local_storage-data` e `gaucha-gestao-local_studio-snippets`.

Sem escrita em dados/Storage, reset, seed, criação de infraestrutura, merge da PR, remoção de branches, deploy ou acesso a C30/STAGING/PROD. Sem segunda revisão humana alegada. A decisão de merge continua pertencendo ao mantenedor, com o audit reprovado visível.
