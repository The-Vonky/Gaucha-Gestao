# Runbook — acesso externo STAGING C30 via Cloudflare Tunnel

**Aplicação:** `https://teste.gauchagestao.online` — STAGING, não produção. **Estado de referência:** [AS-BUILT 30/10/2026](C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md). Este runbook é para diagnóstico e mudança **controlada** no ambiente persistente, não um script de provisionamento cego.

## Consulta rápida (não altera estado)

~~~bash
systemctl is-active caddy cloudflared gaucha-staging
systemctl is-enabled cloudflared caddy
sudo systemctl status cloudflared --no-pager
sudo systemctl status caddy --no-pager
~~~

Verificar **Tunnel Healthy** no painel Cloudflare (Tunnel `gaucha-staging`) e se a rota publicada `teste.gauchagestao.online` aponta a `http://127.0.0.1:4181`. O status Healthy mede conexão conector–Cloudflare, **não** a saúde do frontend ou do Auth.

~~~bash
# O host correto é indispensável: sem ele o Caddy pode responder 200 com corpo vazio.
curl --noproxy '*' -sS --max-time 10 -o /dev/null \
  -H 'Host: teste.gauchagestao.online' \
  -w 'Frontend: HTTP %{http_code}, tipo %{content_type}, bytes %{size_download}\n' \
  http://127.0.0.1:4181/

curl --noproxy '*' -sS --max-time 10 -o /dev/null \
  -H 'Host: teste.gauchagestao.online' \
  -w 'Auth sem apikey: HTTP %{http_code}\n' \
  http://127.0.0.1:4181/auth/v1/health

sudo docker compose \
  --env-file /etc/gaucha-gestao/staging/staging.env \
  -p gaucha-staging \
  -f /opt/gaucha-gestao/staging/infra/supabase/docker-compose.yml \
  -f /opt/gaucha-gestao/staging/infra/supabase/docker-compose.staging-persistente.yml \
  ps --all
~~~

**Referência observada:** frontend HTTP 200 com HTML/bytes não nulos; `/auth/v1/health` HTTP 401 sem apikey é compatível com Kong e não prova falha de login; cinco serviços Docker `healthy`. Para teste completo, realizar login com **conta individual de teste**, ver auditoria de teste, prévia, envio/download e sessão, inclusive rede celular externa. Não fazer mudanças em auditorias reais como diagnóstico.

### Diagnóstico sem expor segredos

~~~bash
sudo journalctl -u cloudflared --since '30 minutes ago' --no-pager
sudo journalctl -u caddy --since '30 minutes ago' --no-pager
sudo ss -ltnp | grep -E ':(4180|4181|443|4443|54321)\b' || true
sudo stat -c '%a %U:%G %n' /etc/cloudflared/token \
  /etc/gaucha-gestao/staging/staging.env
~~~

Antes de compartilhar logs em chat/issue, **remover** tokens, cookies, credenciais, JWT, e-mails, identificadores pessoais, URLs assinadas e outros dados sensíveis. Nunca `cat` o token ou o `staging.env`, nem publicar `docker compose config` completo. Não copiar arquivos de ambiente para o Git.

### Falhas mais prováveis

| Sintoma | Verificar primeiro |
| --- | --- |
| Erro Cloudflare 1033 / rota indisponível | `cloudflared` ativo, Tunnel Healthy, rota DNS/hostname correta |
| 502 ou 503 com Tunnel Healthy | entrada HTTP 4181, `Host: teste.gauchagestao.online`, Caddy ativo e origin configurado |
| HTTP 200 com **0 bytes** | Host incorreto; `4180` atende `127.0.0.1`, não o hostname Cloudflare |
| Tela abre, login falha | bundle com `VITE_SUPABASE_URL` correto; Caddy → Kong/Auth, `SITE_URL`, `API_EXTERNAL_URL`, URI allowlist e apikey |
| Fotos não aparecem/baixam | `/storage/v1` via mesmo host, status do Storage, autorização, URLs assinadas, tamanho de upload, erros no navegador |
| Erro TLS em 443/4443 no teste com nome novo | portas locais configuradas para outro host/certificado; **não** apontar o Tunnel para elas sem plano |
| Após reboot serviço não volta | `cloudflared.service` enabled; verificar dependências de montagem HDD e `gaucha-staging.service`; não iniciar Compose sobre HDD desmontado |

## Mudanças e retorno: controles obrigatórios

**Antes de qualquer mudança:** confirmar operador autorizado, estado dos cinco serviços, montagem de `/armazenamento2`, saúde de armazenamento e backup recuperável adequado ao risco. O histórico de backups da C30 tem lacunas; não assumir restore validado. Congelar checkout `f9f041e`, não `git pull` ou aplicar migrations como efeito colateral de DNS.

**Arquivos de referência (conteúdo protegido):**

- Caddy atual: `/etc/caddy/Caddyfile`; backup pré-migração `/etc/caddy/Caddyfile.backup-20261030T112159Z`.
- Candidato Caddy da migração: `/etc/caddy/Caddyfile.cloudflare.candidate` (fonte auxiliar; não precisa ser idêntico a configurações futuras).
- Env atual: `/etc/gaucha-gestao/staging/staging.env`; backup pré-migração `staging.env.backup-20261030T112932Z` no mesmo diretório; modo `0600`/root.
- Frontend atual: `/opt/gaucha-gestao/staging/web/releases/f9f041e-cloudflare`; releases antigas preservadas.
- Cloudflared: `/etc/systemd/system/cloudflared.service` e arquivo secreto `/etc/cloudflared/token` (root-only).

**Para build de novo hostname:** `VITE_SUPABASE_URL` é incorporada ao JavaScript pelo Vite. Um apontamento DNS ou mudança em env do Docker **não** modifica bundles já publicados. Preparar release imutável nova com chave **anon/publishable**, verificar `npm run build` e `npm run verify:build` antes do cutover. Não publicar `service_role`/JWT privilegiado; não commitar `.env`.

**Para Auth/Storage:** o Compose está fora do checkout, em `/opt/gaucha-gestao/staging/infra/supabase`. O serviço systemd `gaucha-staging` usa `docker compose ... start --wait`, que **não** atualiza variáveis em contêineres existentes. Na migração 30/10, comparação do `config --format json` entre atual/candidato mostrou mudança exclusivamente em `auth` e `storage`; só esses dois foram recriados com `up -d --no-deps --force-recreate --no-build --pull never --wait`. **Não generalizar para futuras alterações**: comparar serviços e volumes novamente antes de decidir.

**Recuperação de mudança de URL (plano, não execução automática):**

1. Se houve erro após a publicação, suspender **a rota Published application** no painel Cloudflare ou parar temporariamente o `cloudflared` para retirar o acesso público, preservando os dados. Qualquer interrupção deve ser coordenada e comunicada.
2. Conferir arquivos de backup/candidatos e diferenças; não sobrescrever um arquivo que possa ter sido modificado posteriormente sem revisão.
3. Para retorno ao host antigo, restaurar **conjuntamente** Caddyfile e `staging.env` anteriores, validando Caddy antes do reload; recriar **somente** serviços com variáveis alteradas para que Auth e Storage realmente absorvam o env restaurado. Um `systemctl restart gaucha-staging` isolado não aplica essas variáveis. Não fazer `down`, `down -v`, `prune`, reset ou reinício geral.
4. **Limitação:** o ngrok antigo excedeu a franquia; restaurar o hostname anterior **não** restabelece automaticamente acesso externo. Preferir corrigir o novo hostname com rollback de Caddy/release dirigido.
5. Conferir cinco contêineres saudáveis, login, download e dados preexistentes antes de reabrir a rota.

Para mudança de versão de aplicação ou schema (e não só hostname), seguir [guia de release/migrations](C30_STAGING_RELEASE_GUIDE.md); migrações não são reversíveis por simples rollback do frontend.

## Segurança, dados e validações pendentes

- A publicação Cloudflare **não** equivale a Cloudflare Access. Sem evidência de política Access, tratar a tela de login como exposta publicamente. Não habilitar `Under Attack` ou desafios genéricos sobre APIs sem testar Auth/Storage.
- Não ativar cache compartilhado de respostas privadas em `/auth/v1`, `/rest/v1`, `/storage/v1` e URLs assinadas.
- Não liberar acesso amplo a funcionários antes de verificar escopo, roles, RLS negativo, contas individuais e tratamento de dados. Os testes atuais são caminhos felizes relatados pelo operador.
- Testar backup independente de DB + roles + bytes Storage, restore em ambiente isolado, monitoramento, reconexão pós-reboot e alertas. O HDD persistente segue risco; ver [lacunas](C30_BACKUP_GAPS.md).
- Cloudflare Free não tem a cota de 1 GB/mês do ngrok Free aplicada indistintamente ao Tunnel regular; **não prometer transferência ilimitada contratual**, especialmente mídia pesada. Medir tráfego, erros e tamanho de fotos; políticas de cache/thumbnail exigem design separado.

**Estado geral: STAGING operacional para testes controlados; PROD NO-GO.**
