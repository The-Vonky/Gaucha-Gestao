# Fundação v1 — desenvolvimento e validação

Para o DEV pessoal persistente `gaucha-gestao-local`, use o [README](../../README.md#primeiros-passos-ambiente-local) e o [runbook compartilhado](../operations/DOCKER_LOCAL_STANDARDIZATION.md). Os procedimentos de instalação e uso diário estão nos guias de plataforma.

A CI usa Supabase CLI em integração de aplicação e Compose mínimo ou específico de Identity em infraestrutura. Use os [workflows](../../.github/workflows/) e o [guia de laboratórios](../../infra/README.md) para o contexto descartável. Mantenha comandos de reset e descarte limitados ao alvo sintético explicitamente autorizado. O estado das contas e objetos é próprio de cada ambiente.

## Registro histórico da fundação

O recorte a seguir acompanha a baseline de outubro de 2026. O [registro de outubro do guia](https://github.com/The-Vonky/Gaucha-Gestao/blob/d0573512e97e9d93cc0202411b783d1a6f16d2f5/docs/development/LOCAL_FOUNDATION.md) preserva o roteiro anterior da Supabase CLI. Para autorização vigente e estado de implementação, consulte o [portal](../README.md).

## Regras operacionais da fundação

- Perfis, papéis, catálogo de setores e atribuições são administração global.
  Unidades e logs aceitam permissões no escopo correspondente.
- Consultar setores permite ler nomes das unidades para inspecionar os vínculos.
- Um papel só pode ser concedido quando o administrador tem todas as permissões
  dele no escopo solicitado. Editar sua composição exige essas permissões globais.
- Papéis de sistema são protegidos; crie um papel personalizado para outras composições.
- Não é possível desativar a própria conta nem revogar a própria atribuição pela UI/API.
- Desativar um usuário revoga suas atribuições; reativar não as restaura.
- Unidades/setores inativos preservam leitura histórica; não aceitam novos vínculos.
- Atualizações usam `version`; a composição de papéis é substituída atomicamente.
- Desvincular setor referenciado por atribuição é bloqueado, inclusive para preservar histórico.
- Audit v1 opera o checklist canônico de 158 critérios por unidade (criação, preenchimento,
  finalização e reabertura via RPCs confiáveis). Planos de Ação manuais e por AP/NAT,
  execução/verificação de eficácia e evidências binárias dos planos estão implementados.
  Exportação/relatórios de Audit (Excel e impressão/PDF) e anexos por critério
  (Checklist Evidence) estão integrados na `main`; veja
  `docs/modules/audit/CHECKLIST_EVIDENCE_V1.md` para contrato e gates restantes.
  O histórico por unidade pagina `inspection_summaries` em blocos de 500 desde a PR #13,
  evitando o truncamento silencioso pelo limite Data API de 1.000 linhas. O software
  funcional e o hardening pré-homologação da Qualidade v1 estão concluídos após a PR #14; Login v3 · Elo foi
  integrado pela PR #17. A baseline de aplicação verificada é o commit `22334995b5b239274c5c1adc98495357ec0d7980`, integrado à `main`, com
  CI de aplicação `37017170877` e infraestrutura reproduzível `37017171393` verdes. A homologação física P1–P9
  e a prontidão operacional O1–O8 permanecem abertas conforme `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md`.
  Production ready: NÃO.

## Concorrência em testes locais

Para repetir uma suíte com timeouts intermitentes, reduza a concorrência local e registre SHA, comando, falha e resultado da repetição. Exemplo verificado no notebook:

```bash
npm test -- --maxWorkers=4
```

Quatro workers são um exemplo. Ajuste à capacidade da máquina e evite sobrepor a suíte a integrações pesadas no mesmo runtime. Preserve as asserções e os comandos da CI. Na PR #130, Auditorias passou isoladamente e a suíte completa passou com dois workers. Na PR #133, timeouts e um HTTP 502 de origem indeterminada passaram em repetições isoladas. Na PR #134, a rodada inicial com 84 workers teve quatro timeouts. No SHA final da PR, a repetição com quatro workers aprovou 1.231 testes em 85 suítes. Esses recortes registram a recuperação dos ensaios, com diagnóstico causal ainda incompleto. [PR #130](https://github.com/The-Vonky/Gaucha-Gestao/pull/130) · [PR #133](https://github.com/The-Vonky/Gaucha-Gestao/pull/133) · [PR #134](https://github.com/The-Vonky/Gaucha-Gestao/pull/134).

## Testes de banco

`npm run test:rls` cria um PostgreSQL efêmero via PGlite e aplica as migrations,
com papéis `anon`/`authenticated`, contrato mínimo `auth.users`/`auth.uid()`, grants,
RLS e triggers reais. Cobre negação, escopos, delegação, auditoria e concorrência
otimista. Não simula políticas em JavaScript.

`test:rls` executa apenas `tests/database.test.ts`; `npm test` inclui também as suítes
de Audit, Action Plans e Evidence. O harness de evidências usa um stub de Storage;
isso não substitui a API real. A CI inclui `tests/integration/action-plans.mjs`,
`evidence.mjs`, `reporting.mjs`, `audit.mjs`, `audit-evidence.mjs` e `admin.mjs` contra Supabase local com
Storage e Chromium a 375px (Admin também a 768/1024/1440).
`audit-evidence.mjs` acrescenta bytes reais de Storage, concorrência em duas sessões
PostgreSQL, matriz de acesso, reconciliation e restauração de um arquivo. Seu runner
recusa endpoints fora de `127.0.0.1`. O workflow também executa `npm audit --omit=dev`.
A presença de uma suíte no workflow não comprova que sua execução passou; consulte
os jobs da revisão correspondente.
Dispositivos reais iOS/Android exigem validação manual separada.

Antes de integrar
um ambiente real, valide login, convite, restauração de sessão e chamadas Data API
com a configuração local acima. A CI executa somente validações, sem deploy.

