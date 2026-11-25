# Operação, implantação, incidentes e recuperação — matriz v1

**Status: RUNBOOK DE PREPARAÇÃO / PROD NO-GO**, revisão de 25/11/2026. Evidências operacionais da C30 mantêm seus recortes datados.
Autoridades: [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md), [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md), [Plano Diretor](../planning/PLANO_DIRETOR_2026.md), [Aceite O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md). **Não é uma receita de produção executável.**

## Adendo operacional — acesso externo STAGING (30/10/2026)

**Evidência de 30/10:** `https://teste.gauchagestao.online` acessível em PC/celular pelo plano Cloudflare Free com Tunnel `gaucha-staging` (Healthy), `cloudflared` como serviço systemd, Caddy HTTP local 4181 e frontend `f9f041e-cloudflare`. Auth/Storage receberam as novas URLs e foram os únicos contêineres recriados; `db`, `rest`, `kong` preservados e saudáveis. Login, consulta de auditoria/histórico preexistente, nova auditoria, envio/visualização/download de foto relatados pelo operador. Evidências e limites no [AS-BUILT de 30/10](C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e [runbook](C30_STAGING_CLOUDFLARE_RUNBOOK.md). **Não foi homologada produção, RLS negativo, backup/restore independente ou Cloudflare Access**; exposição da tela de login requer revisão de segurança antes de distribuir a URL.

## Adendo operacional — C30 STAGING real (22/10/2026)

A fotografia principal desta matriz foi produzida antes da instalação real. **Mudança comprovada no STAGING, sem GO de produção:** C30/Ubuntu Server 22.04.5 LTS, cinco serviços Compose `gaucha-staging` com persistência em HDD, 18 migrations `f9f041e`, administrador testado, Caddy ativo/habilitado e HTTPS validado **somente por loopback/SSH**; firewall UFW inativo, nenhuma publicação LAN/internet validada, nem backup off-site ou restore do conjunto atual. A versão `main` avançou e não foi implantada na C30. Ver [inventário](../history/operations/C30_STAGING_AS_BUILT_20261022.md), [runbook](C30_STAGING_RUNBOOK.md), [backups](C30_BACKUP_GAPS.md), [releases](C30_STAGING_RELEASE_GUIDE.md) e [acesso público](../history/operations/STAGING_PUBLIC_ACCESS_PLAN.md). Frases históricas desta matriz indicando STAGING ainda não instalado devem ser lidas como **snapshot de planejamento anterior**, não status atual.

## 1. Superfícies operacionais

| Superfície | Operação atualmente demonstrável | Operação necessária para PROD | Risco/limite |
| --- | --- | --- | --- |
| DEV pessoal | Compose `gaucha-gestao-local`, Vite e perfil opt-in Identity, conforme [runbook](DOCKER_LOCAL_STANDARDIZATION.md) | Evidências do DEV por SHA e perfil. A continuidade de Identity tem ensaio próprio pendente | Reusar o ambiente autorizado. Seguir AGENTS.md para operações de dados |
| Infra CI/laboratório | Compose de 5 serviços; segredos fora do repo; healthcheck/smoke e cleanup allowlist | Configuração persistente segura, TLS/origens, versionamento do runtime, revisão | scripts/ops recusam production |
| C30 STAGING | Ubuntu Server LTS, cinco serviços persistentes e Caddy com publicação de testes via Tunnel observada em 30/10, após o recorte loopback de 22/10 | Para PROD: aceite físico, SMART/carga, UPS, backup independente, segurança e autorização | STAGING ativo **não equivale** a host aceito para produção; HDD envelhecido e restore atual pendente |
| Publicação web | **STAGING: Cloudflare Tunnel + Caddy 4181 + release Vite dedicada**, HTTPS público de testes validado em 30/10 | **PROD TO-BE:** Workers Static Assets + DNS/WAF/Tunnel e R2, ambientes e rollback | URL pública **não** comprova Cloudflare Access, RLS negativo, backup ou GO produtivo |
| Banco | Migrations append-only em ambientes isolados; RLS em testes | Plano de migration versionada, backup/rollback, RPO/RTO e recuperação | Não rodar SQL em PROD sem autorização |
| Curva ABC | Módulo + schema/bucket privados versionados | Homologar XLSX ERP, integridade, download, históricos, RLS e backup de bytes e metadata | Merge de código não é deploy nem aplicação de migrations |
| Evidências | Buckets privados testados; uploads e signed URLs | Objetos R2, política/headers, reconciliação e restore consistente | Metadados e bytes podem divergir |
| Observabilidade | Logs de aplicação e testes de CI | Alertas host, contêineres, DB, Storage, Tunnel, backup e segurança | Ferramentas/limiares não aprovados |
| Continuidade | Restore sintético a frio com DB/Auth/bytes/RLS PASS histórico; DR-08 parcial (#51/#62) | Backup independente e PITR/teste real de recuperação | Laboratório não comprova RPO/RTO de PROD |

## 2. Ambientes e isolamento

**DEV pessoal:** Ubuntu nativo ou Windows/WSL2 com Docker Desktop. **DEV compartilhado (Issue #68):** registro histórico de duas contas independentes. Confirmar versão e autorização para qualquer reuso. **Não rodar db reset/down -v/migrações exploratórias** na instância compartilhada. [Matriz de ambientes](../architecture/STACK_INTEGRATION.md#ambientes-e-topologias). **CI:** efêmera e destrutível somente dentro de seus recursos isolados. **STAGING persistente (C30):** localização e instância já identificadas em 22/10/2026 (ver [AS-BUILT](../history/operations/C30_STAGING_AS_BUILT_20261022.md)); isolamento, hardening, retenção, restauração e aprovação formal continuam em aberto. Não usar dados reais de produção. **PROD:** não existe autorização de provisionamento neste estado.

Recursos existentes na C30, inclusive Windows/WSL2, discos e dados não pertencentes ao projeto, são **intocáveis** até inventário completo, restauração verificável e consentimento. A issue #52 registra ERP deslocado para outro computador e validação operacional relatada, mas **não aprova destruir o volume antigo** nem os demais dados. Não executar prune, down -v, reset, wipe ou inicialização de HD fora de um projeto sintético inequivocamente identificado e autorizado. Para o ensaio sintético, obedecer à [issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51) e ao [PR #62](https://github.com/The-Vonky/Gaucha-Gestao/pull/62).

## 3. Ciclo seguro de mudança (processo TO-BE)

~~~mermaid
flowchart TD
  CHANGE["Issue + brief + owner + escopo"] --> PR["Branch/PR focada"]
  PR --> CI["CI do SHA candidato e revisão humana"]
  CI --> SEC{"Segurança / migrations / RLS / dados OK?"}
  SEC -- "Não" --> FIX["Corrigir e retestar"]
  FIX --> CI
  SEC -- "Sim" --> STAGE["Deploy em STAGING autorizado"]
  STAGE --> CHECK["Smoke, permissões negativas, UX e rollback ensaiado"]
  CHECK --> OPS{"P1–P9, O1–O8, backups, capacidade OK?"}
  OPS -- "Não" --> HOLD["NO-GO / preservar ambiente"]
  OPS -- "Sim" --> HUMAN["Aprovação humana explícita"]
  HUMAN --> RELEASE["Janela controlada; versão e observabilidade"]
  RELEASE --> WATCH["Monitoramento e operação assistida"]
~~~

**Sem automação de merge ou deploy PROD** nesta documentação. A ausência atual de ruleset de main torna revisão humana ainda mais importante; CI aprovado para um SHA não aprova automaticamente outro.

## 4. Pré-voo de release (checklist sem execução)

- [ ] Identificar commit/tag candidato, alteração, compatibilidade, responsáveis, janela e comunicação de rollback.
- [ ] Confirmar integridade/autorização do ambiente e nenhuma credencial privilegiada no browser.
- [ ] Verificar migrações novas sem editar histórico aplicado; backup/restore e reversão ou forward-fix.
- [ ] Rodar typecheck, lint, testes, build, verify-build, dependências e integração **no mesmo commit**.
- [ ] Testar RLS/grants negativos com JWT real e limites por unidade/setor, upload e links assinados.
- [ ] Verificar configurações publicadas (TLS, origens, headers, cache e logs seguros).
- [ ] Validar P1–P9 em aparelhos físicos, O1–O8 com evidência operacional do candidato, e ausência de bloqueadores.
- [ ] Registrar GO humano inequívoco e registro de release (versão, ambiente, SHA, operador, métricas, evidência e resultado).

Itens não verificados permanecem **BLOCKED/UNKNOWN**, não PASS.

## 5. Continuidade: plano lógico, não comandos produtivos

~~~mermaid
flowchart LR
  PG["PostgreSQL: dados e Auth"] --> B["Backups lógicos + base/WAL"]
  FILE["Storage: metadados + bytes"] --> O["Backup de objetos independente"]
  CFG["Configuração segura + código/migrations"] --> C["Artefatos versionados + referências de segredos"]
  B --> ISO["Destino isolado de restauração"]
  O --> ISO
  C --> ISO
  ISO --> VERIFY["Verificação de integridade, Auth, RLS, downloads e tempo"]
~~~

Etapas obrigatórias antes de declarar operação:
1. **Definir metas:** RPO técnico, RTO dentro e fora de seg–sex 07:00–18:00 America/Sao_Paulo, frequência, retenção, volume/carga, orçamento e responsáveis. Nunca usar RPO=0 por aspiração.
2. **Escolher mecanismo:** ADR para WAL-G/pgBackRest (ou equivalente), cifragem, controle de acesso, backups de objetos, destino off-site independente e rotação/recuperação das chaves.
3. **Validar integridade:** restaurar DB/Auth/metadados e bytes em ambiente isolado, aplicar a versão correta dos artefatos, checar hashes, permissões por unidade, download autorizado e negação cross-unit.
4. **Medir o ensaio:** início/fim, tempos separados, perda de dados relativa ao último ponto, RPO/RTO observados, falhas, responsáveis, data, SHA, aprovação e plano corretivo.
5. **Repetir periodicamente:** agenda, alerta em falha, teste de substituição de host, controle da retenção e documentação de incidentes.

**Evidência histórica:** a Issue #51, encerrada, e a PR #62, integrada em `f9f041e`, registram ensaio sintético a frio com DR-08 parcial. O recorte usou 17 migrations, anterior ao bucket ABC. O perfil base do DEV tem procedimento próprio. Ainda faltam recuperação integral do DEV com Identity, backup e restauração independentes da C30, retenção, alertas e metas medidas. [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md) · [Relatório sintético](../history/operations/02_RESTORE_DRILL.md) · [Guia Mestre](../planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md).

## 6. Resposta inicial a incidente — processo de decisão

| Incidente | Contenção inicial segura | Diagnóstico e restauração autorizada |
| --- | --- | --- |
| Falha de login generalizada | Registrar hora, ambiente e sinais de Auth; não derrubar controles para liberar acesso | Verificar serviços/Auth/PostgREST e configuração; escalar owner; testar correção isolada |
| Possível vazamento ou acesso indevido | Restringir credencial/conta afetada por procedimento aprovado, preservar logs e escopo do incidente | Revisar RLS/JWT/permissões, auditoria e objetos; não divulgar tokens/PII em issues |
| Corrupção/indisponibilidade DB | Não resetar banco nem sobrescrever volumes | Selecionar ponto de recuperação verificado, restaurar primeiro isolado, reconciliar |
| Upload confirmado sem byte / objeto órfão | Suspender purge, preservar identificadores saneados | Comparar metadata, Storage e estado, corrigir com contrato de reconciliação, não excluir manualmente por palpite |
| Erro após release | Identificar SHA/ambiente e conter rollout | Usar plano de rollback do release; para migrations não reversíveis, forward-fix aprovado |
| Falha do host / energia / rede | Não tentar recuperação destrutiva às cegas | Acionar procedimento de substituição/restore testado e comunicar indisponibilidade sem SLA inventado |
| CI intermitente | Não marcar sucesso por rerun isolado sem análise | Anotar SHA, run, checkpoint, reproduzir e tratar [#57](https://github.com/The-Vonky/Gaucha-Gestao/issues/57) |

Em todos os cenários: dono técnico + supervisor (destinatários previstos no BACKUP_RECOVERY), registro temporal, severidade, dados afetados, evidências saneadas, decisão humana e postmortem. Ferramenta específica de pager/observabilidade ainda não foi decidida.

## 7. Handover mínimo para segundo operador

Entregar procedimentos testados de start/stop somente em ambiente autorizado, localização de logs, identificação de volumes, matriz de acesso, contato/escalonamento, segredos por cofre (**sem copiá-los em Markdown**), validade dos backups, links de execução de restore, versões/pinos das imagens, procedimento de rollback, diagnóstico de falhas, inventário físico e mapa de issues. Aceite de independência e operação: [#53](https://github.com/The-Vonky/Gaucha-Gestao/issues/53) e [#59](https://github.com/The-Vonky/Gaucha-Gestao/issues/59).

## 8. Fontes canônicas

- [infra/README](../../infra/README.md): runbook de **laboratório descartável**. O STAGING persistente C30 usa [runbook próprio de consulta](C30_STAGING_RUNBOOK.md) e [guia de mudança ainda sujeito a validação](C30_STAGING_RELEASE_GUIDE.md).
- [LOCAL_FOUNDATION](../development/LOCAL_FOUNDATION.md) e [PARALLEL_AGENT_WORKFLOW](../development/PARALLEL_AGENT_WORKFLOW.md): limites em DEV/agentes.
- [01_DADOS_LIMPOS](../history/planning/01_DADOS_LIMPOS.md): proposta documental de PROD inicial limpo, sem seeds operacionais.
- [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md): gates reais e artefatos de aceite.

Todo comando de infraestrutura produtiva deverá surgir em runbook validado e autorizado **em PR futura**; esta matriz não transforma uma intenção em permissão operacional.
