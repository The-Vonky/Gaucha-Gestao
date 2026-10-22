# Como as stacks funcionam juntas

**Escopo:** integração lógica atual e implantação futura. **Baseline de código:** main após PR #69 (`fed0e0f`, 20/10/2026). **Não existe produção aprovada neste snapshot.**

> **Atualização operacional 22/10/2026 (não modifica o ADR):** existe STAGING C30 real com Caddy frontend estático e backend Supabase Compose de cinco serviços, com dados/objetos em HDD e TLS interno somente loopback. Ainda **não** é Cloudflare/Workers/R2 produtivo. Código instalado `f9f041e` com 18 migrations, diferente da main mais recente. Detalhes auditáveis no [AS-BUILT](../operations/C30_STAGING_AS_BUILT_20261022.md) e [plano de acesso de testes](../operations/STAGING_PUBLIC_ACCESS_PLAN.md). A matriz histórica abaixo separa implementação no repositório de operações e não é prova de GO.

## Matriz tecnológica e responsabilidades

| Camada | Stack / fonte real | Função e limite | Estado |
| --- | --- | --- | --- |
| Interface | React 19 + TypeScript 5 + Vite 6 + Router 7 (apps/web/package.json) | Renderização, formulários, UI de permissão; não é boundary de autorização | **Implementada** |
| Acesso do frontend | @supabase/supabase-js 2 (apps/web/src/core/client.ts) | Cliente de Auth, Data API (PostgREST) e Storage; deve receber só chave publishable/anon | **Implementado** |
| Sessão | Supabase GoTrue/Auth + AuthProvider | Login, sessão, perfil ativo e permissões efetivas via my_access | **Implementado**, gestão privilegiada de credenciais pendente |
| Regras e acesso a dados | PostgreSQL + RLS + funções SQL/RPC + PostgREST | Mutação transacional, escopo, isolamento por unidade/setor, versões/conflitos | **Implementado** conforme migrations e testes |
| Dados | PostgreSQL 17, schemas auth/core/audit/action_plans/abc; schemas internos privados | Identidade, Core corporativo, auditorias, planos, metadados de evidências | **Implementado**, produção não instalada |
| Arquivos | Supabase Storage API; buckets privados | Upload de bytes e download assinado; metadata e autorização ficam em contratos de domínio | **Implementado em laboratório/CI** |
| Armazenamento físico | Filesystem no laboratório e HDD dedicado no STAGING C30; R2 preferido em PROD | Persistência dos objetos distinta do banco; precisa de backup independente | **HDD local em STAGING**; **R2 TO-BE** |
| Curva ABC v1 | Parser XLSX no navegador, schema abc e bucket abc-source-files | Revisões por unidade/competência, classificação em SQL; conferência posterior do arquivo | **Código na main; homologação pendente** |
| Gateway self-hosted | Kong + GoTrue + PostgREST + Storage + PostgreSQL | Perfil mínimo de 5 serviços no Compose | **CI + STAGING persistente real na C30**; **PROD NO-GO** |
| Distribuição pública | Cloudflare Workers Static Assets, DNS/WAF/Tunnel | Frontend estático e proxy privado controlado | **Decidido TO-BE**, não comprovado |
| Host | ThinkStation C30 / Ubuntu Server 22.04.5 LTS / Docker Compose / Caddy | Hospedagem on-premise de STAGING, com 5 serviços e HTTPS loopback confirmados | **STAGING implementado**; **aceite para PROD não comprovado** |
| Pipeline | GitHub Actions validate e infra-validate | Typecheck, lint, Vitest, build, audit npm, integrações Supabase/Chromium e smoke Compose | **Implementado**, CI não é GO de release |
| Recuperação | Backups PostgreSQL + WAL/PITR + objetos + cópia off-site + Ansible | Retorno consistente após corrupção/perda do host | **Arquitetura prevista**; ferramenta, retenção e restore operacional pendentes |

**Precedência técnica:** [ADR-004](../decisions/ADR-004-platform-stack.md) é a baseline de stacks; [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md) substitui somente seu hardware/VM; [ADR-006](../decisions/ADR-006-infra-v1-reused-hardware.md) documenta o Compose mínimo **ainda com status Proposed**. Não declarar que o perfil mínimo engloba todo serviço opcional mencionado no ADR-004.

Para critérios, alternativas e trade-offs das decisões tecnológicas, veja o [racional da stack](TECHNOLOGY_DECISIONS.md). A escolha de host único reduz complexidade e custo recorrente, mas impõe SPOF e obrigações de backup/restore; ela não foi escolhida a partir de um benchmark comparativo documentado.

## O caminho de uma requisição

1. O navegador obtém o build Vite. **No ambiente atual de desenvolvimento:** Vite local. **Em produção futura:** Workers Static Assets.
2. apps/web/src/core/client.ts cria supabase-js com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Sem configuração válida, o cliente fica indisponível; service_role nunca entra no bundle.
3. Auth autentica e entrega sessão/JWT. AuthProvider carrega o perfil em core.profiles e consulta core.my_access. Login **não equivale** a permissão de negócio.
4. A UI de um domínio invoca RPC específica ou consulta permitida em schema core/audit/action_plans/abc via PostgREST. Cada operação depende de grants, RLS e regras transacionais no PostgreSQL.
5. Para anexos, uma RPC reserva/confirma metadata autorizada; o browser envia os bytes à Storage API no bucket privado. Downloads usam URL assinada de curta duração, sem torná-la pública ou persistente.
6. Erros de versão, autorização, conteúdo e rede precisam ser tratados como operações falhas ou pendentes, não como sucesso otimista.

~~~mermaid
sequenceDiagram
  actor U as Usuário
  participant W as React + supabase-js
  participant A as Auth
  participant R as PostgREST
  participant DB as Postgres + RLS / RPC
  participant S as Storage API
  U->>W: Abre módulo e envia ação
  W->>A: Sessão/JWT autenticada
  A-->>W: Token / estado
  W->>R: RPC ou consulta com JWT
  R->>DB: Executa sob grants, RLS e contrato
  alt autorizado e versão válida
    DB-->>R: Resultado
    R-->>W: Dados autorizados
  else negado ou versão obsoleta
    DB-->>R: Erro / negação
    R-->>W: Erro explícito
  end
  opt anexo
    W->>R: Reservar metadados autorizados
    W->>S: Upload com token no bucket privado
    W->>R: Confirmar objeto enviado
  end
~~~

## Ambientes: não confundir as topologias

| Ambiente | Realidade no repositório | Característica / proibição |
| --- | --- | --- |
| DEV local | Vite + Supabase CLI opcional | Só instância local descartável; reset apenas se exclusiva; sem exposição de chaves padrão | 
| DEV compartilhado (#68) | Frontend 5173 e API 54341, registrados em 20/10 | Duas contas distintas; autoria/RLS/rede ainda sob validação. Merge ABC não garante que migration foi aplicada |
| CI aplicação | .github/workflows/validate.yml | Supabase CLI 2.117.0 descartável, Playwright Chromium e banco sem dados reais; não é self-hosted PROD |
| CI infraestrutura | .github/workflows/infra-validate.yml | Compose de cinco serviços com segredos efêmeros externos ao checkout, migrations, healthcheck, smoke e destruição isolada |
| STAGING persistente | Intenção no Plano Diretor; sem evidência de provisionamento nesta base | Definir host, TLS/origens, credenciais, dados sintéticos e restore antes de usar; não herdar volumes locais |
| PROD | **NO-GO** | Ambiente limpo separado, credenciais específicas, host aceito, backup independente, restauração testada e autorização humana |

O script scripts/ops/apply-migrations.sh e os scripts associados **recusam produção** e exigem projeto/instância de laboratório explícitos. infra/env/production.env.example **não é um deploy pronto**. Siga [infra/README](../../infra/README.md) apenas para CI/STAGING descartáveis e [01_DADOS_LIMPOS](../planning/01_DADOS_LIMPOS.md) para política de PROD futura, ainda sujeita a aprovação.

## Contratos e fronteiras

- **Identidade:** auth.users.id ↔ core.profiles.id. Sessão de Auth não é autorização; ausência/inatividade do profile implica default deny.
- **Escopo:** atribuição de papel + permissão + escopo global/unidade/setor + regra de linha; grants e RLS são obrigatórios; UI e Cloudflare não substituem controles.
- **RPC / ownership:** Core é dono de usuários, papéis, permissões, unidades, setores e log do sistema; audit é dono das inspeções; action_plans é dono do ciclo corretivo; abc é dono de séries, revisões e linhas de Curva ABC. Não consumir objetos privados entre módulos.
- **Upload:** o registro de evidência e a confirmação de bytes são passos distintos. Uma falha intermediária pode exigir limpeza/reconciliação; não presumir atomicidade entre PostgreSQL e Storage.
- **Histórico:** usar UUID para referência, timestamptz para instantes e numeric para valores monetários futuros; snapshots e referências históricas devem sobreviver à desativação ordinária de usuários/unidades.
- **Escalabilidade:** host único introduz SPOF; não prometer HA, RPO=0, latência p95 nem recuperação sem medições e aceite.

## Configurações: onde procurar sem armazenar segredos

| Parâmetro / artefato | Consumidor | Cuidado |
| --- | --- | --- |
| VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY | Build/web | Somente URL de ambiente e chave pública; não colocar service_role em VITE_ |
| apps/web/.env.example | DEV | Modelo sem credenciais reais |
| infra/env/staging.env.example | Compose descartável | Placeholder; segredos gerados externamente e por instância |
| infra/env/production.env.example | Projeto futuro | Não executável e não suficiente para liberação |
| supabase/config.toml | Supabase CLI | Exposição explícita de schemas; privados fora da Data API |
| supabase/migrations/*.sql | Postgres | Histórico append-only; não editar migration já aplicada |
| infra/supabase/UPSTREAM.md | Infra | Pinos e proveniência do Compose |
| .github/workflows/*.yml | CI | Validação, **não deploy automático** |

## Questões ainda abertas

Ferramenta WAL/PITR, política de retenção de DB/objetos/logs, recuperação off-site, alvo p95/carga, capacidade da C30, operação de STAGING/PROD, verificações de headers/cache, governança privilegiada de Auth (ADR-007 pendente), monitoramento e alertas. Ver [registro de decisões](../planning/DECISION_REGISTER.md) e [gates](../modules/audit/QUALITY_ACCEPTANCE_V1.md). Não converter plano em configuração ativa.
