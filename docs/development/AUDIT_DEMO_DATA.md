# Massa de demonstração da Auditoria — somente Supabase local

Ferramenta de desenvolvimento para a Auditoria v1 e sua futura apresentação V2.
Não modifica UI, migrations, schema, RLS, permissões, scoring ou lifecycle.
Usa dados fictícios, sem evidências binárias e sem credenciais de produção.

## Pré-requisitos e comando

- Node 22.12+ e npm; execute `npm ci` na raiz.
- Docker Desktop/Engine iniciado, com CLI `docker` no PATH e contexto local
  por socket Unix ou named pipe do Windows. Contextos TCP/SSH são recusados.
- Checkout **não linked**, com `supabase/config.toml` original
  (`project_id = "gaucha-gestao-local"`) e migrations locais aplicadas.
- Um usuário Auth **local**, confirmado, ativo e não banido, com a atribuição
  global ativa de `platform_administrator`. O seed reutiliza esse administrador;
  não cria usuários nem concede acesso.

Na raiz, inicie a stack usando a mesma versão da CLI dos runners de integração:

```sh
npx --yes supabase@2.117.0 start
npm run seed:audit-demo
```

A CLI é obtida pelo npx; não é necessário instalá-la globalmente. O seed imprime
os códigos/nomes e UUIDs das unidades, UUID/data/estado/progresso/score de cada
auditoria, usuário usado e distribuição dos planos. As datas das visitas são
relativas ao dia da **primeira execução** e permanecem estáveis nas repetições.

Se houver mais de um administrador elegível, selecione explicitamente:

```sh
npm run seed:audit-demo -- --user-id UUID_DO_ADMIN_LOCAL
```

No PowerShell com restrição a `npm.ps1`, use `npm.cmd` / `npx.cmd`.
Nenhum argumento para URL, banco, senha, projeto remoto ou `--linked` é aceito.

## Usuário e senha definidos pelo operador

Reutilizar o administrador local evita provisionar contas ou mudar autorização.
Se ainda não existir um administrador, siga o bootstrap existente em
[LOCAL_FOUNDATION.md](LOCAL_FOUNDATION.md):

1. Abra o Studio **local** em `http://127.0.0.1:54323`, Auth → Users, e crie
   uma conta confirmada. **Você define a senha no Studio**, fora do repositório.
2. Copie o UUID e execute uma vez no SQL Editor desse Studio local:

   ```sql
   select private.bootstrap_administrator('UUID_DO_USUARIO_CONFIRMADO'::uuid);
   ```

O bootstrap existente rejeita repetição. Se já houver administrador, entre com
sua conta local ou faça a recuperação/alteração de senha no Auth local. O seed
não altera senhas, perfis, papéis ou atribuições e não imprime segredos.

## Dados criados

Todos os nomes começam com `[DEMO]`. O prefixo de código `DEMO-AUD-` é reservado
exclusivamente para esta ferramenta. Os UUIDs são gerados pelos contratos atuais.

| Código | Cenário inicial |
| --- | --- |
| `DEMO-AUD-ALTA` | Santa Clara: finalizada, 140 AT / 8 AP / 4 NAT / 6 NAP; **94,74%, adequada** |
| `DEMO-AUD-BAIXA` | Vale Verde: finalizada, 45 AT / 45 AP / 60 NAT / 8 NAP; **45%, inadequada** |
| `DEMO-AUD-INICIO` | UPA Central: rascunho com **18/158** critérios respondidos |
| `DEMO-AUD-FINAL` | São Lucas: rascunho com **150/158** critérios respondidos |
| `DEMO-AUD-EVOLUCAO` | Horizonte: três finalizadas, há 90/60/30 dias, **45% → 72,67% → 93,33%**; visita anterior encadeada |
| `DEMO-AUD-VAZIA` | Nova Esperança: unidade ativa **sem auditorias nem planos** |

São sete auditorias, cada uma com o checklist canônico de 158 critérios.
Respostas AP/NAT possuem observações fictícias e geram **320 planos** pelo trigger
existente. As deficiências são distribuídas entre as seções. NAP fica fora do score.
A conformidade/classificação final é calculada por `audit.finalize_inspection`,
sem inserir scores, estados finais ou responsáveis artificialmente.

Quatro planos de Vale Verde ilustram: pendente, em andamento, concluído sem
verificação e concluído com eficácia `effective`. Os três avançados recebem
planejamento completo; o exemplo em andamento tem prazo futuro. As transições
usam `update_plan`, `set_plan_status` e `verify_plan`, com as versões atuais e
conjunto vazio de evidências esperado. Nenhum registro de anexo é criado.

## Como conferir visualmente

1. Copie `apps/web/.env.example` para `apps/web/.env.local`.
2. Defina `VITE_SUPABASE_URL=http://127.0.0.1:54321` e
   `VITE_SUPABASE_PUBLISHABLE_KEY` com a chave **publishable/anon local** mostrada
   por `npx --yes supabase@2.117.0 status`. Nunca use service role no frontend.
3. Execute `npm run dev` e abra a URL local informada pelo Vite
   (normalmente `http://localhost:5173`). Entre com o administrador local e sua senha.
4. Em Qualidade → Auditoria, localize as unidades `[DEMO]`. Abra os dois rascunhos,
   resultados finalizados e o histórico de Horizonte. Confira também Planos de
   Ação, filtrando por Vale Verde para observar os diferentes estados.

O seed é independente do redesign; rode-o a partir desta branch e abra a UI da
branch de design apontada à **mesma stack local**. Não é necessário aplicar este
script à worktree do Claude. Não rode reset enquanto outra pessoa usa essa stack.

## Repetição, erros e limpeza

**Reset não é obrigatório** quando as migrations estão aplicadas e a conta existe.
O seed usa uma transação única com lock para serializar execuções concorrentes.
Uma falha reverte unidades, auditorias, respostas, planos e logs criados pela
execução. O processo retorna código diferente de zero em caso de erro.

Repetir uma massa completa apenas a consulta: preserva respostas, planos e logs
existentes, sem duplicar ou restaurar os estados de demonstração. Códigos/nomes
conflitantes, unidades inativas, conjuntos parciais ou quantidade de auditorias
alterada são recusados sem sobrescrever dados. Se você criar auditorias extras
nas unidades `[DEMO]`, a próxima execução também recusa a massa expandida.

Para **limpar e recriar toda a stack descartável**, o operador pode executar:

```sh
npx --yes supabase@2.117.0 db reset --local
```

Isso apaga **todos os dados locais**, inclusive usuários Auth. Recrie o administrador
local pelo bootstrap acima e execute o seed novamente. Nunca use `--linked`,
`--db-url` ou produção. O seed não executa reset ou remoções por conta própria;
não há limpeza seletiva que burle os contratos de histórico.

## Proteções de destino

- Recusa checkout com `supabase/.temp/project-ref` (linked) e projeto local diferente.
- Recusa ambientes fora de development/local/test, variáveis de credenciais/projeto
  Supabase, overrides de PostgreSQL/Docker e URLs remotas presentes no processo,
  inclusive nomes de variáveis com diferenças de maiúsculas/minúsculas no Windows.
- Não lê `.env`, dumps ou configurações de produção; não aceita segredo como entrada.
- Confere `API_URL` e `DB_URL` do **status local da CLI**, exigindo literalmente
  `127.0.0.1` ou `localhost`, portas 54321/54322 e banco `postgres`. Rejeita
  parâmetros, hosts normalizados alternativos, caminhos diferentes e redirects.
- Confere e fixa o socket local do Docker para todas as chamadas seguintes,
  incluindo a CLI: trocar o contexto padrão durante a execução não altera o destino.
  Confere nome/label do projeto, imagem Supabase PostgreSQL e container em execução. Escreve via `docker exec` no **ID imutável do container**
  e socket PostgreSQL interno, sem conectar à `DB_URL` ou a portas encaminhadas.
- Somente a identificação do administrador é feita como operador. Todas as
  gravações de domínio usam `SET LOCAL ROLE authenticated`, identidade do usuário,
  grants/RLS, triggers e RPCs existentes. Não desabilita nenhum mecanismo.
- Não imprime status bruto, credenciais, tokens ou detalhes de subprocessos.

Execute o SQL somente pelo comando protegido, nunca copiando `seed.sql` para um
banco remoto. Este é um guardrail de ferramenta para desenvolvimento; o operador
continua responsável por usar uma stack local descartável e o checkout confiável.

## Validação

```sh
npm run typecheck
npm run lint
npm test
npm run seed:audit-demo
```

`tests/audit-demo-safety.test.ts` valida recusas de destino/flags, incluindo nomes
de variáveis no Windows. `tests/audit-demo-runner.test.ts` simula a fronteira externa
Docker/CLI no Linux para reproduzir uma troca concorrente de contexto; não inicia
Docker real nem substitui a validação local completa.
`tests/audit-demo-database.test.ts` aplica todas as migrations no PostgreSQL
PGlite e exercita a massa com grants, RLS, triggers e RPCs reais, repetição,
colisões, identidade e rollback tardio. Auth e Storage usam o contrato mínimo
do harness existente; isso **não substitui** uma execução real da CLI/Docker,
Auth/PostgREST e conferência no navegador local.
