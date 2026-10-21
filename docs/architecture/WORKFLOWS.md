# Fluxos funcionais, técnicos e de exceção

**AS-IS no código da main após PR #69 (`fed0e0f`, 20/10/2026)**, exceto quando indicado **TO-BE / PENDENTE**. Diagramas descrevem contratos; não provam testes manuais ou deploy real.

## 1. Login, obtenção de perfil e navegação (AS-IS)

~~~mermaid
sequenceDiagram
  actor U as Pessoa usuária
  participant SPA as Login / AuthProvider
  participant AUTH as Supabase Auth
  participant CORE as core.profiles + core.my_access
  participant APP as App Shell
  U->>SPA: Informa credenciais
  SPA->>AUTH: signIn / sessão
  alt credenciais incorretas
    AUTH-->>SPA: Erro
    SPA-->>U: Login não concluído
  else sessão autenticada
    AUTH-->>SPA: Sessão JWT
    SPA->>CORE: Consulta perfil e acessos
    alt perfil inexistente/inativo/sem acesso
      CORE-->>SPA: Inativo / sem grant
      SPA-->>U: Acesso indisponível / funções negadas
    else perfil ativo
      CORE-->>SPA: Permissões e escopos
      SPA->>APP: Renderiza navegação permitida
      APP-->>U: Módulos visíveis
    end
  end
~~~

**Barreira real:** grants, RLS e RPCs, não a lista de menus. Arquivos de referência: apps/web/src/core/auth/AuthProvider.tsx, apps/web/src/app/App.tsx, apps/web/src/app/navigation.ts e [AUTHORIZATION](AUTHORIZATION.md). Criar/redefinir credenciais administrativas via serviço privilegiado é **TO-BE BLOQUEADO**, não um fluxo implementado. Ver [ACCOUNT_LIFECYCLE_V1](ACCOUNT_LIFECYCLE_V1.md) e [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49).

## 2. Criação, preenchimento e finalização de Auditoria (AS-IS)

~~~mermaid
flowchart TD
  S["Selecionar unidade permitida"] --> C["create_inspection: criar inspeção"]
  C --> FORM["Checklist versionado (9 seções / 158 critérios)"]
  FORM --> ANSWER["Salvar respostas / observações sob RLS"]
  ANSWER --> EVID["Anexar evidências, se necessário"]
  EVID --> READY{"Finalização atende regras e versão?"}
  READY -- "Não" --> ERR["Modal/erro: revisar pendências; preservar dados"]
  ERR --> ANSWER
  READY -- "Sim" --> FINAL["finalize_inspection"]
  FINAL --> REPORT["Relatórios / XLSX / impressão"]
  FINAL --> PLAN["Plano corretivo quando aplicável"]
  FINAL --> REOPEN{"Reabertura autorizada?"}
  REOPEN -- "Sim" --> OPEN["reopen_inspection / novo ciclo controlado"]
  OPEN --> ANSWER
~~~

**Regras reais e limites:** templates imutáveis/versionados, tratamento de concorrência por versão, permissão/scope por unidade, proteção contra finalização incompleta e evidência associada ao ciclo de vida. Não presumir que toda inspeção gera plano automático, nem que exportação concede leitura fora do escopo. Código: apps/web/src/modules/audit/api.ts; migrations audit; [AUDIT_SOURCE_OF_TRUTH](../modules/audit/AUDIT_SOURCE_OF_TRUTH.md). Alterações de UI recentes devem ser verificadas no SHA candidato antes de descrever pormenores do modal.

## 3. Evidence: dois recursos persistidos sem transação distribuída (AS-IS)

~~~mermaid
sequenceDiagram
  actor U as Pessoa autorizada
  participant UI as UI de Auditoria ou Plano
  participant RPC as PostgREST / RPC do domínio
  participant S as Storage API privada
  participant DB as PostgreSQL
  U->>UI: Escolhe arquivo
  UI->>RPC: begin_*_evidence_upload
  RPC->>DB: Valida escopo, formato/limites e reserva
  DB-->>UI: ID e caminho autorizado
  UI->>S: Upload de bytes (sem upsert)
  alt falha no upload
    S-->>UI: Erro
    UI-->>U: Tentativa pendente / retry conforme contrato
  else bytes gravados
    S-->>UI: Upload aceito
    UI->>RPC: confirm_*_evidence_upload
    alt confirmação falha
      RPC-->>UI: Falha / estado não confirmado
      UI-->>U: Não anunciar conclusão
    else confirmado
      RPC-->>UI: Confirmação
      UI-->>U: Evidência disponível
    end
  end
~~~

Para download, o código solicita URL assinada e curta à Storage API. Remoção lógica é feita via RPC do domínio; retenção/purge físico e reconciliação operacional continuam exigindo gates. Os **dois fluxos** (Checklist Evidence e Action Plan Evidence) têm limites e políticas distintos: ver [CHECKLIST_EVIDENCE_V1](../modules/audit/CHECKLIST_EVIDENCE_V1.md), [EVIDENCE_STORAGE_V1](../briefs/EVIDENCE_STORAGE_V1.md) e respectivos tests/integration. O terceiro bucket privado identificado pelo planejamento é destinado às imagens de capa de unidade; não o confundir com estes dois fluxos.

## 4. Plano de Ação, incluindo origem em Auditoria (AS-IS)

~~~mermaid
flowchart LR
  ORIGIN["Plano manual ou originado em Auditoria"] --> CREATE["create_manual_plan ou contrato integrado do domínio"]
  CREATE --> SCOPE["Escopo / permissões"]
  SCOPE --> EDIT["Atualizar plano e acompanhamento"]
  EDIT --> STATUS["set_plan_status"]
  STATUS --> EVI["Evidências de execução/verificação"]
  EVI --> VERIFY["verify_plan / eficácia"]
  VERIFY --> HIST["Histórico rastreável"]
~~~

O ciclo de vida concreto, transições permitidas, revalidação, conflitos e verificações são regidos por [ACTION_PLAN_DOMAIN_V1](../briefs/ACTION_PLAN_DOMAIN_V1.md) e apps/web/src/modules/action-plans/lifecycle.ts, api.ts e migrations. O diagrama é deliberadamente **macro**: não cria status ou transição inexistentes.

## 5. Administração e alterações de acesso (AS-IS, com limite importante)

~~~mermaid
sequenceDiagram
  actor A as Administrador com permissão
  participant UI as Core Admin UI
  participant DB as RPCs / RLS Core
  participant LOG as core.system_audit_log
  A->>UI: Revisa papéis, escopos e situação
  UI->>DB: Consulta governança sob privilégios efetivos
  DB-->>UI: Apenas dados autorizados
  A->>UI: Solicita alteração permitida
  UI->>DB: RPC com validação, escopo e versão
  alt negado/conflito
    DB-->>UI: Erro controlado
  else autorizado
    DB->>LOG: Evento de auditoria confiável (conforme contrato)
    DB-->>UI: Resultado
  end
~~~

**Não afirmar** que existe serviço backend confiável para *criar ou recuperar contas Auth com privilégio*: design de Identity Boundary v1 permanece pendente de GO humano. Alterações de perfis, papéis e atribuições são distintas de criar uma identidade Auth. Consulte [ACCESS_GOVERNANCE_V1](ACCESS_GOVERNANCE_V1.md), [ACCESS_GOVERNANCE_READ_V1](../modules/core/ACCESS_GOVERNANCE_READ_V1.md) e [ACCOUNT_LIFECYCLE_V1](ACCOUNT_LIFECYCLE_V1.md).

## 6. Publicação e conferência da Curva ABC v1 (AS-IS)

~~~mermaid
sequenceDiagram
  actor U as Publicador autorizado
  participant UI as React / parser XLSX
  participant S as Storage privado
  participant DB as RPC abc/PostgreSQL
  participant L as Core log
  U->>UI: Seleciona XLSX da unidade
  UI->>UI: Prévia com bloqueios e avisos
  alt bloqueio
    UI-->>U: Não permite publicar pela UI
  else prévia válida
    UI->>DB: begin_source_upload
    DB-->>UI: Caminho reservado
    UI->>S: Upload privado do XLSX
    UI->>DB: confirm_source_upload
    Note over DB,S: Confirma metadados; não interpreta bytes XLSX
    UI->>DB: publish_revision(payload, versão, motivo)
    alt negação ou conflito 40001
      DB-->>UI: Erro; revisar série
    else sucesso
      DB->>DB: Calcula ABC e grava revisão imutável
      DB->>L: Registra publicação
      DB-->>UI: Revisão publicada
    end
  end
  opt conferência posterior
    U->>UI: Conferir com o arquivo
    UI->>S: Download original
    UI->>UI: Reprocessa e compara hash
    UI->>DB: record_file_check
    DB->>L: Log do resultado
  end
~~~

A série é unidade + competência + modalidade. `abc.report.read` consulta; `abc.report.publish` publica; substituir revisão exige motivo; versões concorrentes são controladas. **O SQL valida conteúdo normalizado, não os bytes da planilha.** Algumas validações da prévia, como competência encerrada, não são reproduzidas integralmente pela RPC. Consulte [brief ABC](../briefs/ABC_DOMAIN_V1.md), [guia operacional](../modules/abc/OPERATOR_GUIDE_V1.md) e [ameaças](THREAT_MODEL.md).

## 7. Migração de um standalone (TO-BE, ainda não autorizada por módulo)

~~~mermaid
sequenceDiagram
  actor PO as Responsável / dono do negócio
  participant SRC as Sistema legado
  participant ENG as Engenharia / QA
  participant TARGET as Módulo na plataforma
  PO->>ENG: Aprova inventário, regra, owner, aceite
  ENG->>SRC: Extrai versão / esquema / dados classificados
  ENG->>ENG: Desenha mappings, escopo, permissões e reconciliação
  ENG->>TARGET: Implementa/testa isoladamente
  ENG->>SRC: Cria ponto de recuperação verificado
  ENG->>TARGET: Migra em ensaio com dados permitidos
  ENG->>ENG: Confere totais, registros, permissões e rollback
  alt gate incompleto
    ENG-->>PO: NO-GO, preserva legado
  else aprovação documentada
    PO->>TARGET: Autoriza cutover controlado
  end
~~~

Fontes: [MODULE_ROADMAP](../migration/MODULE_ROADMAP.md), [CORE_CONSUMER_CONTRACT_MAP](CORE_CONSUMER_CONTRACT_MAP_V1.md) e [BACKUP_RECOVERY](BACKUP_RECOVERY.md). O nome do legado Registros ISO pode não refletir seu domínio funcional; resolver ownership antes de implementar.

## 8. Falhas que precisam estar nos cenários de teste

| Caminho | Falha/negação obrigatória | Fonte de evidência |
| --- | --- | --- |
| Login | credenciais inválidas, perfil inativo, logout/revogação | tests/login.test.tsx; testes Core |
| Core | role sem permissão, scope de outra unidade, versão obsoleta | tests/authorization.test.ts; tests/integration/core-security-matrix.mjs |
| Auditoria | checklist incompleto, versão antiga, reabertura negada | tests/audit-*.test.ts; tests/integration/audit.mjs |
| Evidências | arquivo não aceito, upload parcial, objeto não confirmado, cross-unit, download negado | tests/integration/audit-evidence.mjs; tests/integration/evidence.mjs |
| Planos | status/transição indevida, escopo errado, conflito e evidência inválida | tests/action-plans-*.test.ts; tests/integration/action-plans.mjs |
| Relatórios | escopo indevido, strings maliciosas em XLSX, impressão mobile | tests/audit-reporting-*.test.*; tests/integration/reporting.mjs |
| Curva ABC | XLSX bloqueado, acesso indevido, conflito, original divergente, checagem registrada | tests/abc-*.test.*; tests/integration/abc.mjs; Issue #70 |
| Infra | dependência Storage derrubada, migração em alvo indevido | .github/workflows/infra-validate.yml |

**Não registrar PASS baseado apenas nesta lista.** Execute CI no SHA de entrega, P1–P9 nos dispositivos e O1–O8 no ambiente real, conforme [aceite](../modules/audit/QUALITY_ACCEPTANCE_V1.md).
