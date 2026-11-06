# AUD-IMG-CI-01 — determinismo da regressão da fila

Data: 06/11/2026. Base remota conferida: `1c704f84efa0650e6fbed3354fc7ab77e75fe73f`
(`main`, PR #101 integrada). Branch: `codex/aud-img-ci-01`. As PRs #106–109
continuavam abertas na consulta inicial; #108 permanecia draft. Trabalho independente
de GG-02B/GG-02C. Mantenedor único decide revisão/merge; nenhuma segunda revisão humana
é alegada. **PROD NO-GO**.

## Diagnóstico e contrato

A [CI de `bda21d4`](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/42259464590/job/128035273127)
registrou 1.116 PASS/1 FAIL na antiga linha 325 de
`tests/audit-evidence-database.test.ts`. Teste e migrations eram idênticos à base
`main` consultada. O log histórico contém somente UUID esperado/recebido; não permite
atribuir retrospectivamente o UUID recebido a `b` ou a outra fixture.

Há uma restrição adicional na hipótese inicial: o esperado histórico era
`b5a5ac41-025e-4664-b5a6-eb988ec58a03` e o recebido era
`edf27989-0a4a-4c66-ba51-ce67f57470f4`. O esperado é menor. Portanto, **um empate
total entre apenas essas duas linhas não explicaria aquele resultado** pelo UUID
ascendente. A colisão de `pending` com o corte é um mecanismo adicional demonstrado;
não se deve apresentar o desempate de `a`/`b` como identificação comprovada do run.

O problema demonstrado está nas premissas temporais do teste:

1. Ele iniciava `pending` antes de consultar `clock_timestamp()` para o corte,
   assumindo `pending.created_at < cutoff`. No PGlite instalado, o relógio chega
   por `_emscripten_date_now=()=>Date.now()`: eventos sequenciais podem compartilhar
   o milissegundo. Se forem iguais, o predicado **inclusivo** `>=` permite selecionar
   esse upload após a confirmação tardia. Ele tem prioridade anterior a `a`.
2. Ele exigia `a` primeiro sem fixar prioridade. A ordenação é
   `j.next_attempt_at, j.created_at, x.id`; com horários empatados, o UUID pode colocar
   `b` primeiro. O teste de claim serial/retry continha a mesma suposição e também
   foi ajustado.

Fontes versionadas: migrations `20260930114000_audit_checklist_evidence_v1.sql`
(`e.created_at DEFAULT clock_timestamp()`), `20261104171756_audit_evidence_derivatives.sql`
(`j.created_at` e `next_attempt_at DEFAULT clock_timestamp()`, trigger após
`pending → available`, `ON CONFLICT DO NOTHING`) e
`20261106112635_audit_derivative_global_new_uploads.sql` (corte, seleção e leases).
`runtime_derivative_claim` delega à claim e vincula a lease ao `session_user`.

O [contrato de desenho](AUD_IMG_02_DESIGN_20261104.md) e o
[contrato integrado](AUD_IMG_02_INTEGRATED_DEV_20261106.md) exigem elegibilidade,
serialização, recuperação de lease, CAS, retry limitado e preservação do original;
não exigem FIFO causal estrito. O SQL integrado usa corte inclusivo para **ambos**
os `created_at`. Empate representa o mesmo instante na precisão disponível; não
comprova que um evento ocorreu estritamente antes de outro. A correção preserva
esse contrato e não muda o corte para `>`.

`clock_timestamp()` acompanha o relógio corrente, enquanto o timestamp transacional
permanece no início da transação ([PostgreSQL](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)).
As capturas mostram relógio corrente diferente do transacional, sessão `postgres`
e `TimeZone GMT`. Não houve evidência de fuso, `now()` fixo por transação, mistura
de bancos ou execução concorrente de casos como causa. Cada processo cria PGlite
em memória; os casos deste arquivo são sequenciais, os casos de derivados usam
`BEGIN`/`ROLLBACK` e GUCs locais. A suíte geral também verifica o contexto compartilhado
do arquivo, além da execução isolada.

## Reprodução e evidências

[JSON sanitizado](evidence/aud-img-ci-01-20261106.json) contém ambiente, contagens,
UUIDs exclusivamente sintéticos, timestamps SQL convertidos a texto (sem perda
de precisão por `Date`), estados, tentativas, lease expirada, elegibilidade e ordem
efetiva. Nenhum objeto empresarial, conteúdo de imagem, chave de objeto, JWT ou
credencial foi capturado. A instrumentação temporária foi removida.

Execuções limitadas antes da correção:

| Experimento | Resultado real |
| --- | --- |
| Baseline isolado, sem instrumentação | 1/1 PASS |
| Isolado, instrumentação por console | 10/10 PASS; reporter não expôs console |
| Isolado, instrumentação JSONL temporária | 10/10 PASS |
| Arquivo completo instrumentado (45 testes por execução) | 10/10 PASS |
| Mesmo milissegundo em `pending`/corte | 1/1 FAIL na assertion antiga; selecionou `pending` |
| Prioridade explícita de `b` | 1/1 FAIL na assertion antiga; selecionou `b` |
| Empate total dos dois horários de `a`/`b` | 4 FAIL/1 PASS, conforme desempate por UUID |
| Mutação da regressão corrigida para voltar a exigir `a` | 1/1 FAIL no cenário `ordem b` |

Não se alega reprodução espontânea local: as 31 execuções baseline passaram.
As reproduções controladas demonstram dois mecanismos suficientes para a mesma
assertion falhar, sem alterar a implementação SQL. O run histórico não tem a
instrumentação necessária para decidir qual mecanismo ocorreu nele.

Para reproduzir o empate do corte na baseline, adicionar temporariamente
`vi.spyOn(Date, 'now').mockReturnValue(Date.now())` imediatamente antes de criar
`pending`, restaurando o spy logo após consultar o corte. Isso preserva o SQL e
coloca início/corte no mesmo milissegundo. Para reproduzir o desempate, atribuir
`created_at=next_attempt_at=cutoff` somente aos jobs sintéticos `a`/`b` da transação.
A captura usa `ORDER BY j.next_attempt_at,j.created_at,x.id` e projeta somente ID,
tempos como texto, estado, tentativas, lease_until e comparações com o corte.

## Correção e regressões

Somente testes e este registro/evidência mudam. **Nenhuma migration é necessária**:
não há mudança funcional, SQL de aplicação, RLS, grants, wrappers ou runtime.

A fixture fixa tempos explícitos no passado: evidências do acervo ficam 1 µs antes
do corte; o job confirmado tardiamente fica no corte, com início anterior;
os dois uploads novos e seus jobs ficam exatamente no corte. Há três casos:
prioridade de `a`, prioridade de `b` e empate com desempate por UUID. O teste exige
o conjunto exato das duas evidências processadas e valida a ordem correspondente
aos dados controlados, sem presumir ordem entre chamadas JavaScript.

O ajuste de `created_at` imutável ocorre exclusivamente na montagem da fixture,
sob superusuário do banco de testes, dentro de transação revertida; o guard é
reativado em `finally` **antes** das claims/assertions. Esse padrão já existe no
arquivo. Não remove ou flexibiliza o guard da aplicação nem as negativas de acesso.

Permanecem verificadas: segunda claim negada durante lease ativa, recuperação só
após expiração, nova lease, rejeição da lease obsoleta, teto/falha terminal e
acervo intacto (inclusive job antigo expirado na quinta tentativa). Foram acrescidas
contagens de tentativas, retorno das falhas, estado terminal sem leases, igualdade
dos originais e objetos Storage simulados. O corte posterior é testado contra um
job realmente elegível no corte anterior, seguido de controle positivo no corte
anterior, evitando uma assertion vazia sobre fila já esgotada.

O teste genérico de retry cria o segundo job após recuperar a primeira lease,
antes de registrar a falha transitória: continua verificando backoff, seleção do
outro job e teto de tentativas sem depender de FIFO entre dois jobs novos.

## Validação e limites

Comandos locais usam Node `22.23.4`, Vitest `5.0.4` e PGlite `0.3.14`, já disponíveis,
com `PATH=/home/bernardodev/.nvm/versions/node/v22.23.4/bin:$PATH`. Não houve instalação
de runtime/dependência, container, banco persistente ou worktree novo. `docker ps`
foi somente leitura: stack `gaucha-gestao-local` existente. Sem URL de banco de
testes configurada; migrations foram carregadas somente no PGlite efêmero.

| Validação local do conteúdo corrigido | Resultado |
| --- | --- |
| `npm test -- tests/audit-evidence-database.test.ts -t 'global_new processa' --no-color` | 20/20 execuções PASS, três casos/execução (60 PASS) |
| `npm test -- tests/audit-evidence-database.test.ts --no-color` | 10/10 execuções PASS, 47 testes/execução (470 PASS) |
| `npm test -- --maxWorkers=2 --no-color` | 80 arquivos / 1.119 testes PASS, 147,42 s |
| `npm run typecheck`; `npm run lint` | PASS |
| `npm run build`; `npm run verify:build` | PASS; aviso preexistente de chunk >500 kB |
| `npm audit --audit-level=moderate` | PASS, zero vulnerabilidades |
| Diff, hash/consistência do JSON, links locais | PASS |

A suíte completa preserva as negativas de unidade indevida, perfil inativo, usuário
sem permissão, anônimo, setor, grant revogado, DML técnico, lease obsoleta,
retry/backoff, falha do decoder e limites do processamento. Foi executada fora do
sandbox da ferramenta para permitir os namespaces Bubblewrap, sem fallback.
Build usou URL loopback e chave fictícia pública de CI, sem contato com banco.
Não houve falha na validação final nem rerun para obter verde.

Resultados finais e SHA do conteúdo de teste estão no JSON. A PR registra commit,
links e resultados da CI completa por SHA, inclusive integrações existentes.
Não há configuração de retry automático ou tolerância a FAIL; as repetições são
experimentos contados, com todos os resultados registrados.

PGlite/Auth/Storage stubs não comprovam concorrência entre sessões independentes,
bytes de Storage HTTP, recuperação física ou homologação mobile. Não foram
executados harnesses destrutivos no banco local persistente, nem migrations em
C30/STAGING/PROD. Dados reais não foram acessados. O corte temporal continua com
a precisão do relógio do banco e não constitui fronteira adicional de autorização.

Rollback da correção: reverter o commit de testes/documentação; nenhuma reversão
de dados/schema. Riscos residuais: cobertura de tempo/ordem é finita; CI verde e
repetições não substituem validação operacional, homologação nem aceite humano.
Arquivos não rastreados de `supabase/snippets/` e de GG-02C observados durante o
trabalho foram preservados e ficam fora da PR. Sem merge automático ou deploy.
