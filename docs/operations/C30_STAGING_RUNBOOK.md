# Runbook seguro — C30 STAGING (consulta e diagnóstico)

**Aplicável somente à instância persistente C30 STAGING já existente.** Não substitui procedimento de implantação inicial, restauração ou produção. Estado-base: [AS-BUILT 22/10/2026](C30_STAGING_AS_BUILT_20261022.md). Executar comandos de consulta **na C30**, conferindo o hostname e o projeto antes de qualquer ação de mudança.

## Verificações não destrutivas

~~~bash
hostnamectl
findmnt /armazenamento2
sudo systemctl status gaucha-staging.service --no-pager
sudo systemctl status caddy.service --no-pager
sudo ss -lntp
sudo docker ps --filter name=gaucha-staging --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
sudo journalctl -u gaucha-staging.service -n 80 --no-pager
sudo journalctl -u caddy.service -n 80 --no-pager
~~~

O projeto Compose operacional é **gaucha-staging** (cinco serviços). Não confundir com o laboratório do [infra/README](../../infra/README.md), que admite descarte *somente* do seu projeto efêmero. Estado `healthy` não demonstra permissões, backup nem compatibilidade da aplicação.

## Testes HTTP locais, sem credenciais

~~~bash
curl --noproxy '*' -sS -o /dev/null -w 'UI 4180: %{http_code}\n' http://127.0.0.1:4180/
curl --noproxy '*' -sS -o /dev/null -w 'REST sem token: %{http_code}\n' http://127.0.0.1:4180/rest/v1/
sudo ss -lntp | grep -E ':(443|4443|4180|54321)[[:space:]]'
~~~

Espera-se UI 200 e REST 401, com portas 443/4443/4180/54321 em **127.0.0.1**. Esses testes não exercitam login nem RLS de negócio. Para HTTPS com verificação real, informar a CA local apenas em diagnóstico autorizado; não usar `-k` com sessões, senhas ou tokens.

## Disponibilidade após reinicialização

- `gaucha-staging.service` está enabled e foi validado em reboot real; requer o mount do HDD.
- `caddy.service` foi enabled em 22/10/2026. **Reboot posterior ainda precisa ser provado**.
- Em qualquer falha de mount, checar `findmnt /armazenamento2` **antes** de intervir. Não iniciar Compose sobre diretório vazio do SSD, sob risco de banco aparentemente novo.
- Não usar `docker compose up -d`, `down`, `down -v` ou `docker restart` indiscriminadamente: a configuração de ambiente e o start persistente têm pré-checagens.
- Recuperação que envolve modificação, reinício ou rollback requer janela de manutenção, evidência e autorização do responsável; registrar data e resultado.

## Configuração e riscos

- Compose fora do checkout, em `/opt/gaucha-gestao/staging/infra/supabase/`; configuração sensível exclusivamente em `/etc/gaucha-gestao/staging/staging.env` (0600).
- Caddy: `/etc/caddy/Caddyfile`, com backups históricos no mesmo diretório. Preferir `caddy validate` e recarga controlada, não apagar certificados.
- Build e release em `/opt/gaucha-gestao/staging/web/releases/`; URLs `VITE_*` são **compiladas**, não atualizadas no bundle ao mudar env de runtime.
- Até publicar hostname HTTPS estável, não trocar `SITE_URL`/`API_EXTERNAL_URL` ou abrir porta 443/roteador por tentativa e erro.
- Não gravar dumps em Git, não imprimir `SERVICE_ROLE_KEY`/JWT, não compartilhar logs com tokens ou credenciais.

## Se algo falhar

| Sintoma | Investigação segura |
| --- | --- |
| Interface 4180 indisponível | Estado Caddy, socket loopback, logs, root de release |
| Login falha no Windows via túnel | Verificar origem `VITE_SUPABASE_URL` compilada; verificar túnel e Auth; não redefinir credenciais |
| API 401 sem token | **Esperado** no Kong; autenticação só deve ser testada com credenciais por canal autorizado |
| DB ausente após reboot | **Não recriar volumes**; investigar montagem HDD, unidade systemd e serviços de pré-verificação |
| TLS falha | Verificar Caddy, `default_sni`, certificado de origem e SNI; não desabilitar validação para login |
| Disco antigo gera alerta | Preservar dados, suspender mutações de risco, priorizar backup externo e substituição planejada |

Antes de executar qualquer restauração ou aplicação de migration em STAGING, cumprir [plano de recuperação](C30_BACKUP_GAPS.md) e [guia de atualização](C30_STAGING_RELEASE_GUIDE.md).
