# Modelo de autorização

**VIGENTE na `main`.** [ADR-002](../decisions/ADR-002-core-and-module-ownership.md) define a propriedade do Core e dos módulos. [ADR-005](../decisions/ADR-005-core-authorization.md) define o modelo. O [Registro de Decisões](../planning/DECISION_REGISTER.md) registra a evolução por domínio. Para a adoção por ambiente, consulte [os gates](FOUNDATION_GATES.md).

## Princípio e equação

```text
identidade autenticada → perfil Core ativo → permissão efetiva
                       → escopo da atribuição → regra da linha e do domínio
```

A ausência de qualquer condição exigida nega o acesso. Uma permissão descreve uma capacidade. Um papel reúne permissões. Cada atribuição liga um usuário a um papel em um escopo próprio. O Core avalia perfil, atribuição, papel e permissão ativos. O módulo aplica regras adicionais como autoria, estado, versão e privacidade dos campos. No perfil estrito, a sessão também deve estar viva e admitida para a geração atual da credencial. [Fronteira GG-05B](GG05B_IDENTITY_DESIGN.md#contrato-vigente-no-dev).

## Identidade, papéis e permissões

GoTrue autentica e `auth.users.id` identifica o perfil `core.profiles.id` em relação 1:1. Os grants de negócio são consultados no banco. Claims de sessão e `core.my_access` sustentam, respectivamente, a identidade da sessão e a projeção de acesso usada pela interface.

| Atribuição | Alcance |
| --- | --- |
| `global` | Todos os registros cobertos pela capacidade e pela regra do módulo, sem unidade ou setor na atribuição. |
| `unit` | Recursos da unidade atribuída. |
| `sector` | Recursos do setor dentro da unidade atribuída. Um grant setorial não cobre registros gerais da unidade. |

Uma pessoa pode ter Qualidade em uma unidade e Vendas em outra. Cada operação considera a permissão e o escopo da atribuição correspondente. Papéis protegidos usam a composição versionada no catálogo. Papéis `global_only` exigem atribuição global.

## Matriz de autorização vigente

| Domínio e papel ou capacidade | Escopo, operações e restrições | Aplicação e evidência versionada |
| --- | --- | --- |
| Core · Platform Administrator (`platform_administrator`) | Atribuição global. Administra cadastros, papéis, atribuições e logs conforme o catálogo. Recebe capacidades explícitas de negócio, incluindo gestão de Salas e as sete capacidades de Vendas. Identidade privilegiada exige autoridade adicional. | Grants, RLS e RPCs Core. [Contrato Core](CORE_FOUNDATION_V2.md) · [Matriz com JWT](../../tests/integration/core-security-matrix.mjs). |
| Core · Administração delegada e revisão | Capacidades `admin.*` e escopo efetivo por operação. Concessão exige autoridade sobre a composição e o escopo. A revisão projetada de acesso de terceiros segue a audiência autorizada do operador. | `private.can_delegate`, `private.can_revoke`, RLS e versão. [Leitura de governança](../modules/core/ACCESS_GOVERNANCE_READ_V1.md). |
| Core · Operador de Identity | `admin.user.manage` global efetivo, sessão admitida para módulos e capacidade privada específica de cadastrar ou redefinir. O cadastro admite até um papel delegável, com unidade/setor conforme o papel. | Serviço interno, contratos SQL privados e admissão por geração. [GG-05B](GG05B_IDENTITY_DESIGN.md#contrato-vigente-no-dev) · [Integração real](../../tests/integration/gg05b-identity.mjs). |
| Auditorias e Planos de Ação · Qualidade e visualização | Capacidades de leitura, escrita, finalização, reabertura, verificação e exportação atribuídas por operação. Auditorias exige escopo efetivo na unidade. Planos de Ação considera unidade e setor do plano. Cada transição exige o estado previsto pelo domínio. | RPCs e RLS de domínio e Storage. [Aceite da Qualidade](../modules/audit/QUALITY_ACCEPTANCE_V1.md) · [Evidências](../briefs/EVIDENCE_STORAGE_V1.md). |
| Core · Capas de unidades | Leitura por `core.unit_cover.read` ou `admin.unit.manage` na unidade. Gestão exige `admin.unit.manage`. | RPCs e bucket privado. [Unit Cover](../modules/core/UNIT_COVER_V1.md). |
| Curva ABC · `abc.report.read` e `abc.report.publish` | Escopo por unidade efetiva. Leitura de séries, revisão, original e comparação na unidade. Publicação e substituição exigem permissão própria. Atribuição setorial não cobre a unidade. | RPCs, RLS e bucket `abc-source-files`. [Domínio ABC](../briefs/ABC_DOMAIN_V1.md) · [Ameaças de validação XLSX](THREAT_MODEL.md). |
| Vendas · Sales Manager e Sales Viewer | Atribuição global ou por unidade. O Manager opera lançamentos. Ambos consultam, analisam e exportam no escopo autorizado. Setor fica fora da cobertura da unidade. | `private.has_unit_permission`, RPCs e tabelas privadas. [GG-04](#perfis-institucionais-de-vendas--gg-04) · [Catálogo](../../tests/sales-institutional-database.test.ts) · [Escopo](../../tests/sales-operations-database.test.ts). |
| Salas · Room Booking Requester e Room Booking Manager | Atribuições globais explícitas. Requester consulta a agenda e cria/consulta pedidos próprios. Manager tem também gestão, fila, histórico, contato e foto. | RPCs com revalidação, tabelas privadas e RLS de Storage. [AG-D5-C](../modules/room-booking/D5C_ADMIN_MODES.md) · [Aceite](../modules/room-booking/ACCEPTANCE_V1.md). |
| Comunicados · `announcements.notice.manage` | Gestão global explícita em Platform Administrator ou Gestor de Comunicados. Perfil ativo com acesso à aplicação pode ler publicados durante a vigência, inclusive sem papel operacional. | RPCs e tabelas privadas. Escrita versionada e auditada. [Contrato](../modules/announcements/ADMINISTRATION_V1.md) · [Validação local datada](../modules/announcements/LOCAL_VALIDATION_20261105.md). |
| Relatos · `feedback.report.read` | Envio com autoria da sessão ativa. Leitura administrativa exige atribuição atual de Platform Administrator global. O catálogo restringe delegação da capacidade. | RPCs e bucket privado, com [limitação do ingresso estrito para anexos](SECURITY.md#storage-privado-e-miniaturas). [Contrato GG-11](../modules/feedback/FEEDBACK_V1.md). |

## Perfis institucionais de Vendas — GG-04

| Capacidade | Sales Manager (`sales_manager`) | Sales Viewer (`sales_viewer`) | Platform Administrator |
| --- | --- | --- | --- |
| `sales.entry.read` | Sim | Sim | Sim |
| `sales.entry.create`, `sales.entry.edit`, `sales.entry.delete` | Sim | — | Sim |
| `sales.dashboard.read` | Sim | Sim | Sim |
| `sales.export.filtered`, `sales.export.full` | Sim | Sim | Sim |

[GG-04, PR #126](https://github.com/The-Vonky/Gaucha-Gestao/pull/126) consolidou os papéis protegidos. A [migration GG-04](../../supabase/migrations/20261118132509_gg04_sales_institutional_roles.sql) criou o Viewer sem atribuições automáticas e removeu `sales_operator` do catálogo e de suas relações de permissões, com auditoria. A remoção aborta diante de atribuições ativas ou revogadas, dependências inesperadas ou divergências de catálogo. As migrations de criação do papel antigo permanecem no histórico. Atribuição e revogação em operação seguem o Core.

Escrita operacional revalida o perfil e o escopo atual, incluindo origem e destino em transferência. Criar e transferir exigem unidade de destino ativa. A leitura autorizada inclui o histórico de unidades inativas. O dashboard consulta somente agregados autorizados e resguarda o fechamento global de leitores unitários. Para exportar, cada unidade precisa de `sales.entry.read` e da capacidade de exportação do modo escolhido. Exportar completa percorre o histórico autorizado. Ajustes analíticos exigem também `sales.dashboard.read`. O contrato preserva a precisão monetária e revalida o conjunto autorizado entre páginas e antes de gerar o arquivo. [Operação](../modules/sales/VEN02_OPERATIONS.md) · [Análise](../modules/sales/VEN03_ANALYTICS.md) · [Exportação](../modules/sales/VEN05A_EXCEL_EXPORT.md).

## Navegação e aplicação no banco

O menu e os Guards usam capacidades efetivas para orientar a navegação. As superfícies expostas aplicam ACLs/grants, RLS e RPCs de contrato explícito. Os schemas internos ficam fora da Data API. Funções `SECURITY DEFINER` exigem `search_path` fixo, referências qualificadas e `EXECUTE` restrito. Os [manifests](../../infra/local/compose.yaml) definem os schemas expostos por perfil. O [contrato de integração](API_CONTRACTS.md) aponta os consumidores das APIs.

## Exportação, arquivos e Realtime

O escopo de leitura limita exportações. Os objetos privados herdam autorização de domínio, de unidade quando aplicável e do estado da referência. [Storage no perfil base e no estrito](SECURITY.md#storage-privado-e-miniaturas). Realtime exigiria inventário e validação próprios de autorização.

## Administração e ciclo de vida

Concessão e revogação exigem `admin.user.manage` global e autoridade sobre as permissões pertinentes no escopo. Revogação considera permissões ativas mesmo se o papel estiver inativo. Concessão não pode elevar acima da autoridade atual do operador. O Core restringe a revogação da própria atribuição e a edição do próprio perfil pela administração. A alteração de perfil de terceiros também exige autoridade para revogar suas atribuições ativas. Mudanças são auditadas. Revogar mantém a atribuição anterior no histórico. Conceder novamente cria nova linha. A inativação de perfil revoga as atribuições e preserva autoria histórica. Em Identity, a inativação também invalida admissões e avança a geração. Reativar permite um login novo quando a credencial está apta. A reconstrução de acesso segue concessões explícitas. [Operação GG-05B](../operations/GG_05B_IDENTIDADE_DEV.md).

## Testes de autorização

A cobertura de regressão deve incluir perfil inativo, sessão revogada, grants insuficientes ou revogados, unidade ou setor incorretos, acesso a registro de outro autor e mutações administrativas auditadas. Casos em banco em memória sustentam regressão de SQL. As integrações reproduzem as fronteiras Auth/API/Storage que exercitam. [Matriz Core](../../tests/integration/core-security-matrix.mjs) · [Identity](../../tests/integration/gg05b-identity.mjs) · [Fundação](FOUNDATION_GATES.md#gate-4--autenticação-e-autorização).

## Agendamento de Salas — decisão AG-D5-C (23/11/2026)

Com perfil ativo, atribuição global ativa e relação atual com a permissão, `platform_administrator` e `room_booking_manager` podem gerir a sala. O Requester autorizado usa agenda e pedidos próprios. A agenda retorna confirmadas com os campos públicos do contrato. Pedidos próprios vinculam a autoria a `auth.uid()` e só podem ser cancelados pelo titular enquanto pendentes e com início futuro. A fila e os históricos são reservados à gestão. A leitura de contato e foto exige leitura da agenda. Sua alteração e os históricos exigem gestão efetiva. As tabelas permanecem privadas.

O administrador global entra em **Room Booking Requester** e pode alternar para **Room Booking Manager**. `public.room_booking_admin_context()` projeta a atribuição administrativa global para o seletor. A escolha é transitória na UI e o backend continua autorizando as operações de gestão do administrador mesmo na vista Requester. Usuários comuns recebem a experiência correspondente às suas capacidades. [Contrato e risco residual](../modules/room-booking/D5C_ADMIN_MODES.md).

A GG-05B permite a atribuição de `room_booking_manager` ou `room_booking_requester` no cadastro global, com unidade e setor nulos e delegação efetiva. Outros papéis `global_only` e papéis com permissões `admin.%` continuam excluídos do cadastro. [SQL AG-D5-C](../../supabase/migrations/20261123143000_room_booking_admin_modes.sql). [D5-A e D5-B](../planning/DECISION_REGISTER.md#adendo-ag-d5-c--23112026) ficam como decisões históricas. O módulo permanece independente da agenda legada.
