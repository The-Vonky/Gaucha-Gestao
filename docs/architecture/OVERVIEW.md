# Visão geral da arquitetura

A Gaúcha Gestão é um **monólito modular** ([ADR-001](../decisions/ADR-001-modular-monolith.md)). A SPA em `apps/web` reúne shell, navegação, Core web, Shared e os módulos de negócio. PostgreSQL/Supabase executa os contratos de dados. O componente interno `apps/core-identity` acrescenta ao Core o ciclo de credenciais e a admissão de sessões no perfil opt-in do DEV.

## Fronteiras do monólito

- O **Core** é dono de identidade de aplicação, perfil, organização, papéis, permissões, escopos, referências organizacionais e auditoria sistêmica. GoTrue mantém a identidade Auth. Cada módulo é dono dos seus dados, regras e metadados de anexos.
- **Shared** contém primitivas de UI e utilitários neutros. O shell compõe as entradas públicas. Módulos podem depender de Core e Shared. Core e Shared ficam livres de dependências de negócio.
- Módulos trocam dados por contratos públicos. Por exemplo, Auditorias registra a origem rastreável de um plano e consome o contrato público de leitura de Planos de Ação.
- A autorização efetiva é aplicada por grants, RLS e RPCs PostgreSQL. No perfil estrito, Identity e o pre-request acrescentam a admissão de sessão antes do uso dos contratos. [Autorização](AUTHORIZATION.md) · [Contratos de API](API_CONTRACTS.md).

## Módulos e estado de implementação

Na [baseline do Mapa de Implementação](IMPLEMENTATION_MAP.md), estão integrados **Core e Identity**, **Auditorias e Qualidade**, **Planos de Ação**, **Curva ABC**, **Vendas e Maquininhas**, **Agendamento de Salas**, **Comunicados** e **Relatos e sugestões**. O mapa identifica rotas, schemas, evidências automáticas e aceites DEV por recorte. O [roadmap](../migration/MODULE_ROADMAP.md) acompanha as fases pendentes e os domínios ainda planejados.

## Tecnologias e implantação

- **Aplicação e CI.** React/TypeScript/Vite, GoTrue/Auth, PostgREST, Storage, PostgreSQL 17, Kong e integrações descartáveis. No DEV pessoal, o Compose inclui Studio, pg_meta e imgproxy. Identity é um serviço interno adicional desse perfil. [Stacks e ambientes](STACK_INTEGRATION.md).
- **STAGING persistente.** Em 30/10/2026, o operador registrou Cloudflare DNS/Tunnel → Caddy → Supabase na C30, com login, auditoria e fotos. O SHA e o ledger implantados exigem verificação própria no inventário GG-01. [AS-BUILT](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md).
- **PROD planejado.** Workers Static Assets, Cloudflare DNS/WAF/Tunnel, R2, C30 em Ubuntu bare metal e recuperação independente. Consulte as escolhas e os requisitos no [ADR-004](../decisions/ADR-004-platform-stack.md) e [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md).

## Migração incremental e prontidão

Cada migração começa com inventário funcional e propriedade reconhecida, passa por brief/contratos aprovados, integração com Core, reconciliação e recuperação, e chega ao corte somente após homologação e autorização específicas. Salas segue a decisão AG-D11 de implementação independente e preservação do legado.

Qualidade v1 é a primeira entrega operacional do Plano Diretor. A liberação depende de P1–P9/O1–O8 aplicáveis, segurança e recuperação do Identity, inventário e continuidade da C30, proteção do ingresso, observabilidade e GO explícito do mantenedor. Consulte os [gates da fundação](FOUNDATION_GATES.md), [Plano Diretor](../planning/PLANO_DIRETOR_2026.md) e [Guia Mestre](../planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md). **PROD NO-GO.**
