# AUD-IMG-02 — GO C executado no desenvolvimento local

**05/11/2026 · PR #101 draft · HEAD funcional testado `27a82938e96b4da7a4ac7ce86e1f5fc826a88ccc`.** O mantenedor autorizou expressamente as duas migrations incrementais, identidade técnica mínima, remoção segura do GUC legado, uma imagem sintética, one-shot e teste visual temporário. Destino exclusivo: `gaucha-gestao-local`. O pedido vigente substituiu a exigência anterior de recuperação/backup de produção por backup local proporcional, preservando os dados. Sem autorização de merge, deploy, backfill ou alteração em C30/STAGING/PROD.

## Resultado funcional medido

| Verificação | Resultado real |
| --- | --- |
| Migrations autorizadas | `20261104171756` e `20261104192428` aplicadas; histórico passou de 32 para 34 registros |
| Storage existente | **v1.72.1**, sem atualização de containers; ciclo de geração/leitura funcionou |
| Original sintético PNG | **5.127.003 bytes**, **1600 × 1066** |
| Miniatura PNG `img-480-v1` | **377.025 bytes**, **480 × 320**, sem EXIF |
| Redução física/GET de listagem | **92,6463%**, `100 × (1 − 377025 / 5127003)`; uma única imagem |
| Processamento | Uma tentativa, `ready`, `runtime_login = audit_derivative_worker`, lease encerrada |
| Listagem no Chromium 1280 × 960 | Um GET de miniatura, HTTP 200, **377.025 bytes**, hash conferido; **zero GETs do original** antes de ampliar |
| Ampliação | GET HTTP 200 de **5.127.003 bytes**, dimensão natural 1600 px; SHA-256 do original |
| Download no Chromium | `Evidência 1.png`, **5.127.003 bytes**; arquivo baixado comparado pelo SHA-256 do original |

SHA-256 do original, antes do upload, na leitura de volta, após processamento, na ampliação e no download:

```text
b34b6b1b6925339967de1e8a37da0355ac184ca43adb8dc3eba7f82d7a652831
```

SHA-256 da miniatura, no manifesto, leitura de volta e resposta recebida pelo navegador:

```text
71a97e3a0ee1b56ac732d9c4012168a37bff0ad27bbc9a13197603aa2959e423
```

A redução corresponde aos bytes reais recebidos neste ensaio sintético. Não é benchmark MED-01 10/30/100, economia global de egress ou avaliação humana de textos/códigos de barras. O custo one-shot de processamento continua incluindo leituras adicionais do original.

## Ambiente, preservação e aplicação

Checkout inicial em `codex/gg-10-announcements-admin`, sem alterações rastreadas e com `supabase/snippets/` não rastreado. Foi preservado e reutilizado o checkout existente, trocando para `codex/aud-img-02-derivative-design` e avançando por fast-forward até o HEAD autorizado; nenhum worktree ou runtime novo. Containers locais existentes: PostgreSQL 17.6.1.167, Auth v2.196.0, REST v16.2, Storage v1.72.1 e Kong 2.8.1. `supabase/config.toml` confirma o projeto; API/DB vinculados a loopback nas portas existentes 54321/54322.

O histórico tinha uma migration adicional da outra tarefa, `20261105131548_announcements_administration`. Seu conteúdo armazenado no banco foi comparado **integralmente** ao arquivo da branch de comunicados: igual. Nenhuma migration comum faltava. Não foi usado repair nem removido esse registro para fazer a CLI aceitar a branch anterior.

Após revisão do SQL, cada uma das duas migrations autorizadas foi aplicada por `psql` via stdin, como `postgres`, inserindo versão/nome/conteúdo no ledger **antes do COMMIT da própria migration**. Não se chamou `migration up` indiscriminadamente diante da divergência conhecida entre branches. Os 32 registros anteriores do ledger foram comparados integralmente ao final: preservados. Bucket privado com limite 1.048.576 bytes e MIME JPEG/PNG, manifesto/fila com RLS, trigger, policies e sete funções de runtime conferidos; fila vazia antes da única fixture. Nenhum backfill.

Backup local simples, com diretório 0700 e arquivos 0600: dump custom completo, roles, bytes do volume Storage, configuração privada dos containers/frontend e ledger anterior. Catálogo do dump legível por `pg_restore --list`, sem restauração sobre o banco existente. Cópia local conservada em `tmp/aud-img-go-c-20261105-backup/`, ignorado pelo Git. É backup no mesmo computador, **sem prova de restore ou independência do host**. Nenhum conteúdo desses arquivos integra a PR.

Os **19 arquivos regulares anteriores** do Storage foram comparados ao tar anterior por caminho e SHA-256: todos preservados. Ao final existem apenas dois arquivos novos, original e miniatura, 12 evidências no total (11 anteriores + uma sintética) e uma única linha de derivados `ready`.

## Identidade técnica e acesso

A busca em funções/views, extensões instaladas e configurações dos serviços não encontrou dependência do GUC `app.settings.jwt_secret`. A remoção exigiu o bootstrap existente `supabase_admin`; a tentativa como `postgres` foi recusada. Executado `ALTER DATABASE postgres RESET "app.settings.jwt_secret"`, sem rotação ou substituição do segredo, restart, recriação ou ampliação de autoridade do `postgres`. Catálogo/conexão nova confirmam ausência de exposição global. Auth, RPCs, Storage e navegador continuaram funcionando.

Login técnico criado inicialmente NOLOGIN, com SCRAM, NOINHERIT, NOBYPASSRLS, sem superuser/CREATEROLE/CREATEDB/REPLICATION/memberships, limite de três conexões e validade inicial de uma hora. Aplicado somente o bootstrap `scripts/ops/sql/audit-derivative-runtime-access.sql`; depois habilitado para o ensaio. `restrictedConnection` passou; senha incorreta foi recusada com `28P01`. Leituras de Core/manifesto/Storage, arquivo do servidor, SET ROLE e claim legada foram negados com `42501`. Senha própria/chave pública no worker; segredo de assinatura somente no supervisor, sem `service_role` no processamento. A chave administrativa preexistente foi usada apenas no bootstrap Auth dos usuários sintéticos.

One-shot executado com `expectedEvidence` fixado à única evidência sintética. Bubblewrap do worker e decoder irmão preservados. O login voltou a **NOLOGIN** ao encerrar o ensaio; ACLs mínimas conservadas, sem daemon/timer ou sessão técnica permanente.

| Ator / caminho real | Original GET e nova assinatura | Miniatura GET e nova assinatura |
| --- | --- | --- |
| Autor autorizado | PASS permitido | PASS permitido |
| Outro leitor autorizado na mesma unidade | PASS permitido | PASS permitido |
| Outro usuário sem grant | PASS negado | PASS negado |
| Usuário de outra unidade | PASS negado | PASS negado |
| Perfil inativo | PASS negado | PASS negado |
| Grant revogado com JWT ainda válido | PASS negado | PASS negado |
| Anônimo | PASS negado | PASS negado |

RPC do manifesto retornou linha para autor/leitor e lista vazia para sem grant/outra unidade/inativo. GET público da miniatura também negado. Nenhum 5xx foi aceito como prova de negação.

**Teste adicional de escrita: PARCIAL.** POST/upsert ordinário com o corpo completo da miniatura retornou `400 Unauthorized` em algumas tentativas, mas requisições subsequentes excederam o limite de 15 segundos. O comportamento também apareceu com cliente HTTP independente e handshake 100-continue; a causa não foi determinada. Não se marcou toda a matriz de escrita como PASS, nem se atualizou/reiniciou Storage para contorná-lo. Uma tentativa de DELETE retornou HTTP 200 com lista vazia; objeto preservado. Leitura final e hashes confirmaram original e miniatura intactos. Esse ponto permanece pendente; não impede a demonstração comprovada de listagem/ampliação/download, mas limita a homologação completa da versão local.

## Frontend e artefatos locais

Vite existente em `http://127.0.0.1:5173` foi reutilizado. Flag habilitada somente no `.env.local` ignorado e confirmada no módulo servido, sem mudar o padrão versionado `false`. Chromium com bibliotecas locais já existentes, sem instalação/atualização do sistema. Requisições externas foram bloqueadas pelo teste; Auth/RPC/Storage reais, sem mocks de imagem. No download o corpo foi verificado pelo arquivo salvo pelo Chromium; a API do navegador não disponibilizou esse corpo no evento de resposta, por isso não foi inventada uma segunda medida de transporte.

Para a conferência posterior do mantenedor, a flag fica **temporariamente `true` apenas no `.env.local`**; remover essa linha ou definir `false` desliga a prévia local. O build validado abaixo foi feito com a configuração original restaurada, padrão `false`. Nenhuma configuração versionada foi ativada. A inspeção sintética, os objetos e o histórico foram preservados; contas/unidades/papel sintéticos não foram apagados. Credenciais locais permanecem somente em arquivos protegidos fora do Git.

Artefatos desta execução em `/tmp/aud-img-go-c-20261105/`: `browser-proof.json`, `result.json`, `localhost-list.png`, `localhost-expanded.png` e harnesses locais. Os JSONs de prova não contêm tokens, senhas nem URLs assinadas; arquivos `*-private`, segredo e backup **não são artefatos publicáveis**.

## Checks e limites

Executados no HEAD funcional acima, com registros documentais posteriores:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test -- tests/audit-derivative-protocol.test.ts tests/audit-derivative-worker.test.ts tests/audit-derivative-runtime.test.ts tests/audit-derivative-runtime-protocol.test.ts tests/audit-evidence-traffic.test.ts --maxWorkers=2`: **55 PASS, cinco arquivos**; subprocessos fora do sandbox externo, preservando o Bubblewrap do decoder.
- `npm run build`: PASS; aviso de chunk maior que 500 kB.
- `npm run verify:build`: PASS, sem chaves privilegiadas no bundle.
- `npm audit --audit-level=moderate`: PASS, zero vulnerabilidades.
- `git diff --check`: PASS; conferidos os links locais dos documentos alterados.
- Auth/PostgreSQL/Storage/Chromium reais: resultados acima. Evidência sintética única, sem acervo antigo.

Não repetidos no local: matriz completa de verbos técnicos com lease viva, expiração/renovação de JWT, concorrência de duas sessões, pending/removed, restore, MED-01 10/30/100 e Android/iOS físicos. As provas anteriores do CI no mesmo SHA continuam históricas, sem serem atribuídas a este banco. Nenhuma correção do código de produto ou migration adicional foi necessária para alcançar `ready` e testar visualmente; ajustes feitos nos harnesses locais não equivalem à resolução do timeout HTTP pendente.

Mantenedor único decide revisão/merge; sem segunda revisão humana ou review formal APPROVED inventados. PR continua draft. A execução local não fecha homologação geral, gates humanos nem PROD NO-GO.
