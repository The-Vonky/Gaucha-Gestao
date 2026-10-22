# C30 — STAGING persistente: inventário AS-IS (22/10/2026)

**Natureza:** fotografia operacional relatada e confirmada por saídas de terminal em 20–22/10/2026; não é inspeção independente nem aprovação de produção. **PROD NO-GO.** O checkout instalado não acompanha automaticamente a main.

## Identidade e versão

| Item | Estado observado |
| --- | --- |
| Host | Lenovo ThinkStation C30, Ubuntu Server **22.04.5 LTS**, SSH ativo |
| Rede | Interface `eno1`, IPv4 **estático** (`dhcp4: false`), gateway via MikroTik. Endereço omitido neste repositório público; consultar inventário operacional restrito |
| Código implantado | Commit **`f9f041e`**; não presumir que o HEAD atual da main está implantado |
| Stack | Projeto Docker Compose **`gaucha-staging`**, cinco contêineres `db`, `auth`, `rest`, `storage`, `kong`, todos reportados saudáveis |
| Versões das imagens observadas | `supabase/postgres:17.6.1.136`, `supabase/gotrue:v2.196.0`, `postgrest/postgrest:v14.17`, `supabase/storage-api:v1.74.0`, `kong/kong:3.9.3` |
| Schema de negócio no STAGING | **18 migrations** do baseline `f9f041e`, aplicadas com manifesto SHA-256 conferido; `core`, `audit`, `action_plans`, `abc` |
| Conta de bootstrap | Um administrador global autenticou com sucesso; não registrar identificação, senha, JWT ou detalhes pessoais |
| Persistência | SSD para sistema/serviços; HDD separado de ~1 TB montado em `/armazenamento2` para PostgreSQL e bytes de objetos |
| Risco físico | HDD de idade elevada (~79 mil horas SMART registradas, status PASS no teste relatado); **não** equivale a confiabilidade nem substitui backup |
| Início no boot | `gaucha-staging.service` **active/enabled**, testado após reboot; `caddy.service` **active/enabled** desde 22/10, ainda **sem teste de reboot após a habilitação** |
| Backup | Dumps locais manuais e arquivo de roles; restauração dos dumps atuais, backup de objetos, automação e off-site **não comprovados** |
| Acesso público | **Não publicado**; ngrok gratuito considerado para testes com endereço fixo, **não instalado/configurado** nesta fotografia |

Em 22/10/2026, a main do GitHub estava 33 commits à frente de `f9f041e` e possuía **19** arquivos de migration. Esta contagem é fotografia datada, não instrução de aplicar a 19ª migration automaticamente. Novos contratos/UI da main podem exigir atualização coordenada de banco, Auth e objetos.

## Armazenamento e isolamento

- Dados PostgreSQL: `/armazenamento2/gaucha-gestao/staging/postgres`.
- Configuração persistente DB: `/armazenamento2/gaucha-gestao/staging/db-config`.
- Bytes de objetos Storage: `/armazenamento2/gaucha-gestao/staging/storage`.
- Compose operacional: `/opt/gaucha-gestao/staging/infra/supabase/docker-compose.yml` com override `docker-compose.staging-persistente.yml`.
- Segredos **somente no host**: `/etc/gaucha-gestao/staging/staging.env`, proprietário root e modo 0600; **não copiar para Git, PR ou chat**.
- Gateway Kong: `127.0.0.1:54321`, somente loopback; banco não tem porta publicada pelo host.
- Serviço de inicialização: `gaucha-staging.service` exige HDD montado e verificações prévias; contêineres têm política Docker de reinício `no` para não recriar projeto automaticamente.
- Projeto, paths e dados persistentes **não** são descartáveis. Não executar `down -v`, `docker prune`, `git clean`, `db reset` ou aplicação cega de migrations.

## Frontend, Caddy e TLS observados

Caddy v2.11.7 e releases estáticas imutáveis:

| Release | Uso observado |
| --- | --- |
| `f9f041e-ssh` | Primeira versão por Vite preview/SSH; preservada |
| `f9f041e-caddy4180` | Frontend via Caddy `127.0.0.1:4180`; Supabase URL compilada para a mesma origem; login administrativo confirmado com **apenas** túnel 4180 |
| `f9f041e-https-lan` | Supabase URL compilada para HTTPS do IP interno, atualmente atendida por Caddy somente em `127.0.0.1:443`; sem login via LAN ou internet confirmado |

Caddyfile: `/etc/caddy/Caddyfile`. Entradas observadas: HTTP `127.0.0.1:4180`, HTTPS `127.0.0.1:4443` e HTTPS `127.0.0.1:443`; todas escutam **somente loopback**. Rotas `/auth/v1`, `/rest/v1` e `/storage/v1` encaminhadas para Kong. Frontend SPA usa fallback a `index.html`.

Autoridade `tls internal` emitida pelo Caddy; opção `default_sni` para IP interno resolveu a seleção de certificado no curl sem SNI; `skip_install_trust` evita instalação automática. Certificado verificado com `curl --cacert` no host (**HTTP 200** para frontend, **401** esperado em REST sem credenciais). Windows confirmou HTTP 200 usando o certificado público e `--ssl-revoke-best-effort`, pois Schannel informou estado de revogação desconhecido; isso **não** aprova a política de confiança/revogação para usuários. Certificado raiz ainda não distribuído como autoridade confiável aos computadores. Não enviar sua **chave privada**.

## Evidências e limites

1. Testes proxy Caddy com autorização privilegiada **somente em loopback**: Auth, PostgREST e Storage retornaram HTTP 200 sem imprimir chaves.
2. Login administrativo pela porta 4180 com túnel de 54321 fechado no Windows: **PASS**.
3. HTTPS porta 443: frontend 200 e REST sem credencial 401 com CA informada, **sem `-k`**, **PASS** apenas local.
4. UFW **inactive**, iptables INPUT ACCEPT no instante observado. SSH escuta porta 22 em IPv4/IPv6; acesso efetivo externo depende também da rede/MikroTik. **Não presumir host endurecido**.
5. **Não executados:** teste de acesso direto LAN na porta 443, acesso público, criação de usuário comum, matriz negativa de RLS em staging, backup off-site, restauração independente da configuração atual, aceites P1–P9/O1–O8, medição de capacidade e reboot após habilitar Caddy.

Em particular, instalar e iniciar infraestrutura de STAGING **não equivale** a concluir o aceite físico ou emitir GO de PROD do [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md).

**Referências:** [runbook C30](C30_STAGING_RUNBOOK.md), [backups](C30_BACKUP_GAPS.md), [plano de acesso externo](STAGING_PUBLIC_ACCESS_PLAN.md), [procedimento de atualização](C30_STAGING_RELEASE_GUIDE.md).
