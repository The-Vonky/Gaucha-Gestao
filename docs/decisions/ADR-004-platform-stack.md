# ADR-004 — Stack tecnológica da plataforma

**Status: Aceito — escolha do host físico substituída pelo ADR-008**  
**Data: 24/09/2026**

> **Parcialmente substituído pelo [ADR-008](ADR-008-production-host-thinkstation-c30.md), de 15/10/2026.** O host físico escolhido passa a ser uma **Lenovo ThinkStation C30 dedicada, com Ubuntu Server LTS bare metal**, no lugar da HP ProLiant ML350 e da VM Linux. **Todas as outras decisões deste ADR permanecem válidas.** Referências específicas à ML350 abaixo são históricas, não instruções atuais de implantação.

## Decisão

A Gaúcha Gestão utilizará a seguinte stack:

### Frontend
- React;
- TypeScript;
- Vite;
- Cloudflare Workers Static Assets para entrega em produção.

### Backend e plataforma de dados
- Supabase Self-Hosted;
- PostgreSQL;
- Supabase Auth;
- PostgREST;
- Realtime;
- Storage API;
- Supavisor quando pool de conexões for adequado;
- topologia/gateway oficiais do Supabase preservados, salvo alteração em novo ADR aceito.

**Distinção entre decisão e execução:** Realtime e Supavisor aparecem na direção de plataforma aceita, mas **não integram o perfil mínimo de cinco serviços validado na CI** ([ADR-006, ainda proposto](ADR-006-infra-v1-reused-hardware.md)). Não declarar serviços opcionais como executados sem prova.

### Armazenamento de arquivos
- Supabase Storage API;
- Cloudflare R2 como backend de objetos S3 compatível preferencial para produção.

### Infraestrutura
- ~~HP ProLiant ML350 como primeiro host físico~~ (**substituído pelo ADR-008**);
- ~~VM Linux~~ (**substituída por Ubuntu diretamente no hardware**);
- Ubuntu Server LTS;
- Docker Engine;
- Docker Compose.

### Borda e entrada
- Cloudflare DNS;
- Cloudflare WAF;
- Cloudflare Tunnel;
- sem exigência de portas públicas de entrada no host on-premises.

### CI/CD
- GitHub e GitHub Actions;
- validação antes de deploy;
- deploy produtivo controlado;
- nenhuma implantação implícita em produção a partir de uma tarefa comum.

### Operação
- backups automatizados de PostgreSQL;
- backups lógicos;
- backup físico/base + arquivamento WAL para PITR;
- cópia externa (*off-site*);
- testes periódicos de restauração;
- automação de provisionamento/recuperação por Ansible;
- observabilidade de host, contêineres, PostgreSQL, serviços Supabase, Tunnel e backup;
- telemetria de erro do frontend com ferramenta aprovada sob análise de privacidade, como Sentry.

**Esses itens de operação são requisitos TO-BE, não instalações comprovadas.** Evidência atual: [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md) e [restauração sintética](../planning/02_RESTORE_DRILL.md).

## Topologia prevista para produção (TO-BE)

~~~text
                       INTERNET
                          |
                          v
                     CLOUDFLARE
                    DNS/WAF/CDN
                   /           \
                  v             v
     React/Vite: assets     Cloudflare Tunnel
       Workers Static             |
                                  v
                           Gateway Supabase
                                  |
              +-------------------+-------------------+
              |                   |                   |
              v                   v                   v
             Auth             PostgREST           Realtime
              |                   |                   |
              +-------------------+-------------------+
                                  |
                                  v
                              PostgreSQL
                                  ^
                                  |
                              Supavisor
                                  ^
                                  |
                       clientes com pool,
                          quando necessário

                         Storage API
                              |
                              v
                         Cloudflare R2
~~~

As conexões internas devem seguir a topologia self-hosted **suportada pelo upstream**. Supavisor não é caminho obrigatório para todo serviço Supabase. **Este desenho não é um diagrama do runtime atual**; consultar [DIAGRAMS](../architecture/DIAGRAMS.md).

## Decisões de segurança

- PostgreSQL não será exposto publicamente.
- Segredos/credenciais produtivas não entrarão no Git.
- Browser nunca receberá credenciais PostgreSQL ou segredos privilegiados Supabase.
- Supabase Studio/administração técnica não poderão ser expostos publicamente sem controles adicionais.
- Autorização da aplicação permanece baseada em **permissão + escopo organizacional**.
- Cloudflare Tunnel protege transporte/entrada, **não substitui autorização de negócio**.
- Arquivos sensíveis permanecem sujeitos à autorização da aplicação e do Storage.

## Decisões de implantação

- Docker Compose é o orquestrador aceito para a v1.
- Kubernetes e orquestração multi-host ficam fora do escopo sem necessidade concreta.
- Indisponibilidade pequena e controlada durante deploy é inicialmente aceitável.
- Blue/green não é requisito da v1.
- Atualização automática produtiva no estilo Watchtower **não é permitida**.
- Versões do Supabase devem ser **fixadas**, e upgrades exigem teste, backup e execução deliberada.

## Decisões sobre backup

A proteção produtiva do banco contará com **dois mecanismos complementares**:

1. Backup lógico (como dumps PostgreSQL) para portabilidade/restauração seletiva.
2. Backup físico/base com WAL arquivado para restauração a ponto no tempo (PITR).

Backup WAL/base exige destino externo ao host. Manter a única cópia recuperável na C30 **não é aceitável**.

Storage de objetos **não** é backup apenas por estar fora do host; retenção e recuperação dos arquivos exigem estratégia independente.

## Recuperação de desastre

A plataforma deve ser reproduzível em infraestrutura substituta. Ansible é a ferramenta preferencial de provisionamento e recuperação do host/aplicação.

O futuro runbook de recuperação deverá suportar:

~~~text
novo host Ubuntu
-> pacotes e runtime necessários
-> Docker
-> stack Supabase com versões fixadas
-> injeção segura de configurações/segredos
-> restore PostgreSQL / PITR
-> ligação ao R2 e validação dos objetos
-> restauração do Tunnel
-> healthchecks da aplicação
~~~

## Limite da decisão histórica de hardware

> **Substituído pelo ADR-008.** Esta seção é histórica; controladora RAID e requisitos da ML350 não se aplicam automaticamente à C30.

A decisão original escolhia ML350 como host físico único, aceitando SPOF de hardware.

Inventário físico ainda faltante **na época**:
- modelo/quantidade de CPU, RAM e discos, tipo/capacidade/saúde;
- controladora RAID, cache protegido BBWC/FBWC, nível RAID;
- placas de rede e consumo medido.

RAID 10 era preferência para PostgreSQL com muitas escritas quando hardware/capacidade justificassem; RAID 1 aceitável em arranjo simples de dois discos. **RAID nunca substitui backup.**

## Disponibilidade

A decisão inicial aceita **host único**. Medidas físicas recomendadas: UPS dimensionada para host/rede, fontes redundantes quando disponíveis, WAN dupla/failover quando justificável e procedimento documentado para host substituto.

Alta disponibilidade com um segundo host fica adiada até requisito de negócio.

## Consequências

**Benefícios:** menor custo recorrente, controle de dados/runtime, base compartilhada, stack web consolidada, operação simples em host único, caminho planejado de recuperação, objetos separados do disco do servidor e assets protegidos/servidos na borda Cloudflare.

**Trade-offs:** operação do Supabase self-hosted é responsabilidade do projeto; **host único permanece SPOF (agora C30)**; upgrades exigem disciplina; backup/PITR/monitoramento/restore ficam sob nossa responsabilidade; disponibilidade depende de energia, rede e hardware locais.

## Quando reconsiderar

Reabrir a decisão somente com evidência de que:
- host único não atende à disponibilidade exigida;
- carga extrapola escalabilidade vertical razoável;
- segurança/compliance impõe outro desenho;
- custo operacional self-hosted supera materialmente alternativas gerenciadas;
- algum módulo precisa, justificadamente, de runtime incompatível com a arquitetura.
