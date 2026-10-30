# C30 STAGING — Cloudflare Tunnel: estado observado em 30/10/2026

**Natureza:** registro AS-BUILT do ambiente de **testes** relatado pelo operador e confirmado por saídas de terminal e testes manuais nesta data. Não constitui inspeção independente, auditoria de segurança, homologação integral, garantia de disponibilidade nem autorização de produção. **PROD NO-GO.** Histórico anterior: [fotografia de 22/10](C30_STAGING_AS_BUILT_20261022.md).

## Resultado e escopo

- **URL de testes operacional:** `https://teste.gauchagestao.online` (domínio próprio registrado na Hostinger; zona DNS ativa no plano Cloudflare Free).
- **Acesso:** HTTPS no navegador de PC e celular, por **Cloudflare Tunnel regular** (`gaucha-staging`) até Caddy na ThinkStation C30. O endereço público já foi aberto e login realizado.
- **Aplicação:** checkout local da C30 continua no commit **`f9f041e`**, branch `feat/c30-staging-persistente`, baseline com 18 migrations. O HEAD posterior da `main` **não** foi implantado por esta operação.
- **Continuidade de dados:** auditoria existente antes da interrupção por cota ngrok, histórico e imagens continuaram acessíveis. O operador relatou criação de nova auditoria, fotografia capturada no celular, upload, visualização e download bem-sucedidos.
- **Limite do teste:** o fluxo observado demonstra funcionamento básico, **não** comprova matriz negativa de RLS, controle de acesso por papel/unidade, performance sob carga, recuperação ou homologação de todos os dispositivos. Não tratar STAGING como PROD.

O ngrok Free anterior atingiu seu limite de transferência mensal (relato aproximado de 1 GB), tornando o acesso indisponível. A conexão anterior estava inativa no momento da troca; `ngrok.service` **não** existia com esse nome. Não concluir que o binário foi desinstalado ou que não existe outro mecanismo de inicialização.

## Topologia efetivamente implantada

~~~mermaid
flowchart LR
  U["Navegador PC / celular"] -->|HTTPS| CF["Cloudflare DNS / proxy"]
  CF --> T["Cloudflare Tunnel: gaucha-staging"]
  T -->|conexão de saída iniciada na C30| D["cloudflared / systemd"]
  D -->|HTTP loopback 127.0.0.1:4181| C["Caddy / Host: teste.gauchagestao.online"]
  C -->|SPA estática| W["release f9f041e-cloudflare"]
  C -->|/auth/v1, /rest/v1, /storage/v1| K["Kong 127.0.0.1:54321"]
  K --> A["Auth / GoTrue"]
  K --> R["PostgREST"]
  K --> S["Storage API"]
  A --> P[("PostgreSQL persistente C30")]
  R --> P
  S --> P
  S --> F["Arquivos em armazenamento persistente C30"]
~~~

A rota Cloudflare **Published application** usa hostname `teste.gauchagestao.online`, sem filtro de path, **Service URL** `http://127.0.0.1:4181`, configurações avançadas padrão. Não criar outra rota para APIs; frontend e três APIs usam a **mesma origem HTTPS**. O Tunnel é administrado pelo painel Cloudflare. Nenhuma porta de entrada do roteador precisou ser aberta; **PostgreSQL, SSH, Kong direto e administração não devem ser publicados**.

### Serviços, caminhos e isolamento

| Item | AS-BUILT observado |
| --- | --- |
| Host | Lenovo ThinkStation C30, Ubuntu Server 22.04.5 LTS, `x86_64` |
| DNS/proxy | `gauchagestao.online` ativo na Cloudflare Free, nameservers delegados pelo registrador Hostinger |
| Túnel | `gaucha-staging`, status **Healthy** no painel; teste temporário registrou quatro conexões QUIC e pré-verificações DNS/UDP/TCP/API PASS |
| Binário | `/usr/local/bin/cloudflared`, versão observada `2026.10.6` |
| Serviço | `/etc/systemd/system/cloudflared.service`, `active` e `enabled` |
| Inicialização | `ExecStart=/usr/local/bin/cloudflared tunnel run --token-file /etc/cloudflared/token` |
| Token | `/etc/cloudflared/token`, proprietário `root:root`, modo `0600`; **nunca divulgar/commitar seu conteúdo** |
| Caddy | `/etc/caddy/Caddyfile`; `active` após reload validado |
| Entrada Cloudflare | `http://teste.gauchagestao.online:4181` no Caddy, bind local `127.0.0.1:4181` |
| Release publicada | `/opt/gaucha-gestao/staging/web/releases/f9f041e-cloudflare` (`root:root`, leitura para Caddy) |
| Entrada local preservada | `127.0.0.1:4180`, hostname `127.0.0.1`, release original; entradas HTTPS locais anteriores 443/4443 mantidas |
| Backend | Compose `gaucha-staging`: `db`, `auth`, `rest`, `storage`, `kong` — cinco `healthy` após alteração |
| Variáveis de runtime | `/etc/gaucha-gestao/staging/staging.env`, `root:root`, `0600` |
| Persistência | PostgreSQL e bytes Storage permanecem no HDD persistente documentado no [AS-BUILT de 22/10](C30_STAGING_AS_BUILT_20261022.md) |

**Separação da arquitetura futura:** este STAGING usa Caddy para servir assets e Storage em disco da C30. **Não** implantamos Cloudflare Workers Static Assets, R2, novos WAF Rules ou uma política Cloudflare Access nesta operação. A arquitetura TO-BE de produção do [ADR-004](../decisions/ADR-004-platform-stack.md) permanece distinta.

## Alterações realizadas em 29–30/10

1. Domínio próprio `gauchagestao.online` registrado e DNS ativado na Cloudflare Free; hostname escolhido `teste.gauchagestao.online`.
2. Instalado `cloudflared` no Ubuntu via repositório da Cloudflare; credencial guardada em arquivo protegido (não no Git) e serviço systemd criado/habilitado. Testes QUIC e status Healthy confirmados.
3. Identificado por teste de host que `4180` só atendia ao host `127.0.0.1`, enquanto `4181` atendia o hostname ngrok anterior. Reaproveitada **somente** a entrada HTTP 4181.
4. Compilado frontend `f9f041e` com `VITE_SUPABASE_URL=https://teste.gauchagestao.online` e **chave anon existente** (papel JWT `anon` verificado localmente). `npm run build` e `npm run verify:build` passaram; bundle sem URL local antiga/ngrok e sem chave privilegiada conforme verificador existente.
5. Publicada quinta release imutável `f9f041e-cloudflare`, preservando `f9f041e-caddy4180`, `f9f041e-https-lan`, `f9f041e-ngrok` e `f9f041e-ssh`.
6. Backup de Caddyfile antes da troca: `/etc/caddy/Caddyfile.backup-20261030T112159Z`; candidato validado `/etc/caddy/Caddyfile.cloudflare.candidate`. Alterados no Caddy **somente** host 4181 e seu `root`; `caddy validate` e `systemctl reload caddy` concluíram, retornando HTML HTTP 200 na rota `/`.
7. Backup do ambiente: `/etc/gaucha-gestao/staging/staging.env.backup-20261030T112932Z` (`0600`); candidato `staging.env.cloudflare.candidate`. Substituído o hostname antigo nas variáveis `SITE_URL`, `API_EXTERNAL_URL` e na ocorrência correspondente em `ADDITIONAL_REDIRECT_URLS`; outras entradas de redirecionamento preservadas.
8. Comparação JSON de Compose comprovou **somente** quatro variáveis alteradas para Auth (`API_EXTERNAL_URL`, `GOTRUE_JWT_ISSUER`, `GOTRUE_SITE_URL`, `GOTRUE_URI_ALLOW_LIST`) e uma para Storage (`STORAGE_PUBLIC_URL`). Recriados **apenas** `auth` e `storage` com `docker compose up -d --no-deps --force-recreate --no-build --pull never --wait`, mantendo `db`, `rest`, `kong` intactos e saudáveis.
9. Adicionada rota pública no Tunnel; testes locais retornaram `/` **200** com HTML (466 bytes) e `/auth/v1/health` **401** sem apikey (compatível com proteção do Kong; não interpretar como teste completo de Auth). Login pelo navegador e testes manuais de evidências passaram em PC e celular.

**Não foram executados:** `git pull` na C30, atualização do checkout, migrations, reset do banco, `docker compose down`, `down -v`, prune, instalação de produção, troca do storage para R2 ou abertura de portas no roteador.

## Testes e situação de aceite

| Teste | Evidência relatada | Escopo |
| --- | --- | --- |
| DNS e Tunnel | Zona Active; Tunnel Healthy; conexões QUIC e pré-check PASS | Conectividade |
| Caddy / frontend | HTTP 200, HTML pela porta 4181 e hostname correto | Servir SPA |
| Autenticação | Login pelo endereço HTTPS novo | Caminho feliz Auth |
| Persistência prévia | Auditoria interrompida pelo ngrok, histórico e fotos visíveis | Continuidade dos registros |
| Novas operações | Nova auditoria, fotografia no celular, upload, visualização e download | Fluxo feliz REST/Storage |
| Dispositivos | PC e celular usados pelo operador | Amostra limitada |
| Negativas / RLS | **Não demonstradas nessa migração** | Pendente |
| Backup e restauração independente | **Não demonstrados** | Pendente |
| Reinício completo da C30 após Cloudflare | **Não relatado/testado** | Pendente |

Os testes são **relato do operador, não certificação independente**. Não afirmar carga ilimitada, SLA ou compatibilidade total com todos os navegadores. O Cloudflare Tunnel Free não corresponde à cota de transferência mensal do ngrok Free que motivou a troca, mas uso de mídia continua sujeito aos termos/limites do provedor; otimização de imagens ainda é recomendável.

## Riscos e controles pendentes

- **STAGING acessível na internet:** o endereço público apresenta a autenticação Supabase; **Cloudflare Access não foi configurado/comprovado**. Confirmar usuários autorizados, signup desabilitado, RBAC/RLS e matriz negativa antes de liberar amplamente; proteger logs e URLs assinadas.
- **Dados e continuidade:** existe histórico preservado, mas **backup off-site, cópia independente dos objetos e restore funcional da versão atual não foram demonstrados**. HDD envelhecido permanece risco físico. Ver [lacunas de backup](C30_BACKUP_GAPS.md).
- **Imagens:** uploads/descargas e previews originais podem consumir tráfego; não adicionar cache compartilhado para `/auth/v1`, `/rest/v1` ou `/storage/v1`. O plano Free possui limite por requisição de upload; tamanho da aplicação segue limitado a 10 MiB por objeto.
- **Disponibilidade:** depende da C30, energia, rede, DNS e Cloudflare. Verificar reinício pós-implantação, alertas e monitoramento.
- **Separação de ambientes:** URL de testes não é `app.gauchagestao.online` de produção. **PROD NO-GO**, independentemente da confirmação visual de login e fotos.

Para verificações diárias, diagnóstico e retorno controlado, consultar [runbook Cloudflare C30](C30_STAGING_CLOUDFLARE_RUNBOOK.md). Este registro **não** substitui o procedimento de atualização de versão/migrations da C30.
