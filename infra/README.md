# Supabase mínimo reproduzível — CI e laboratório descartável

**Status:** infraestrutura de validação, **não** receita de produção. Cinco serviços exatos: PostgreSQL 17 (`db`), Kong (`kong`), GoTrue/Auth (`auth`), PostgREST (`rest`) e Storage API (`storage`). Não operar servidor físico, banco preexistente, deploy nem dados produtivos por este procedimento.

Referências: [proveniência do upstream](supabase/UPSTREAM.md), [ADR-006 — Proposto](../docs/decisions/ADR-006-infra-v1-reused-hardware.md), [operações](../docs/operations/OPERATIONS_MATRIX.md).

> **Atenção ao STAGING persistente real:** desde 21–22/10/2026 há uma instância **separada** da CI/laboratório na ThinkStation C30, com projeto `gaucha-staging`, HDD persistente, `gaucha-staging.service` e Caddy HTTPS loopback. **Não use o procedimento descartável deste arquivo nesse host/projeto.** Leia [inventário AS-IS](../docs/operations/C30_STAGING_AS_BUILT_20261022.md), [runbook não destrutivo](../docs/operations/C30_STAGING_RUNBOOK.md) e [plano de atualização](../docs/operations/C30_STAGING_RELEASE_GUIDE.md). `scripts/ops/apply-migrations.sh` recusa banco previamente inicializado: não serve para atualizar essa instância.

## Pré-requisitos e ciclo de vida

Usar **Linux**, Docker Engine, Docker Compose v2 com `up --wait` e `config --format json`, Bash, Node >=22.12, Git, coreutils e ShellCheck. A CI usa runner Ubuntu efêmero. Estes scripts de operação/smoke não precisam de `npm install`.

O gerador cria um env **novo, fora de todo checkout Git**, e recusa destino já existente ou apontando para o repositório (inclusive via symlink). Usa permissão 600 e não imprime segredos. Chaves JWT do gateway expiram em **uma hora**; gerar stack novo para outra sessão. Este processo **não** implementa ciclo de segredos de PROD.

**Execute apenas em host/projeto comprovadamente descartável, com nomes, portas e volumes exclusivos.** Nunca use o mesmo `infra_project` de um ambiente preexistente. Inventariar `docker compose ls --all`, contêineres e volumes antes de criar/remover. O comando `down -v` abaixo é **destrutivo** e só pode atingir o projeto sintético explicitamente criado neste exemplo.

### Exemplo de laboratório isolado

```bash
# Escolha nome exclusivo e diretório externo novo para cada laboratório descartável.
infra_tmp=$(mktemp -d)
infra_env="$infra_tmp/staging.env"
infra_project="gaucha-infra-staging-$(date +%s)"
bash scripts/ops/gen-secrets.sh --environment staging --output "$infra_env"
# Edite SITE_URL, API_EXTERNAL_URL, ADDITIONAL_REDIRECT_URLS e GATEWAY_PORT
# somente no arquivo externo, se necessário. Use modo 600 e nunca exiba segredos.

docker compose --env-file "$infra_env" -p "$infra_project" -f infra/supabase/docker-compose.yml config --quiet
docker compose --env-file "$infra_env" -p "$infra_project" -f infra/supabase/docker-compose.yml up -d
bash scripts/ops/apply-migrations.sh --environment staging --env-file "$infra_env" --project "$infra_project" --database postgres
docker compose --env-file "$infra_env" -p "$infra_project" -f infra/supabase/docker-compose.yml up -d --wait --wait-timeout 180
bash scripts/ops/healthcheck.sh --environment staging --env-file "$infra_env" --project "$infra_project" --database postgres
node scripts/ops/smoke.mjs --environment staging --env-file "$infra_env" --project "$infra_project" --database postgres

# LIMPEZA DESTRUTIVA: somente do projeto descartável específico validado acima.
docker compose --env-file "$infra_env" -p "$infra_project" -f infra/supabase/docker-compose.yml down -v --remove-orphans
rm -f "$infra_env"
rmdir "$infra_tmp"
```

Em falhas, encerrar **apenas** o laboratório explicitamente identificado, após revisar os alvos; um `trap` ou `finally` controla a limpeza quando autorizado. A CI usa `if: always()`. Nunca executar exemplo contra volumes de projeto reutilizado. O marcador de instância gerado deve coincidir com o registrado no bootstrap do DB.

Todos os entrypoints operacionais recusam modo `production`. `production.env.example` é registro **não executável** das decisões pendentes, não template de deploy produtivo.

Somente `127.0.0.1:GATEWAY_PORT` é exposto, por padrão em 54321. PostgreSQL **não** publica porta no host: os scripts usam `compose exec` do projeto nomeado. Porta ocupada exige outra porta livre e atualização de `API_EXTERNAL_URL`, sem mexer em instâncias de outros desenvolvedores.

## Segurança de aplicação de migrations

Todo comando exige ambiente, env externo, nome de projeto e banco explícitos. `common.sh` valida dados sem `eval` e confere marcador exclusivo de instância nova no DB. Somente `ci` e `staging` **descartável** são aceitos; alvos são DB do próprio Compose, não URI host arbitrária.

`apply-migrations.sh` recusa schema `core` ou ledger pré-existente e aplica `supabase/migrations/*.sql` em ordem nominal, **sem mudar os bytes**. Migrations executam como `postgres` e preservam transações/owners originais. Ledger/marcador infra usam `supabase_admin`, gravando SHA-256 após êxito. Não há `ALTER OWNER` posterior.

Migrations do Auth/Storage upstream terminam na inicialização dos serviços; a primeira subida espera dependências, e REST só fica saudável após os schemas da aplicação existirem. O segundo `up --wait` exige cinco serviços saudáveis. Não existe override temporário de schemas nem schema falso. **Não há reset/drop/replay.** Falha parcial exige descartar somente o laboratório exclusivo e criar outro com segredos novos.

## Contrato de validação

Smoke aceita **apenas alvos descartáveis**. Ele limpa sua tabela REST temporária, objeto de prova Storage e login sintético; unidade/registro de auditoria de prova permanecem até a exclusão explícita dos volumes do **próprio** laboratório. Não contorna triggers nem apaga histórico.

O workflow [infra-validate](../.github/workflows/infra-validate.yml) executa verificação de Bash/ShellCheck, guards de alvo/caminho, Compose config, **cinco serviços exatos**, versões fixadas, portas protegidas, schemas, signup desabilitado e limites de arquivos. Credenciais geradas fora do checkout são ocultadas. Contêineres só rodam em runner efêmero.

**Healthcheck:** saúde dos contêineres, PostgreSQL 17 primário, Auth/REST/Storage via Kong, bytes/inodes livres e caminhos graváveis (limites mínimos de readiness 100 MiB/100 inodes, **não** dimensionamento de produção). Faz pequena escrita e exclusão real no Storage; falhas obrigatórias retornam erro.

**Smoke:** hashes atuais de migrations, objetos representativos, rejeição de cadastro público, login administrativo sintético, acesso anônimo negado, **quatro buckets privados** — dois de PDF (10 MiB), um `unit-covers` JPEG (1 MiB) e um `abc-source-files` XLSX (10 MiB) —, limites e MIME, schemas PostgREST expostos e negação de schemas privados, truncamento real de 1.001 linhas para 1.000. Verifica owner `postgres` de schemas da aplicação e funções `SECURITY DEFINER`, inclusive helpers privados; senha incorreta não autentica.

Teste de transporte: PDF pequeno enviado pelo Kong para bucket privado, URL assinada temporária (60 s), download no gateway loopback com comparação de todos os bytes, exclusão e verificação de que link antigo não funciona. Demonstra backend de arquivos configurado; testes RLS de domínio rodam **separadamente** na stack Supabase CLI de integração.

Teste negativo interrompe o Storage obrigatório, exige falha do healthcheck, restabelece Storage e exige saúde novamente. `docker stats` é informativo; não prova capacidade do host físico.

## Serviços omitidos e trabalho residual

Não há Realtime, Edge Functions, imgproxy, Supavisor, analytics/Logflare, Vector, Studio, postgres-meta nem Mailpit no perfil mínimo. SMTP, backend de Storage produtivo, chaves API opacas/assimétricas, backups, restore operacional, WAL/PITR, off-site, ingress/deploy e monitoramento **não estão implementados neste laboratório como solução de produção**.

Imagens usam tags de versão (não digest imutável); pinning por digest e política de atualização produtiva são decisões posteriores. Ver [UPSTREAM](supabase/UPSTREAM.md) para diferenças em relação à CLI 2.117.0.

**Produção: NO-GO.** Este guia não autoriza parada/exclusão de DEV compartilhado, C30, ERP ou ambientes persistentes.
