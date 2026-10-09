# Fundação v1 — desenvolvimento e validação

> **Core v2 em teste (2026-10-09):** este guia registra a fundação histórica e contém o comando `supabase db reset` somente para **banco local descartável sob controle exclusivo**. Para testar as interfaces novas sem risco ao banco compartilhado e sem confundir versões locais, use [Core v2 — teste manual PC/Android](CORE_V2_MANUAL_TEST.md); no desenvolvimento corrente, não execute reset em instâncias compartilhadas.

Requisitos: Node 22.12+ e npm. Na raiz:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

Copie `apps/web/.env.example` para `apps/web/.env.local`. Preencha apenas URL
local/de teste e chave **publishable** (ou JWT legado com papel **anon**).
Nunca use `service_role`, chave secreta ou credenciais do PostgreSQL no frontend.
Sem configuração, a aplicação apresenta um estado explícito de ambiente indisponível.

## Supabase local (opcional; requer CLI e Docker)

```sh
supabase start
supabase db reset
```

`db reset` apaga somente o banco local; não use `--linked` nem uma URL remota.
O arquivo `supabase/config.toml` expõe `core`, `audit` e `action_plans`, mantém `private`, `audit_private` e `action_plans_private` fora da Data API
e desabilita cadastro público. Não provisiona produção.

1. No Auth do Studio **local**, crie/confirme uma identidade administrativa
   com `display_name` no metadata (ou use o Admin API em processo confiável).
2. Como operador do banco local, execute **uma vez**, substituindo o UUID:

```sql
select private.bootstrap_administrator('UUID_DO_USUARIO_CONFIRMADO'::uuid);
```

O bootstrap exige conta confirmada e ativa, é serializado, rejeita repetição e
não é executável por `anon`/`authenticated`. Não escolhe automaticamente o primeiro
cadastro nem confia em metadata para atribuir privilégios. Nenhum segredo é gerado
ou armazenado no repositório. Usuários adicionais são criados/convidados pelo
operador autorizado no Auth; recebem perfil sem atribuições. O administrador
concede acesso na tela Usuários. Recuperação de senha também usa o fluxo do Auth.

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

