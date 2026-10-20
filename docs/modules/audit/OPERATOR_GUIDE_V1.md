# Guia do operador — Qualidade v1

**Status: pré-homologação.** Descreve a navegação da Qualidade na main após PR #69, 20/10/2026; **não é manual de produção nem comprova aceite em Android/iOS**. Validação final: [P1–P9 / O1–O8](QUALITY_ACCEPTANCE_V1.md).

## Ambiente e acesso

Use somente DEV/STAGING autorizados com dados sintéticos até existir GO de produção. O usuário precisa de sessão Supabase Auth, perfil Core ativo e permissão correspondente no escopo global/unidade/setor. Login não concede acesso a todas as telas; a barreira é RLS/RPC no banco. Nunca copiar service_role ou credenciais PostgreSQL para navegador, issue ou screenshot.

| Área | Rota inicial no shell | Permissão relevante |
| --- | --- | --- |
| Auditorias | /audit | audit.inspection.read |
| Planos de Ação | /action-plans | action_plan.read |
| Administração de usuários | /admin/users | admin.user.read/manage |
| Papéis de acesso | /admin/roles | admin.role.read/manage |
| Catálogo de permissões | /admin/permissions | admin.role.read/manage |
| Unidades e setores | /admin/units e /admin/sectors | admin.unit.* / admin.sector.* |
| Logs administrativos | /admin/logs | admin.audit_log.read |

A visualização depende também do escopo efetivo; ver [AUTHORIZATION](../../architecture/AUTHORIZATION.md).

## Jornada de Auditoria

~~~mermaid
flowchart TD
  LOGIN["Login e perfil ativo"] --> UNIT["Escolher unidade permitida"]
  UNIT --> AUD["Abrir / criar inspeção conforme permissão"]
  AUD --> CHECK["Preencher checklist, 9 seções / 158 critérios"]
  CHECK --> EVID["Vincular evidências autorizadas"]
  EVID --> CONF{"Finalização válida e versão atual?"}
  CONF -- "Não" --> FIX["Revisar itens pendentes ou conflito; preservar registros"]
  FIX --> CHECK
  CONF -- "Sim" --> FINAL["Finalizar e consultar histórico"]
  FINAL --> EX["Exportar XLSX / imprimir se autorizado"]
~~~

Em inspeção incompleta, resolver critérios e mensagens de bloqueio; não forçar alteração de estado. Reabertura requer autorização e respeita ciclo de vida e controle de versão. A implementação de telas e contratos fica em apps/web/src/modules/audit, e as regras são detalhadas em [AUDIT_SOURCE_OF_TRUTH](AUDIT_SOURCE_OF_TRUTH.md).

## Evidência de checklist

O fluxo atual reserva metadados por RPC, faz upload privado via Supabase Storage e só então confirma a evidência. Em erro de confirmação, **não anunciar sucesso**; seguir o retry compatível com o contrato e, se necessário, encaminhar para reconciliação. Downloads usam URL assinada temporária. Remoções são lógicas sob permissão e retenção; não apagar diretamente objetos no storage. Tipos, limites e regras exatas: [CHECKLIST_EVIDENCE_V1](CHECKLIST_EVIDENCE_V1.md). Câmera/galeria em Android/iOS e HEIC precisam dos testes físicos P3–P4.

## Jornada de Plano de Ação

~~~mermaid
flowchart TD
  ORI["Criar plano manual ou acessar plano originado em auditoria"] --> FIELDS["Ponto de melhoria, ação, como executar, responsável, prazo, eficácia, evidência esperada"]
  FIELDS --> READY{"Campos exigidos para execução completos?"}
  READY -- "Não" --> FIELDS
  READY -- "Sim" --> EXEC["Pendente → Em andamento → Concluído, conforme regras"]
  EXEC --> ANEX["Anexos de execução / verificação"]
  ANEX --> VER["Verificação de eficácia autorizada"]
  VER --> HIST["Histórico e indicadores"]
~~~

No código, os estados são **Pendente, Em andamento, Concluído**; a avaliação de eficácia pode ser **Eficaz, Parcialmente eficaz ou Ineficaz**. Vencido/próximo vencimento são indicadores calculados, não estados adicionais. Transições válidas, exigências e conflitos seguem apps/web/src/modules/action-plans/lifecycle.ts e [ACTION_PLAN_DOMAIN](../../briefs/ACTION_PLAN_DOMAIN_V1.md).

## Relatórios e suporte

XLSX de inspeção/histórico e impressão são produzidos a partir de dados autorizados; a impressão/PDF é superfície do navegador, não backend de PDFs. Verificar conteúdo, unidade, período e abertura real em dispositivos antes de compartilhar. P7–P9 continuam pendentes de homologação física.

| Problema | Ação segura |
| --- | --- |
| Acesso indisponível | Conferir perfil ativo, permissão e escopo com administração; não trocar identificador para contornar RLS |
| Sessão expirada | Entrar novamente sem publicar tokens/senhas em logs |
| Registro desatualizado | Recarregar e revisar antes de persistir, evitando sobrescrita concorrente |
| Checklist incompleto | Seguir mensagem/modal e conferir critérios/evidências pendentes |
| Upload interrompido | Preservar contexto, não repetir cegamente até duplicar, registrar erro saneado |
| Exportação/print falha | Registrar SHA do app, navegador/OS, escopo fictício e resultado sem dados sensíveis |
| Suspeita de dado de outra unidade | Não explorar; preservar evidência saneada e escalar incidente de autorização |

Todo teste manual deve registrar aparelho, navegador/versão, data, ambiente, usuário de teste, escopo, passos, esperado/obtido e evidência sem segredos. **Sem teste físico e operação comprovada, nenhuma funcionalidade descrita aqui autoriza uso produtivo.**
