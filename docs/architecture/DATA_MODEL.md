# Modelo de dados do Core

**Estado:** modelo lógico inicial v1 aceito no [ADR-005](../decisions/ADR-005-core-authorization.md). Este texto preserva a baseline inicial; as migrations atuais são a fonte do schema físico.

## Fronteiras dos schemas

~~~text
auth          identidade mantida pelo Supabase
core          plataforma e organização
private       helpers internos de segurança não expostos
audit         Auditorias de Qualidade
action_plans  módulo transversal Planos de Ação
~~~

O schema `abc` e seu schema privado `abc_private` foram integrados **depois** (PR #69). Módulos futuros recebem schemas próprios. Tabelas expostas exigem **RLS e grants explícitos**.

## Relacionamentos

~~~text
auth.users
    |
    1:1
    v
core.profiles
    |
    +--> core.user_role_assignments --> core.roles
    |                                 |
    |                                 v
    |                            core.role_permissions
    |                                 |
    |                                 v
    |                            core.permissions
    |
    +--> created_by / updated_by históricos

core.user_role_assignments --> escopo global
                           --> unit (core.units)
                           --> sector (core.units + core.sectors)

core.units -> core.unit_sectors <- core.sectors
~~~

## Tabelas e campos iniciais

| Tabela | Definição resumida |
| --- | --- |
| `core.profiles` | `id uuid` PK/FK de `auth.users.id`; `display_name text not null`, `active boolean not null default true`, `created_at`, `updated_at` |
| `core.units` | `id uuid`, `code text unique`, `name text not null`, `active boolean not null default true`, timestamps e autoria |
| `core.sectors` | `id uuid`, `code text unique`, `name text not null`, `active boolean not null default true`, timestamps |
| `core.unit_sectors` | `unit_id uuid`, `sector_id uuid`, PK/unique composta; valida disponibilidade de setor na unidade |
| `core.permissions` | `key text primary key` natural/estável; `domain`, `resource`, `action`, `description`, `active` |
| `core.roles` | `id uuid`, `key text unique`, `name`, `description`, `system`, `active`, timestamps |
| `core.role_permissions` | `role_id uuid`, `permission_key text`, PK/unique composta |
| `core.user_role_assignments` | `id uuid`, `user_id`, `role_id`, `scope_type = global/unit/sector`, `unit_id`/`sector_id` anuláveis, `active`, `granted_by`, timestamps; CHECK de formato/uniqueness |

Atributos adicionais de RH/perfil só entram mediante necessidade real aprovada.

### `core.system_audit_log`

Trilha de eventos orientada a append:
`id uuid`, `occurred_at timestamptz`, `actor_user_id` opcional, `module text`, `action text`, `entity_type text`, `entity_id text`, `unit_id` e `sector_id` opcionais, `before_data jsonb`/`after_data jsonb` opcionais, `metadata jsonb`, identificador de correlação/requisição quando disponível.

Clientes autenticados **não** têm escrita/exclusão direta comum na trilha. **Auditoria sistêmica é diferente do módulo Qualidade > Auditorias.**

## Tipos e propriedade

- **Identificadores:** UUID por padrão; código de negócio estável é separado.
- **Tempo:** `timestamptz` para instantes e log; `date` para datas de negócio.
- **Dinheiro:** PostgreSQL `numeric` de precisão fixa, **não** float como fonte de verdade; módulo define regra de arredondamento.
- **Anexos:** bytes no Storage/R2; módulos detêm metadados e vínculos, reutilizando contrato comum. Não criar tabela polimórfica universal sem necessidade comprovada.
- **Importação:** distinguir lote de origem, resultado de validação, dados normalizados, aliases e metadados de auditoria. Não reescrever silenciosamente o histórico.

## Ciclo de vida, exclusão e migrations

Perfis, unidades, setores e papéis devem normalmente ser **desativados**, não apagados, após referenciados historicamente. Cada domínio define sua política de exclusão física sem cascata de perda de histórico.

Migrations são **append-only** após aplicadas em ambiente compartilhado, com fonte versionada única, backup/recuperação para alterações destrutivas, ensaios fora de PROD e regressão de RLS/grants.

Para implementação física atual: [mapa](IMPLEMENTATION_MAP.md) e arquivos `supabase/migrations/`.
