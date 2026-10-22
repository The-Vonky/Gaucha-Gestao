# Arquitetura desenhada — AS-IS e TO-BE

**Fotografia reconciliada:** main após PR #69 (`fed0e0f`, 20/10/2026). **Produção: NO-GO.**
**Autoridades:** [ADR-001](../decisions/ADR-001-modular-monolith.md), [ADR-002](../decisions/ADR-002-core-and-module-ownership.md), [ADR-004](../decisions/ADR-004-platform-stack.md), [ADR-005](../decisions/ADR-005-core-authorization.md), [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md).
Diagramas lógicos, **não diagramas as-built de servidor em produção**. Linhas pontilhadas indicam direção ainda não entregue/validada.

**Diagrama físico de STAGING de 22/10/2026:** ver [C30_STAGING_AS_BUILT](../operations/C30_STAGING_AS_BUILT_20261022.md). É distinta da topologia futura Cloudflare Workers/R2 deste arquivo: Caddy/HTTPS estão ativos apenas no loopback e nenhum túnel público foi implantado.

## 1. Contexto da plataforma

~~~mermaid
flowchart LR
  USER["Usuário autorizado"] --> UI["Gaúcha Gestão — Web"]
  ADMIN["Administrador autorizado"] --> UI
  UI --> AUTH["Supabase Auth"]
  UI --> DATA["Data API com RLS / RPCs"]
  UI --> FILE["Supabase Storage API"]
  DATA --> PG[("PostgreSQL / Core e domínios")]
  AUTH --> PG
  FILE --> PG
  LEGACY["Sistemas standalone"] -. "migração futura por módulo" .-> DATA
  OPS["Operador técnico"] -. "gates, backup, recuperação" .-> PG
~~~

O administrador inicial não pode ser criado por procedimento privilegiado não aprovado. A plataforma consome Auth, PostgREST e Storage; **a checagem de permissão na UI não é a barreira de acesso**.

## 2. Componentes implementados no repositório (AS-IS)

~~~mermaid
flowchart TB
  subgraph WEB["apps/web — React 19, TypeScript, Vite"]
    SHELL["App Shell + navegação"]
    AUTHUI["AuthProvider / sessão / my_access"]
    COREUI["Admin — usuários, permissões, papéis, unidades, setores, logs"]
    AUDITUI["Auditorias e relatórios"]
    PLANSUI["Planos de Ação"]
    ABCUI["Curva ABC — importação e revisões"]
    SHARED["shared — UI / utilidades"]
  end
  SHELL --> AUTHUI
  SHELL --> COREUI
  SHELL --> AUDITUI
  SHELL --> PLANSUI
  SHELL --> ABCUI
  COREUI --> API["supabase-js"]
  AUDITUI --> API
  PLANSUI --> API
  ABCUI --> API
  AUTHUI --> API
  SHARED -. "consumido internamente" .-> AUDITUI
  API --> AUTH["GoTrue"]
  API --> REST["PostgREST — RPCs e tabelas expostas"]
  API --> STORAGE["Storage API — buckets privados"]
  AUTH --> DB[("PostgreSQL 17")]
  REST --> DB
  STORAGE --> DB
  STORAGE --> OBJ["Objetos: backend local em CI/lab"]
~~~

*Ambientes:* o pipeline de aplicação usa Supabase CLI descartável; o pipeline de infraestrutura valida, isoladamente, um Compose mínimo de **db, kong, auth, rest, storage**. O diagrama acima mostra dependências funcionais, não presume que todos os ambientes já tenham ingress/CDN/Tunnel/R2.

## 3. Infraestrutura prevista para produção (TO-BE, NÃO IMPLANTADA)

~~~mermaid
flowchart TB
  BROWSER["Navegador"] --> CF["Cloudflare DNS / WAF"]
  CF -. "assets" .-> WORKER["Workers Static Assets — frontend"]
  CF -. "API pública controlada" .-> TUNNEL["Cloudflare Tunnel"]
  TUNNEL -. "origem privada" .-> KONG["Kong — API gateway"]
  subgraph C30["Lenovo ThinkStation C30 — Ubuntu Server LTS bare metal (pendente de aceite)"]
    KONG -.-> GOTRUE["GoTrue / Auth"]
    KONG -.-> REST["PostgREST"]
    KONG -.-> STORE["Storage API"]
    GOTRUE -.-> PG[("PostgreSQL 17")]
    REST -.-> PG
    STORE -.-> PG
  end
  STORE -. "S3 compatível; configuração a homologar" .-> R2[("Cloudflare R2")]
  PG -. "base + WAL/PITR; ferramenta e destino pendentes" .-> BACKUP[("Backup independente / off-site")]
  R2 -. "cópia e recuperação a definir" .-> BACKUP
  CICD["GitHub Actions"] -. "validação; deploy controlado futuro" .-> C30
~~~

**Não interpretar este desenho como deploy, configuração de produção executável, teste de hardware, backup existente, HA ou capacidade aprovada.** O host substitui a HP ML350 histórica no ADR-004; a instalação do Ubuntu depende de inventário, preservação e aceite. Realtime/Supavisor/Studio não fazem parte do perfil mínimo de cinco serviços da validação ADR-006; qualquer ampliação exige necessidade concreta e decisão/documentação.

## 4. Dependências do monólito modular

~~~mermaid
flowchart LR
  SHELL["App Shell"] --> C["Core"]
  SHELL --> A["Audit"]
  SHELL --> P["Action Plans"]
  SHELL --> ABC["Curva ABC"]
  A --> C
  P --> C
  ABC --> C
  ABC --> S
  A --> S["Shared"]
  P --> S
  C --> S
  FUT["Futuros módulos: ISO, Vendas, Satisfação, Salas, Frota, P×R, Contratos"] -. "após gate de migração" .-> C
  A -. "contrato público explícito, sem ler internals" .-> P
~~~

A seta Audit → Planos representa **somente a integração pública autorizada** dos planos originados em auditorias, não dependência de arquivos internos ou leitura indiscriminada de tabelas. Core não referencia módulos de negócio. Agrupamento de menu não muda propriedade técnica.

## Curva ABC v1 — AS-IS, fronteira de confiança

~~~mermaid
flowchart LR
  XLSX["XLSX ERP"] --> PARSE["Parser browser: prévia e bloqueios"]
  PARSE --> UP["begin_source_upload"]
  UP --> OBJ["Storage privado abc-source-files"]
  OBJ --> CONF["confirm_source_upload: tamanho e MIME"]
  CONF --> PUB["publish_revision: valida payload + RLS + versão"]
  PUB --> DB[("abc: série / revisões / linhas")]
  PUB --> LOG[("core.system_audit_log")]
  DB --> REV["Consulta de revisão"]
  OBJ --> CHECK["Conferir com o arquivo no browser"]
  REV --> CHECK
  CHECK --> LOG
~~~

**Não confundir:** o SQL não reprocessa o XLSX original nem recalcula SHA-256 dos bytes físicos antes de publicar; a conferência de conteúdo é posterior pelo navegador. [Risco detalhado](THREAT_MODEL.md) e [guia ABC](../modules/abc/OPERATOR_GUIDE_V1.md).

## 5. Modelo lógico de identidade e escopo (resumo)

~~~mermaid
erDiagram
  AUTH_USERS ||--|| CORE_PROFILES : "id"
  CORE_PROFILES ||--o{ USER_ROLE_ASSIGNMENTS : "user"
  ROLES ||--o{ USER_ROLE_ASSIGNMENTS : "role"
  ROLES ||--o{ ROLE_PERMISSIONS : "possui"
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : "incluida"
  UNITS ||--o{ UNIT_SECTORS : "tem"
  SECTORS ||--o{ UNIT_SECTORS : "atua_em"
  UNITS o|--o{ USER_ROLE_ASSIGNMENTS : "escopo_unit"
  SECTORS o|--o{ USER_ROLE_ASSIGNMENTS : "escopo_setor"
~~~

O escopo pode ser **global, unidade ou setor dentro de unidade**; não inferir que toda atribuição tem unidade/setor. Consulte [DATA_MODEL](DATA_MODEL.md) para o modelo formal, [AUTHORIZATION](AUTHORIZATION.md) para autorização e [migrations](../../supabase/migrations/) para DDL executável. Registros de Auditorias e Planos permanecem nos schemas de domínio, sem tabelas universais de anexos.

## 6. Trilha de entrega de módulos

~~~mermaid
flowchart LR
  INVENT["Inventário do legado"] --> RULES["Regras e paridade"]
  RULES --> CONTRACT["Contratos, dados, permissões"]
  CONTRACT --> BRIEF["Brief / decisão aprovada"]
  BRIEF --> IMPLEMENT["Implementação isolada"]
  IMPLEMENT --> SEC["Testes e RLS"]
  SEC --> RECON["Reconciliação de dados"]
  RECON --> ACCEPT["Aceite humano"]
  ACCEPT --> CUT["Cutover controlado"]
  CUT --> LEG["Legado preservado / rollback"]
~~~

Nenhum módulo futuro se torna aprovado só por constar do desenho. A ordem/estratégia são definidas pelo [roadmap canônico](../migration/MODULE_ROADMAP.md).

## Regra de atualização

Se mudar serviço, diagrama, propriedade de entidade, comunicação ou status da produção, revisar este arquivo **junto** de [STACK_INTEGRATION](STACK_INTEGRATION.md), dos ADRs afetados e do [Plano Diretor](../planning/PLANO_DIRETOR_2026.md).
