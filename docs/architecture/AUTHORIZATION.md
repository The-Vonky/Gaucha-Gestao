# Modelo de autorização

**Melhorias aprovadas em 26/10/2026 após teste manual:** foto privada da sala gerida somente por `room_booking.manage`, status verde/vermelho e contagem pelo relógio do servidor, visão da secretária sem cards de solicitante e histórico geral paginado somente para gestão. D5-B, agenda, pedidos próprios e decisões anteriores preservados. [Contrato, segurança e validação](../modules/room-booking/EXPERIENCE_V1.md).

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

**Vendas VEN-02 (integrada na PR #91 em 28/10/2026):** `sales.entry.read/create/edit/delete`
usam `private.has_unit_permission`, sem atribuição automática a papéis. Cinco RPCs
`public.sales_*`, tabelas privadas com RLS restritiva, grants somente de EXECUTE.
Negam escopo setorial e unidade externa; edição exige escopo na origem e no destino,
sem autoria obrigatória; criação/transferência exigem unidade ativa. Perfil,
atribuições, papéis e permissões são bloqueados e revalidados na transação;
consultas históricas incluem unidades inativas. [Contrato completo](../modules/sales/VEN02_OPERATIONS.md).

**Vendas VEN-03 (integrada pela PR #92, 28/10/2026):** `public.sales_dashboard` exige
`sales.dashboard.read` com escopo efetivo global/unidade. Agregados, referências,
ranking e metadados usam somente unidades autorizadas. Snapshot mensal global só
é visível com permissão global; leitor unitário recebe status histórico indisponível
sem presumir fechamento, e deriva o mês corrente apenas por suas datas. Métricas
dependentes ficam nulas quando o status não pode ser confirmado. Nenhum grant
adicionado a papéis reais. [Contrato e decisão do titular](../modules/sales/VEN03_ANALYTICS.md).

**Vendas VEN-04A (integrada na PR #93, 29/10/2026):** menu/Guard de `/sales` aceitam
as capacidades operacionais em global/unidade, excluindo setor. Nova RPC
`public.sales_operation_units(integer,integer)` descobre somente referências Core
cobertas por read/create/edit/delete e suas flags por unidade; não exige nem amplia
admin/dashboard. Escrita não concede consulta. [Contrato e uso](../modules/sales/VEN04A_OPERATIONS_UI.md).

**Vendas VEN-04B (para revisão, 29/10/2026):** `/sales/dashboard` exige
`sales.dashboard.read` global/unitária, independentemente de `sales.entry.*`.
Menu, Guard, abas e páginas preservam a separação; setor não concede agregado de unidade.
Foco em unidade/mês/dia consome apenas a RPC analítica; não chama list/detail nem
catálogo operacional. URL externa é negada, respostas obsoletas são descartadas e
troca de identidade elimina dados anteriores. Status histórico indisponível permanece
indeterminado. Sem mudança de grants/RLS/RPCs; [contrato e cobertura](../modules/sales/VEN04B_DASHBOARD_UI.md).

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

## Agendamento de Salas — fundação AG-01

Catálogo `room_booking.schedule.read`, `room_booking.request.create`, `room_booking.request.read_own` e `room_booking.manage`; solicitante e administrador recebem as três primeiras; gestor recebe as quatro, condicionado à ausência de atribuição administrativa ativa conflitante (D5-B, 26/10/2026). Papéis novos `global_only`, sem atribuição automática. Schema privado e tabelas sem acesso direto, RLS restritiva; RPCs autorizadas e leitura saneada somente em AG-02. Ver [contrato AG-01](../modules/room-booking/AG01_FOUNDATION.md). Implementação autorizada para revisão em 23/10; revisão do titular e merge continuam pendentes, conforme exceção de mantenedor único registrada em `9e20199` (sem parecer independente).


## Agendamento — API AG-02 e interface AG-03 (PR #88)

As tabelas `room_booking` continuam privadas e sem grants de acesso direto. Seis RPCs
`public.room_booking_*` expõem somente operações autorizadas, com `search_path=''`,
EXECUTE restrito a `authenticated` e validação das permissões globais atuais do Core.
Leitura de agenda retorna apenas confirmadas e campos públicos; finalidade e decisões
ficam restritas ao solicitante ou gestor. Helpers travam perfil, atribuições, papéis,
relações de permissões e catálogo antes de revalidar o acesso. Escritas serializam por
sala e mantêm versão, exclusão GiST e auditoria sem textos livres.

A rota `/rooms` espelha as quatro permissões, sem substituir a proteção no banco.
Aplicação incremental autorizada somente no `gaucha-gestao-local`; ver
[contrato e evidências](../modules/room-booking/AG02_AG03_LOCAL.md).

D5-B acrescenta `private.permission_assignment_allowed`, usado por `private.has_scoped_permission` e `core.my_access`: restrição explícita de separação de funções para `room_booking.manage`, exigindo atribuição global ativa de `room_booking_manager` e ausência de `platform_administrator` ativo. Essa exceção aprovada em 26/10 não cria bypass positivo por papel nem dependência do Core em tabelas do módulo. Demais permissões seguem o contrato anterior. `validate_assignment` trava o perfil com `FOR UPDATE` ao ativar/conceder atribuições, serializando com as autorizações que mantêm `FOR SHARE`. [Procedimento técnico e limites](../modules/room-booking/D5B_ACCESS.md).
