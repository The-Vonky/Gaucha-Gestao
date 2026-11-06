# AUD-IMG-02 — Preparação para revisão final da PR #101

> **Estado posterior, 06/11/2026:** AUD-IMG-01/02 integradas pelas PRs #99/#101. A rodada MED-01/AUD-IMG-04 e a revisão do carregamento inicial estão no [relatório consolidado](MED01_FRONTEND_CLOSURE_20261106.md). Pendências/ausências abaixo descrevem a data e o SHA históricos deste documento; não invalidam provas posteriores. Homologação física e implantação continuam separadas.

**05/11/2026.** Continuação autorizada a partir de `8fa62ee`. A prova funcional do GO C permanece no [relatório local](AUD_IMG_02_LOCAL_GO_C_20261105.md); esta rodada se limita à integração da main, investigação de POST/upsert e validação do HEAD resultante. PR draft; sem merge, deploy, backfill ou alteração em STAGING/PROD.

## Integração da main

Merge normal de `origin/main` **`f073215`** na branch `codex/aud-img-02-derivative-design`, commit **`6db5368`**, sem rebase/force-push. Inclui GG-10 (PRs #102/#103), GG-01 (#104) e GG-02 (#105).

- `docs/README.md`: conflito textual resolvido mantendo o resultado atual de AUD-IMG-02 e a entrada de GG-10; inventários GG-01/GG-02 preservados.
- `docs/architecture/SECURITY.md`: conflito textual resolvido mantendo integralmente login/isolamento de derivados e segurança de comunicados.
- `.github/workflows/validate.yml`: combinação automática conferida; manteve Bubblewrap nos testes de imagem e os testes `announcements-browser.mjs` e `announcements-security.mjs` da main, sem remover jobs/checks.
- `docs/architecture/IMPLEMENTATION_MAP.md`: combinação automática conferida; manteve as entradas de miniaturas, avisos e administração GG-10.

Código/migration/documentos dos trabalhos recebidos preservados. `supabase/snippets/` não rastreado e arquivos locais ignorados foram preservados. As migrations **`20261104171756` e `20261104192428` não foram editadas nem reaplicadas**. Nenhuma migration foi executada nesta rodada.

## POST/upsert — autorização e transporte separados

Reutilizada exclusivamente a imagem sintética já existente, seu autor autorizado e sua chave de miniatura. Sem novos usuários, objetos, leases ou configurações de permissão. Login técnico permaneceu **NOLOGIN** durante toda a investigação; não se usou identidade técnica ou administrativa para tentar upload.

Diagnóstico versionado: `tests/integration/audit-derivative-storage-local.mjs`. Exige opt-in exato para `gaucha-gestao-local`, fixture privada 0600, URL/porta/container/versão confirmados, manifesto `ready` e chave vinculada à evidência. Oito requisições sequenciais, timeout de **10 s cada**, sem retry automático. Respostas 2xx/5xx ou erro não reconhecido não contam como negação; timeout gera resultado parcial e **exit code 2**. O relatório não imprime JWT, senha, URL assinada, chave de objeto ou resposta privada.

| Caminho | Corpo | POST `x-upsert=false` | POST `x-upsert=true` |
| --- | --- | --- | --- |
| Loopback do container existente; `Connection: close` | PNG reduzido da mesma imagem, 265 bytes | `400 Unauthorized`, 388 ms | `400 Unauthorized`, 241 ms |
| Mesmo loopback/cliente novo | Miniatura completa, 377.025 bytes | `400 Unauthorized`, 256 ms | `400 Unauthorized`, 260 ms |
| Gateway local existente | PNG reduzido, 265 bytes | `400 Unauthorized`, 9 ms | `400 Unauthorized`, 10 ms |
| Mesmo gateway, sequência contínua | Miniatura completa, 377.025 bytes | `400 Unauthorized`, 9 ms | **Sem cabeçalhos HTTP; timeout em 10.002 ms** |

Resultados sanitizados: [JSON da reprodução](evidence/aud-img-02-storage-local-20261105.json), sobre `6db5368`. Uma reprodução anterior nesta rodada também obteve três negações explícitas no gateway e timeout na chamada subsequente com corpo completo. O acesso inicial do host ao IP interno Docker não estabeleceu resposta; foi descartado como controle de API e substituído por um cliente temporário no loopback **do container existente**. Nenhuma porta, serviço ou container novo foi criado.

**Conclusão comprovada:** a API Storage v1.72.1 nega POST e upsert do usuário comum, com os dois tamanhos testados, quando acessada diretamente em conexão nova. No caminho gateway/Storage, a chamada subsequente com corpo grande pode travar antes de retornar status. Esse timeout **não é prova de negação**, nem foi considerado PASS ou defeito específico de upsert. A rodada anterior também observou negação de upsert quando ele era a primeira chamada.

**Hipótese, sem causa raiz fechada:** rejeição antecipada do upload e reaproveitamento de conexão/corpo não consumido no caminho pelo gateway. Na [fonte oficial v1.72.1](https://github.com/supabase/storage/blob/v1.72.1/src/storage/uploader.ts), conferida também no código instalado, `prepareUpload` avalia RLS antes do envio dos bytes ao backend e antes do bloco que trata fechamento em erros de upload; a entrada crua usa proxy de stream. Isso é compatível com a observação, mas não comprova qual componente/conexão causa o travamento. Não se atribui uma correção a v1.74.0 sem comparação equivalente. [Formato de erros Storage](https://supabase.com/docs/guides/storage/debugging/error-codes).

Não foi identificado defeito no código de produto que justifique alterar worker/frontend/RLS. Não se mudou permissão, timeout de produto, pool, container ou versão para obter PASS. O caminho direto é **controle diagnóstico**, não workaround incorporado à aplicação.

## Integridade após cada reprodução

- GET autorizado de original e miniatura conferiu os SHA-256 já registrados, antes/depois: original `b34b6b1b6925339967de1e8a37da0355ac184ca43adb8dc3eba7f82d7a652831`; miniatura `71a97e3a0ee1b56ac732d9c4012168a37bff0ad27bbc9a13197603aa2959e423`.
- Linhas completas dos dois objetos em `storage.objects`, manifesto `ready` com uma tentativa, ledger inteiro e `NOLOGIN` comparados antes/depois: iguais.
- ID e `StartedAt` do Storage iguais: sem restart/recriação/update. Nenhuma alteração nas duas migrations ou nos dados existentes.

## Validação e revisão

No merge `6db5368`, com diagnóstico/documentação posteriores sem alteração do produto:

- `npm test -- --maxWorkers=2`: **78 arquivos / 1.103 testes PASS**; decoder preservou seu Bubblewrap.
- `npm run typecheck` e `npm run lint`: PASS.
- `VITE_AUDIT_EVIDENCE_THUMBNAILS=false npm run build`, `npm run verify:build` e `npm audit --audit-level=moderate`: PASS; zero vulnerabilidades; aviso existente de chunk >500 kB.
- Diff da PR contra a main, migrations e arquivos compartilhados revisados; links locais conferidos. Whitespace anterior da main em `announcements-local.mjs` não foi alterado para maquiar o diff.

Os **sete checks do HEAD publicado** são confirmados na descrição da PR e no relatório de entrega por SHA: `validate`, `action-plans-integration`, quatro `sales-integration` e `infra-validate`. Resultados anteriores não são atribuídos ao novo HEAD. Não executar os harnesses descartáveis do CI no banco persistente.

**Limite para decisão de merge:** a matriz HTTP pelo gateway local permanece parcial, com risco residual de travamento em upload negado com corpo grande; requer avaliação/aceite explícito do mantenedor. Não há evidência de alteração indevida de objeto. Homologação física/MED-01/restore e PROD continuam fora desta rodada, sem reabrir o desenho aprovado. PR permanece draft; aprovação final e merge pertencem ao mantenedor humano único, sem segunda revisão ou APPROVED inventados. Flag versionada false; login técnico NOLOGIN.
