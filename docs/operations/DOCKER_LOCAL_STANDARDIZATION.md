# Docker Compose de desenvolvimento local

A [PR #121](https://github.com/The-Vonky/Gaucha-Gestao/pull/121) implementa o Compose de DEV. Em 12/11/2026, o mantenedor autorizou uma instalação limpa no notebook. O Docker Desktop passou a operar com o grupo `gaucha-gestao-local` e os oito serviços do Compose. **PROD NO-GO.**

## Topologia e operação

O [manifesto de DEV](../../infra/local/compose.yaml) fixa seis imagens por digest e duas imagens locais (PostgreSQL/Kong), construídas a partir de bases fixadas por digest. O projeto `gaucha-gestao-local` reúne PostgreSQL, Auth, REST, Storage, Kong, Studio, pg_meta e imgproxy. A API, o banco e o Studio escutam em IPv4 e IPv6 loopback nas portas 54321, 54322 e 54323. Os volumes nomeados `db-data`, `storage-data` e `studio-snippets` guardam PostgreSQL, objetos e snippets do Studio. A Supabase CLI continua disponível para a CI. [Referência de versões do laboratório de CI](../../infra/supabase/UPSTREAM.md).

Storage e imgproxy se comunicam em um bridge IPv4 dedicado com `internal: true` e gateway `isolated`. O Storage resolve `http://imgproxy:8080` via DNS do Docker. O imgproxy tem namespace próprio, sem publicação, e monta o volume de objetos somente para leitura. Os controles continuam em [audit-imgproxy.env](../../infra/local/audit-imgproxy.env) e [audit-storage-transforms.env](../../infra/local/audit-storage-transforms.env). O [Kong](../../infra/local/config/kong.yml) aplica `Cache-Control: private, no-store` e remove `Expires` na rota Storage comum. A rota S3 mantém sua assinatura própria. [Modo de gateway isolated](https://docs.docker.com/engine/network/port-publishing/#gateway-modes).

Os oito serviços usam `restart: unless-stopped`. O Compose aguarda os healthchecks de `depends_on` durante suas próprias operações de partida. Ao abrir o Docker Desktop, o Engine aplica as políticas de reinício individualmente, e os serviços dependentes precisam se reconectar. Uma parada explícita com `docker compose stop` requer partida explícita dos serviços parados. [Políticas de reinício](https://docs.docker.com/engine/containers/start-containers-automatically/) · [Ordem de partida do Compose](https://docs.docker.com/compose/how-tos/startup-order/).

A [instalação em máquina nova](../../README.md#instalação-inicial-em-máquina-nova) cria os volumes, gera as credenciais e aplica as migrations em ordem. O ledger é escrito na mesma transação de cada migration. O comando `vite-env` escreve a flag nativa e a chave de cliente. `npm run dev` executa só o Vite. O executor anterior segue disponível por `npm run dev:thumbnails`.

## Diagnóstico

Use o arquivo de segredos do provisionamento e o contexto Docker local.

```bash
GG_DEV_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/gaucha-gestao/backend.env"
docker compose -f infra/local/compose.yaml --env-file "$GG_DEV_ENV" config --quiet
docker compose -f infra/local/compose.yaml --env-file "$GG_DEV_ENV" ps
curl -fsS http://127.0.0.1:54321/auth/v1/health -o /dev/null
curl -fsS http://127.0.0.1:54321/storage/v1/status -o /dev/null
curl -fsS http://127.0.0.1:54323/api/platform/profile -o /dev/null
```

Se o Docker indicar portas ocupadas, identifique quem as usa antes de prosseguir. Se a configuração Vite divergir, confira URL, chave de cliente e flag, depois reinicie o Vite. Em falha de transformação, a aplicação oferece **Abrir original**. Consulte os estados e healthchecks sem divulgar a saída de `docker compose config` sem `--quiet`, envs, JWTs ou URLs assinadas. Kong, Storage e imgproxy têm driver de logs `none`.

## Retomada nativa após reboot Windows/WSL2

O reboot físico de 13/11/2026 identificou falha exit 127 (`not a directory`) nos bind mounts de `99-gg-roles.sql` e `kong-entrypoint.sh`: o Docker Engine tentou restaurar os containers antes de o proxy WSL disponibilizar os arquivos da distro Ubuntu. Abrir o Ubuntu e iniciar os containers **existentes** recuperou os oito serviços sem alteração dos volumes. O monitor com Agendador tentado nesta PR era apenas um contorno, não a solução definitiva.

O Compose agora **constrói imagens locais para PostgreSQL e Kong**, incorporando `roles.sql`, `kong.yml` e `kong-entrypoint.sh` ao build. As duas imagens-base continuam fixadas por digest, assim como as outras seis imagens. Esses arquivos já existem nas imagens na hora do boot, sem precisar de bind mounts do Ubuntu. Os dados continuam em três volumes nomeados; `restart: unless-stopped` é o mecanismo nativo de retomada.

### Aplicação controlada no notebook existente

O operador/agente com acesso ao notebook deve conferir `git status`, checkout, projeto Docker, IDs dos oito containers, volumes e dados antes da troca. Não misturar ambientes, sobrescrever trabalho local ou executar esta alteração na C30/STAGING/PROD. Se os dados de teste precisarem ser preservados fora dos volumes, criar backup restaurável antes da janela.

1. No **Windows PowerShell**, remova o monitor da tentativa anterior usando **a cópia já instalada** (somente `GauchaGestaoDockerResume`):

   ```powershell
   $legacy = Join-Path $env:LOCALAPPDATA 'GauchaGestao\Resume-LocalDocker.ps1'
   if (Test-Path -LiteralPath $legacy) {
       powershell.exe -NoProfile -ExecutionPolicy Bypass -File $legacy -Uninstall
   }
   Get-ScheduledTask -TaskName GauchaGestaoDockerResume -ErrorAction SilentlyContinue
   ```

   A consulta final deve ser vazia. Se a tarefa continuar presente, registrar o usuário/resultado e remover **somente** esse agendamento após confirmar sua origem. O script legado foi retirado do repositório; esta etapa usa apenas a cópia previamente instalada no perfil Windows.

2. No **Ubuntu/WSL**, na raiz do checkout correto e com Docker Desktop iniciado, confira segredos e Compose **sem imprimir os segredos**:

   ```bash
   GG_DEV_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/gaucha-gestao/backend.env"
   docker compose -f infra/local/compose.yaml --env-file "$GG_DEV_ENV" config --quiet
   docker compose -f infra/local/compose.yaml --env-file "$GG_DEV_ENV" ps -a
   ```

3. Com a janela de manutenção validada, execute:

   ```bash
   docker compose -f infra/local/compose.yaml --env-file "$GG_DEV_ENV" up -d --build --wait --wait-timeout 180
   ```

   `up --build` **pode recriar os containers db e kong**, mas deve preservar os três volumes nomeados e os dados existentes. Os IDs de containers recriados mudam; os volumes não devem mudar. **Proibido** `down -v`, `prune`, `supabase db reset`, gerar novos segredos ou criar outra instância por rotina. Em falha, capturar diagnóstico antes de intervir novamente.

4. Confirmar os oito serviços `healthy`, Auth/REST/Storage/Studio, login e leituras autenticadas. Inspecionar `.Mounts` de `db` e `kong`: não devem existir bind mounts dos três arquivos WSL citados.

### Homologação física

Reiniciar o Windows, entrar na conta usual e abrir **somente o Docker Desktop**. Não abrir Ubuntu, não rodar comandos de recuperação e não manter tarefa externa. Os oito serviços precisam voltar a `healthy` nativamente, sem prazo fixo de espera de quatro minutos. Após a partida, comparar volumes, checar API e login; em erro, salvar `docker inspect` e logs antes de restart manual. Manter a PR em rascunho e sem merge até o teste físico do mantenedor e CI.

## Dados descartáveis no DEV pessoal

O grupo `gaucha-gestao-local` no notebook é o **ambiente de desenvolvimento pessoal**; o mantenedor pode pedir a exclusão permanente de dados usados em testes. Quando houver pedido explícito para apagar unidades, usuários, registros, anexos, auditorias ou histórico **de teste**, executá-lo sem reter cópias de rotina, exigir soft delete ou pedir nova autorização apenas por existir histórico. Limpar as dependências efetivamente pertencentes ao alvo, de maneira delimitada, e verificar o resultado. Para contas de teste, distinguir `auth.users`, `core.profiles` e as atribuições de acesso; para evidências, conferir também os objetos associados no Storage. Não remover dados diferentes dos solicitados nem resetar o banco/volumes inteiros sem pedido explícito.

A regra não alcança DEV compartilhado, C30, STAGING, PROD ou dados reais. Consultar [AGENTS.md](../../AGENTS.md) para a instrução obrigatória aos agentes. O procedimento de backup abaixo continua **opcional para os dados descartáveis do DEV pessoal**, e necessário apenas quando o mantenedor desejar preservar dados ou executar uma operação que exija cópia por outro motivo.

## Backup e restauração de um DEV Compose

Pause o Vite, uploads, clientes SQL e outros escritores antes da janela. O comando `backup` para os serviços da aplicação, guarda dump lógico e globals, encerra o PostgreSQL e arquiva os volumes a frio com permissões e proprietários. Retoma a origem ao final. Mantenha o pacote cifrado fora do checkout, com cópia independente do Docker Desktop.

```bash
GG_BACKUP_DIR="$HOME/backups/gaucha-gestao/dev-2026-11-12"
mkdir -p -m 700 "$(dirname "$GG_BACKUP_DIR")"
python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" backup "$GG_BACKUP_DIR"
```

Em um Docker local sem instância com o nome de destino, restaure o pacote íntegro e a credencial original em volumes novos.

```bash
install -m 600 "$GG_BACKUP_DIR/secrets.env" "$GG_DEV_ENV"
python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" restore "$GG_BACKUP_DIR"
```

O restore confere SHA-256, versão/digest do PostgreSQL e ausência de `postmaster.pid` no arquivo. Ele cria containers parados, preenche os volumes e só então inicia o Compose. Para ensaiar com a origem ativa, use `--project gg-dev-lab-<id>` antes de `restore`, com uma cópia privada de `secrets.env` alterando apenas as três portas para valores livres. Compare ledger, roles/grants, Auth, buckets, RLS e hashes dos originais. Se a restauração falhar depois de criar recursos, preserve-os para diagnóstico e use outro destino vazio para o próximo ensaio.

## Instalação limpa no notebook em 12/11/2026

O ambiente anterior da Supabase CLI foi desligado e removido. A limpeza incluiu os sete serviços da CLI, os dois containers de reversão de Kong e Storage, o imgproxy avulso, os dois volumes legados de banco e objetos e a rede legada. Foram recriados os volumes `db-data` e `storage-data` do Compose. O volume `studio-snippets` foi preservado. Os dados anteriores foram descartados conforme a decisão do mantenedor.

No Engine Docker Desktop 29.9.3, o contexto Windows `desktop-linux` confirmou um projeto `gaucha-gestao-local` com oito serviços em execução. Os healthchecks e a política `unless-stopped` foram conferidos individualmente. O banco recebeu as 41 migrations versionadas, com sete buckets privados. O smoke test confirmou login, REST autenticado, Studio com pg_meta, upload e miniatura assinada pelo Storage com imgproxy. A conta e o objeto sintéticos foram removidos.

O `npm run dev` iniciou o Vite em `127.0.0.1:5173` com acesso ao socket Docker desabilitado para o processo. Os IDs, estados, contadores de reinício e horários de início dos containers permaneceram iguais. O Docker Desktop permaneceu aberto durante a instalação. A retomada após reiniciar o Engine fica sem teste nesta janela.

## Referência histórica da migração com preservação de dados

O procedimento abaixo descreve a janela anterior com preservação de dados. A instalação limpa de 12/11/2026 substituiu essa estratégia para o notebook do mantenedor.

**Executar apenas após GO específico para a janela do notebook.** A instância de referência tem 41 migrations, incluindo `20261111125540`, sete buckets e volumes `supabase_db_gaucha-gestao-local` e `supabase_storage_gaucha-gestao-local`. Confira o inventário, as imagens e os nomes antes da janela. Guarde o registro de reversão do AUD-IMG-02, a configuração original e o inventário de roles, grants, RLS, triggers, identidades, auditorias e hashes de objetos em pacote privado. Verifique espaço para os volumes duplicados. [Runbook da origem](AUD_IMG_02_IMGPROXY_LOCAL_RUNBOOK.md).

1. **Preparar credenciais e captura.** No checkout da PR, com o contexto Docker do notebook confirmado, defina um diretório externo e proteja a saída. `cli-secrets` captura apenas os parâmetros necessários a partir dos containers esperados, incluindo chaves do Auth, verificação REST/Storage, chaves opacas e S3. O arquivo é gravado com modo 0600 e saída sem valores.

   ```bash
   umask 077
   GG_ADOPTION="$HOME/backups/gaucha-gestao/adocao"
   mkdir -m 700 "$GG_ADOPTION"
   GG_DEV_ENV="$GG_ADOPTION/backend.env"
   python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" cli-secrets
   ```
2. **Congelar escritas e capturar.** Encerre Vite e clientes SQL. Verifique as referências de objetos enquanto a origem responde. Pare os sete serviços que não são PostgreSQL, com Kong e Studio primeiro e imgproxy antes do Storage. Confirme que os containers de reversão da PR #120 também estão parados. Capture dump/globals e encerre o banco de forma limpa. O helper só arquiva os volumes esperados com a origem parada.

   ```bash
   gg_origin=gaucha-gestao-local
   docker stop "supabase_kong_$gg_origin" "supabase_studio_$gg_origin"
   docker stop "$gg_origin-audit-imgproxy"
   docker stop "supabase_storage_$gg_origin" "supabase_rest_$gg_origin" \
     "supabase_auth_$gg_origin" "supabase_pg_meta_$gg_origin"
   docker exec "supabase_db_$gg_origin" pg_dump -Fc -U supabase_admin postgres > "$GG_ADOPTION/database.dump"
   docker exec "supabase_db_$gg_origin" pg_dumpall --globals-only -U supabase_admin > "$GG_ADOPTION/roles.sql"
   docker exec -i "supabase_db_$gg_origin" pg_restore --list < "$GG_ADOPTION/database.dump" > /dev/null
   docker stop -t 60 "supabase_db_$gg_origin"
   python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" capture-stopped-cli "$GG_ADOPTION"
   ```
3. **Restaurar e comparar.** Valide o pacote em projeto isolado antes da troca definitiva. Para a troca, confirme que a origem está parada e as portas estão livres. Restaure cópias em volumes do Compose.

   ```bash
   python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" restore "$GG_ADOPTION" --adopt-stopped-cli
   ```

   A adoção não executa o provisionamento de máquina nova. Compare os inventários, faça login com uma identidade existente, confirme REST, assinatura privada, miniaturas, originais e fallback. Mantenha a URL e a chave de cliente originais e habilite `VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS=true` no `apps/web/.env.local` existente. Com o Vite fechado, reinicie o Docker Desktop e depois o Windows na janela. Confira também o Storage e o agrupamento.
4. **Provar reversão antes de liberar escritas.** Pare o Compose e retome a origem nos volumes anteriores. Use a recuperação do runbook da PR #120, que redescobre o namespace ativo do Storage para o sidecar. Compare login, REST, ledger e hashes. Volte ao Compose, repita o smoke test e só então libere uso. Preserve os volumes e containers antigos durante a janela de reversão. Os containers reservados podem aparecer no Docker Desktop como itens parados. A limpeza posterior dos containers de origem requer o pacote de reconstrução ensaiado e autorização própria.

   ```bash
   docker compose -f infra/local/compose.yaml --env-file "$GG_DEV_ENV" stop
   npm run dev:local
   ```

   Se houve escritas após o corte, capture o par atualizado de PostgreSQL e objetos e ensaie a reconciliação antes de voltar. O snapshot anterior ao corte perderia essas escritas.

## Ensaio descartável

Com as dependências Node instaladas e um Docker local com portas livres, execute `node infra/local/rehearse-compose.mjs`. O script cria dois projetos `gg-dev-lab-*` com portas, credenciais, redes e volumes independentes. Ele verifica o inventário persistente antes e depois e remove apenas recursos dos projetos sintéticos que criou.

O ensaio cobre oito serviços saudáveis, Studio/pg_meta, login e REST, RLS negativo, miniaturas assinadas de 9 MP e 49,94 MP, cabeçalhos privados, hashes dos originais, isolamento do imgproxy, restart e recriação de Storage/imgproxy, Vite sem acesso ao Docker, backup a frio, restauração em volumes novos e retorno à origem descartável. O registro da instalação limpa acima documenta a validação executada no notebook.

O Engine aninhado 29.0.2 iniciou em socket próprio. A prova de retomada integral ficou bloqueada quando o `runc` recusou iniciar o imgproxy com limites de recursos devido ao estado inválido de cgroups v2 do ambiente aninhado. Repita essa prova em uma VM descartável com Engine próprio e controladores delegados, com Vite desligado e sem iniciar serviços manualmente após reiniciar o Engine.
