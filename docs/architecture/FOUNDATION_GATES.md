# Gates da fundação da plataforma

**Estado: vigente como referência de gates, atualizado editorialmente em 21/10/2026.**  
**Baseline de revisão original:** 02/10/2026, `22334995b5b239274c5c1adc98495357ec0d7980`. Contagens de testes e status antigos são **fotografias históricas**, não o HEAD atual.

Fontes: [conclusão factual da Qualidade](../modules/audit/QUALITY_COMPLETION_V1.md), [aceite P1–P9/O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md), [Plano Diretor](../planning/PLANO_DIRETOR_2026.md). O software Qualidade v1 e Core estão na `main`; Curva ABC v1 foi integrada posteriormente. **Nenhuma CI descartável comprova produção. PROD NO-GO.**

## Objetivo

Explicitar as decisões mínimas da fundação antes de ampliar os domínios. Não superprojetar: resolver cada gate na profundidade necessária para Auditoria e módulos próximos.

## Gate 1 — Runtime e topologia de implantação

**DECIDIDO COMO ARQUITETURA:** host único escolhido [ThinkStation C30](../decisions/ADR-008-production-host-thinkstation-c30.md), Ubuntu Server LTS bare metal, Docker Engine/Compose, Cloudflare DNS/WAF/Tunnel, React estático via Workers, deploy controlado e disponibilidade de host único aceita na v1.

**PENDENTE:** aceitação física/capacidade C30 sob Ubuntu e perfil ADR-006; topologia definitiva DEV/STAGING/PROD; UPS e failover de rede. Decisão não significa instalação.

## Gate 2 — Stack da aplicação

**DECIDIDO:** React, TypeScript, Vite, monólito modular, Supabase Self-Hosted e GitHub Actions. Referências [ADR-001](../decisions/ADR-001-modular-monolith.md) e [ADR-004](../decisions/ADR-004-platform-stack.md).

## Gate 3 — Banco de dados

**DECIDIDO:** PostgreSQL, migrations incrementais, dinheiro com precisão fixa, DB protegido, backup lógico + base físico/WAL/PITR + cópia off-site.

**PENDENTE:** escolha WAL-G/pgBackRest ou equivalente; retenção, RPO/RTO e dimensionamento. **Implementado em repo:** migrations SQL append-only em `supabase/migrations`, aplicadas por CLI local e CI.

## Gate 4 — Autenticação e autorização

**MODELO v1 DECIDIDO:** Supabase Auth; perfil Core ativo; negação padrão; múltiplos papéis por usuário; permissões granulares; escopo **global/unidade/setor em cada atribuição**; navegação filtrada e aplicação confiável no banco/RLS. Papel de administrador é atribuição global privilegiada.

**PENDENTE:** serviço de identidade privilegiada e UX completo de convite/recuperação dependem de novo desenho aprovado; **ADR-007 NO-GO** ([Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49)).

## Gate 5 — Core organizacional

**MODELO v1 DECIDIDO:** `core.profiles`, `core.units`, `core.sectors`, `core.unit_sectors`, `core.permissions`, `core.roles`, `core.role_permissions`, `core.user_role_assignments`, `core.system_audit_log`; desativar entidades com histórico, IDs técnicos UUID e códigos de negócio estáveis. Brief original: [PLATFORM_FOUNDATION](../briefs/PLATFORM_FOUNDATION_V1.md).

## Gate 6 — Arquivos e anexos

**DECIDIDO:** Supabase Storage privado; Cloudflare R2 preferencial para produção futura; DB guarda metadados/referências, não blobs grandes; backup de arquivos separado do banco.

**Implementado:** `action-plan-evidence` (10 MiB, tipos JPEG/PNG/PDF/XLSX/DOCX, até 20 evidências ativas por plano, download assinado e remoção lógica); `audit-checklist-evidence` (até 10 ativas por critério, 100 por inspeção, 10 MiB, versão de lifecycle/assinatura); `unit-covers` e `abc-source-files` entraram em etapas posteriores. A verificação de assinatura/magic bytes no browser **não** é atestado dos bytes no servidor.

**PENDENTE:** retenção/expurgo, cópias produtivas, cabeçalhos, reconciliação e restauração para todos os buckets. Nenhuma tabela universal de anexos está autorizada.

## Gate 7 — Auditoria sistêmica

**MODELO E CÓDIGO IMPLEMENTADOS; OPERAÇÃO PENDENTE.** O ADR-005 e migrations definem `core.system_audit_log`, ator/tempo/módulo/entidade/antes-depois, writes confiáveis e leitura administrativa por escopo. Auditoria de Qualidade, Planos e evidências usam essa capacidade.

Falta política/rotina operacional de retenção, monitoramento e expurgo autorizado. O log sistêmico não é o domínio Auditorias.

## Gate 8 — Backup e recuperação

**ARQUITETURA DECIDIDA; PROVA PRODUTIVA PENDENTE.** Backups automatizados, cópias off-site, logical/base+WAL/PITR, ensaios de restore e Ansible para reconstrução são TO-BE.

**Ensaio registrado:** [Issue #51 e DR-01–DR-09](../planning/02_RESTORE_DRILL.md) com 8 PASS/DR-08 PARCIAL no snapshot de 17 migrations, sem ABC. **Não comprova** RPO/RTO, off-site nem host perdido.

Faltam ferramenta/destino, retenção, RPO/RTO quantitativos por janela, frequência de drill e runbook produtivo.

Responsável de operação/backup: responsável atual do projeto; alertas ao responsável e supervisor; expediente provisório e requisito de preservação em [BACKUP_RECOVERY](BACKUP_RECOVERY.md#decisões-operacionais-de-01102026). **O1 não foi fechado.**

## Gate 9 — Observabilidade

**BASELINE DECIDIDA; SEM PROVA DE OPERAÇÃO.** Observar host, reinícios/saúde Docker, conexões/Storage/backup PostgreSQL, Auth/REST/Storage, Tunnel, falhas WAL/backup, erros frontend com revisão de privacidade, healthchecks e rollback. Ferramenta/limiares ainda dependem de decisão.

## Gate 10 — Contrato do primeiro módulo

**SOFTWARE FUNCIONAL E HARDENING PRÉ-HOMOLOGAÇÃO INTEGRADOS; ACEITE PENDENTE.**

Fontes: [Audit source](../modules/audit/AUDIT_SOURCE_OF_TRUTH.md), [migração](../modules/audit/MIGRATION_MAP.md), [ADR-003](../decisions/ADR-003-action-plans-transversal-module.md), [briefs](../briefs/). Reabertura está implementada. Planos e evidências estão implementados.

Três saídas aprovadas em 29/09: XLSX da inspeção, XLSX histórico da unidade e impressão/PDF (PR #9). Anexos por critério (PR #11), paginação de histórico acima de 1.000 linhas (PR #13) e hardening pré-homologação (PR #14). A CI histórica do SHA `664ed5a` foi aprovada, **não** representa versão atual. P1–P9 e O1–O8 seguem pendentes.

## O que não deve bloquear a primeira entrega

Não antecipar dashboard executivo completo, permissões de todos os domínios, detalhes do ERP de Contratos, schema Frota, notificações futuras, microsserviços, Kubernetes, multi-host HA, blue/green, engine universal de workflow ou integrações especulativas. A Curva ABC v1 foi antecipada depois e já está no repo; isso não muda a regra de evitar trabalho especulativo.

## Condição de evolução

Fundação e código da Qualidade v1 estão integrados. Os gates **físicos P1–P9**, **operacionais O1–O8** e itens 7–9 precisam de evidência real antes do rollout. **Este documento não autoriza deploy, reset, alteração de infra ou PROD.**
