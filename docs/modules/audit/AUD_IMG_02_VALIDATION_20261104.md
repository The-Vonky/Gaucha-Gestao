# AUD-IMG-02 — Registro de validação, 04/11/2026

> **Estado posterior, 06/11/2026:** o desenho foi implementado e integrado pela PR #101, incluindo o executor de `npm run dev`. Consulte a [consolidação MED-01/AUD-IMG-04](MED01_FRONTEND_CLOSURE_20261106.md). As limitações de implementação abaixo são históricas; dispositivos físicos, backfill e implantação do executor no servidor continuam separados.

> Baseline histórico de `fb675da`/`6e84a22`. A continuação autorizada acrescenta [integração real em Auth/PostgreSQL/Storage no CI descartável](AUD_IMG_02_REAL_SECURITY_20261104.md); seus resultados e os sete checks do HEAD são registrados na PR #101. As pendências abaixo descrevem a rodada anterior.

**Código testado/publicado:** `fb675dab4e461394209887325567fdfc4b9aa130`, branch `codex/aud-img-02-derivative-design`, PR #101 draft. O commit posterior deste registro altera somente documentação. Base da PR: `422a51fe91843824013ad337122f6954c954e59c`; preparação preservada até `d74039d453ddd9f96dab2b046cba3d61168be934`.

## Ambiente e comandos

Checkout WSL/Linux do mantenedor, Node **v22.23.4**, npm **10.9.9**, Sharp **0.35.5**. Sem nova infraestrutura. Docker não foi usado: `docker ps` no sandbox respondeu permission denied. Nenhuma migration, fixture, usuário, bucket ou arquivo foi aplicado ao Supabase persistente. Nenhuma ação em C30/STAGING/PROD.

| Comando | Resultado real no código indicado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` com variáveis de conexão persistente removidas | PASS: **72 arquivos, 999 testes**, 80,00 s na execução final |
| `node --test tests/audit-derivative-protocol.node.mjs` | PASS: **6/6**, fakes offline |
| `npm run build` | PASS; aviso de chunk >500 kB, sem mudança de escopo para dividir bundle |
| `npm run verify:build` | PASS: aplicação presente, sem chaves privilegiadas no bundle |
| `npm audit --audit-level=moderate --cache /tmp/aud-img-npm-cache` | PASS: **0 vulnerabilidades** |
| `git diff --check origin/main...HEAD` e `git diff --check` | PASS |
| `node --check` dos quatro novos scripts MJS | PASS |
| `node scripts/audit-derivative-once.mjs` sem adapter | Bloqueio esperado, exit **2**, sem conexão |

A suíte completa final foi executada explicitamente assim:

```bash
env -u AUDIT_TEST_DATABASE_URL -u ABC_TEST_DATABASE_URL \
  -u ACTION_PLANS_TEST_DATABASE_URL -u SALES_CI_DATABASE_URL \
  -u VEN04A_LOCAL_TEST -u VEN04B_LOCAL_TEST -u VEN03_LOCAL_TEST npm test
```

Foi necessário executar os testes de subprocesso fora do sandbox externo do agente, que impedia pipes/namespaces. **O decoder continuou dentro do próprio Bubblewrap sem rede**, com mounts somente de runtime/dependências/código e limites prlimit/RSS/wall. Não houve fallback sem isolamento. Sem credenciais, conexão ou dados empresariais nos testes.

Uma execução completa anterior detectou a expectativa antiga de grants em `tests/audit-database.test.ts`: agora há um helper de leitura autorizado a mais. A lista explícita foi corrigida para incluir somente `can_read_evidence_derivative`, mantendo negado EXECUTE de processamento e anon. A execução final acima passou. Diagnósticos anteriores de pipes e resolução do caminho do runtime foram corrigidos antes do SHA validado.

## O que foi efetivamente provado

- **Decoder real:** JPEG/PNG sintéticos, 480 px, orientação EXIF, remoção de metadata do derivado, transparência, sem ampliação, rejeição de conteúdo inválido/truncado/MIME falso/excesso de bytes/pixels, timeout e orçamento RSS.
- **Worker com DB/Storage fakes:** SHA-256 dos bytes lidos/gerados, reserva antes do upload, read-back antes de ready, 409 com verificação de igualdade, negação de divergência, falhas parciais, lease obsoleta, preservação do original e ausência de efeitos em idle.
- **SQL real em PGlite; Auth/Storage stubs:** nova migration aplica em memória junto às anteriores; bucket privado, SELECT/RLS/RPC por evidência e unidade, perfil ativo, grants revogados/inadequados, setor negado, operações de escrita negadas, manipulação de chave/ID, claim/lease/retry/CAS e finalização/reabertura. Não é prova da Storage API ou de duas conexões PostgreSQL concorrentes.
- **Frontend com backend mockado:** flag false conserva comportamento; true carrega somente miniatura visível, sem fallback silencioso; modal usa original por ação explícita; cache distinto, reconciliação e logout. Suítes existentes de download, nome apresentado, ciclo/histórico e permissões passaram.

## CI remoto e limitações

No SHA `fb675da`, workflows [Validate foundation](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/41878907166) e [Validate reproducible infrastructure](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/41878907208) foram disparados e estavam **queued** na consulta de entrega. Isso não é CI verde. Consultar o HEAD documental posterior e os checks atuais da PR antes do merge; não reutilizar checks da rodada preparatória como prova do código novo.

**Não executados/provados nesta rodada:** RLS/Storage/Auth reais da nova funcionalidade; identidade técnica/JWT customizado; assinatura direta e verbos copy/move/upsert reais; concorrência entre sessões reais; backup/restore; MED-01 de 10/30/100 e economia percentual; avaliação humana de códigos de barras/textos; Android/iOS físicos. As integrações existentes, quando executadas pelo CI, não substituem os casos específicos de derivados ainda ausentes.

O processamento operacional não funciona sem migration/bucket, identidade técnica e policies/grants técnicos aprovados e comprovados. Nenhum desses recursos foi ativado. O [contrato vigente](AUD_IMG_02_IMPLEMENTATION_20261104.md) descreve o impedimento preciso, primeiro teste seguro após GO C, dependências adicionais de ativação, riscos e reversão sem exclusão de dados. Mantenedor único decide merge; nenhuma segunda revisão humana foi declarada. PROD NO-GO.
