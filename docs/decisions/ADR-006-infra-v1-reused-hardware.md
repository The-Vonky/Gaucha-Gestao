# ADR-006 — Infraestrutura v1 reproduzível; decisão de hardware originalmente adiada

**Status: Proposto**  
**Data: 01/10/2026**

> **Atualização 15/10/2026:** a escolha de hardware antes adiada foi tomada no [ADR-008](ADR-008-production-host-thinkstation-c30.md): Lenovo ThinkStation C30 dedicada, com Ubuntu Server LTS bare metal. Referências à ML350 abaixo são históricas. WAL-G versus pgBackRest, backup/restauração e recuperação off-site continuam abertos.

## Contexto e escopo

A CI da aplicação usa uma instância descartável da Supabase CLI 2.117.0. A PR original acrescentou uma validação reproduzível por Docker Compose self-hosted para o **mesmo contrato da aplicação**. Ela não implanta nem aceita infraestrutura produtiva, tampouco valida P1–P9.

O nome do arquivo refere-se à avaliação futura de hardware reaproveitado, **não** comprova que algum servidor físico seja adequado.

O ADR-004 continua sendo a direção de plataforma aceita historicamente. O brief específico desta proposta limita o perfil implementado às dependências funcionais existentes; este ADR **Proposto** não ratifica nem substitui as escolhas de produção do ADR-004.

## Decisões propostas pela PR original

- O único perfil implementado contém **PostgreSQL 17, Kong, GoTrue/Auth, PostgREST e Storage API**. A aplicação usa esses cinco serviços. Realtime, Functions, imgproxy, Supavisor, analytics/Logflare, Vector, Studio, Meta e Mailpit ficam de fora.
- CI e staging **descartável** usam Storage local em volume nomeado isolado. Os buckets privados de evidências da época conservam limites de 10 MiB e políticas das migrations; **isso não decide Storage de produção**. O inventário atual de buckets cresceu com a Curva ABC — ver [mapa de implementação](../architecture/IMPLEMENTATION_MAP.md).
- O Compose deriva do release oficial `self-hosted/v0.8.1`, commit `8c7a4d9dbbaf8b552893822e89d7bf06f33f9220`, com override oficial do Kong. Imagens têm tags explícitas. Consultar [UPSTREAM](../../infra/supabase/UPSTREAM.md) para versões e adaptações.
- Migrations/configuração da aplicação são preservadas. O runner aplica arquivos existentes a um banco **novo, isolado e explicitamente identificado**; não existe modo de reset nem alvo implícito/produção.
- Exemplos de `.env` são placeholders. Credenciais são geradas fora dos checkouts; chaves, contas, volumes e dados da CI são efêmeros.
- PostgreSQL não publica porta no host; somente o gateway expõe HTTP em loopback. URLs/redirects variam por ambiente. Não há ingresso real nem endpoint produtivo.

## Explicitamente não decidido nesta proposta

- Esta PR não define arquitetura/configuração final de produção.
- A inspeção física do hardware era pendente na data original; a **escolha da C30 foi tomada depois pelo ADR-008**, mas seu aceite operacional continua pendente.
- VM versus bare metal não foi resolvido **neste** ADR, tendo sido decidido posteriormente no ADR-008.
- WAL-G versus pgBackRest permanece aberto.
- Backup/restore, WAL/PITR, Google Drive, rclone e recuperação off-site ficaram para PRs futuras; não foram implementados pela proposta.
- Ingresso produtivo, deploy, Ansible, alertas, reconciliação periódica, políticas `nosniff`/cache e homologação física estão fora do escopo original.

## Consequências

Um runner limpo de CI consegue subir o stack mínimo, aplicar migrations, verificar saúde e provar o contrato de infraestrutura. Parar um serviço Storage obrigatório deve fazer o healthcheck falhar; após restaurá-lo, uma nova verificação deve passar antes da destruição dos volumes **descartáveis do próprio runner**.

Métricas de `docker stats` são informativas e não comprovam capacidade da ML350 nem da C30. Storage em arquivos locais do laboratório é descartável, não possui backup garantido. Falha parcial de migration exige **novo stack descartável**. Diferenças em relação à CLI ficam explícitas e são testadas, **não presumidas equivalentes**. **Produção: NO-GO.**
