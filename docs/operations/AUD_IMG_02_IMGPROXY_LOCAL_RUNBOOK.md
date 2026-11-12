# AUD-IMG-02 · ativação e reversão no notebook

PR #120, branch `codex/aud-img-02-imgproxy`. A ativação do fluxo nativo em `gaucha-gestao-local` depende de autorização específica do mantenedor. **PROD NO-GO.** [POC de referência](../modules/audit/AUD_IMG_02_STORAGE_IMGPROXY_POC_20261111.md).

## Topologia

| Serviço | Configuração da troca |
| --- | --- |
| Storage v1.72.1 | Mesmo digest, volume de objetos em `/mnt`, bind privado na rede existente e aliases originais. Transformação ativa até 480 px, imgproxy em loopback, quatro sockets e timeout de 10 s. |
| Kong 2.8.1 | Mesmo digest, portas HTTP em `127.0.0.1:54321` e `[::1]:54321`, aliases, declarativo e TLS preservados. O plugin da rota `storage-v1-all` aplica `Cache-Control: private, no-store` e remove `Expires`. A rota S3 tem configuração própria. |
| imgproxy v4.0.17 | Compartilha o namespace do Storage e escuta em `127.0.0.1:8080`, sem publicação. O volume de objetos é montado em `/isolated/mnt` somente para leitura. Fonte `local://`, 10 MiB, 50 MP, 1 vCPU, 512 MiB, um worker, fila de quatro e timeout de 8 s. |

A troca interrompe brevemente o gateway inteiro. O access log do proxy Kong é desativado, o error log do proxy vai a `/dev/null` e o driver de logs dos três candidatos é `none`. A transformação é habilitada na instância inteira. O Kong 2.8.1 decide se deve adicionar o cabeçalho usando os cabeçalhos originais. A regra usa `replace` quando `Cache-Control` já existe e `add` quando está ausente. [Implementação do plugin no Kong 2.8.1](https://raw.githubusercontent.com/Kong/kong/2.8.1/kong/plugins/response-transformer/header_transformer.lua). A assinatura no bucket `audit-checklist-evidence` continua sujeita a RLS. O resgate de uma URL assinada válida funciona como credencial de posse até o vencimento. A lista limita o cache volátil à sessão. [Transformações do Storage](https://supabase.com/docs/guides/storage/serving/image-transformations).

## Preparar a janela

- Usar o checkout da PR no notebook, Docker Engine local em `/var/run/docker.sock`, Python 3 com PyYAML, Docker CLI e curl com suporte a socket Unix. A sonda independente usa Node HTTP/TCP da imagem Storage v1.72.1 fixada pelo ID, com entrypoint próprio e rede `none` no teste de ferramentas. O pré-voo exige que as imagens fixadas no script já estejam no Docker. A janela roda com `--pull=never`.
- Preparar um arquivo privado, fora do Git, de propriedade do operador e modo `0600`. Guardar nele `email` e `password` de uma conta local de homologação autorizada, `apikey` pública/anon local, `object` com o caminho completo de uma evidência privada existente, por exemplo `audit-checklist-evidence/<chave>`, e `rest_path` com uma leitura autenticada, por exemplo `/rest/v1/<recurso>?select=id&limit=1`. Escolher um JPEG ou PNG de dimensões acima de 480 px, até 50 MP e 10 MiB. O procedimento lê o objeto, compara SHA-256 e abre sessões de login. Definir `fixture` no shell com o caminho desse arquivo. O ensaio descartável gera seus dados e sua conta sintética.
- Interromper uploads concorrentes e reservar a interrupção. Manter a flag Vite nativa desligada até as verificações passarem. Conferir que o equipamento que serve `127.0.0.1:5173` usa o checkout da PR. O acesso pelo celular requer encaminhamento local autorizado de frontend e API. O imgproxy continua inacessível diretamente.
- Rodar a verificação sem troca de serviços. Ela verifica inventário, saúde, rede, ferramentas, imagens, nomes disponíveis, montagem, portas, rota, arquivos do Kong e sonda a partir de um container temporário. A ativação repete essas verificações e valida login, REST e leitura do original antes da primeira parada.

  ```bash
  python3 infra/local/prepare-audit-imgproxy.py preflight --fixture "$fixture"
  ```

## Ativar e verificar

Após a autorização específica do mantenedor, com `fixture` apontando para o arquivo privado:

```bash
python3 infra/local/prepare-audit-imgproxy.py activate --approve-local --fixture "$fixture"
```

O procedimento cria os candidatos parados e copia os três arquivos do Kong via API do Docker. A verificação compara SHA-256, UID, GID e modo, incluindo o declarativo com o plugin novo. A extração usa `copyUIDGID=false` para preservar os metadados do tar. A troca confere novamente IDs e arquivos originais, para Kong e Storage nessa ordem e os guarda com o sufixo `-before-imgproxy`. Após iniciar o Storage candidato, a sonda independente verifica HTTP 200 do imgproxy em loopback compartilhado, HTTP 200 do Storage na rede Docker e `ECONNREFUSED` em `:8080` nessa rede. Confere também ausência de publicação e recusa no loopback do host. [API de arquivos do Docker Engine](https://github.com/moby/moby/blob/master/daemon/archive_unix.go#L783).

O Kong sobe depois da verificação do sidecar. O procedimento confere os arquivos novamente e verifica a rota pelo gateway, login, leitura REST, assinatura autorizada, recusa anônima, resgate assinado, cache e integridade do original. O registro privado de reversão, em `/tmp/gaucha-aud-imgproxy-<uid>/local/state.json`, conserva IDs e hashes. Guarde esse registro e os containers originais durante toda a homologação. Evite `supabase stop/start` durante a troca e a homologação. O CLI pode recriar os serviços.

Com a ativação verificada, definir `VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS=true` na sessão Vite e reiniciar o frontend. Essa flag tem precedência sobre `VITE_AUDIT_EVIDENCE_THUMBNAILS`. Se o Docker ou o Storage perder o namespace compartilhado, a lista oferece **Abrir original**. Use a reversão automatizada antes de uma nova ativação autorizada.

## Reverter

Desligar a flag nativa e reiniciar o Vite. Com ambas as flags desligadas, volta a prévia do original. Para usar os derivados gravados, configurar a flag anterior e seguir o [runbook do executor](AUD_IMG_02_LOCAL_GO_C_RUNBOOK.md).

```bash
python3 infra/local/prepare-audit-imgproxy.py rollback --approve-local --fixture "$fixture"
```

Falhas durante a ativação disparam a mesma reversão automaticamente. Em caso de encerramento abrupto do processo ou se a reversão automática falhar, repetir o comando de reversão com o registro privado disponível. O procedimento usa os rótulos exclusivos da operação para retirar Kong candidato, sidecar e Storage candidato sem apagar volumes. Restaura nomes e inicia os originais na ordem Storage → Kong. Verifica IDs, saúde, portas, montagem, metadados e hashes de Kong, acesso e integridade do original. Também confere IDs e horários de início de Auth, REST e PostgreSQL. O registro é removido após a verificação.

## Reproduzir o ensaio descartável

```bash
python3 -B infra/local/rehearse-audit-imgproxy.py
```

O ensaio exige também OpenSSL e as imagens locais de PostgreSQL 17.6.1.167, Auth v2.196.0 e REST v16.2. Usa nomes e credenciais novos, rede e volume exclusivos, PostgreSQL em tmpfs e Kong em porta loopback dinâmica. Reproduz o comando de partida do Kong e a resolução do nome canônico do Storage. Provisiona conta, policies e PNG sintéticos. Executa o mesmo código de ativação e reversão, incluindo uma falha deliberada após a partida do Kong candidato. Ao terminar, remove os recursos sintéticos e compara IDs e horários de início dos containers preexistentes.

**Resultado de 12/11/2026 — PASS no Docker Engine 29.9.3 do notebook.** A sequência verificou os candidatos parados, a integridade dos três arquivos do Kong antes e depois da partida, o bind IPv4/IPv6, o acesso privado ao imgproxy e a recusa externa. O gateway autenticou a conta sintética, serviu REST e entregou o PNG transformado dentro de 480 px com `private, no-store` e sem `Expires`. O SHA-256 dos originais coincidiu com o upload. A leitura autorizada e a recusa anônima do segundo bucket privado passaram, e status e cache da rota S3 coincidiram com o início do ensaio. A reversão explícita e a reversão automática após falha deliberada restauraram os IDs anteriores, os arquivos Kong, as portas e os originais. A limpeza confirmou que os containers preexistentes conservaram IDs e horários de início.

## Homologação após a janela

No notebook e no Galaxy S24 Ultra, validar câmera e galeria, JPEG Ultra HDR de 9 MP, amostra próxima de 50 MP dentro do teto, PNG transparente, JPEG/PNG compacto e arquivo inválido. Conferir orientação, dimensões, ampliação, download íntegro e fallback **Abrir original**. Validar perfil inativo, permissão ausente, unidade indevida, evidência pendente/removida, troca de sessão e expiração. Registrar somente status, dimensões, bytes e veredictos de integridade. O teste `GG_TEST_AUDIT_STORAGE_TRANSFORMS=true node tests/integration/audit-evidence.mjs` provisiona fixtures e requer ambiente de integração autorizado.

Medições de latência, lotes de 10/30/100 fotos, saturação do sidecar, memória e cache volátil na revisita ficam para a validação de carga. O ensaio operacional usa uma imagem sintética e a matriz de autorização da aplicação depende da homologação.
