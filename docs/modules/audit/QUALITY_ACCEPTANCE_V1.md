# Qualidade v1 — aceite final P1–P9 / O1–O8

Status: aberto até evidência real  
Baseline de aplicação revisada: 2026-10-02 — PR #18 `22334995b5b239274c5c1adc98495357ec0d7980`  
Objetivo: transformar as referências genéricas a “P1–P9” e “O1–O8” em um checklist nominal, sem criar funcionalidade nova nem substituir evidência operacional.

## Regra de fechamento

Qualidade v1 só pode ser declarada **100% / production-ready** quando:

1. a `main` candidata estiver com CI verde;
2. P1–P9 estiverem executados em dispositivos/navegadores físicos e registrados;
3. O1–O8 estiverem fechados com evidência do ambiente operacional real;
4. nenhum blocker novo permanecer aberto;
5. houver autorização humana explícita para rollout.

Automação Chromium, Supabase descartável e stack self-hosted reproduzível são evidência de engenharia, não substitutos dos itens abaixo.

## Limite de escopo da Qualidade v1

Este fechamento cobre o primeiro domínio entregue da área de Qualidade:

- Auditorias;
- Planos de Ação;
- Action Plan Evidence;
- Checklist Evidence;
- Export & Reporting;
- App Shell/Admin necessários ao uso e à autorização desses fluxos.

`Qualidade > Registros ISO` e `Qualidade > Pesquisa de Satisfação` permanecem módulos futuros do roadmap e **não são ausência funcional desta entrega**. Eles exigem migration gate/brief próprios e não devem ser adicionados para “completar” este v1.

## Baseline automatizada já comprovada

Na baseline de aplicação `22334995b5b239274c5c1adc98495357ec0d7980`, integrada à `main`:

- CI de aplicação `37017170877`: typecheck, lint, 236 testes, build, verify:build, audit de dependências e integrações reais de Action Plans, Evidence, Reporting, Audit, Checklist Evidence e Admin;
- CI de infraestrutura `37017171393`: stack mínimo reproduzível aprovado em runner descartável;
- Audit: catálogo 9 seções / 158 critérios, scoring, create/edit/finalize/reopen, concorrência, stale versions, revogação e RLS;
- Action Plans: origem manual/Audit, lifecycle, concorrência, verificação e revogação;
- Evidence: upload/confirm/list/download/remove, Storage/RLS, reconciliação, limites, rounds e corridas;
- Reporting: inspection/history XLSX, print surface, filtros/escopo, conteúdo completo e segurança de células;
- UI: Chromium narrow/coarse-pointer e Admin em 375/768/1024/1440, sem overflow obrigatório e com touch targets;
- Login v3 · Elo: integrado, contrato de autenticação preservado, teste dedicado de mostrar/ocultar senha e safe areas mobile no polish final.

## P1–P9 — homologação física

Cada execução deve registrar: data/hora, aparelho, SO, navegador/versão, usuário/permissão usada, resultado, evidência (screenshot/vídeo quando útil) e observações.

| ID | Teste físico obrigatório | Critério de aprovação | Estado |
| --- | --- | --- | --- |
| P1 | Android Chrome — navegação e Audit | Login, drawer, Auditorias, histórico, inspeção 158 itens, seção mobile, observação, finalizar/reabrir; sem overflow ou alvo impraticável | PENDING |
| P2 | iOS Safari — navegação e Audit | Mesmo fluxo essencial de P1, incluindo teclado/viewport e foco; sem perda de acesso a ações primárias | PENDING |
| P3 | Android Chrome — Checklist Evidence | câmera, galeria e arquivos; upload, erro/retry, download attachment e remoção; nomes longos legíveis | PENDING |
| P4 | iOS Safari — Checklist Evidence | câmera/galeria/arquivos; JPEG esperado quando o seletor transpõe foto, HEIC rejeitado claramente quando chegar; download/removal | PENDING |
| P5 | Android Chrome — Action Plan Evidence | execução e verificação: anexar, baixar, remover, verificar/reverificar com conjunto mostrado | PENDING |
| P6 | iOS Safari — Action Plan Evidence | mesmo contrato de P5 com seletor nativo e download real | PENDING |
| P7 | Android + iOS — XLSX de inspeção | salvar/abrir arquivo, nomes seguros, abas Resumo/Checklist/Secoes e conteúdo legível | PENDING |
| P8 | Android + iOS — XLSX de histórico | salvar/abrir arquivo, abas Historico/Metadados, filtros e conteúdo legível | PENDING |
| P9 | Android + iOS — impressão / salvar-compartilhar PDF | inspeção e histórico completos, sem chrome da aplicação, sem clipping crítico; registrar limitações do navegador | PENDING |

Falha em qualquer item permanece blocker ou exige uma exceção explicitamente aprovada e documentada. Não converter ausência de dispositivo em “pass”.

## O1–O8 — prontidão operacional

Os IDs abaixo formalizam a classificação já usada pela matriz de conclusão.

| ID | Gate operacional | Evidência mínima para fechar | Estado atual |
| --- | --- | --- | --- |
| O1 | RPO/RTO e retenções | RPO técnico, RTO dentro/fora da janela operacional e retenção de DB, objetos, logs e removidos definidos/medidos pelo responsável | PARTIAL |
| O2 | Ambiente real / headers de Storage | verificar ambiente de produção candidato, HTTPS/origem, `X-Content-Type-Options: nosniff`, cache/no-cache e comportamento de signed download | UNKNOWN |
| O3 | Backup independente | backup automatizado de PostgreSQL + Storage/objetos em destino independente, com credenciais/separação adequadas | OPEN |
| O4 | Restore drill | restaurar DB + objetos em ambiente isolado, reconciliar, iniciar app, baixar arquivos autorizados e comprovar negação cross-unit | OPEN |
| O5 | Reconciliação monitorada | executar reconciliação Audit + Action Plan Evidence em agenda definida e gerar alerta acionável | PARTIAL |
| O6 | Retenção/purge operacional | política de retenção, autorização humana, runbook de purge via Storage API e evento de auditoria; nunca delete SQL direto do Storage | PARTIAL |
| O7 | Observabilidade | health checks, métricas e alertas para app/gateway/Auth/PostgREST/Storage/PostgreSQL, capacidade e falhas de backup/WAL | OPEN |
| O8 | Release/rollback e aceite operacional | runbook de deploy/rollback, responsáveis, janela, checklist pós-deploy e assinatura/aprovação humana de liberação | OPEN |

A PR #16 fornece uma base reproduzível para infraestrutura e healthcheck negativo de Storage, mas não fecha O2–O8 porque não acessou servidor/produção e não implementou a operação real.

## Login — fechamento de repositório

Critérios de código/documentação para considerar a tela finalizada antes de homologação física geral:

- PR #17 mergeada em `main` no commit `32540028119ecd0ac13bcec13d69c1d55e67d834`;
- CI pós-merge de aplicação e infraestrutura verdes;
- `Login.tsx` importa exclusivamente `Login.css` para a composição v3;
- regras antigas `.login/.login-card/.login-loops` removidas do App Shell na rodada final;
- mostrar/ocultar senha acessível, busy/error, reduced motion, compact mobile/visualViewport e theme-color preservados;
- autenticação/Supabase não redesenhados pela camada visual.

## Padronização visual final

A rodada final deve manter como invariantes:

- tokens de `shared/styles/tokens.css` como fonte de valores compartilhados;
- App Shell sem CSS específico do Login;
- superfícies de Evidence usando tokens e componentes compartilhados;
- ações/filtros responsivos em mobile, touch targets ≥44 px quando narrow/coarse;
- safe-area de top/bottom/left/right no shell mobile;
- Audit section bar abaixo da altura real do header/safe-area;
- sem regra visual que altere scoring, lifecycle, RLS, autorização ou contrato de Storage.

## Registro de execução

Quando um item for executado, substituir apenas seu estado por `PASS`, `FAIL` ou `BLOCKED` e anexar uma linha no log abaixo.

| Data | ID | Ambiente/aparelho | Resultado | Evidência / observação | Responsável |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

Não preencher resultados retroativamente sem evidência.
