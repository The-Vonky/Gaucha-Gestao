# AUD-IMG-02 · ativação e reversão no notebook

**Situação em 11/11/2026** — código candidato em `codex/aud-img-02-imgproxy`. Pré-voo de leitura executado em `gaucha-gestao-local`. A ativação de Storage e Kong requer autorização específica do mantenedor e a homologação física ainda está pendente. **PROD NO-GO.** [Prova de referência](../modules/audit/AUD_IMG_02_STORAGE_IMGPROXY_POC_20261111.md).

## Inventário e mudanças propostas

| Item | Runtime observado | Mudança proposta |
| --- | --- | --- |
| Storage | `supabase_storage_gaucha-gestao-local`, ID `d5c08b816760`, `public.ecr.aws/supabase/storage-api:v1.72.1`, alias `storage`, sem porta publicada | Mesmo digest, comando, ambiente, limites de upload, volume e política de reinício. Flags de transformação ativas, limite de 480 px, loopback, quatro sockets, timeout de 10 s e driver de logs `none`. |
| Objetos | Volume `supabase_storage_gaucha-gestao-local` em `/mnt` | Mesma montagem de leitura/escrita no Storage e montagem somente leitura em `/isolated/mnt` no imgproxy. |
| Kong | `supabase_kong_gaucha-gestao-local`, ID `ea89c250bdd4`, Kong 2.8.1, portas em `127.0.0.1:54321` e `[::1]:54321` | Mesmo digest, comando, aliases, configuração TLS e bind. `response-transformer` em `storage-v1-all` substitui `Cache-Control` por `private, no-store` e remove `Expires`. Desligamento do access log, error log do proxy em `/dev/null` e driver `none`. Isso afeta logs de todo o gateway local e cache HTTP da rota `/storage/v1/` (S3 tem rota própria). |
| imgproxy | `gg-imgproxy-lab` é outro ensaio, com porta 18080 no host | Sidecar dedicado, sem ingress próprio, no namespace do Storage. Digest v4.0.17, 1 vCPU, 512 MiB, 64 PIDs, um worker, fila de quatro, timeout de 8 s, fonte `local://`, 10 MiB por fonte, 50 MP e uma imagem por animação. |
| Banco | PostgreSQL 17.6, migration `20261111125540` presente | A proposta parte de `origin/main` e tem zero migrations. A versão local adicional pertence à PR #119, ainda draft. Preservar o ledger e o schema existentes, inclusive no rollback. |

Auth, REST, Studio, PostgreSQL, rede existente, volume e dados históricos ficam no lugar. A policy de leitura do bucket `audit-checklist-evidence` exige evidência `available`, perfil ativo e `audit.inspection.read` na unidade. O Storage revalida a policy ao assinar. Quem possui uma URL emitida consegue resgatá-la até a expiração de 60 s. A troca de sessão descarta blobs e pedidos pendentes no frontend. A transformação é habilitada na instância inteira, por isso a homologação também verifica o impacto nos outros buckets. [Transformações do Storage](https://supabase.com/docs/guides/storage/serving/image-transformations).

## Pré-voo de leitura

1. Verificar branch, SHA, `git status`, versão no ledger e identidade do checkout. Conferir o inventário e o digest do imgproxy local. Guardar IDs, saúde e horários de início de Storage, Kong, banco, Auth e REST para comparação posterior.
2. Executar o gerador com Docker local e PyYAML. Ele lê os dois containers, confere projeto, rede, portas, versão, volume, configuração e flags, e prepara a configuração candidata em diretório privado `0700` em `/tmp`. Os arquivos privados incluem o snapshot de configuração anterior e material de autenticação. Manter fora do Git, logs e anexos. O snapshot não contém os objetos nem substitui backup de dados.

   ```bash
   snapshot="$(python3 infra/local/prepare-audit-imgproxy.py)" || exit 1
   ```

3. Antes da janela, confirmar espaço, volume existente, ausência dos nomes de candidato e de preservação abaixo, correspondência dos IDs do snapshot e possibilidade de voltar aos containers originais. Conferir ausência de cache intermediário e a política de logs para a rota externa. Reservar interrupção breve em todo o gateway local e interromper uploads concorrentes. Manter os containers originais parados e renomeados para reversão, com as definições e os respectivos sistemas de arquivos intactos. O plano de troca e reversão ainda precisa de prova na janela autorizada. Se o runtime divergir, faltar uma condição de reversão ou a primeira tentativa falhar, parar no ponto de falha, aplicar a reversão correspondente e apresentar o resultado.

## Sequência para a janela autorizada

**Executar somente após autorização específica do mantenedor para a troca de Storage e Kong no notebook.** Os comandos abaixo pressupõem uma sessão local, a raiz do repositório, Docker Engine no socket Unix padrão e o `snapshot` gerado no pré-voo. Executar por etapa, interromper se algum comando falhar e manter o trace de shell desligado.

1. Preparar os dois containers candidatos **parados**. A resposta da API do Docker fica suprimida. Usar `PUT /containers/{id}/archive` com `copyUIDGID=false` para aplicar os UID/GID do tar. O `docker cp -a` para dentro do Kong aplica o usuário e o grupo do container, que no notebook substituíram `0:0` por `100:65533`. O comando original do Kong recria seu template Nginx na partida. [Extração de archives no Docker Engine](https://github.com/moby/moby/blob/master/daemon/archive_unix.go#L783).

   ```bash
   storage=supabase_storage_gaucha-gestao-local
   kong=supabase_kong_gaucha-gestao-local
   proxy=gaucha-gestao-local-audit-imgproxy
   engine=http://localhost/containers/create
   curl --silent --show-error --fail --output /dev/null --unix-socket /var/run/docker.sock \
     -H 'Content-Type: application/json' --data-binary "@$snapshot/storage-create.json" "$engine?name=${storage}-imgproxy-candidate"
   curl --silent --show-error --fail --output /dev/null --unix-socket /var/run/docker.sock \
     -H 'Content-Type: application/json' --data-binary "@$snapshot/kong-create.json" "$engine?name=${kong}-imgproxy-candidate"
   kong_candidate_id="$(docker inspect --format '{{.Id}}' "${kong}-imgproxy-candidate")" || exit 1
   curl --silent --show-error --fail --output /dev/null --unix-socket /var/run/docker.sock \
     --request PUT -H 'Content-Type: application/x-tar' --data-binary "@$snapshot/kong-files.tar" \
     "http://localhost/containers/${kong_candidate_id}/archive?path=/home/kong&copyUIDGID=false&noOverwriteDirNonDir=true" || exit 1
   python3 infra/local/prepare-audit-imgproxy.py verify-kong "$snapshot" "$kong_candidate_id" || exit 1
   ```

2. Reler os IDs de Storage e Kong e compará-los com `$snapshot/container-ids`. Repetir a conferência do Kong candidato antes da primeira parada. A verificação lê os três arquivos do container por ID e compara SHA-256, UID, GID e modo com o tar privado. Qualquer divergência ou erro de leitura interrompe a troca. O SHA-256 de `kong.yml` tem como referência o declarativo candidato com o plugin `response-transformer`. Após a validação, parar Kong e Storage nessa ordem, renomear os originais para preservação, colocar os candidatos nos nomes originais e iniciar somente o novo Storage.

   ```bash
   python3 infra/local/prepare-audit-imgproxy.py verify-kong "$snapshot" "$kong_candidate_id" || exit 1
   docker stop "$kong"
   docker stop "$storage"
   docker rename "$kong" "${kong}-before-imgproxy"
   docker rename "$storage" "${storage}-before-imgproxy"
   docker rename "${storage}-imgproxy-candidate" "$storage"
   docker rename "${kong}-imgproxy-candidate" "$kong"
   docker start "$storage"
   ```

3. Aguardar a saúde do Storage. Anexar o sidecar pelo **ID** do Storage e testar saúde em loopback. Verificar namespace idêntico pelos links `/proc/1/ns/net` dos dois containers, montagem somente leitura e ausência de bind publicado.

   ```bash
   storage_id="$(docker inspect --format '{{.Id}}' "$storage")" || exit 1
   docker run --detach --pull=never --name "$proxy" --network "container:$storage_id" \
     --mount "type=volume,source=$storage,target=/isolated/mnt,readonly" \
     --env-file infra/local/audit-imgproxy.env \
     --cpus=1 --memory=512m --memory-swap=512m --pids-limit=64 \
     --read-only --cap-drop=ALL --security-opt=no-new-privileges \
     --log-driver=none --restart=no \
     ghcr.io/imgproxy/imgproxy@sha256:db0b4b9cd690c8b3590203dea300fb759a18c4ec2af7b37424f0bdef23ce317d
   docker exec "$storage" node -e 'fetch("http://127.0.0.1:8080/health").then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})'
   ```

4. De outro container da rede, conferir acesso a `storage:5000` e recusa de conexão a `storage:8080`. Conferir recusa a partir do host e ausência de rota Kong para imgproxy. Só então iniciar Kong com `docker start "$kong"`. Conferir saúde, `/auth/v1/health`, login, leitura de API e upload/download de fixture. Confirmar `private, no-store` no resgate pelo gateway, inclusive na rota assinada. Conferir que outras rotas do Storage continuam autorizando e servindo objetos conforme os contratos.
5. Ativar `VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS=true` no ambiente Vite do notebook e iniciar `npm run dev` em `http://127.0.0.1:5173`. A flag nativa tem precedência sobre `VITE_AUDIT_EVIDENCE_THUMBNAILS` e dispensa o executor na sessão. Para o teste no celular, usar o acesso local autenticado do mantenedor. O gateway do inventário está vinculado ao loopback do notebook. O acesso pelo aparelho exige encaminhamento local autorizado para **frontend e API**, mantendo as duas origens no perímetro de homologação e o imgproxy isolado.

**Reinício.** O sidecar tem `--restart=no`. Se o namespace for perdido no reinício do Docker ou do Storage, a transformação fica indisponível e a lista oferece **Abrir original**. Recuperar na ordem Storage saudável → retirar o sidecar dedicado parado ou vinculado ao namespace antigo → executar novamente a etapa 3 com o ID atual → repetir o teste de isolamento e saúde. Evitar `supabase stop/start` para ativar ou recuperar esta configuração. O CLI pode recriar Storage/Kong a partir das próprias definições. Se isso ocorrer, interromper e refazer o inventário.

## Reversão

1. Retirar `VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS` ou definir `false` e reiniciar o Vite. Para retornar às miniaturas gravadas, definir `VITE_AUDIT_EVIDENCE_THUMBNAILS=true` e usar o executor legado conforme seu [runbook](AUD_IMG_02_LOCAL_GO_C_RUNBOOK.md). Com ambas as flags desligadas, vale o comportamento anterior de prévia do original.
2. Parar Kong candidato, depois o sidecar e o Storage candidato. Conferir os IDs antes de renomear. Renomear os candidatos para os nomes `-imgproxy-candidate`. Restaurar os nomes originais de `-before-imgproxy`. Iniciar Storage original, aguardar saúde, iniciar Kong original. Em troca parcial, ajustar apenas os serviços que já passaram pelas etapas correspondentes. Os originais restauram flags, driver de logs, plugins, declarativo e TLS anteriores.
3. Confirmar IDs originais, saúde, bind, acesso autorizado e hashes dos arquivos de prova. Confirmar o mesmo volume, contagem do ledger e os IDs/horários de início de banco/Auth/REST. A remoção eventual dos containers descartados exclui apenas os candidatos identificados, sem `-v`, após confirmação da reversão. Preservar todos os objetos, jobs, manifestos e migrations.

## Homologação e registro

| Prova | Evidência de aceite |
| --- | --- |
| Galaxy S24 Ultra | Enviar uma foto pela câmera e outra pela galeria. Registrar JPEG Ultra HDR de 9 MP e a foto de cerca de 50 MP, incluindo dimensões e bytes. O teto é 50 MP e a POC recusou 50,4 MP. Se a foto real exceder o teto, registrar a degradação e validar também uma amostra de aproximadamente 50 MP dentro do limite. |
| Formatos e integridade | JPEG e PNG comuns, PNG transparente, JPEG/PNG compacto e arquivo inválido. Conferir orientação, dimensões até 480 px e exibição no notebook e celular. Abrir e baixar o original, comparar SHA-256 com a origem. Na lista, falha de transformação oferece **Abrir original** e evita GET automático de foto grande. |
| Autorização e cache | Validar anônimo, perfil inativo, usuário sem permissão, unidade indevida, evidência pendente/removida, troca de sessão, expiração de sessão e de link. Confirmar URL assinada, resgate no bucket privado, `private, no-store` no gateway e descarte de blobs. Medir cache volátil na revisita e ausência de acesso direto ao imgproxy. |
| Concorrência e recuperação | Abrir lotes de 10, 30 e 100 fotos, com dois clientes. Registrar bytes por miniatura, latência, erros, `memory.peak`, `memory.events`, OOM e reinícios. Confirmar carregamento sob demanda, limite no cliente de dois carregamentos ativos e 24 MiB de cache, saturação controlada e recuperação após pausa do sidecar e reinício do Storage. |
| Teste automatizado | `GG_TEST_AUDIT_STORAGE_TRANSFORMS=true node tests/integration/audit-evidence.mjs` em ambiente de integração autorizado com a topologia ativa. Exercita a matriz RLS, expiração, transformação real, Chromium 1280/375 px, bytes, cache e download íntegro. A suíte existente provisiona fixtures e manipula objetos, por isso a homologação no banco persistente usa o roteiro manual acima. |

Cada falha deve ser registrada por formato, status e etapa, sem incluir tokens, caminhos privados ou URLs assinadas. Guardar somente dimensões, bytes, hashes sintéticos ou resultado da comparação, tempos e códigos. A POC sintética serial mediu 30,34 MiB de pico, 47 ms para 9 MP e 413 ms para 49,77 MP. A opção nativa desloca CPU e latência para a leitura e renderiza novamente após perda do cache volátil. Medições de concorrência, recuperação, cache via Kong e fotos reais no fluxo completo permanecem pendentes.
