# Validação de tráfego de evidências — 04/11/2026

Branch: `codex/audit-evidence-traffic`. Base: `d9b47359b00fd1516bc773d696d760c1c603ed84`. **Código validado:** `d3ec58aee99e486218a6055618adef8b8ec31330`. O commit seguinte altera somente documentação de resultados. Responsável pela execução: agente Codex; decisão de integração: mantenedor único. Sem segunda revisão humana ou aceite formal inferido.

## Checks executados no SHA de código

| Comando | Resultado real |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 69 arquivos / 960 testes, 68,80s |
| `npm run build` | PASS — 293 módulos; aviso de chunk JS acima de 500 kB, maior chunk 893,32 kB antes de gzip |
| `npm run verify:build` | PASS — aplicação presente, sem material de chave privilegiada no bundle |
| `npm audit --audit-level=moderate` | PASS — zero vulnerabilidades; consulta ao registro com acesso de rede autorizado |
| `git diff --check` / `git diff --check origin/main...HEAD` | PASS |

Node `v22.23.4`. `npm` exigiu inclusão do diretório existente do Node no PATH. A primeira consulta de audit dentro do sandbox falhou por DNS; a execução com rede passou. Uma execução anterior da suíte carregou a primeira versão da nova fixture SQL e falhou em `Cannot delegate permission`; corrigida a identidade administrativa **somente na fixture em memória**, a suíte direcionada e depois a suíte completa acima passaram. Não foi alterado contrato SQL para satisfazer o teste.

Antes do commit, os seis arquivos direcionados passaram com **131 testes**: cliente, UI, SQL/PGlite, cache de imagens, medição sanitizada e cache/AuthProvider. O teste SQL de inativação usa rollback porque a regra vigente remove atribuições; reativar não as recria. A suíte completa usa PGlite em memória, sem definir `AUDIT_TEST_DATABASE_URL` e sem alterar o PostgreSQL persistente.

Diff revisado pelo agente: Core informa contexto via Shared, sem dependência Core → Audit; imagens têm fetch limitado/no-store, contexto e respostas tardias protegidos; downloads conservam anexo, nome de apresentação e original; upload/validação/lifecycle/RLS/migrations permanecem nos contratos existentes. `supabase/snippets/` era não rastreado antes da tarefa e foi preservado fora dos commits.

## Fixtures e cabeçalhos observados

Gerador executado no mesmo SHA para 10, 30 e 100 PNGs determinísticos, em diretórios distintos de `/tmp`. Manifestos conferidos:

| Arquivos | Bytes por arquivo | Bytes do lote gerado |
| --- | --- | --- |
| 10 | 1.844.468 | 18.444.680 |
| 30 | 1.844.468 | 55.334.040 |
| 100 | 1.844.468 | 184.446.800 |

**Esses números são tamanho dos arquivos sintéticos, não tráfego medido.** Não houve upload. A tentativa adicional de decodificar um PNG em Chromium local não chegou a abrir o browser: falta `libnspr4.so` no ambiente de execução. Não foram instaladas bibliotecas de sistema nem criado runtime alternativo.

Consulta somente leitura no frontend/Supabase local existente:

- HTML em `127.0.0.1:5173`: HEAD 200, `Cache-Control: no-cache`, ETag presente, `nosniff` ausente.
- Endpoint de chave sintética inexistente/sem assinatura no Storage: HEAD 400, sem Cache-Control/ETag/nosniff. **Não representa entrega autorizada de evidência.**

Nenhum conteúdo privado, token, credencial, nome pessoal ou URL assinada foi registrado. O inventário do banco consultou somente versões de migrations e propriedades do bucket; nenhuma migration foi aplicada.

## Não executado / não provado

- **MED-01 real 10/30/100:** instrumentação e roteiro entregues, execução pendente. O runtime local é persistente, sem conjunto de medição e sessão de teste preparados para esta tarefa; a fixture de integração existente é explicitamente descartável e não foi executada nele.
- **E2E Storage/Chromium real:** código ampliado, execução pendente em ambiente adequado. A tentativa mínima de abrir Chromium encontrou a biblioteca ausente descrita acima. Nenhum resultado E2E foi inferido de Vitest.
- **Chrome/Edge desktop, Android Chrome e iOS Safari físicos:** pendentes, incluindo câmera/galeria, legibilidade, rede lenta/offline, download e memória móvel.
- **Headers reais de URL assinada válida e assets produtivos:** pendentes. Caddy, Cloudflare, STAGING e PROD não foram consultados/alterados nesta tarefa.
- **Percentual de redução de tráfego:** não medido; a meta ≥80% depende da proposta de miniaturas físicas e da comparação com baseline.
- **Segunda revisão, aceite do mantenedor, CI remoto e merge:** não fazem parte dos checks locais acima; consultar a PR para o estado atual. Não houve merge/deploy.

## Propostas e decisões pendentes

A [proposta técnica](EVIDENCE_IMAGE_TRAFFIC.md) compara bucket privado/processamento controlado, rota autenticada, geração cliente e transformação nativa, e define associação auditável, autorização, legado, ciclo de vida, reconciliação/restore e testes negativos planejados. Nenhuma alternativa foi implantada. Políticas B/C de upload e qualquer transformação do original dependem de aprovação formal. A Política A continua preservando o original.

**Atualização E3 em 04/11/2026 (posterior à bateria de testes do SHA de código):** o mantenedor autorizou expressamente a exceção restrita a prévias JPEG/PNG com leitura autenticada/autorizada, mantendo os outros formatos somente para download. O [contrato](CHECKLIST_EVIDENCE_V1.md#revisão-restrita-de-e3--04112026) e o [brief histórico](../../briefs/AUDIT_CHECKLIST_EVIDENCE_V1.md#revisão-restrita-da-decisão-e3--04112026) registram a revisão. Isso **não altera retroativamente os resultados dos testes** nem prova sanitização: o blob em memória não é sanitização, a revogação remota tem janela residual, o limite de blobs não limita toda a memória do browser e o primeiro acesso ainda transfere o original.

Rollback: revert dos commits da PR e novo build, sem reversão de dados/schema/Storage. O mantenedor reportou teste manual DevTools satisfatório e aceitou a exceção E3; as verificações E2E com Storage real, métricas 10/30/100, dispositivos físicos e deploy continuam pendentes. O mantenedor deve verificar o CI no novo SHA documental antes de fazer merge. **PROD continua NO-GO.**
