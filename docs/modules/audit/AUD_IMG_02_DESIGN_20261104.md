# AUD-IMG-02 — Projeto de miniaturas privadas e protocolo offline

> **Registro preparatório histórico, substituído no estado de implementação pelo [contrato vigente](AUD_IMG_02_IMPLEMENTATION_20261104.md).** Após esta preparação, o mantenedor concedeu GOs A/B para código e testes seguros, incluindo nova migration sem aplicação. C/D/E, provisionamento de identidade, instalação, merge e deploy permanecem bloqueados. As descrições abaixo de ambiente e ausência de código referem-se à rodada preparatória, não ao checkout atual.

**Data:** 04/11/2026. **Issue:** #100. **Base:** main em 422a51fe91843824013ad337122f6954c954e59c (PR #99 **já integrada**).
**Escopo deste PR:** desenho, contratos executáveis e testes com fakes. **Sem GO operacional.** PROD NO-GO.

A revisão restrita de E3 e a Política A foram aprovadas pelo mantenedor em 04/11/2026: JPEG/PNG inline somente com acesso autorizado; PDF/DOCX/XLSX apenas por download. O original probatório conserva **todos os bytes, nome e EXIF/GPS**. Não há autorização para worker, bucket, migrations, grants, backfill, STAGING, PROD, merge ou deploy. Risco residual E3 (decodificação de conteúdo não confiável, janela de revogação, orçamento de memória parcial) continua conhecido.

## 1. Diagnóstico e ambiente

- A migration vigente de evidências define a chave original gerada **inspection_id/id**, status pending/available/removed, associação à inspeção e imutabilidade; consulta e SELECT de Storage exigem evidência available e private.has_unit_permission('audit.inspection.read', inspections.unit_id). Usuários finais só podem fazer upload do original pending sob o contrato vigente, sem update/delete.
- ChecklistEvidence.tsx usa EvidenceImage para lista e modal. evidenceImages.ts baixa hoje o **original** ao primeiro acesso visível. O cache Shared privateImageCache.ts é neutro, volátil, 24 MiB de blobs, TTL máximo 60 s, duas transferências, invalidação por acesso. O download por anexo em evidence.ts assina e verifica HEAD sem transformar bytes nem nome. Dimensões CSS não reduzem o egress.
- infra/supabase/docker-compose.yml contém **apenas db/auth/rest/storage/kong** e ENABLE_IMAGE_TRANSFORMATION: "false"; UPSTREAM.md registra remoção deliberada de imgproxy e transformações. Não pressupor Functions, queue, worker ou secret manager existentes, nem habilitar transformação sem decisão e prova.
- Fronteiras: **Audit** possui original/manifesto/assinatura e UI; **Core** possui perfil, grants e unidade; **Shared** somente cache/transporte neutro; Core e Shared não importam Audit. Planos de Ação não participam.
- No runtime desta execução não há checkout Git, Docker/Supabase CLI, serviços locais nem node_modules. git status respondeu "not a git repository"; git ls-remote falhou por DNS. Node v22.16.0 está disponível. A branch remota foi criada pelo conector GitHub a partir do SHA acima. **Não há ambiente descartável com DB/Storage autorizado**, logo nenhum seed ou MED-01 real foi executado. C30, STAGING e Supabase persistente não são fixtures descartáveis.

## 2. Opções e recomendação

| Opção | Benefício | Riscos/custo/realidade | Conclusão |
| --- | --- | --- | --- |
| **A. Bucket privado separado + derivação controlada uma vez por original/versão** | Baixo custo de entrega e processamento amortizado; original intacto | Bucket/manifesto + papel técnico + executor e backup/reconcile ainda inexistentes | **Recomendada sob GOs independentes** |
| B. Rota autenticada de resize/entrega | Autorização em cada request e controle de headers | Novo serviço online 24x7, CPU repetida ou cache adicional, latência e disponibilidade | Não preferida sem demanda comprovada |
| C. Derivado enviado pelo navegador | Sem decoder servidor no upload | Cliente falsificável, hash não atesta origem; custo bateria/memória, divergência de browsers | Não confiável como cadeia probatória controlada |
| D. Transformação Storage nativa | Seria simples caso disponível | Desativada no Compose e sem imgproxy; nova topologia precisaria de GO | **Não disponível na configuração versionada** |

**A em menor footprint realista:** propor **processo one-shot** isolado e supervisionado por timer, por exemplo systemd a cada 60 s em host aprovado, **não** um daemon 24x7 ou broker Redis inventado. Uma tabela transacional de jobs no PostgreSQL usa claim via SKIP LOCKED e lease, evitando serviço de fila extra. Iniciar com 1 job concorrente, medir backlog antes de aumentar. Timer, conta técnica, segredo, pacote de encoder, alertas e runtime **não estão instalados**: instalar/ligar tudo requer GO A. Um script disparado só manualmente poderia operar backfill, mas não atende novos uploads com previsibilidade.

### Fluxo proposto (nenhum bloco executado)

~~~mermaid
flowchart TD
  A[Fluxo atual de upload] --> B[Confirmação: original available]
  B --> C[Trigger transacional futuro cria job pending JPEG/PNG]
  C --> D[Timer one-shot consulta jobs e obtém lease]
  D --> E[Storage API: lê original com limite, calcula SHA-256]
  E --> F[Decoder isolado: sniff, pixels, orientação, strip de metadata]
  F --> G[Encoder cria JPEG ou PNG <=480 px]
  G --> H[Storage API: upload privado sem upsert]
  H --> I[Read-back: hash, bytes, MIME e dimensões]
  I --> J{CAS: lease válida e evidência ainda available?}
  J -->|sim| K[Manifesto ready]
  J -->|não| L[Órfão para reconcile]
  D -->|falha| M[failed, backoff e reprocessamento]
  K --> N[Consulta/RLS e URL assinada autorizada]
  N --> O[Viewport da lista: somente derivado]
  O --> P[Clique explícito: original no modal]
  M --> Q[Placeholder + abrir original explicitamente]
~~~

Um trigger **após** a transição pending→available insere job no mesmo commit da confirmação, com ON CONFLICT DO NOTHING, sem alterar a função ou a prova original. Upload não espera miniatura. Latência percebida = intervalo de agendamento (até aproximadamente 60 s no exemplo) + fila + leitura/encode/upload: estimativa topológica, **não medição nem SLA**. O item pode mostrar placeholder por minutos sob falha ou carga. Auditoria finalizada pode ter imagens processadas, sem ganhar permissão de edição.

## 3. Manifesto e identidade (schema proposto, nenhuma migration criada)

Propor tabela Audit com UNIQUE(evidence_id, encoder_version), vínculo FK à evidência e registro de tentativas separado para histórico. Estados técnicos **pending/ready/failed**, distintos de pending/available/removed da evidência. Campos:

| Campo | Invariante |
| --- | --- |
| evidence_id; original_object_key | ID imutável, key gerada inspection_id/id; comparação exata com evidência |
| encoder_version; parameters_digest | Versão inclui lado, orientação, formato, qualidade, stripping e algoritmo; 480 vs 320 são versões diferentes |
| original_sha256 | SHA-256 dos bytes **efetivamente lidos** via Storage API, nunca apenas metadado enviado pelo browser |
| derived_sha256; derived_object_key | Hash dos bytes realmente produzidos e conferidos; chave técnica ID/version/hash-original/hash-derivado.ext, sem nomes pessoais |
| mime; width; height; bytes | MIME codificado, dimensões depois da orientação, tamanho após read-back |
| state; attempt_count; next_attempt_at | pending/ready/failed, retry limitado e diagnóstico técnico |
| lease_id; lease_until | Claim atômico e CAS, evitando publish de tentativas concorrentes obsoletas |
| created_at; updated_at; ready_at; failed_at; error_code | Timestamps de banco e erro sanitizado, sem nomes, tokens, paths ou bytes nos logs |

Metadados obrigatórios em ready; ausência de objeto ou divergência de hash nunca devolve URL da miniatura. Chave técnica no estilo evidence_uuid/encoder_version/original_sha256/derived_sha256.jpg (ou .png). Publicar só após objeto gravado via **Storage API**, read-back e CAS: evidencia available + lease válida + objeto coerente. Se upload acontecer e commit falhar, o objeto é órfão e **não fica legível** por RLS. Um 409 só pode ser aceito após comparar bytes/hash do objeto já existente; não fazer upsert. Uma falha do derivado **jamais** remove/rejeita evidência available, edita seu original, apaga histórico ou gera nova evidência.

Hash prova associação à **cópia lida** na execução; não autentica retrospectivamente captura, nem significa que original foi sanitizado. Não guardar filename original em key técnica ou logs do processador.

### Contratos de interfaces da implementação futura

- claim({evidenceId,originalObjectKey,encoderVersion}) -> lease | null: transação atômica, elegibilidade e lease com timeout.
- storage.readOriginal(key,maxBytes) -> bytes: requisição controlada, limitar **durante stream**, abortar acima de 10 MiB; nenhuma leitura de outro bucket.
- encoder.encode({bytes,contentType,maxSide,version}) -> {bytes,mime,width,height}: decoder isolado e limitado; resultado exige validação real de bytes.
- storage.putDerived(key,bytes,mime,{upsert:false}); storage.readDerived(key,maxBytes): somente Storage API, read-back + hash.
- complete(lease, ready) -> boolean: CAS atômico verifica available, vínculo imutável, lease e versão; false indica objeto órfão para reconcile.
- fail(lease, sanitized_code): tentativa/next_attempt_at com backoff; conteúdo de erro privado não é logado.
- audit.checklist_evidence_derivative_list(p_inspection): retorna identificador/estado/metadados mínimos somente de leitura autorizada; assinatura deve verificar novamente acesso server-side, não confiar em unidade enviada pelo cliente.

O módulo **scripts/audit-derivative-protocol.mjs** implementa apenas o protocolo offline acima com interfaces injetadas e checagens estruturais de dados. **Não** implementa decoder seguro, RLS, autenticação, timer, Storage API ou worker; não importá-lo no browser (usa Node crypto). Testes em memória: tests/audit-derivative-protocol.node.mjs (Node --test), e tests/audit-derivative-protocol.test.ts (Vitest). Servem para detectar regressões na sequência e seleção, não para homologar plataforma.

## 4. Autorização e privacidade da URL assinada

Condição obrigatória no **servidor** tanto para descobrir o manifesto quanto para SELECT/sign do bucket derivado:

- usuário autenticado e perfil ativo; atribuição ativa com **audit.inspection.read** cobrindo a **unidade da inspeção** via private.has_unit_permission; evidência **available** e versão de derivado **ready**, key exata e identidade coerente;
- usuário de unidade estranha, apenas grant setorial, grant revogado, anônimo, perfil inativo, evidência pending/removed e derivado ausente/pending/failed são **negados**. Auditoria finalizada permanece legível com grant válido, reabertura não modifica original nem reinstala removidas;
- RLS do manifesto e **policy SELECT de storage.objects** no bucket separado privado devem relacionar key exata do objeto pronto com evidência/inspeção, **não** conceder SELECT por prefixo de path. Testar Storage createSignedUrl real, com token manipulado/ID forjado, porque a autorização da RPC por si só não blinda assinatura direta;
- nenhum usuário final ganha INSERT/UPDATE/UPSERT/COPY/MOVE/DELETE para derivado; testar todos os verbos e operação de COPY/MOVE, inclusive key não referenciada. O papel técnico recebe unicamente operações aprovadas de leitura de original, gravação nova no bucket derivado e RPC de claim/ack/fail. Nunca service_role no frontend/log.

**Ponto de GO A:** avaliar uma identidade técnica separada audit_derivative_processor e JWT curto limitado nas versões self-hosted de Kong/PostgREST/Storage. **Não existe prova** de suporte efetivo de papel/claims customizados no Storage API v1.74.0 instalado; demonstrar em ambiente isolado. Caso a alternativa exija service_role no processo backend, obter **GO alternativo explícito**, reduzir privilégios operacionais via isolamento de rede/host, rotação e segredo fora do frontend, registrar risco residual. Não provisionar conta/chave antes da decisão.

Novas URLs de Storage temporárias (TTL proposto <=60 s) permanecem potencialmente utilizáveis até expirar mesmo após revogação, além do cache volátil já existente. Não prometer revogação instantânea. Não cachear URL/blob em localStorage, IndexedDB, Cache API, service worker ou CDN pública.

## 5. Encoder, resiliência, restore e capacidade

Propostas para validar e ajustar em laboratório, **não valores homologados**: entrada <=10 MiB conforme contrato atual, até 16 megapixels e eixo máximo 8192 px; 1 imagem simultânea, CPU ~1 core, RSS máximo inicial 384 MiB, wall timeout 20 s, saída <=1 MiB como teto defensivo (não meta de qualidade). Sniffing de magic bytes JPEG/PNG contra MIME declarado, arquivo completo, PNG malicioso/arquivo truncado, negação de decompression bombs, lib de decoder fixada e atualizada, subprocesso isolado sem root com limites de CPU/memória/tempo e kill. O simples parser de metadados JS do protótipo não satisfaz tais requisitos.

Aplicar orientação EXIF antes de redimensionar; gerar JPEG para foto opaca e PNG quando necessário manter alpha/transparência, re-encodar sem herdar EXIF/GPS/XMP e conferir com parser independente; **original mantém todos os metadados e bytes**. Considerar perfil de cor/ICC sem vazar dados. Lado maior inicial **480 px**, comparar **320 px** em versão distinta; JPEG qualidade inicial exploratória ~82. Alvo **30–100 KB como referência**, não truncar nem degradar etiquetas, textos pequenos e códigos de barras para forçar limite. Usar amostras com leitura/scan humano. Se decoder negar conteúdo perigoso, manter placeholder e original apenas por ação explícita conforme E3 residual.

Retries transitórios: propor 5 tentativas com backoff de 1/2/4/8/16 min + jitter e timeouts; falhas permanentes em failed até reprocessamento operacional autorizado. Claim com SKIP LOCKED, lease com proteção contra worker zumbi, concorrência inicial 1, alertas por backlog/idade/taxa de falha/CPU/RAM; registrar contagens e códigos, não keys, imagem ou identidade pessoal. Worker offline não exige serviço de fila, mas exige timer e runbook/plantão. Em indisponibilidade do worker, **a UI não deve bloquear upload/lista**.

Reconciliar: job com lease expirada; ready cujo objeto não existe; hash ou MIME divergente; objeto derivado órfão; evidência removed cujo derivado permanece armazenado; DB restaurado fora de sincronia com Storage. Usar Storage API para inspeção/remediação, **não DML direto em storage.objects**. Backups precisam incluir originais, metadados DB/Storage, fila/manifestos, objetos derivados e configuração do processo; restore DB no instante T e objetos consistentes em T ou posterior com retenção dos objetos eventualmente apagados após T. Se derivado faltar: placeholder e reprocessar após aprovação; original **nunca** perdido por isso. RPO/RTO, retenção, expurgo e backup C30 não são considerados aprovados, consultar BACKUP_RECOVERY.md. Rollback: feature gate cliente desligada + timer parado; migrations append-only não são removidas destrutivamente; objetos e originais preservados.

### Custo e capacidade

Armazenamento extra proporcional a quantidade de derivados e versões; a referência 30–100 KB daria aproximadamente 3–10 MB por 100 imagens **se** alcançada (não é medição nem compromisso). Teto defensivo de 1 MiB por derivado => até ~100 MiB por 100; originais continuam ocupando o mesmo espaço. Há overhead de uma leitura do original e de upload/read-back por versão, filas, backup e monitoramento. A economia significativa é em GET de **navegação**, não em upload, restauração, processamento ou download explícito. Sem throughput real, não prometer CPU/minuto/egress/latência nem redução de >=80%.

## 6. UI futura (não modificada no PR preparatório)

Feature gate proposto **desligado por padrão**, a implementar apenas com backend existente e testes de assinatura: lista viewport solicita **somente derivado** ready; cacheKey de thumb inclui inspection/evidence/version/derived SHA distinto da key de original. Original no modal somente quando clicar explicitamente em "Ampliar" ou "Abrir imagem original"; download continua por anexo, nome de apresentação e SHA do original sem mudança. Acervo legado, pending, failed ou 404: placeholder acessível **"Miniatura indisponível"** com ação explícita de abrir original; **nunca** GET do original em effect/catch/onError/background como fallback. Para JPEG/PNG autorizados, nunca introduzir preview de PDF/DOCX/XLSX. Shared continua cache neutro com epoch/logout/grants/TTL e sem persistência; Audit reconcilia/invalida ambas as variantes por ID quando removida/ausente. Considerar loading, retries limitados, teclado e foco. Não substituir EvidenceImage atual por chamada a RPC/bucket inexistente.

| Superfície futura | Esforço inicial aproximado | Gate |
| --- | --- | --- |
| Migration append-only Audit + Storage bucket/manifest/jobs/RLS/RPC | 200–350 linhas | GO B para criar/revisar; GO C para aplicar |
| Novo executor/timer, isolamento e runbook em infra/scripts/ops | 200–400 linhas + dependências | GO A |
| Audit evidence.ts/evidenceImages.ts/EvidenceImage.tsx/ChecklistEvidence.tsx/types.ts | 120–250 linhas | Backend real e GO E |
| Shared privateImageCache.ts | 0–40 linhas; preferir nenhuma mudança | Necessidade comprovada |
| Testes Audit/Storage/Chromium e documentação de restore | 200–450 linhas + docs | GOs + laboratório isolado |

Estimativas são ordem de grandeza, sem prazo. Nesta PR **nenhuma migration, bucket, serviço, feature gate ou UI muda**; apenas contrato offline/testes/documento.

## 7. MED-01 e qualidade: procedimento reproduzível, nenhuma métrica inventada

Ferramentas já versionadas na PR #99: scripts/generate-audit-evidence-fixtures.mjs, scripts/measure-audit-evidence.mjs e tests/integration/audit-evidence-traffic.mjs. O gerador produz PNG RGB sintético de ruído 960x640 (não prova legibilidade), com manifesto/sha256. O medidor usa CDP sanitizado e **Chromium de teste já aberto**, exigindo aplicação/Storage local, sem subir banco. Nenhum deles foi executado aqui contra Storage real porque **não há laboratório descartável e autorizado**. Dados da PR #99 são históricos, não nova medição.

Em ambiente **explicitamente isolado/autorizado**, conferir estado do Git, volumes/identidade do DB, uso exclusivo de fixtures sintéticas; jamais seed C30, STAGING ou projeto persistente. Preparar 10 arquivos/1 critério, 30/3, 100/10, até 10 por critério. Executar:

~~~sh
node scripts/generate-audit-evidence-fixtures.mjs 10 /tmp/med01-10
node scripts/generate-audit-evidence-fixtures.mjs 30 /tmp/med01-30
node scripts/generate-audit-evidence-fixtures.mjs 100 /tmp/med01-100
node scripts/measure-audit-evidence.mjs 10 /tmp/med01-before-10.json
# Repetir 30/100; repetir com build candidato e arquivos idênticos
~~~

Usar **baseline pós-#99 da main** (primeira lista baixa originais) e candidata depois do GO com mesmo browser/build local, rede, viewport, dataset, cache e passos. Três repetições frias para cada 10/30/100; separar first-visit (scroll por viewport), collapse/revisit/section, modal com clique explícito, upload e download, reload/TTL/logout. Reportar GETs do bucket original versus derivado, body/wire bytes, erros, tempo total, p50/p95, cache; conferir unfinished=0. Download por anexo pode não contabilizar no Network da página: conferir bytes/sha do arquivo salvo separadamente. Omitir URLs, names, tokens, paths e bodies dos relatórios. Não confundir tamanho de fixture ou HEAD de erro com tráfego autorizado.

Percentual **somente** com dados reais equivalentes: 1 - (bytes de fotos GET da lista candidata / bytes de fotos GET da lista baseline). Não incluir upload/download explícito nesse cálculo, mas **reportar o total de sessão incluindo modal de original** em métrica separada. Baseline 0 ou coleta incompleta => sem percentual. **>=80% é meta, não resultado**. Comparar qualidade 480 x 320 com etiquetas/códigos de barras e orientação/alpha, não inferir de PNG ruidoso.

### Testes negativos reais antes de qualquer release

Auth/DB/Storage: anon, inativo, grant global/unidade correta, outra unidade, somente setor, grant revogado, evidence pending/removed, finalizada/reaberta, token vencido, path/ID/hash forjado, direto no bucket sem RPC, CREATE SIGNED URL, INSERT/UPDATE/UPSERT/COPY/MOVE/DELETE negados e tentativas cross-unit. Concorrência duas sessões, CAS e retry, objeto faltante, conflito 409, mídia truncada/magic mismatch/bomba, EXIF/GPS/alpha/orientação, download original byte a byte, restore com e sem derivado. E2E real Storage/Chromium e homologação **Android Chrome e iOS Safari físicos** (câmera/galeria, foco, código de barras, memória e rede lenta/offline) permanecem pendentes.

Validação offline desta fase: Node --test tests/audit-derivative-protocol.node.mjs (fakes: claim, idempotência, concorrência, leitura/hash, read-back, orphan e placeholder) e Vitest tests/audit-derivative-protocol.test.ts. **Mocks não demonstram RLS/Storage nem encoder real**.

## 8. Riscos e solicitações de GO independentes

| Risco | Controle e prova exigida |
| --- | --- |
| **Crítico: bypass de escopo ou identidade técnica ampla** | Join exato, RLS/Auth/Storage real, tester cross-unit e menor privilégio |
| **Alto: decoder hostil, MIME falsificado, decompression bomb** | Subprocesso isolado com teto de pixels/CPU/RAM/tempo; corpus adversarial |
| **Alto: EXIF/GPS na thumb** | Re-encode strip somente no derivado e parser de verificação |
| **Crítico: perda/adulteração do original** | Não fazer overwrite, SHA byte a byte antes/depois, histórico de Audit |
| **Alto: inconsistência DB/Storage/restore** | CAS+read-back, reconcile de órfãos, backup/restore comprovado |
| **Médio-alto: fila/latência/custo** | Timer, backoff, alarme, medição de 10/30/100 |
| **Alto: fallback silencioso do original** | Gate somente com backend, placeholder, medição CDP |
| **Médio: queda de legibilidade ou meta não alcançada** | Comparação 480/320, humanos/scanner, medição sem estimativa |
| **Residual: URL emitida/cache sobrevive à revogação por curto período** | TTL/epoch e documentação de janela conhecida, sem promessa instantânea |

**GO A — processador e privilégio:** aprovar topologia/host/timer, identidade JWT/papel ou exceção privilegiada delimitada, limites de isolamento, secrets, logging e observabilidade. Sem GO: nenhum worker/serviço provisionado.

**GO B — bucket, migration append-only e RLS/RPC:** autorizar criação **em branch, para revisão** da migration proposta, trigger/queue/manifest/policies e grants; não é autorização para aplicar.

**GO C — aplicação em ambiente nomeado:** avaliar diff, inventário de schema/volumes e ponto de backup/restore, autorizar separadamente aplicação em DEV local persistente, ou STAGING, ou PROD; nenhum alvo está autorizado agora.

**GO D — backfill:** aprovar lote de legado, escopo, janela, rate limit, checkpoint, retry/rollback e preservação; sem execução até então.

**GO E — release operacional:** após E2E Storage, CDP 10/30/100, mobile físico, headers e restore, decidir gate gradual, CI/review, monitoramento e rollback; **merge, deploy STAGING e PROD requerem atos separados**. PROD continua NO-GO.

Fontes: Issue #100; AGENTS.md; EVIDENCE_IMAGE_TRAFFIC.md; EVIDENCE_IMAGE_VALIDATION_20261104.md; CHECKLIST_EVIDENCE_V1.md; brief E3; ADR-005; BACKUP_RECOVERY.md; Compose/UPSTREAM; SQL atual e código/testes da PR #99.
