# Gaúcha Gestão

Plataforma interna da Gaúcha Alimentação para reunir sistemas corporativos com identidade comum, controle de acesso por unidade e rastreabilidade das operações.

[Ambiente local](#primeiros-passos-ambiente-local) · [O que já existe](#o-que-já-existe) · [Arquitetura](#arquitetura-como-as-peças-conversam) · [O que falta para produção](#o-que-falta-para-produção) · [Portal documental](docs/README.md)

## Arquitetura: como as peças conversam

A plataforma é um monólito modular. O **Core** mantém identidade, perfis, unidades, setores, permissões e auditoria sistêmica. Cada módulo mantém seus dados e regras de negócio. As integrações usam contratos explícitos. PostgreSQL aplica autorização por RLS, grants e RPCs.

A interface usa React, TypeScript, React Router, Vite e o Design System Elo. O backend usa PostgreSQL 17 e Supabase autohospedado, com Auth (GoTrue), PostgREST, Storage e Kong. O Compose de DEV inclui Studio, pg_meta e imgproxy. A extensão opt-in de Identity acrescenta um serviço interno do Core para o ciclo de credenciais e a admissão de sessões no DEV. [Arquitetura](docs/architecture/OVERVIEW.md) · [ADR-001](docs/decisions/ADR-001-modular-monolith.md) · [ADR-005](docs/decisions/ADR-005-core-authorization.md)

## O que já existe

| Área | Integrado à main |
| --- | --- |
| Core e Administração | Organização, usuários, papéis, grants, logs e GG-05A/B no DEV com Identity habilitado |
| Qualidade | Auditorias, checklist versionado, histórico, evidências e relatórios com fotos |
| Planos de Ação | Planos manuais e vinculados a Auditorias, com atribuições, evidências e verificação |
| Curva ABC | Importação e revisão de XLSX por unidade, histórico e áreas analíticas |
| Vendas / Maquininhas | Lançamentos, dashboard, exportação Excel e perfis institucionais de Vendas |
| Agendamento de Salas | Agenda, pedidos, gestão, contato e histórico, incluindo AG-D5-C |
| Comunicados e Relatos | Publicação administrativa de avisos e canal interno de relatos com anexos privados |

Para rastrear migrations, código, PRs e testes, consulte o [mapa de implementação](docs/architecture/IMPLEMENTATION_MAP.md). Use o [Guia Mestre GG-01–GG-15](docs/planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md) para acompanhar prioridades, evidências e aceites pendentes.

## Primeiros passos: ambiente local

Use Git, Node.js ≥ 22.12, npm, Python ≥ 3.11 e Docker com Linux containers e Compose v2 ou superior. O Engine precisa oferecer bridge com gateway `isolated`, e o Compose precisa aceitar `up --wait`.

- **Ubuntu nativo:** use Docker Engine e Compose no Linux. O Ubuntu 26.04 LTS é a referência principal de desenvolvimento. [Guia Ubuntu](docs/operations/LOCAL_DEV_UBUNTU.md)
- **Windows:** use Docker Desktop com integração WSL2 e execute os comandos na distribuição Linux. [Guia Windows](docs/operations/LOCAL_DEV_WINDOWS.md)

Use o runbook compartilhado para [instalar em uma máquina nova](docs/operations/DOCKER_LOCAL_STANDARDIZATION.md#instalação-inicial-em-máquina-nova) ou [retomar uma instalação interrompida](docs/operations/DOCKER_LOCAL_STANDARDIZATION.md#retomada-de-instalação-interrompida).

Com o DEV saudável, as dependências instaladas e o Vite parado, execute na raiz do projeto:

```bash
npm run dev
```

Frontend em [127.0.0.1:5173](http://127.0.0.1:5173), API Supabase em `127.0.0.1:54321`, PostgreSQL em `127.0.0.1:54322` e Studio em [127.0.0.1:54323](http://127.0.0.1:54323), nas portas padrão. Para o modo opt-in, consulte o [runbook Identity DEV](docs/operations/GG_05B_IDENTIDADE_DEV.md).

## O que falta para produção

**PROD NO-GO.** A liberação depende dos gates aplicáveis, incluindo homologação P1–P9, prontidão O1–O8, segurança de identidade privilegiada, recuperação comprovada e decisão explícita do mantenedor. [Plano Diretor](docs/planning/PLANO_DIRETOR_2026.md) · [Matriz de aceite da Qualidade](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md)

- **DEV pessoal:** Compose persistente no computador do mantenedor, usado para desenvolvimento e homologação antes do merge. A CI usa perfis descartáveis próprios.
- **STAGING:** ambiente persistente de testes na C30. O último registro operacional consultado documenta a linha `f9f041e` com acesso por Cloudflare Tunnel e Caddy. O estado implantado exige verificação própria. [AS-BUILT](docs/operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) · [Runbook](docs/operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md)
- **PROD:** implantação condicionada ao GO operacional. Merge, CI e homologação local documentam etapas distintas.

## Onde encontrar cada resposta

O [portal documental](docs/README.md) reúne guias, arquitetura, contratos e planejamento. Consulte o [índice histórico](docs/HISTORY.md) para decisões anteriores, ensaios e evidências datadas. Leia [AGENTS.md](AGENTS.md) para contribuição, homologação local, revisão e regras de segurança. Use o [template de PR](.github/pull_request_template.md) para registrar as validações aplicáveis.
