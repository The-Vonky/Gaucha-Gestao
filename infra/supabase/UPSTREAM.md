# Proveniência do Supabase upstream

**Documento de rastreabilidade técnica em pt-BR; não é autorização de implantação.** Baseline histórica da aplicação: `e7ed7d5167d4b7e592532df0830d6b2744d96eff`. Execução CI histórica: [36889526091](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/36889526091), dois jobs aprovados. Revisar os checks do HEAD atual antes de usar essa evidência.

## Origem oficial fixada

Usar release [`supabase/supabase self-hosted/v0.8.1`](https://github.com/supabase/supabase/releases/tag/self-hosted/v0.8.1), de 09/09/2026, commit resolvido **`8c7a4d9dbbaf8b552893822e89d7bf06f33f9220`**. Objeto de tag anotada: `690080884040e238926ba22606e8c05a3536829b`.

Arquivos de referência: `docker/docker-compose.yml`, `docker/docker-compose.kong.yml`, `docker/volumes/api/kong.yml`, `kong-entrypoint.sh`, `docker/volumes/db/roles.sql`, `jwt.sql` e `docker/CHANGELOG.md`. A seleção usa **commit fixo**, não `latest` ou branch móvel.

O release v0.8.1 fornece PostgreSQL 17 e override oficial para Kong. Desde v0.8.0, gateway padrão do upstream é Envoy; este projeto escolhe o override de **Kong suportado pelo próprio upstream**, para obedecer ao brief. A versão da **CLI 2.117.0 não é a versão do Compose**.

## Comparação de imagens com Supabase CLI descartável

A [CLI v2.117.0](https://github.com/supabase/cli/tree/21db855916f2c2b12f61cde923a27094b8528b23), commit `21db855916f2c2b12f61cde923a27094b8528b23`, objeto de tag `cdcb8e4a8bc8d10658f194186d39739f43c04d1b`, mantém versões na `apps/cli-go/pkg/config/templates/Dockerfile`; foram cotejadas com pull de imagens na CI `110461309280`.

| Component | CLI 2.117.0 / existing CI | Official self-hosted v0.8.1 / this PR |
| --- | --- | --- |
| PostgreSQL | `supabase/postgres:17.6.1.167` | `supabase/postgres:17.6.1.136` |
| Kong | `library/kong:2.8.1` | `kong/kong:3.9.3` |
| Auth | `supabase/gotrue:v2.196.0` | `supabase/gotrue:v2.196.0` |
| PostgREST | `postgrest/postgrest:v16.2` | `postgrest/postgrest:v14.17` |
| Storage | `supabase/storage-api:v1.72.1` | `supabase/storage-api:v1.74.0` |

A CLI espelha imagens via `public.ecr.aws/supabase`. Os nomes da tabela representam **imagens-fonte**, sem provar equivalência de digests entre registros. Preservar a combinação compatível do self-hosted publicado; **não inventar híbrido** com versões da CLI. Auth coincide, PostgreSQL permanece major 17, mas REST e Storage diferem e precisam de testes reais de migrations/contratos/API. Tags não garantem imutabilidade de registry.

## Redução controlada para o perfil mínimo

- Apenas `db`, `kong`, `auth`, `rest`, `storage`; remover serviços/rotas opcionais (Studio/Meta, Realtime, Functions, analytics, pooler etc.).
- Incorporar override oficial do Kong ao Compose base; remover listener HTTPS do laboratório e expor HTTP **somente em loopback**; PostgreSQL sem porta publicada.
- Manter topologia Auth/REST/Storage; remover transformação de imagem/imgproxy. Configurar schemas atuais, limite PostgREST de **1.000 linhas**, cadastro público desativado e limite global de **10 MiB**; buckets individuais são criados pelas migrations da aplicação.
- Preservar inicialização de papéis JWT/senha da origem, restringindo senhas de papéis aos serviços usados. Desativar logs SQL que possam expor material de assinatura. SQL de roles opcionais Realtime/webhooks/analytics/pooler é omitido conforme adaptação.
- Persistir dados DB, configuração DB e arquivos em **volumes nomeados isolados**; adicionar marcador exclusivo de instância nova.
- Manter entrypoint upstream do Kong com somente rotas/consumidores necessários. Suporte a API keys opacas permanece não configurado; chaves JWT legadas efêmeras atendem ao contrato atual do cliente.
- Acrescentar `scripts/ops/common.sh` para validação explícita de alvo e `volumes/db/99-target.sql` para marcar bancos **novos** de laboratório.

Fonte upstream pinada: <https://github.com/supabase/supabase/tree/8c7a4d9dbbaf8b552893822e89d7bf06f33f9220/docker>.

**Não** afirmar prontidão produtiva, capacidade física nem bootstrap idêntico entre CLI e self-hosted.

## Rastreabilidade de arquivos e hashes

**Arquivo de origem não modificado**: `volumes/api/kong-entrypoint.sh`, SHA-256 `399394576635f7477dfee32e870f509567fc496f0dc86a5a6611f58d1099031f`.

Arquivos upstream **adaptados, não cópias idênticas em bytes**: `roles.sql` SHA-256 de origem `3ad717b225daa38aa982da26750f35641eb404e1eb5e69a763c22236ab96c1b2`; `jwt.sql` SHA-256 `1cc94a4f16f6e2932b383cd68e211a96bcae298437ca4120d8a5106396c58465`. Adaptações removem senhas Pooler/Functions e desativam logs SQL de statements/queries com erros. `log_min_messages=fatal` do upstream é preservado e logging de statements/erros é restringido no startup, evitando vazamento de credenciais.

## Inicialização e prontidão

São **duas fases**: DB/Auth/Storage/Kong saudáveis antes das migrations da aplicação; REST saudável após criar `core`, `audit`, `action_plans` e `abc`. Kong/Storage dependem de REST iniciado, não necessariamente com cache completo de schemas. Os dois waits têm timeout. `PGRST_DB_SCHEMAS` nunca é reduzido temporariamente.

A verificação IPv4 do Storage usa `127.0.0.1`, não `localhost`: o processo escuta IPv4, enquanto wget pode resolver `localhost` para IPv6 primeiro. Diagnósticos devem ser **sanitizados**, nunca exibir envs.

Os blocos YAML do Kong mantêm aspas do upstream. O entrypoint insere expressões Lua com aspas simples; trocar escalares para YAML com aspas simples corromperia o arquivo expandido. Rotas reduzidas mantêm semântica e template de chave legado é validado por parse.

## Papel da migration e propriedade

A imagem DB `supabase/postgres:17.6.1.136` corresponde a [commit upstream `d156ba65`](https://github.com/supabase/postgres/tree/d156ba65c14694c12cc5e782bc15b9b8ed2d1376). `migrations/db/migrate.sh` define PGPASSWORD de POSTGRES_PASSWORD e cria login `postgres` com essa senha na primeira inicialização. `pg_hba.conf.j2` usa SCRAM para rede Docker e trust em localhost.

Migrations da aplicação autenticam como `postgres` via hostname `db`; marcador/ledger pertencem ao helper de infraestrutura. CI valida login com senha correta, rejeição da incorreta e owner real dos schemas/funções `SECURITY DEFINER`. **Não alterar owners após as migrations.**

**Produção NO-GO:** esse documento descreve origem e adaptações do laboratório, não configuração de host físico ou R2/Cloudflare já provisionados.
