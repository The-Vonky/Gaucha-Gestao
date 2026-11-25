# Prova de integração nativa do Supabase Storage com imgproxy

**11/11/2026 · Gaúcha Gestão · referência `codex/aud-img-02-confiabilidade` (`6413f56`, PR #119)**

**Resultado.** Storage `v1.72.1` e imgproxy `v4.0.17` entregaram miniaturas privadas sob demanda de até 480 px, com emissão sujeita a RLS, expiração e originais íntegros. O isolamento depende de manter a porta do imgproxy acessível exclusivamente no namespace de rede do Storage. A troca do AUD-IMG-02 ainda exige validação no localhost com as policies reais, o gateway e o fluxo de evidências. **PROD NO-GO.**

## Critérios de aceite

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Compatibilidade exata | **PASS** | Storage chamou imgproxy por HTTP em `127.0.0.1:8080`. O backend `file` usou fontes `local://` no volume sintético montado somente leitura no imgproxy. |
| Independência do ambiente persistente | **PASS** | PostgreSQL e rede interna novos, credenciais aleatórias próprias, volume sintético dedicado e zero portas publicadas. IDs, horários de início e redes dos containers existentes coincidiram antes e depois. |
| Assinatura com 480 px e acesso autenticado | **PASS** | A identidade autorizada recebeu HTTP 200 ao assinar, resgatar e chamar a rota autenticada com bearer. A URL assinada funcionou sem bearer antes do vencimento. Parâmetros de dimensão acrescentados ao resgate não alteraram os 480 px assinados. |
| Expiração e negação anônima | **PASS** | URL com TTL de 4 s retornou 200 no resgate imediato e 400 após espera de 5,5 s. Storage retornou 400 para assinatura, original privado e render autenticado sem bearer, com papel `anon` e com outra identidade autenticada. Rotas públicas do bucket privado, resgate sem token, token inválido e troca da chave de objeto no resgate também retornaram 400. |
| Acesso direto ao imgproxy | **PASS no perímetro testado** | Do namespace do Storage, a saúde do imgproxy retornou 200. De um segundo namespace na mesma rede, o Storage retornou 200 em `:5000`, enquanto a conexão a `:8080` retornou `ECONNREFUSED`, antes de qualquer rota HTTP para original ou derivado. Docker confirmou ausência de portas publicadas. O teste pressupõe que o namespace e o host Docker sejam confiáveis. |
| Tamanho, limite e integridade | **PASS** | As três imagens representativas ficaram menores. Um PNG mínimo cresceu. A imagem de 50,4 MP foi recusada no render (400). Os cinco originais recuperados pela API tiveram SHA-256 idêntico ao upload antes e depois. O bucket permaneceu privado, com cinco registros e cinco arquivos físicos de origem. |
| Reprodução, limites e reversão | **PASS** | Configuração, controles de recursos e procedimento de parada documentados. A limpeza do laboratório foi verificada. |
| Comparação com o AUD-IMG-02 | **PASS** | Componentes candidatos à descontinuação e dados a preservar identificados abaixo. |
| Paridade para substituir imediatamente o executor | **FAIL** | A transformação pode aumentar imagens pequenas. RLS da aplicação, cache e logs do gateway, formatos de celular, concorrência e recuperação do runtime local ainda precisam de validação. |

A rodada final passou **45 verificações**, após o upload de cinco imagens em bucket privado. O cliente usou JWTs HS256 sintéticos e policies por identidade. O ensaio dispensou GoTrue, Kong e o frontend. Somente o Storage inicializou seu schema interno no PostgreSQL descartável. Nenhuma migration do Gaúcha Gestão foi executada. As referências de fotos reais fornecidas pelo mantenedor pertencem ao ensaio anterior com imgproxy isolado e ficaram fora desta medição.

## Medição

Bytes correspondem ao corpo HTTP integral, com `Accept-Encoding: identity`, sem incluir cabeçalhos ou transporte. Os tempos incluem a requisição e leitura do corpo a partir do cliente Docker, em uma rodada serial, com a assinatura já emitida. O servidor devolveu JPEG ou PNG conforme a amostra.

| Imagem sintética | Dimensões de origem | Original (B) | Resposta (B) | Dimensões de saída | Redução | Tempo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| JPEG 9 MP | 4000 × 2250 | 1.094.746 | 5.122 | 480 × 270 | 99,53% | 47 ms |
| JPEG 49,77 MP | 5760 × 8640 | 5.904.461 | 6.935 | 320 × 480 | 99,88% | 413 ms |
| PNG | 1200 × 800 | 1.783.528 | 138.742 | 480 × 320 | 92,22% | 57 ms |
| PNG mínimo | 1 × 1 | 90 | 282 | 1 × 1 | aumento de 213,33% | 13 ms |
| JPEG acima do teto | 8000 × 6300 | 5.978.195 | Render recusado | — | — | — |

O pico de memória do cgroup do imgproxy foi **30,34 MiB** (`memory.peak`), com limite de 512 MiB, 1 vCPU e um worker. `memory.events` registrou zero OOM e nenhum dos três serviços reiniciou na rodada válida. São números do ensaio sintético serial. A medição do tamanho saiu em formato de origem mesmo com `Accept: image/webp`. A rodada incluiu `IMGPROXY_ENABLE_WEBP_DETECTION=true`, que ficou sem efeito. A tag usa `IMGPROXY_AUTO_WEBP`. A conversão WebP ficou sem ensaio. [Configuração de negociação na tag v4.0.17](https://raw.githubusercontent.com/imgproxy/imgproxy/v4.0.17/clientfeatures/config.go).

## Contrato e reprodução

O cliente pede a assinatura ao Storage. O JWT da URL de resgate inclui o objeto, a transformação e a expiração. O Storage valida a assinatura antes de buscar o original e envia um GET interno com prefixo `/public` e fonte `local://`. A chamada interna encaminha `Accept` quando aplicável, sem `Authorization` nem assinatura HMAC do imgproxy. `IMGPROXY_SECRET` ou HMAC obrigatório exigiriam uma adaptação fora dessa integração nativa. O serviço precisa ficar em loopback privado, sem ingresso próprio. Uma URL assinada válida funciona como credencial de posse até expirar. O resgate observado incluiu `Expires` e omitiu `Cache-Control`. A prova verificou expiração no Storage. [Renderer v1.72.1](https://raw.githubusercontent.com/supabase/storage/v1.72.1/src/storage/renderer/image.ts) · [Backend file v1.72.1](https://raw.githubusercontent.com/supabase/storage/v1.72.1/src/storage/backend/file.ts) · [Rota assinada v1.72.1](https://raw.githubusercontent.com/supabase/storage/v1.72.1/src/http/routes/render/renderSignedImage.ts).

| Serviço | Imagem testada e digest |
| --- | --- |
| PostgreSQL 17.6 | `public.ecr.aws/supabase/postgres:17.6.1.167` · `sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb` |
| Storage | `public.ecr.aws/supabase/storage-api:v1.72.1` · `sha256:105a2584129c9600aebed6f5ac49ca4371c92b996ecd1af7179750333e9e2120` |
| imgproxy | `ghcr.io/imgproxy/imgproxy:v4.0.17` · `sha256:db0b4b9cd690c8b3590203dea300fb759a18c4ec2af7b37424f0bdef23ce317d` |

1. Crie rede Docker `--internal` e volume de objetos com identificadores inéditos, rotulados para conferência na limpeza. Suba o PostgreSQL nessa rede, alias `db`, com senha recém-gerada, `--tmpfs /var/lib/postgresql/data:rw,size=256m` e `--shm-size=64m`. Aguarde `pg_isready` e atribua ao papel preexistente `supabase_storage_admin` uma senha só do laboratório via SQL autenticado como `supabase_admin` dentro desse container. Use arquivos de ambiente com modo 0600 para `POSTGRES_PASSWORD`, `DATABASE_URL` e `AUTH_JWT_SECRET`. Gere o segredo HS256 separadamente. O Storage aponta para `supabase_storage_admin@db:5432/postgres`. A tentativa inicial com o papel `postgres` encontrou falta de permissão no schema `storage`. O papel esperado resolveu a inicialização.
2. Suba Storage na mesma rede, alias `storage`, com o volume montado em `/lab-objects` para escrita. Suba imgproxy com `--network container:<storage-do-laboratorio>` e o mesmo volume em `/isolated/lab-objects` somente leitura. A raiz `/isolated` permite resolver o caminho absoluto do Storage dentro de uma árvore dedicada. Use `--cpus=1 --memory=512m --memory-swap=512m` para cada serviço. No imgproxy, use também `--read-only --cap-drop=ALL --security-opt=no-new-privileges --pids-limit=64`. Aguarde HTTP 200 em `:5000/status` e `:8080/health` a partir do namespace do Storage. [Configuração do Storage v1.72.1](https://raw.githubusercontent.com/supabase/storage/v1.72.1/src/config.ts) · [Configuração do imgproxy 4.0.x](https://docs.imgproxy.net/configuration/options).

   | Storage | imgproxy |
   | --- | --- |
   | `DB_INSTALL_ROLES=false` | `IMGPROXY_BIND=127.0.0.1:8080` |
   | `STORAGE_BACKEND=file`, `STORAGE_FILE_BACKEND_PATH=/lab-objects` | `IMGPROXY_LOCAL_FILESYSTEM_ROOT=/isolated`, `IMGPROXY_ALLOWED_SOURCES=local://` |
   | `GLOBAL_S3_BUCKET=lab`, `TENANT_ID=imgproof`, `REGION=local` | `IMGPROXY_ALLOW_PRIVATE_SOURCE_ADDRESSES=false` |
   | `FILE_SIZE_LIMIT=10485760` | `IMGPROXY_MAX_SRC_FILE_SIZE=10485760`, `IMGPROXY_MAX_SRC_RESOLUTION=50` |
   | `IMAGE_TRANSFORMATION_ENABLED=true`, `IMAGE_TRANSFORMATION_LIMIT_MAX_SIZE=480` | `IMGPROXY_MAX_RESULT_DIMENSION=480`, `IMGPROXY_MAX_ANIMATION_FRAMES=1` |
   | `IMGPROXY_URL=http://127.0.0.1:8080`, `IMGPROXY_REQUEST_TIMEOUT=10` | `IMGPROXY_TIMEOUT=8`, `IMGPROXY_WORKERS=1`, `IMGPROXY_REQUESTS_QUEUE_SIZE=4` |
   | `IMGPROXY_HTTP_MAX_SOCKETS=4`, `S3_PROTOCOL_ENABLED=false`, `EXPOSE_DOCS=false` | Sem credenciais Storage, PostgreSQL ou de assinatura no serviço |

3. Crie `proof-private` com `public:false` pela API com JWT de bootstrap `service_role` sintético. Aplique as duas policies abaixo no banco descartável. Emita JWTs com papel `authenticated` e `sub` distintos e um JWT com papel `anon`. A identidade autorizada envia as imagens pela API sob seu próprio prefixo `<sub>/`. As amostras usaram gradiente RGB com ruído determinístico de 3 bits, codificadas pelo Sharp 0.35.5 em JPEG qualidade 92 ou PNG compressão 7. O cliente de teste pode usar Node em outro container nessa rede, com 1 vCPU e 256 MiB, e guardar somente status, tamanhos e veredictos.

   ```sql
   CREATE POLICY proof_upload ON storage.objects FOR INSERT TO authenticated
     WITH CHECK (bucket_id = 'proof-private' AND split_part(name, '/', 1) = (SELECT auth.uid())::text);

   CREATE POLICY proof_read ON storage.objects FOR SELECT TO authenticated
     USING (bucket_id = 'proof-private' AND split_part(name, '/', 1) = (SELECT auth.uid())::text);
   ```

4. Use `POST /object/sign/<bucket>/<key>` com bearer e corpo `{"expiresIn":20,"transform":{"width":480,"height":480,"resize":"contain","quality":75}}`. Consuma em memória o caminho retornado sob `/render/image/sign/`. Repita com TTL 4 s para o teste de expiração. Faça a matriz de identidades também em `/render/image/authenticated/<bucket>/<key>` e `/object/authenticated/<bucket>/<key>`, com as dimensões na query da primeira rota. Compare os corpos completos do original antes e depois com o arquivo enviado. Confira pelo segundo container que a API está acessível e `storage:8080` recusa conexão. Inspecione rede, portas, montagem somente leitura, `memory.peak` e `memory.events` antes de encerrar.

**Parada e reversão do laboratório.** Interrompa se houver coincidência com recursos persistentes, porta publicada, fonte gravável pelo imgproxy, leitura por identidade indevida, falha de integridade, OOM ou saída de credenciais. Retire primeiro o imgproxy e, em seguida, Storage e PostgreSQL, usando nomes e rótulos verificados. Remova a rede exclusiva e os arquivos temporários de credenciais e fixtures. Nesta execução os containers e a rede descartáveis foram removidos. O volume sintético `gg-storage-imgproof-261111` ficou desanexado, conforme a restrição de exclusão de volumes. O ambiente persistente e o imgproxy do ensaio anterior continuaram em execução. C30, STAGING, PROD e PRs ficaram fora da operação.

## Proposta para o localhost

O AUD-IMG-02 gera uma vez, armazena em `audit-evidence-thumbnails` e publica um manifesto com hash, tamanho e estado. O caminho nativo renderiza a cada leitura sem cache intermediário e dispensa a gravação de um derivado. Pode antecipar a primeira prévia, mas transfere custo da fila para o momento da consulta. A geração nativa poderá substituir o supervisor de `npm run dev` / `dev:thumbnails`, os one-shots, o decoder Sharp/Bubblewrap, o emissor de JWT técnico, a renovação de `audit_derivative_worker`, o polling e a execução de claims, leases e retries. A retirada do trigger de enfileiramento e a desativação de RPCs técnicas dependem de conferir consumidores e compatibilidade. A troca pode manter intactos o bucket de miniaturas existentes, os manifestos, os jobs e as migrations já aplicadas. [Executor integrado](AUD_IMG_02_INTEGRATED_DEV_20261106.md) · [Contrato de derivados](AUD_IMG_02_DESIGN_20261104.md).

1. **Provar a topologia no runtime do notebook.** O Storage local usa `file`, `FILE_STORAGE_BACKEND_PATH=/mnt` e ambas as flags de transformação estão em `false`. Em etapa separada e autorizada, planejar a configuração durável do runtime que cria o Storage, com cópia da configuração atual e prova de reversão. Para a topologia ensaiada, o mesmo volume iria a `/mnt` no Storage e a `/isolated/mnt` somente leitura no imgproxy. Testar a ordem de inicialização e a recriação do namespace quando o Storage reiniciar. Conter a porta 8080, a origem `local://` e o acesso ao volume. Restringir egress e verificar que o gateway não encaminha para o imgproxy.
2. **Validar acesso e carga antes de alterar a lista.** Repetir via gateway e sessão reais com perfil ativo/inativo, escopo de unidade indevido, evidências removidas, expiração e troca de sessão. Medir lotes concorrentes e falhas com o limite de 1 vCPU, 512 MiB e um worker como ponto de partida. Confirmar a política de cache privado `no-store` para as rotas de render, a supressão de tokens em logs e os limites de taxa/dimensões no gateway. Habilitar a transformação afeta rotas do Storage inteiro. Verificar exposição e carga em outros buckets. Validar orientação, PNG transparente, Samsung SEF/Ultra HDR, amostras de 50 MP e legibilidade em celular.
3. **Ativar o render por opção reversível.** Manter downloads e ampliação explícita no original assinado. Na lista, preservar cache volátil por sessão e limitação de bytes. Decidir o comportamento de PNG/JPEG compactos e falhas antes do corte. O transformador nativo pode produzir mais bytes que o original e não oferece o estado `derivative_not_smaller` do executor. Manter o fluxo atual disponível até homologação e validação de rollback. Para reverter, selecionar o fluxo atual, restaurar as flags e a configuração anterior do Storage e parar o sidecar no local autorizado. Preservar os dados, os grants e o histórico já existentes.
