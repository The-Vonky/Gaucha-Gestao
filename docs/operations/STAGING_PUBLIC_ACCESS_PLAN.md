# STAGING — plano de acesso web para funcionários sem domínio próprio

**Status em 22/10/2026: proposta de implementação, NÃO publicada.** Objetivo do responsável: abrir um link HTTPS no navegador do celular ou PC, inclusive fora da empresa e em sub-redes diferentes, sem instalar clientes, VPN ou certificados privados nos dispositivos. Continua sendo **STAGING com dados sintéticos**, não produção.

## Decisão provisória e limites

- O proprietário prefere **um endereço de testes estável**, sem comprar domínio por enquanto. **ngrok com domínio de desenvolvimento reservado** foi escolhido como candidato a avaliar primeiro; conta, plano, nome DNS, token, agente e serviço de túnel **ainda não configurados**.
- Quick Tunnel/trycloudflare tem URL temporária e não atende bem ao compartilhamento recorrente do mesmo link; pode servir a diagnóstico descartável.
- Antes de depender de ngrok, confirmar no **plano vigente e na conta real**: reserva e permanência da URL, limites de tráfego/requisições, política de aviso intermediário no browser, compatibilidade de Auth/Storage, condições e custo. Não inventar SLA ou acesso “24h garantido”.
- **ADR-004 não é alterado por esse teste:** para produção aprovada, Cloudflare Workers Static Assets + DNS/WAF/Tunnel e R2 permanecem direções aceitas. Uma topologia temporária de testes não é autorização para mudar a arquitetura produtiva.

## Topologia desejada para STAGING público (TO-BE)

~~~mermaid
flowchart LR
  USERS["Navegadores PC / celular, redes diversas"] --> URL["URL HTTPS estável de testes, provida por serviço de túnel"]
  URL --> TUNNEL["Agente ngrok na C30, apenas saída"]
  TUNNEL --> CADDY["Caddy loopback: frontend + proxy API"]
  CADDY --> KONG["Kong 127.0.0.1:54321"]
  KONG --> AUTH["Auth"]
  KONG --> REST["PostgREST / RLS"]
  KONG --> STORAGE["Storage privado"]
  AUTH --> PG[("PostgreSQL C30 / HDD")]
  REST --> PG
  STORAGE --> PG
  STORAGE --> FILES["Bytes no HDD"]
~~~

Não redirecionar o túnel diretamente para 54321; entregar UI e APIs pela **mesma origem** do Caddy. Não publicar PostgreSQL, SSH, Studio, UI administrativa do Caddy, métricas, segredos ou portas de infraestrutura. Não alterar roteador MikroTik ou abrir encaminhamento de portas só para usar túnel de saída.

## Checklist obrigatório antes de enviar link

- [ ] Confirmar plano/URL estáveis e restrições de uso do provedor; registrar hostname aprovado sem authtoken no Git.
- [ ] Instalar o agente **somente na C30** por método oficial verificado; credenciais restritas/root-only em arquivo externo, nunca no shell history/README/bundle; service systemd somente após teste.
- [ ] Criar release **nova** com `VITE_SUPABASE_URL=https://HOSTNAME_PUBLICO` e somente `VITE_SUPABASE_PUBLISHABLE_KEY`/anon; não reutilizar bundle compilado para IP privado.
- [ ] Ajustar com controle e rollback `SITE_URL`, `API_EXTERNAL_URL`, redirect allowlist e configuração de Auth/Storage da **mesma origem pública**; reiniciar apenas serviços afetados após revisão, nunca todo Compose às cegas.
- [ ] Definir camada de proteção para teste: allowlist, autenticação adicional do provedor quando contratada/possível, controle de contas e desativação de signup; **o túnel e HTTPS não substituem RLS**.
- [ ] Validar HTTPS no browser e APIs Auth/REST/Storage, login/logout, sessão, refresh, anexos, erros, URLs assinadas e CORS/redirect em Chrome, Edge, Android e iOS fora da LAN.
- [ ] Criar contas individuais e papéis mínimos para funcionários de teste; auditar matrizes negativas por unidade, setores, usuário inativo e URLs adivinhadas; nunca distribuir conta administrativa.
- [ ] Fazer inventário de dados e ter recuperação minimamente testada antes de cargas relevantes; usar apenas **dados sintéticos** enquanto gates pendentes.
- [ ] Testar reinício controlado, reconexão do túnel, URL estável, telemetria e limite de uso. Preparar bloqueio rápido do acesso em incidente.
- [ ] Registrar resultado e aprovação humana de **STAGING para testes**, sem marcar produção GO.

## Transição futura

Quando houver domínio próprio/subdomínio corporativo autorizado, reavaliar ingresso e arquitetura produtiva conforme ADR-004. A troca de origem HTTPS normalmente exige **novo build Vite** e revisão de Auth/redirect, não apenas apontar DNS. No host único, disponibilidade depende da C30, energia, internet corporativa, limites do provedor e manutenção. Não prometer SLA.

Referências: [estado instalado](C30_STAGING_AS_BUILT_20261022.md), [runbook](C30_STAGING_RUNBOOK.md), [backups](C30_BACKUP_GAPS.md), [ADR-004](../decisions/ADR-004-platform-stack.md).
