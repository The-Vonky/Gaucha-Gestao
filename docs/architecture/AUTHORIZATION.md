# Modelo de autorização

**Estado:** modelo lógico v1 aceito — [ADR-005](../decisions/ADR-005-core-authorization.md). O catálogo inicial abaixo é histórico; o módulo ABC foi acrescentado depois por migration.

## Princípio e equação

Conceder apenas as capacidades e os dados organizacionais necessários, **sem codificar cargos na lógica**.

~~~text
ACESSO
= identidade autenticada
+ perfil Core ativo
+ permissão do papel
+ escopo da atribuição de papel
+ regra da linha e do domínio
~~~

Na ausência de autorização inequívoca, **NEGAR**.

## Identidade, papéis e permissões

Supabase Auth autentica. `auth.users.id` liga-se 1:1 a `core.profiles.id`. Sessão Auth válida **não** dá acesso se o perfil Core está inativo.

Uma **permissão** descreve capacidade (`domain.resource.action`); um **papel** reúne permissões. Aplicação verifica permissões, **não nomes de papéis**.

Correto: `can('audit.inspection.finalize')`. Incorreto: `role === 'qualidade'`.

Cada usuário pode receber múltiplas atribuições com **escopos independentes**:

~~~text
Ana: Qualidade @ global
Bruno: Qualidade @ CMD; Frota @ Matriz
Carla: Visualizador de Qualidade @ HRAD / setor Nutrição
~~~

| `scope_type` | Alcance |
| --- | --- |
| `global` | Todos os registros organizacionais pertinentes à permissão |
| `unit` | Somente registros da unidade da atribuição |
| `sector` | Somente registros do setor na unidade correspondente |

Atribuição de unidade não cobre outra unidade; atribuição setorial não concede automaticamente acesso a registros gerais da unidade.

## Primeiro catálogo de permissões (referência v1)

**Auditoria:** `audit.inspection.read`, `audit.inspection.create`, `audit.inspection.edit`, `audit.inspection.finalize`, `audit.inspection.reopen`, `audit.inspection.export`.

**Planos de Ação:** `action_plan.read`, `action_plan.create_manual`, `action_plan.write`, `action_plan.verify`.

**Administração:** `admin.user.read`, `admin.user.manage`, `admin.role.read`, `admin.role.manage`, `admin.unit.read`, `admin.unit.manage`, `admin.sector.read`, `admin.sector.manage`, `admin.audit_log.read`.

**Core:** `core.unit_cover.read` permite ler capas de unidades; presente historicamente nos papéis `platform_administrator`, `quality`, `quality_viewer`. Gerenciar capa requer `admin.unit.manage`; ver [Unit Cover](../modules/core/UNIT_COVER_V1.md).

Não antecipar permissões de módulos **não implementados**. A Curva ABC acrescentou permissões próprias depois; consultar [mapa atual](IMPLEMENTATION_MAP.md).

**Curva ABC:** `abc.report.read` (papéis `costs_viewer`, `costs`, `platform_administrator`) e `abc.report.publish` (`costs`, `platform_administrator`), sempre por unidade (`private.has_unit_permission`); atribuição de setor não concede a unidade.

| Operação | Permissão na unidade | Implementação |
| --- | --- | --- |
| Consultar séries, revisões, linhas, original | `abc.report.read` | `units`, `unit_series`, `revision_detail`, RLS das tabelas e do bucket `abc-source-files` |
| Visão geral, comparações, produtos, classes, histórico de revisões (v2) | `abc.report.read` | `overview`, `compare`, `competency_products`, `product_history`, `unit_revisions` — sem agregado entre unidades |
| Conferir com o arquivo | `abc.report.read` | `record_file_check` (registra no log) |
| Enviar original e publicar/substituir revisão | `abc.report.publish` | `begin_source_upload`, `confirm_source_upload`, `publish_revision` |
| Categorias comerciais, ajustes, exportação em planilha, comparação entre unidades | **não implementado** | Decisões D3–D6 da [matriz](../modules/abc/MATRIZ_EQUIVALENCIA_LEGADO.md); exigirão permissões e contratos próprios |

## Navegação e aplicação no banco

O menu deriva das permissões efetivas, mas sua ocultação é apenas **UX**. A autoridade está em grants, **RLS e RPCs** no banco.

Toda tabela acessível pela Data API tem **grants explícitos, RLS ativo e políticas baseadas em permissão/escopo**. Schemas expostos no desenho inicial: `core`, `audit`, `action_plans`; atualmente também `abc`. Helpers sensíveis ficam em schemas não expostos como `private`.

Helpers conceituais: `is_active_user()`, `has_global_permission(permission)`, `has_unit_permission(permission, unit_id)`, `has_scoped_permission(permission, unit_id, sector_id)`. Centralizá-los, evitando reescrever EXISTS por módulo. `SECURITY DEFINER` exige `search_path` fixo e `EXECUTE` restrito.

Recursos com `unit_id` usam autorização da unidade; com `unit_id`/`sector_id`, autorização do setor; operação administrativa global requer atribuição global quando aplicável. **Autorização não substitui invariantes de negócio.**

## Exportação, arquivos e Realtime

Exportação nunca contorna escopo de leitura. Anexos herdam autorização da entidade de negócio e capacidade pertinente de escrita/remoção. Conhecer um object key/ID não concede acesso.

Realtime, quando usado, deve respeitar RLS/escopo como uma leitura comum; ele **não faz parte do Compose mínimo de cinco serviços**.

## Administração e ciclo de vida

Concessões/revogações exigem permissão administrativa e trilha de auditoria; esconder UI não basta. Administrador da plataforma é papel privilegiado de atribuição global, não bypasss individuais `if admin`.

Usuários/unidades com referências históricas devem normalmente ser **desativados** e continuar representáveis no histórico.

## Testes de autorização

Negar: usuário inativo, sem papel, sem permissão, unidade incorreta, setor incorreto, acesso a outro módulo por papel indevido e ID adivinhado. Permitir: grant global ou da unidade/setor corretos. Confirmar exportação com escopo, proteção de anexos e auditoria de mutações administrativas.
