# MED-01, AUD-IMG-04 e carregamento inicial — consolidação de 06/11/2026

Base de produto: `1c704f84efa0650e6fbed3354fc7ab77e75fe73f` (merge da PR #101). Branch `codex/med-01-cache-frontend`. Código da otimização/instrumentação: `aa5b38c`. Responsável pela execução: agente Codex; revisão e decisão de merge: mantenedor humano único, sem segunda revisão humana inferida.

**Resultado:** MED-01 executada para navegação local com 10/30/100 imagens, três repetições por modo. AUD-IMG-04 teve revisão HTTP local concluída e lacunas de entrega futura registradas. AUD-IMG-01/02 já estavam integradas pelas PRs #99/#101; não foram reimplementadas. A única mudança de produto desta rodada é carregar páginas por rota. **PROD NO-GO**; homologação física, headers na borda e implantação do executor no servidor continuam separados.

Evidência numérica: [JSON sanitizado](evidence/med01-frontend-20261106.json), com repetições, percentis, cabeçalhos, tamanhos de build, preservação e diagnóstico de upload negado. Relatórios CDP sanitizados completos e preparação privada permanecem em `tmp/med01-20261106/`, ignorado pelo Git; o JSON versionado contém hashes dos relatórios de imagens. Nenhuma URL assinada, credencial, chave de objeto ou identidade de usuário integra a evidência publicada.

## Método e preservação

- Reutilizado exclusivamente `gaucha-gestao-local`, Storage **v1.72.1**, 36 migrations, sem migration/reset/seed/atualização/restart de containers. Nenhuma ação em C30/Cloudflare/STAGING/PROD.
- Um lote de **100 PNGs sintéticos 960×640**, gerado por `scripts/generate-audit-evidence-fixtures.mjs`: 1.844.468 bytes por arquivo, **184.446.800 bytes** no lote. São ruído determinístico, não fotos de câmera nem prova de legibilidade. Nenhum dado empresarial foi usado.
- Uma inspeção sintética nova, conta de teste existente e RPCs/Storage normais: dez imagens por critério, dez critérios distribuídos por duas seções (1–5 e 14–18). Cenários usam os primeiros 1/3/10 critérios do mesmo lote, sem duplicação de uploads. Limites de 10/critério e 100/inspeção respeitados.
- Os 36 registros de migrations, 14 jobs, 25 evidências e 39 objetos anteriores ficaram **idênticos no inventário de linhas completo**. Adicionados somente 100 evidências, 100 jobs `ready` com uma tentativa e 200 objetos. Não é uma prova de backup/restore físico. O executor existente processou somente uploads novos após o corte da sessão e voltou a **NOLOGIN** ao encerrar. O lote sintético foi preservado para reprodução, sem limpeza física ou backfill.
- Build de produção no preview Vite da aplicação, na porta local **5173 reutilizada**, Supabase em 54321; Chromium headless Linux, viewport 1280×960, locale pt-BR, rede loopback sem throttle, cache habilitado, sem interceptação de requests, contexto novo por repetição. Bibliotecas Chromium já existentes em `/tmp/aud-img-browser-libs`; nenhuma instalação de sistema ou infraestrutura nova.
- Baseline e candidato de imagens usam **a mesma versão de produto da base**, com `VITE_AUDIT_EVIDENCE_THUMBNAILS=false` e `true`. A mudança de rotas não entrou nessa comparação. O frontend antes/depois usa ambos os builds com a flag **false**. Build adicional com true validou a integração final.
- `tests/integration/audit-evidence-traffic.mjs` (versão 2) agora distingue originais/derivados e RPCs sem exportar paths. Os dois drivers opt-in novos apenas navegam/baixam no loopback; não provisionam infraestrutura nem criam fixtures no banco.

O tempo de percurso inclui abertura de critérios, rolagem de todas as imagens, decodificação observada, fechamento e estabilização `networkidle` + 100 ms. **Não é somente latência de rede nem carregamento de uma tela imóvel.** p50/p95 abaixo são nearest rank das durações dos GETs concluídos reunidos das três repetições. Três amostras de UI não permitem prometer ganho estatístico ou desempenho móvel.

## MED-01 — primeira visita

Bytes são soma do corpo codificado observado no CDP, não estimativa por tamanho de arquivo ou `Content-Length`. Cada rodada teve exatamente N GETs completos, status 200, aliases distintos e **zero originais na lista candidata**. Sem falhas, retries ou pendências nessa etapa. MB nas explicações usa base decimal.

| Imagens | Anterior (bytes) | Miniaturas (bytes) | Redução de corpo | GETs anterior → candidato | Percurso mediano anterior → candidato | GET p50/p95 anterior → candidato |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 10 | 18.444.680 | 4.156.046 | 77,47% | 10 originais → 10 derivados | 1.245 → 1.197 ms | 29/43 → 11/18 ms |
| 30 | 55.334.040 | 12.467.210 | 77,47% | 30 originais → 30 derivados | 3.466 → 3.034 ms | 26/42 → 10/13 ms |
| 100 | 184.446.800 | 41.556.219 | 77,47% | 100 originais → 100 derivados | 12.045 → 9.923 ms | 28/47 → 10/18 ms |

**A meta de 80% não foi atingida neste lote.** Não se alterou resolução/encoder para ajustar o resultado à meta. Os ganhos anteriores de 86–94% em imagens individuais continuam provas daqueles arquivos, não previsão universal.

| Imagens | Wire mediano anterior → candidato (bytes, inclui headers) | Redução wire | Assinaturas por rodada anterior → candidato | RPCs concluídas na primeira visita anterior → candidato |
| --- | ---: | ---: | --- | --- |
| 10 | 18.449.619 → 4.160.056 | 77,45% | 10 → 10 | 0 → 24, 24, 23 |
| 30 | 55.348.856 → 12.479.240 | 77,45% | 30 → 30 | 0 → 63, 63, 64 |
| 100 | 184.496.190 → 41.596.324 | 77,45% | 100 → 100 | 0 → 210, 208, 207 |

Assinaturas não são RPCs: as primeiras usam a API Storage; as últimas incluem consulta de estado/manifesto. Reentrar no viewport pode repetir a consulta de estado. O custo de autorização não foi retirado para otimizar o benchmark.

## Revisita, seções, reload e ações explícitas

| Imagens | Bytes na revisita anterior → candidato | GETs na revisita anterior → candidato | Cache observado |
| --- | ---: | --- | --- |
| 10 | 0 → 0 | 0 → 0 | Ambos retêm os blobs dentro dos 60 s |
| 30 | 55.334.040 → 0 | 30 → 0 | Só o lote de miniaturas cabe nos 24 MiB |
| 100 | 184.446.800 → 41.556.219 | 100 → 100 | Ambos excedem 24 MiB; varredura sequencial causa evicção LRU |

Os zeros são reutilização de **blobs voláteis na sessão**, não HIT de CDN ou cache persistente do navegador. GETs efetivos de prévia usaram `no-store`; zero hits HTTP registrados. Em revisita de 10/30, a candidata ainda fez respectivamente 10/30 RPCs de estado por rodada, sem nova assinatura/GET. O limite de memória foi preservado: não se promete reter 100 imagens nem se ampliou RAM para eliminar a evicção.

- **Troca de seções e retorno ao primeiro critério:** baseline 0/10/10 GETs para 10/30/100; candidato 0/0/10 GETs de derivados. Mesmos critérios e ações em ambos os modos.
- **Reload:** perdeu blobs e transferiu novamente N originais ou N derivados. Todas as 18 rodadas terminaram o bloco principal com `unfinished=0`; etapas de primeira visita/revisita/seção/modal/reload sem falhas.
- **Ampliação:** baseline reutilizou o original já retido depois da visita ao primeiro critério; candidato fez um GET explícito de **1.844.468 bytes** do original por rodada. O smoke final no build otimizado conferiu SHA-256 do blob ampliado e do arquivo baixado contra a fixture.
- **Download explícito:** novo pedido de assinatura, HEAD e navegação attachment, com arquivo salvo de 1.844.468 bytes, idêntico em todas as rodadas. CDP reportou HEAD/GET abortados na transferência para o subsistema de download; `wireBytes`/`bodyBytes` desse estágio são **desconhecidos**, não zero. Não entram na redução de navegação.
- **Expiração:** no cenário 10/repetição 1 de cada modo, após mais de 61 s houve dez novas assinaturas/GETs do tipo esperado. Sem renovação automática infinita.
- **Logout/login:** zero imagens no DOM após logout; o login autorizado posterior fez dez novos GETs em cada modo. URLs assinadas previamente emitidas ainda responderam **200 após logout** no ensaio HTTP independente, dentro do TTL residual; isso não é revogação instantânea.
- **Offline:** fetch público sem cache falhou com a rede desligada; reconexão/navegação voltou a carregar dez imagens. É ensaio básico de perda/retorno, não homologação de upload offline, rede móvel ou todos os retries de imagem.

**Limites de coleta:** tentativas exploratórias que misturavam bootstrap, troca de documento e sessão deixaram chamadas API sem término no CDP e foram excluídas das comparações. A coleta final usa blocos separados. Bootstrap final e navegação principal foram completos. O bloco complementar de sessão terminou com **três GETs API sem término em cada modo**; sua contagem API é parcial, não há percentual de economia para esse bloco. Também houve cancelamento CDP da resposta Auth 204 na saída e falha de rede deliberada no teste offline. Não se transformou captura incompleta em zero nem em PASS de egress total.

**Upload e processamento separados:** os 100 uploads autorizados enviaram payload conhecido de 184.446.800 bytes; os 100 derivados ficaram ready em uma tentativa. Wire, tempo/CPU do processamento e tráfego interno do executor não foram medidos. Estão fora dos percentuais de navegação. O coletor não foi conectado durante a ingestão.

## AUD-IMG-04 — revisão HTTP local e entrega futura

Respostas GET reais, condicionais com ETag e HEAD foram verificadas, além dos headers capturados no navegador. O JSON registra somente diretivas e indicadores permitidos.

| Recurso local | Observação |
| --- | --- |
| HTML do preview | 200, `Cache-Control: no-cache`, ETag; condicional 304; sem `nosniff` |
| JS/CSS com hash | 200, gzip na transferência, `no-cache`, ETag; condicional 304; sem `nosniff` |
| favicon sem hash | 200/304 com revalidação; sem `nosniff` |
| Original e derivado privados assinados | GET/HEAD 200, ETag; GET condicional 304; sem Cache-Control/nosniff observados |
| URL assinada com TTL de 2 s, após expirar | 400, sem corpo privado |
| Objeto privado sem autorização | 400, sem corpo privado |
| Auth e REST observados no bootstrap | sem diretiva Cache-Control/nosniff registrada; não confundir endpoint sem diretiva com garantia de cache privado |

Requisições da prévia impõem `cache:'no-store'`; upload usa os contratos existentes (`cacheControl:'0'` para originais). Esses parâmetros não comprovam cabeçalhos de resposta nem proteção de CDN. A interface retira blobs no logout, mas assinaturas são credenciais temporárias independentes até expirar.

A configuração versionada inspecionada contém Vite, Compose/Kong e documentação de Caddy/Cloudflare; **não há Caddyfile/Workers/_headers versionado que imponha a política futura aos assets**. Os AS-BUILTs apontam para arquivos operacionais externos ao checkout; eles não foram acessados ou alterados nesta rodada. Caddy/Cloudflare/STAGING não foram medidos.

Oportunidade registrada para a entrega futura: assets públicos de build com hash podem usar `public, max-age=31536000, immutable`, compressão e `nosniff`; HTML e assets sem hash devem revalidar para absorver nova release. Aplicar a regra somente ao namespace de assets públicos versionados. Auth, REST, Storage privado e assinaturas devem ter bypass de cache compartilhado e política privada/no-store adequada; não usar regra genérica de cache de `/` nem confiar em extensão `.png`/`.js`. Conferir GET/HEAD/304 e URL expirada após qualquer implantação autorizada. **Revisão local concluída não encerra O2 nem aplica esses headers na borda.** Nenhuma mudança de hosting/infra foi feita.

Diagnóstico existente `audit-derivative-storage-local.mjs`, com usuário comum e apenas miniatura sintética: quatro negações 400 no loopback do container; gateway negou dois corpos de 301 bytes e POST de 415.571 bytes; upsert subsequente de 415.571 bytes terminou sem headers em **10.005 ms**. Exit code **2**, matriz parcial. Hashes, manifesto, objetos, ledger e NOLOGIN preservados; Storage não reiniciado. Reproduz a limitação histórica, sem causa raiz fechada. Não interferiu nos uploads autorizados nem nos GETs medidos; não é considerado negação comprovada por timeout e não foi corrigido por mudança de permissão/pool/Storage.

## Frontend — antes/depois

Mudança pontual em `App.tsx`: `React.lazy` nas páginas de módulos e administração, com `Suspense`/Loader existente dentro do conteúdo. Shell, Home, autenticação e Guards mantidos; falha de import usa ErrorBoundary existente. Auditoria e seu CSS passam a carregar na primeira entrada da rota, sem obrigar login/Home a carregar todo o módulo. Sem biblioteca, `manualChunks`, refatoração de domínio ou alteração de autorização.

Dois builds com flag false, três contextos por versão, mesmos critérios: botão Entrar disponível; shell autenticado com Sair após reload; título Auditorias após navegação pelo menu. CPU corresponde a `Performance.getMetrics/ScriptDuration` até a janela de coleta, não bytes de cobertura de código. Métricas reiniciam por navegação; cada bloco terminou sem pendências. Recursos do documento e chamadas por bloco estão no JSON.

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| JS principal minificado (bytes) | 917.030 | 556.914 |
| JS inicial gzip transferido, corpo (bytes) | 272.112 | 164.605 |
| CSS inicial gzip (bytes) | 26.550 | 19.384 |
| CPU JavaScript no login, mediana (ms) | 58 | 48 |
| Login utilizável, mediana (ms) | 149 | 135 |
| Shell após reload, mediana (ms) | 91 | 90 |
| Entrada em Auditorias, mediana (ms) | 64 | 33 |
| CPU JavaScript na entrada em Auditorias, mediana (ms) | 15 | 22 |

O ganho material comprovado é **39,51% no JS inicial gzip**, adiando código para a rota usada. A entrada em Auditorias adicionou aproximadamente 29,6 kB de JS e 2,0 kB de CSS ao documento na primeira navegação; no baseline esse código já havia sido enviado. A CPU nessa entrada cresceu de 15 para 22 ms (medianas). A mediana de reload do shell ficou praticamente estável (91 → 90 ms); não se atribui melhora geral de latência a três amostras loopback. CSS inicial segue bloqueante, mas menor; não se introduziu preload de todos os módulos, que anularia o ganho.

O chunk principal remanescente é **556,91 kB**, ainda acima do aviso de 500 kB. Não houve evidência que justificasse fatiar dependências comuns, reescrever CSS global ou mudar bibliotecas para eliminar o aviso. Chamadas de estado de miniatura na revisita foram registradas, mas não exigiram nova abstração/cache de autorização. Download, escopos, sessão e limites de memória foram preservados. Smoke no build com miniaturas true confirmou modal/download por SHA-256 e ausência de falha global ao navegar módulos/administração; não substitui teste funcional completo de cada tela.

## Reprodução

1. Confirmar Git e o destino local existente; usar exclusivamente inspeção/conta sintéticas explicitamente autorizadas. Preservar inventário e não executar o harness descartável de integração no banco persistente.
2. Gerar **uma vez** o lote: `node scripts/generate-audit-evidence-fixtures.mjs 100 /tmp/med01-images`. Anexar pelos contratos normais em dez critérios de uma inspeção sintética, com o executor de `npm run dev` ativo para os uploads novos. Não processar acervo anterior nem reenfileirar jobs para medir.
3. Preparar arquivo privado 0600: `owner` com login sintético; `inspection` UUID; `items` com dez entradas `{key}` na ordem dos critérios das seções 1 e 2 (cinco por seção); `rows` com cem entradas `{file}` na mesma ordem. Os PNGs `synthetic-NNN.png` ficam em `images/` ao lado desse arquivo. O relatório não emite essas credenciais/IDs.
4. Servir o build baseline e depois o candidato em **127.0.0.1:5173**, sequencialmente, preservando checkout e sessão de desenvolvimento. Compilar a mesma versão com a flag false/true; para frontend antes/depois usar false nos dois builds. A flag é de build, não muda dentro de um bundle já servido.
5. Executar com Node 22 e Chromium disponível:

```bash
MED01_LOCAL_TARGET=gaucha-gestao-local node scripts/benchmark-audit-evidence-local.mjs /tmp/med01/fixture-private.json baseline /tmp/med01/baseline.json
# Após servir o build candidato equivalente:
MED01_LOCAL_TARGET=gaucha-gestao-local node scripts/benchmark-audit-evidence-local.mjs /tmp/med01/fixture-private.json candidate /tmp/med01/candidate.json
MED01_LOCAL_TARGET=gaucha-gestao-local node scripts/benchmark-frontend-local.mjs /tmp/med01/fixture-private.json /tmp/med01/frontend.json
```

O driver percorre 10/30/100 em três repetições, valida N GETs do tipo esperado e zero pendências antes de aceitar navegação. `measure-audit-evidence.mjs` continua disponível para marcação manual/CDP, usando o mesmo coletor atualizado. Percentual: `100 × (1 − bytes_candidato/bytes_baseline)`, somente no bloco equivalente concluído. Não calcular redução para download attachment ou API incompleta de sessão.

## Validação, limites e próximas decisões

Código `aa5b38c`, com documentação posterior sem alteração de produto:

| Comando/prova | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --maxWorkers=2` | PASS — 80 arquivos, 1.118 testes, 129,24 s; inclui cache/Auth/UI/RLS e decoder Bubblewrap, sem conexão persistente de teste |
| Builds false (comparação) e true (smoke final) | PASS; aviso remanescente de chunk >500 kB registrado |
| `npm run verify:build` | PASS |
| `npm audit --audit-level=moderate` | PASS — zero vulnerabilidades |
| Chromium real | 18 rodadas de imagens, 6 de frontend com blocos completos; modal/download SHA-256 e smoke de rotas PASS |
| Diagnóstico POST/upsert negado | PARCIAL — exit 2; timeout reproduzido e integridade preservada |
| Diff/links e CI remoto | Resultados do HEAD final registrados na PR; não inferidos de SHA anterior |

A suíte em memória não comprova as negações HTTP desta rodada; os testes de integração reais de RLS/Storage da PR #101 e do CI permanecem evidências distintas. Harnesses descartáveis de CI não foram executados no banco persistente.

- **Concluído localmente:** AUD-IMG-01/02 integradas, MED-01 de navegação com resultados confiáveis, revisão AUD-IMG-04 e otimização inicial medida/documentada.
- **AUD-IMG-03:** políticas B/C de alteração de originais seguem sem aprovação; Política A preservada. Não reduzir bytes probatórios para atingir meta de tráfego.
- **AUD-IMG-05:** Android/iOS físicos, câmera/galeria, rede móvel, legibilidade/textos/códigos de barras e pressão de memória seguem pendentes. Emulação/headless não encerra esse aceite.
- **Acervo/backfill, retenção, recuperação/restore real e executor no servidor:** pendências operacionais independentes, sem execução/autorização por inferência. Aplicar headers/cache em hosting também exige rodada operacional autorizada.
- **Issue #100:** desenho e implementação local já entregues, e agora há MED-01. **Não recomendar encerramento integral com os critérios atuais:** a própria issue inclui homologação física e validações operacionais ainda não cumpridas. O mantenedor pode decidir separar essas pendências em acompanhamento explícito; a issue não foi fechada.

Rollback da otimização de rotas: revert do commit de código e novo build, sem reversão SQL/dados. A instrumentação não altera o produto em runtime. Revisão individual do mantenedor continua necessária para merge; não houve APPROVED humano inventado, auto-merge ou deploy. A sessão `npm run dev` local é restaurada após encerrar o preview de medição.

Referências consultadas: [React lazy/Suspense](https://react.dev/reference/react/lazy), [Storage privado e URLs assinadas](https://supabase.com/docs/guides/storage/serving/downloads), [changelog CLI v3](https://supabase.com/changelog/supabase-cli-v3) e [mudança TLS hospedada](https://supabase.com/changelog/cbc-tls-ciphers-deprecated). As mudanças de CLI/TLS não motivaram atualização do Storage autohospedado nesta tarefa.
