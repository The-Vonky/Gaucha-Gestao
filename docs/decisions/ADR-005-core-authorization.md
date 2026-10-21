# ADR-005 — Identidade, autorização e escopo organizacional do Core

**Status: Aceito**  
**Data: 24/09/2026**

## Contexto

A Gaúcha Gestão reúne nove módulos de negócio com públicos e escopos organizacionais distintos.

Uma pessoa pode precisar de permissões diferentes por domínio, acesso a todas ou apenas algumas unidades, restrições por setor e mais de uma responsabilidade funcional.

Papéis fixados diretamente na lógica (`admin`, `qualidade`, `gestor`, `viewer`) são insuficientes.

## Decisão

A autorização usa:

~~~text
Usuário autenticado
      |
      v
Perfil Core (ativo?)
      |
      v
Atribuição de papel ao usuário
      |
      +--> Papel --> Permissões
      |
      +--> Escopo
           global
           unit
           sector
~~~

Uma pessoa pode ter **várias atribuições de papel**. O escopo pertence à **atribuição**, não globalmente ao usuário.

Exemplo:

~~~text
Usuário
├── Papel Qualidade @ CMD + HRAD
└── Papel Frota @ Matriz
~~~

Isso não dá acesso à Qualidade da Matriz nem à Frota de CMD/HRAD.

## Autenticação

Supabase Auth é o provedor de identidade.

`auth.users.id` é a identidade canônica autenticada. O Core tem um perfil 1:1 referenciando esse usuário.

Usuário autenticado com perfil Core **inativo** tem acesso aos dados negado mesmo que a sessão Auth permaneça tecnicamente válida.

## Schemas de banco

Schemas iniciais desta decisão:

~~~text
core
audit
action_plans
~~~

Módulos futuros recebem schema próprio quando implementados. **Evolução histórica:** o schema `abc` foi integrado posteriormente (PR #69); não alterar o snapshot inicial desta decisão por retroatividade.

Schemas expostos devem ser configurados explicitamente na Data API/PostgREST. **Toda tabela exposta exige RLS e grants explícitos.** Helpers sensíveis que não precisam ser chamados diretamente pela API devem morar em schema não exposto, como `private`.

## Tabelas Core

### `core.profiles`

Perfil da plataforma vinculado a `auth.users`.

Campos iniciais: `id uuid primary key` → `auth.users(id)`, `display_name text`, `active boolean`, metadados corporativos opcionais somente quando justificados, timestamps de criação/atualização.

**Não** armazenar hashes de senha nem duplicar credenciais Auth.

### `core.units`

Unidade organizacional corporativa canônica.

Campos iniciais: `id uuid`, `code text` (código de negócio único/estável quando existir), `name text`, `active boolean`, timestamps, autoria de criação/atualização.

Uma unidade já referenciada historicamente deve ser **desativada**, em vez de excluída fisicamente por padrão.

### `core.sectors`

Definição canônica de setor: `id uuid`, `code text`, `name text`, `active boolean`, timestamps.

### `core.unit_sectors`

Relaciona setores às unidades onde são válidos, sem duplicar o conceito canônico de setor.

Chave inicial: `unit_id`, `sector_id`, com estado/ativo se necessário depois.

### `core.permissions`

Catálogo de permissões. Sempre que viável, usar a própria **chave de permissão como identificador estável**. Exemplo: `audit.inspection.finalize`.

Metadados: domínio, recurso, ação, descrição legível e indicador ativo. Criar permissões apenas para capacidades implementadas.

### `core.roles`

Conjunto reutilizável de permissões.

Campos iniciais: `id uuid`, `key text unique`, `name text`, `description text`, `system boolean`, `active boolean`, timestamps.

A lógica de aplicação não deve testar o nome/chave do papel se uma **permissão** expressa a necessidade.

### `core.role_permissions`

Relação N:N entre `role_id` e `permission_key`.

### `core.user_role_assignments`

Atribui papel ao usuário com escopo organizacional.

Campos iniciais: `id uuid`, `user_id`, `role_id`, `scope_type` (`global | unit | sector`), `unit_id` anulável, `sector_id` anulável, indicador ativo, timestamps e `granted_by`.

**Regras de formato:**
- `global` → `unit_id` nulo, `sector_id` nulo;
- `unit` → `unit_id` obrigatório, `sector_id` nulo;
- `sector` → `unit_id` e `sector_id` obrigatórios;
- atribuição setorial requer vínculo válido entre setor e unidade.

**Não criar** tabelas separadas `user_unit_access` e `user_sector_access` na v1: a atribuição por papel e escopo representa a relação com mais precisão.

### `core.system_audit_log`

Trilha de auditoria de segurança/operação da plataforma.

Campos iniciais:
- `id uuid`, `occurred_at timestamptz`;
- `actor_user_id uuid null`;
- `module text`, `action text`, `entity_type text`, `entity_id` (texto/UUID);
- `unit_id` e `sector_id` opcionais;
- `before_data jsonb null`, `after_data jsonb null`, `metadata jsonb`;
- identificador de correlação/requisição, quando disponível.

Clientes autenticados não recebem INSERT/UPDATE/DELETE direto nessa tabela. Operações sensíveis registram eventos por mecanismos confiáveis de aplicação/banco. Payloads **não** devem conter segredos nem dados sensíveis desnecessários.

## Avaliação de escopo

Para recurso de unidade e setor opcional, a permissão é concedida quando **todas** as condições são verdadeiras:

1. perfil está ativo;
2. atribuição ativa de papel existe;
3. papel contém a permissão requerida;
4. escopo da atribuição cobre o recurso.

Cobertura:

~~~text
global
  -> unidades/setores permitidos pela permissão

unit(U)
  -> recursos pertencentes à unidade U

sector(U,S)
  -> recursos pertencentes ao setor S, dentro da unidade U
~~~

Escopo mais amplo cobre recurso mais restrito. **Atribuição por setor não concede acesso a registros gerais da unidade** que não pertençam explicitamente ao setor.

## Helpers de autorização confiáveis

Usar helpers no banco conceitualmente equivalentes a:

- `private.is_active_user()`;
- `private.has_global_permission(permission_key)`;
- `private.has_unit_permission(permission_key, unit_id)`;
- `private.has_scoped_permission(permission_key, unit_id, sector_id)`.

Assinaturas exatas podem evoluir durante implementação.

Helpers `SECURITY DEFINER`, quando usados, precisam:
- fixar `search_path` ou mantê-lo vazio;
- qualificar integralmente tabelas referenciadas;
- expor `EXECUTE` apenas quando necessário;
- não se tornar bypass genérico de privilégios.

## Padrão RLS

**Toda tabela exposta usa RLS**. Uma tabela de módulo vinculada a unidade deve usar helper Core pertinente em políticas SELECT/INSERT/UPDATE/DELETE.

Exemplos conceituais:

~~~text
audit.inspections SELECT
-> has_unit_permission('audit.inspection.read', unit_id)

audit.inspections INSERT
-> has_unit_permission('audit.inspection.create', unit_id)
~~~

Filtragem de UI espelha essas regras, **mas não tem autoridade de segurança**.

## Primeiro catálogo de permissões

### Auditoria
- `audit.inspection.read`
- `audit.inspection.create`
- `audit.inspection.edit`
- `audit.inspection.finalize`
- `audit.inspection.reopen`
- `audit.inspection.export`

### Planos de Ação
- `action_plan.read`
- `action_plan.create_manual`
- `action_plan.write`
- `action_plan.verify`

### Administração da plataforma
- `admin.user.read`, `admin.user.manage`
- `admin.role.read`, `admin.role.manage`
- `admin.unit.read`, `admin.unit.manage`
- `admin.sector.read`, `admin.sector.manage`
- `admin.audit_log.read`

**Não incluir permissões de módulos de negócio não implementados.**

## Modelos iniciais de papéis

Templates de seed são **conveniência**, não lógica de autorização; podem ser administrados depois.

**Administrador da plataforma:** atribuição somente global, com permissões de administração e negócio implementadas. Papel privilegiado cuja concessão/remoção deve ser auditada.

**Qualidade:** atribuível globalmente ou por unidades escolhidas, com as permissões operacionais de Auditoria e Planos de Ação.

**Visualizador de Qualidade:** leitura/exportação de Auditoria e Planos conforme necessário.

A composição concreta dos templates pertence ao seed da migration, **não à lógica codificada de autorização**.

## Ciclo de vida do usuário

**Criação:** conta Auth criada/convidada por fluxo administrativo aprovado; perfil Core criado; acesso de negócio só após atribuição, salvo administrador inicial explicitamente bootstrapado.

**Inativação:** marcar perfil Core `active = false`; helpers RLS negam acesso; referências históricas de autoria preservadas; sessões Auth podem ser revogadas por processo administrativo.

**Reativação:** ação administrativa explícita; restauração de atribuições antigas depende de política.

Excluir fisicamente usuários **não** é o mecanismo normal do ciclo de vida.

## Ciclo de vida da unidade

Unidade referenciada por dados históricos **não** é removida fisicamente pela UI comum: usar `active = false`. Desaparece de seletores de criação, mas permanece legível no histórico para usuários autorizados.

## Salvaguardas administrativas

- mudanças de papel/permissão/escopo geram auditoria sistêmica;
- ninguém concede permissões que não possa administrar;
- código de browser não contorna RLS usando chave privilegiada;
- `service_role` e chaves secretas nunca chegam ao frontend;
- ações administrativas destrutivas exigem confirmação explícita na UI **e** validação no servidor/banco.

## Consequências

**Benefícios:** múltiplas responsabilidades por usuário, escopos por papel/domínio, redução da explosão de papéis, identidades corporativas únicas e contrato de autorização estável para os módulos.

**Trade-offs:** consultas de autorização mais complexas que um enum único; helpers RLS exigem índices e testes; UI administrativa precisa explicar papel + escopo.

## Alternativas rejeitadas na v1

**Um campo de papel no perfil:** rejeitado porque não representa domínios/escopos múltiplos.

**Acesso usuário-unidade separado do papel:** rejeitado porque concederia o mesmo escopo a todas as permissões do usuário, impedindo expressar `Qualidade@UnidadeA` + `Frota@UnidadeB`.

**Sobrescrita direta de permissões por usuário:** adiada; papéis são suficientes para v1 e sobrescritas complicam auditoria e UX.

**Autorização apenas em claims customizados do JWT:** rejeitada como fonte primária. O banco deve refletir as atribuições **atuais**, não claims de longa duração já obsoletos.

## Quando reconsiderar

Reavaliar se:
- consultas de autorização virarem gargalo mensurável;
- surgir necessidade comprovada de sobrescrita de permissões por usuário;
- a organização exigir hierarquia além de unidade/setor;
- identidade externa/SSO alterar o ciclo de vida de contas.
