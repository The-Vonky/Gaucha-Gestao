# Racional da stack: decisões, alternativas e evolução

**Estado:** revisão da `main` após a [PR #69](https://github.com/The-Vonky/Gaucha-Gestao/pull/69), em 20/10/2026. **Produção NO-GO.** Este documento explica decisões existentes; não cria ADRs nem aprova serviços ou custos adicionais. Fontes canônicas: [ADR-001](../decisions/ADR-001-modular-monolith.md), [ADR-002](../decisions/ADR-002-core-and-module-ownership.md), [ADR-004](../decisions/ADR-004-platform-stack.md), [ADR-005](../decisions/ADR-005-core-authorization.md), [ADR-006 proposto](../decisions/ADR-006-infra-v1-reused-hardware.md), [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md).

## Por que este conjunto de tecnologias?

O projeto prioriza **controle do runtime e dos dados, custo recorrente contido, Core comum e operação proporcional a um host único**. Essa é uma decisão contextual registrada em ADRs, **não prova de superioridade universal** ou benchmark entre fornecedores. A contrapartida é assumir operação, segurança, disponibilidade limitada por host único, atualizações, backup e recuperação.

| Tecnologia | Como funciona na Gaúcha Gestão | Motivo/benefício | Alternativas e limites |
| --- | --- | --- | --- |
| React 19, TypeScript 5, React Router 7 | SPA modular em `apps/web`: App Shell, Core, Auditoria, Planos e Curva ABC | Componentização e contratos tipados numa aplicação corporativa com módulos | SSR/full-stack não é requerido na v1; **UI não substitui RLS** |
| Vite 6 e Node >=22.12 | DEV e compilação do frontend; build vira assets estáticos | Pipeline enxuto; não requer backend Node executando regras em PROD | Chunk size e desempenho devem ser medidos; não é servidor de negócio |
| Supabase Auth (GoTrue) | Login/sessão JWT; `AuthProvider` carrega `core.profiles` e `core.my_access` | Autenticação compartilhada sem duplicar identidade por módulo | Operação self-hosted e governança de contas privilegiadas continuam responsabilidades; ADR-007 **NO-GO** |
| PostgreSQL 17, `numeric`, RLS, SQL/RPC | Core, Audit, Action Plans e ABC; integridade, operações atômicas e autorização no banco | Dados, escopo e invariantes checados em camada confiável, sob transação | Requer migrations incrementais e testes SQL/JWT reais; `SECURITY DEFINER` exige revisão rigorosa |
| PostgREST + supabase-js 2 | Cliente acessa schemas explicitamente expostos (`core`, `audit`, `action_plans`, `abc`) | Dispensa API de negócio Node/FastAPI paralela para os contratos aprovados | RPC e RLS são APIs de segurança: mudanças exigem contratos, escopos e regressão |
| Storage API Supabase | Buckets privados para evidências, capas e `abc-source-files` | Integra autorização de objetos e fluxos de upload existentes | Banco e bytes não têm transação distribuída; MIME/hash não provam que XLSX foi reprocessado no servidor |
| Kong | Gateway Auth/REST/Storage do Compose mínimo | Gateway compatível com o baseline self-hosted pinado | Versões/topologia precisam de teste na infra; não expor painéis administrativos |
| Docker Engine + Compose | Cinco serviços: `db`, `kong`, `auth`, `rest`, `storage` | Topologia simples e reproduzível para host único e CI | Não oferece HA; reset/down -v só em stack **descartável explicitamente identificada** |
| Lenovo ThinkStation C30, Ubuntu Server LTS bare metal | Host **escolhido** para PROD futura, conforme ADR-008 | Evita overhead de VM no inventário de 8 GiB e dedica o host à plataforma | SPOF, RAM/SSD/UPS e capacidade sem aceite; host ainda não equivale a produção |
| Cloudflare Workers Static Assets + DNS/WAF/Tunnel | Frontend e ingresso seguro **previstos para PROD** | Assets servidos fora do host e API sem portas públicas de entrada | WAF/Tunnel **não autorizam dados**; configuração, redes e disponibilidade ainda não homologadas |
| Cloudflare R2 | Backend S3 compatível preferido para bytes em PROD **TO-BE** | Desacoplar objeto físico do SSD local | R2 não é backup; cópia independente, retenção, custos e restore precisam de prova |
| GitHub Actions + Vitest/PGlite/Playwright | CI `validate`, `action-plans-integration`, `infra-validate`, testes de banco e interface | Evidência reproduzível por commit; diferentes camadas de regressão | CI descartável não comprova servidor, iOS/Android físicos ou O1–O8 |
| Mermaid em Markdown | Diagramas de arquitetura, sequência e processo versionados no Git | Revisões de texto/diagramas podem acompanhar diffs de código | É necessário verificar **renderização** e precisão do desenho, não só sintaxe |
| Ansible + WAL/PITR + observabilidade | **Planejados**, não instalados/provados | Rebuild do host, recuperação e detecção de falhas | Ferramenta, RPO/RTO, retenção, custos e destino off-site continuam dependentes de decisão |

O ADR-004 aceita ainda tecnologias opcionais como Realtime/Supavisor; elas **não** fazem parte do perfil mínimo atual de cinco serviços. Sua menção histórica não é autorização para ativá-las. O host do ADR-004 (ML350/VM) foi **parcialmente substituído** pelo ADR-008 (C30/bare metal).

## Percurso real de uma requisição

~~~mermaid
flowchart LR
  U["Usuário"] --> WEB["React / supabase-js: chave pública"]
  WEB --> AUTH["GoTrue: sessão JWT"]
  WEB --> KONG["Kong: gateway"]
  KONG --> REST["PostgREST: RPC + RLS"]
  KONG --> STORAGE["Storage API: objeto privado"]
  REST --> PG[("PostgreSQL: core, audit, action_plans, abc")]
  AUTH --> PG
  STORAGE --> PG
  STORAGE --> FILE["Objetos locais em CI/DEV; R2 futuro"]
  PG --> LOG["core.system_audit_log"]
~~~

**Identidade não é autorização.** A navegação do browser recebe grants para usabilidade; o banco aplica papéis, escopo, RLS e validações de negócio. O módulo ABC lê XLSX no browser, publica revisões via RPC e confere o original posteriormente; o SQL **não** reinterpreta os bytes físicos do XLSX. Ver [WORKFLOWS](WORKFLOWS.md) e [THREAT_MODEL](THREAT_MODEL.md).

## Estado, dependências e critérios de evolução

1. **AS-IS de software:** Core v2, Auditoria/Qualidade, Planos de Ação e Curva ABC v1 integrados ao repositório. A Curva ABC não migra histórico do desktop; comparações/exportação/correção manual ficam para briefs futuros.
2. **AS-IS de infraestrutura:** testes em Supabase CLI e Compose de CI; [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68) relata DEV compartilhado com duas contas, com pendências de rede/RLS/autoria. Merge de código **não aplica migrations automaticamente ao DEV existente**.
3. **TO-BE antes de produção:** aceitar a C30, identity boundary, P1–P9/O1–O8, metas mensuráveis, Storage e rede, backup separado/restore, observabilidade, homologação e GO humano.
4. **Quando revisar decisões:** gatilhos de capacidade, SLA/disponibilidade, compliance, burden self-hosted ou demanda justificada por worker, serviço adicional ou HA. Registrar alternativas efetivamente estudadas, custos, limites e evidências em nova issue/ADR; se não houver comparação medida, declarar isso explicitamente.

Para localizar a implementação, consulte [IMPLEMENTATION_MAP](IMPLEMENTATION_MAP.md). Para a sequência futura, [EXECUTION_MAP](../planning/EXECUTION_MAP.md) e [MODULE_BLUEPRINTS](../planning/MODULE_BLUEPRINTS.md).
