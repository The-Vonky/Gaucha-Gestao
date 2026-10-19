# Operação, implantação, incidentes e recuperação — matriz v1

**Status: RUNBOOK DE PREPARAÇÃO / PROD NO-GO**, base main 1e818a4 (19/10/2026).
Autoridades: [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md), [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md), [Plano Diretor](../planning/PLANO_DIRETOR_2026.md), [Aceite O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md). **Não é uma receita de produção executável.**

## 1. Superfícies operacionais

| Superfície | Operação atualmente demonstrável | Operação necessária para PROD | Risco/limite |
| --- | --- | --- | --- |
| Desenvolvimento | npm ci, typecheck/lint/test/build; CLI local isolada | Nenhum dado real | Reset somente local descartável exclusivo |
| Infra CI/laboratório | Compose de 5 serviços; segredos fora do repo; healthcheck/smoke e cleanup allowlist | Configuração persistente segura, TLS/origens, versionamento do runtime, revisão | scripts/ops recusam production |
| C30 | Inventário/planejamento documentados | Preservação e recuperação, Ubuntu LTS bare metal, SMART, temperatura, RAM, SSD, carga e aprovações | Instalação destrutiva **bloqueada** até gate |
| Publicação web | Vite build verificado em CI | Workers Static Assets + DNS/WAF/Tunnel, ambientes e rollback | CDN/tunnel não autorizam acesso de negócio |
| Banco | Migrations append-only em ambientes isolados; RLS em testes | Plano de migration versionada, backup/rollback, RPO/RTO e recuperação | Não rodar SQL em PROD sem autorização |
| Evidências | Buckets privados testados; uploads e signed URLs | Objetos R2, política/headers, reconciliação e restore consistente | Metadados e bytes podem divergir |
| Observabilidade | Logs de aplicação e testes de CI | Alertas host, contêineres, DB, Storage, Tunnel, backup e segurança | Ferramentas/limiares não aprovados |
| Continuidade | Restore sintético em andamento/documentação Draft (#51/#62) | Backup independente e PITR/teste real de recuperação | Laboratório não comprova RPO/RTO de PROD |

## 2. Ambientes e isolamento

**DEV:** máquina de cada desenvolvedor, dados sintéticos, credenciais locais, projeto exclusivo; não reutilizar volume de outro agente. **CI:** efêmera e destrutível somente dentro de seus recursos isolados. **STAGING persistente:** ainda requer localização/isolamento e aprovação; não usar dados reais de produção. **PROD:** não existe autorização de provisionamento neste estado.

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

**Evidência disponível nesta data:** a issue #51 registra ensaio **sintético a frio** com resultados positivos parciais; PR #62 em Draft. Isto **não** prova backup contínuo, WAL/PITR, restauração remota, replicação de objetos em R2 ou prontidão de produção. Ver [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md).

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

- [infra/README](../../infra/README.md): **único runbook executável atualmente registrado para Compose CI/STAGING descartáveis**.
- [LOCAL_FOUNDATION](../development/LOCAL_FOUNDATION.md) e [PARALLEL_AGENT_WORKFLOW](../development/PARALLEL_AGENT_WORKFLOW.md): limites em DEV/agentes.
- [01_DADOS_LIMPOS](../planning/01_DADOS_LIMPOS.md): proposta documental de PROD inicial limpo, sem seeds operacionais.
- [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md): gates reais e artefatos de aceite.

Todo comando de infraestrutura produtiva deverá surgir em runbook validado e autorizado **em PR futura**; esta matriz não transforma uma intenção em permissão operacional.
