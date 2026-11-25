# Docker Compose de desenvolvimento local

Procedimentos comuns a [Ubuntu nativo](LOCAL_DEV_UBUNTU.md) e [Windows com WSL2](LOCAL_DEV_WINDOWS.md), na raiz do checkout. Confirme o contexto Docker e o projeto pessoal `gaucha-gestao-local` antes de operar.

## Topologia e operação

- **Base:** PostgreSQL (`db`), Auth, REST, Storage, Kong, Studio, pg_meta e imgproxy. Os volumes nomeados `db-data`, `storage-data` e `studio-snippets` guardam banco, objetos e snippets. PostgreSQL e Kong usam imagens locais construídas de bases fixadas, com configuração incorporada. [Manifesto base](../../infra/local/compose.yaml)
- **Identity:** mesmo projeto com nove serviços. A extensão acrescenta `identity` sem porta publicada e configura Auth, REST e Kong. Preserve os dois manifests em operações do ambiente adotado. [Manifesto Identity](../../infra/local/compose.identity.yaml) · [Runbook GG-05B](GG_05B_IDENTIDADE_DEV.md)
- **CI e laboratórios:** usam perfis e volumes descartáveis, com procedimentos próprios no [guia de infra](../../infra/README.md). C30/STAGING é persistente e segue [runbook próprio](C30_STAGING_RUNBOOK.md).

As portas padrão da API, PostgreSQL e Studio são 54321, 54322 e 54323 em loopback IPv4/IPv6. Storage usa imgproxy em bridge interna com gateway `isolated` e montagem de objetos somente para leitura no imgproxy. [Controles do imgproxy](../../infra/local/audit-imgproxy.env) · [Controles do Storage](../../infra/local/audit-storage-transforms.env)

## Instalação inicial em máquina nova

A [PR #130](https://github.com/The-Vonky/Gaucha-Gestao/pull/130), integrada à `main` em `cbaeb29`, ampliou os formatos aceitos pelo provisionador. Para migrations com `BEGIN` e `COMMIT` explícitos, ele registra a versão no ledger antes do `COMMIT`. Para uma migration composta de um único `DO` com corpo delimitado por cifrões, como a GG-04, ele abre a transação, executa o bloco e registra a versão antes de confirmar. A migration e sua entrada no ledger são confirmadas juntas. O provisionador pode iniciar serviços antes de verificar todas as migrations.

Confirme portas livres e ausência de instância anterior nas mesmas portas ou com o mesmo nome. Para instalar o perfil base em máquina nova:

```bash
npm ci
GG_DEV_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/gaucha-gestao"
GG_DEV_ENV="$GG_DEV_DIR/backend.env"
mkdir -p -m 700 "$GG_DEV_DIR"
python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" secrets
python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" install
python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" vite-env
```

Prossiga para cada passo apenas após sucesso do anterior. `secrets` e `vite-env` recusam sobrescrita. Confira o ledger e os oito serviços saudáveis. Para o primeiro administrador de **um DEV base novo**, crie e confirme uma conta de teste em **Authentication → Users** no Studio local. Execute uma vez no SQL Editor com o UUID dessa conta:

```sql
select private.bootstrap_administrator('UUID_DO_USUARIO_CONFIRMADO'::uuid);
```

O cadastro público permanece desabilitado. Para estender o ambiente com Identity, siga o [runbook de adoção GG-05B](GG_05B_IDENTIDADE_DEV.md).

## Retomada de instalação interrompida

Identifique a fase da falha e preserve projeto, volumes e arquivo privado originais. Verifique o estado dos serviços e o ledger antes de retomar. No perfil base, use o mesmo projeto e arquivo privado da instalação. Em um novo terminal, defina o caminho para o arquivo existente:

```bash
GG_DEV_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/gaucha-gestao/backend.env"
python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" install --no-recreate
```

O provisionador repassa `--no-recreate` às duas chamadas de partida do Compose. Containers existentes e suas configurações são preservados, serviços faltantes podem ser iniciados e as migrations pendentes continuam sendo aplicadas. Alterações de configuração ou imagem dos containers preservados exigem uma atualização controlada. Se já houver Identity adotado, use o Compose combinado e o [runbook de retomada do perfil](GG_05B_IDENTIDADE_DEV.md#retomada-do-notebook-já-adotado).

## Uso diário

Com o backend saudável e o Vite parado, execute `npm run dev`. O Vite atende em [127.0.0.1:5173](http://127.0.0.1:5173), e o Studio em [127.0.0.1:54323](http://127.0.0.1:54323). `vite-env` gera `apps/web/.env.local` com a URL da API em loopback, a chave autorizada de cliente e `VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS=true`. No perfil com Identity, configure também `VITE_GG_IDENTITY_ENABLED=true`. Preserve segredos administrativos fora do frontend e do Git.


## Diagnóstico

Selecione os arquivos correspondentes ao perfil já adotado. Confira contexto e portas antes de qualquer partida.

```bash
GG_DEV_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/gaucha-gestao"
GG_DEV_ENV="$GG_DEV_DIR/backend.env"
GG_DEV_COMPOSE=(docker compose -p gaucha-gestao-local --env-file "$GG_DEV_ENV" -f infra/local/compose.yaml)
# Somente se o projeto já usar Identity, acrescente o complemento:
# GG_DEV_COMPOSE+=(--env-file "$GG_DEV_DIR/identity.env" -f infra/local/compose.identity.yaml)
"${GG_DEV_COMPOSE[@]}" config --quiet
"${GG_DEV_COMPOSE[@]}" ps -a
curl -fsS http://127.0.0.1:54321/auth/v1/health -o /dev/null
curl -fsS http://127.0.0.1:54321/storage/v1/status -o /dev/null
curl -fsS http://127.0.0.1:54323/api/platform/profile -o /dev/null
```

Use as portas efetivas se forem diferentes das padrão. `restart: unless-stopped` permite que o Engine retome os serviços existentes após reboot. Uma parada explícita requer partida explícita. Se os containers esperados já existem e foram parados, use `"${GG_DEV_COMPOSE[@]}" start` com o perfil correto após conferir o alvo. Verifique novamente os estados. Diagnostique containers ausentes, falhas de configuração ou conflitos antes de decidir por reconstrução. Limite a saída pública a estados e resultados sanitizados. Kong, Storage e imgproxy usam driver de logs `none`.

## Atualização de infraestrutura e adoção

Para imagem/configuração nova, identifique o diff, a revisão, o perfil, as dependências, o ledger e a necessidade de preservar dados. `up --build` pode recriar serviços. Use janela e plano de recuperação adequados. Um ambiente saudável segue a rotina diária acima.

Se existir uma instância anterior da Supabase CLI, planeje adoção separadamente. O [registro de migração com preservação](#referência-histórica-da-migração-com-preservação-de-dados) guarda o roteiro histórico. Para Identity, siga a ordem e os limites de reversão do [runbook GG-05B](GG_05B_IDENTIDADE_DEV.md). Qualquer laboratório que exija isolamento adicional precisa de escopo próprio.

## Dados descartáveis no DEV pessoal

O grupo `gaucha-gestao-local` no notebook é o **ambiente de desenvolvimento pessoal**; o mantenedor pode pedir a exclusão permanente de dados usados em testes. Quando houver pedido explícito para apagar unidades, usuários, registros, anexos, auditorias ou histórico **de teste**, executá-lo sem reter cópias de rotina, exigir soft delete ou pedir nova autorização apenas por existir histórico. Limpar as dependências efetivamente pertencentes ao alvo, de maneira delimitada, e verificar o resultado. Para contas de teste, distinguir `auth.users`, `core.profiles` e as atribuições de acesso; para evidências, conferir também os objetos associados no Storage. Não remover dados diferentes dos solicitados nem resetar o banco/volumes inteiros sem pedido explícito.

A regra não alcança DEV compartilhado, C30, STAGING, PROD ou dados reais. Consultar [AGENTS.md](../../AGENTS.md) para a instrução obrigatória aos agentes. O procedimento de backup abaixo continua **opcional para os dados descartáveis do DEV pessoal**, e necessário apenas quando o mantenedor desejar preservar dados ou executar uma operação que exija cópia por outro motivo.

## Backup e restauração de um DEV Compose

**Escopo: Compose base de oito serviços.** O provisionador usa somente `compose.yaml`, para os serviços base, captura os três volumes e guarda o arquivo privado base, o dump, os globals e o manifesto.

Pause o Vite, uploads, clientes SQL e outros escritores antes da janela. O comando `backup` para os serviços da aplicação, guarda dump lógico e globals, encerra o PostgreSQL e arquiva os volumes a frio com permissões e proprietários. Retoma a origem ao final. Mantenha o pacote cifrado fora do checkout, com cópia independente do armazenamento do Docker.

```bash
GG_BACKUP_DIR="$HOME/backups/gaucha-gestao/dev-$(date +%Y%m%d-%H%M%S)"
mkdir -p -m 700 "$(dirname "$GG_BACKUP_DIR")"
python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" backup "$GG_BACKUP_DIR"
```

Em um Docker local sem instância ou volumes do nome de destino, restaure o pacote íntegro com a credencial original. Prepare `GG_DEV_DIR` com o modo indicado na instalação e preserve qualquer arquivo privado existente. O exemplo copia o arquivo do pacote somente se o destino estiver livre.

```bash
if [ ! -e "$GG_DEV_ENV" ] && [ ! -L "$GG_DEV_ENV" ]; then
  (umask 077; set -C; cat "$GG_BACKUP_DIR/secrets.env" > "$GG_DEV_ENV") &&
    python3 -B infra/local/local-dev.py --env-file "$GG_DEV_ENV" restore "$GG_BACKUP_DIR"
fi
```

O restore confere SHA-256, versão/digest do PostgreSQL e ausência de `postmaster.pid` no arquivo. Ele cria containers parados, preenche os volumes e só então inicia o Compose. Para ensaiar com a origem ativa, use `--project gg-dev-lab-<id>` antes de `restore`, com uma cópia privada de `secrets.env` alterando apenas as três portas para valores livres. Compare ledger, roles/grants, Auth, buckets, RLS e hashes dos originais. Se a restauração falhar depois de criar recursos, preserve-os para diagnóstico e use outro destino vazio para o próximo ensaio.

### Limite do backup com Identity

**O backup e o restore do Compose base cobrem apenas o perfil de oito serviços.** Mesmo com um pacote íntegro, a recuperação do ambiente adotado com Identity exige um procedimento próprio. O script base não coordena a quiescência nem a partida de `identity`, não restaura o complemento `compose.identity.yaml` e não inclui `identity.env` no pacote. A recuperação integral desse perfil ainda precisa ser ensaiada. Preserve os insumos privados aplicáveis fora do Git, incluindo os arquivos do backend e da extensão, e registre a revisão dos manifests. Consulte o [runbook GG-05B](GG_05B_IDENTIDADE_DEV.md).

**Tarefa técnica proposta:** definir e ensaiar a quiescência de escritores com Identity, conservar e validar os insumos privados, estabelecer a ordem de recuperação do banco, objetos, Auth, REST, Kong e Identity, e comprovar login, admissão, revogação e Storage autenticado após a restauração. A tarefa depende de autorização própria. A continuidade do STAGING exige [processo independente da C30](C30_BACKUP_OPERATIONAL_PLAN.md).

## Registros anteriores

## Retomada nativa após reboot Windows/WSL2

**Registro histórico da PR #122.** As instruções abaixo pertencem à janela de correção do incidente de 13/11/2026. Para uso atual, siga o [guia Windows](LOCAL_DEV_WINDOWS.md).

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

## Instalação limpa no notebook em 12/11/2026

**Registro histórico da PR #121**, referente ao notebook Windows naquela data.

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
