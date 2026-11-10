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
Menu agrupado, Guard do módulo, atalhos contextuais e páginas preservam a separação;
setor não concede agregado de unidade. MEL-03–06: `/sales/entries` é operacional,
`/sales` escolhe entrada conforme capacidade e mantém queries operacionais antigas;
retorno revalida escopo da unidade e nunca concede acesso. Nenhuma mudança de RLS/RPC.
Foco em unidade/mês/dia consome apenas a RPC analítica; não chama list/detail nem
catálogo operacional. URL externa é negada, respostas obsoletas são descartadas e
troca de identidade elimina dados anteriores. Status histórico indisponível permanece
indeterminado. RLS/RPCs preservadas; [contrato e cobertura](../modules/sales/VEN04B_DASHBOARD_UI.md).

## Correção institucional de Vendas — VEN-04B, 29/10/2026

Decisão expressa do mantenedor após revisão visual da PR #94. A ausência das
relações em `core.role_permissions` na VEN-01 impedia o acesso do administrador,
mesmo com perfil Core e atribuição global ativos. A migration append-only
`20261029180613_sales_institutional_roles.sql` provisiona a composição abaixo:

| Papel protegido | Capacidades explícitas | Escopo da atribuição |
| --- | --- | --- |
| `platform_administrator` | `sales.entry.read/create/edit/delete`, `sales.dashboard.read`, `sales.export.filtered/full` | Global existente |
| `sales_manager` — Sales Manager | As mesmas sete capacidades de Vendas | Global ou unidade; setor não concede unidade |
| `sales_operator` — Sales Operator | `sales.entry.read`, `sales.entry.create` | Global ou unidade; setor não concede unidade |

`system=true`, sem atribuir os novos papéis automaticamente. Nenhuma capacidade de
outro módulo nos papéis de Vendas. Exportações permanecem **capacidades reservadas**:
a composição não implementa VEN-05. Colisões personalizadas/divergências falham;
reexecução válida não duplica papéis/relações. Autorização continua por capacidade,
perfil ativo e escopo, sem inferência positiva pelo nome do papel.

**D5-B preservada integralmente:** administrador continua sem `room_booking.manage`;
nenhuma função, política ou provisionamento de Agendamento foi alterado. A limpeza
física de 58 papéis comprovadamente sintéticos foi autorizada somente no notebook,
com inventário, preservação privada, dry-run/ROLLBACK e transação por UUID. Não faz
parte da migration e não altera a visibilidade de papéis inativos legítimos.
Testes Auth locais retiram seus papéis e relações no teardown, preservando auditoria
e histórico financeiro. [Relatório e reprodução](../modules/sales/VEN04B_ACCESS_CORRECTION.md).

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

**Vendas VEN-05A (implementada para revisão, 03/11/2026):**
`public.sales_export_page` exige identidade ativa e, em cada unidade,
`sales.entry.read` + `sales.export.filtered` ou `sales.export.full`, conforme modo.
Ajustes/justificativas exigem ainda `sales.dashboard.read` na mesma unidade;
ausência fica explícita no arquivo, sem revelar dados recusados. Global/unidade,
inclusive histórico inativo; setor negado. Unidade explícita fora da interseção
nega a chamada inteira. Cada página e a conferência final revalidam o acesso;
alterações de conjunto/escopo invalidam o token. Nenhum grant ou papel acrescentado;
tabelas privadas e RLS preservadas. A partir de `20261104122256`, listagem e
exportação incluem somente o nome atual do criador dos lançamentos autorizados,
sem abrir o diretório de perfis nem exportar e-mail/UUID do criador. Mudança de
nome também invalida o token. [Matriz, consistência e limites](../modules/sales/VEN05A_EXCEL_EXPORT.md).

Exportação nunca contorna escopo de leitura. Anexos herdam autorização da entidade de negócio e capacidade pertinente de escrita/remoção. Conhecer um object key/ID não concede acesso.

Realtime, quando usado, deve respeitar RLS/escopo como uma leitura comum; ele **não faz parte do Compose mínimo de cinco serviços**.

## Administração e ciclo de vida

Concessões/revogações exigem permissão administrativa e trilha de auditoria; esconder UI não basta. Administrador da plataforma é papel privilegiado de atribuição global, não bypasss individuais `if admin`.

Usuários/unidades com referências históricas devem normalmente ser **desativados** e continuar representáveis no histórico.

## Testes de autorização

Negar: usuário inativo, sem papel, sem permissão, unidade incorreta, setor incorreto, acesso a outro módulo por papel indevido e ID adivinhado. Permitir: grant global ou da unidade/setor corretos. Confirmar exportação com escopo, proteção de anexos e auditoria de mutações administrativas.

## Agendamento de Salas — fundação AG-01

Catálogo `room_booking.schedule.read`, `room_booking.request.create`, `room_booking.request.read_own` e `room_booking.manage`; solicitante e administrador recebem as três primeiras; gestor recebe as quatro, condicionado à ausência de atribuição administrativa ativa conflitante (D5-B, 26/10/2026). Papéis novos `global_only`, sem atribuição automática. Schema privado e tabelas sem acesso direto, RLS restritiva; RPCs autorizadas e leitura saneada somente em AG-02. Ver [contrato AG-01](../modules/room-booking/AG01_FOUNDATION.md). Implementação autorizada para revisão em 23/10; revisão do titular e merge continuam pendentes, conforme exceção de mantenedor único registrada em `9e20199` (sem parecer independente).

GG-08 permite ler o contato da sala com `room_booking.schedule.read` e exige `room_booking.manage` efetivo para gravá-lo com versão otimista e auditoria. GG-09 exige gestão efetiva para consultar tanto solicitações quanto reservas diretas. As três RPCs novas usam a autorização existente do Agendamento, sem grants diretos sobre as tabelas. D5-B se aplica inclusive ao administrador com atribuição conflitante e D6 segue a atribuição efetiva da substituta. [Contratos do Agendamento](../modules/room-booking/EXPERIENCE_V1.md#gg-08-e-gg-09--contato-e-histórico-de-gestão).


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


## Comunicados — GG-10, Entrega B (05/11/2026, para revisão)

Capacidade explícita `announcements.notice.manage`, somente atribuição global
ativa sobre perfil/papel/permissão ativos. Migration proposta adiciona a relação
a `platform_administrator` e cria o papel protegido/global-only
`announcement_manager` (Gestor de Comunicados) com **somente essa capacidade**.
Não atribui papéis a pessoas, não concede administração geral, não modifica
permissões de Usuários/Perfis/Unidades/Setores/Logs e preserva D5-B.

Menu/Guard de `/admin/announcements` espelham a capacidade global; quatro RPCs
`public.announcements_*` validam acesso no servidor. Tabelas privadas com RLS
restritiva e sem DML/USAGE de clientes. Escrita revalida/bloqueia referências Core
e registro versionado até o commit. Histórico é exclusivo da gestão. Usuários
comuns ativos recebem somente comunicados globais publicados dentro do período,
sem rascunhos/futuros/autoria. Não há segmentação por unidade/setor nesta versão.
Aplicada somente no Supabase local autorizado em 05/11/2026; negativas e persistência reais [validadas](../modules/announcements/LOCAL_VALIDATION_20261105.md). [Contrato e decisões](../modules/announcements/ADMINISTRATION_V1.md).

## Relatos e sugestões — GG-11

`feedback.report.read` pertence à atribuição global ativa de
`platform_administrator`. Um trigger em `core.role_permissions` rejeita
delegação a outros papéis e a checagem de domínio exige a relação vigente com
o papel. O menu e a rota usam a projeção Core. Listagem, detalhes e download
autenticado reavaliam a sessão, o perfil e a atribuição no servidor.

O envio está disponível a perfis ativos com sessão vigente e vincula a autoria
a `auth.uid()`. O funcionário pode repetir o próprio envio para obter o recibo.
A tabela privada tem RLS restritiva e as RPCs de leitura administrativa são
separadas das de recebimento. [Contrato GG-11](../modules/feedback/FEEDBACK_V1.md).
