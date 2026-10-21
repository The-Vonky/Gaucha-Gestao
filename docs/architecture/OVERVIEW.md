# Visão geral da arquitetura

## Propósito e estilo

Consolidar sistemas corporativos internos da Gaúcha Gestão em uma plataforma com fronteiras de domínio e migração gradual. O objetivo não é reunir arquivos numa pasta gigante, mas compartilhar a fundação sem tornar os módulos inseparáveis.

**Decisão arquitetural:** monólito modular ([ADR-001](../decisions/ADR-001-modular-monolith.md)).

~~~text
Plataforma
+-- App Shell (navegação / sessão / contexto global)
+-- Core (identidade / autorização / unidades / setores / logs)
+-- Shared (primitivas UI / utilitários / contratos)
+-- Módulos
    +-- Auditorias (Qualidade)
    +-- Planos de Ação (transversal)
    +-- Curva ABC
    +-- ISO / Vendas / Satisfação / Salas / Frota
    +-- Planejado×Realizado / Contratos (futuros)
~~~

## Dependências permitidas e proibidas

~~~text
PERMITIDO
Módulo de negócio -> Core ou Shared
App Shell -> Core ou entrada pública do módulo

PROIBIDO
Core -> módulo de negócio
Módulo A -> arquivos internos do módulo B
Shared -> módulo de negócio
~~~

Integrações entre módulos devem passar por **contratos públicos**. Acesso direto à tabela/componente interno de outro módulo exige decisão arquitetural.

## O que pertence ao Core

Identidade/perfil, papéis, permissões, unidade, setor, escopo organizacional, eventos sistêmicos e contrato técnico compartilhado de arquivos. Metadados de anexos específicos e acesso a entidades pertencem aos módulos, conforme [DATA_MODEL](DATA_MODEL.md).

Semântica parecida em dois módulos não justifica mover tudo para Core.

## Módulos e estado de implementação

| Domínio | Estado verificado no repositório em 21/10/2026 |
| --- | --- |
| Auditoria/Qualidade | v1 integrada ao código, sem homologação P1–P9/O1–O8 |
| Planos de Ação | Transversal e integrado |
| Curva ABC | v1 integrada na PR #69, homologação [#70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) aberta |
| ISO/Propostas ISO, Vendas, Satisfação | Legados; migração futura |
| Agendamento de Salas | Legado funcional, [AG-00](../briefs/ROOM_BOOKING_V1.md) proposto e não aprovado |
| Frota | Legado em desenvolvimento |
| Planejado×Realizado | Legado a revisar antes de migrar |
| ERP de Contratos | Legado; backup/recuperação exige revisão |

## Migração incremental

~~~text
inventariar comportamento legado
-> definir fronteira do módulo
-> aprovar brief e critérios de aceite
-> reutilizar regras de negócio validadas
-> integrar Core
-> migrar dados controladamente
-> reconciliar com legado
-> homologar e autorizar corte
-> preservar recuperação do legado
~~~

Um legado “finalizado” não obriga copiar sua arquitetura técnica.

## Capacidades antes de múltiplos módulos produtivos

Identidade/sessões, autorização granular, escopo, audit log, navegação, disciplina de migrations, backups/restore, segredos, ambientes e observabilidade precisam ser confiáveis.

A primeira entrega operacional é **Qualidade v1**. Não reimplementar Auditoria, Planos, evidências e relatórios concluídos; consultar [QUALITY_COMPLETION](../modules/audit/QUALITY_COMPLETION_V1.md). O código está integrado, **a produção não**.

## Tecnologias atuais versus futuras

**AS-IS em código/CI:** React/TypeScript/Vite, GoTrue/Auth, PostgREST, Storage API, PostgreSQL 17/RLS e Kong em Compose mínimo de cinco serviços, além de CI Supabase CLI. **Realtime/Supavisor não fazem parte desse perfil.**

**TO-BE produção:** frontend Cloudflare Workers Static Assets, Cloudflare DNS/WAF/Tunnel, R2, ThinkStation C30 Ubuntu bare metal, backup lógico+base/WAL/PITR off-site, Ansible e alertas. A escolha está nos [ADR-004](../decisions/ADR-004-platform-stack.md) e [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md), **sem comprovar implantação**.

Detalhes: [DIAGRAMS](DIAGRAMS.md), [STACK_INTEGRATION](STACK_INTEGRATION.md), [TECHNOLOGY_DECISIONS](TECHNOLOGY_DECISIONS.md).

## Decisões abertas

Backup/PITR e retenção, RPO/RTO, observabilidade/alertas, política de exclusão de evidências, STAGING/PROD, capacidade física da C30 (RAM/SSD) e identidade privilegiada ADR-007 (NO-GO). Não reabrir stack aceita para resolver detalhe sem requisito/novo ADR.

**Produção NO-GO** até evidências P1–P9/O1–O8 e liberação humana.
