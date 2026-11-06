# GG-02B — prova de conceito local de backup incremental

**06/11/2026 · Estado atual: POC DE ARQUIVOS SINTÉTICOS PASS (BAK-01–08).**
**BAK-09 físico/off-site e GG-02/GG-03 operacionais permanecem pendentes. PROD e piloto com dados reais: NO-GO.**

## Escopo, autorização e rastreabilidade

Continuação da [PR #108](https://github.com/The-Vonky/Gaucha-Gestao/pull/108), branch `codex/gg-02b-restic-lab`, após a [revisão técnica](https://github.com/The-Vonky/Gaucha-Gestao/pull/108#pullrequestreview-5803768603). O mantenedor autorizou especificamente a obtenção do executável portátil oficial do Restic para o ambiente local descartável do Codex, com SHA-256 conferido, usuário comum e sem instalação global. Não autorizou Rclone, C30, Drive ou dados reais.

Código ensaiado: **`976bcc33faf91dcabd9b1cc04bd0608e1a34a8ec`**. A [evidência completa saneada](../../tests/labs/gg02b/results/20261106-execution.json) contém hashes dos scripts, versão/procedência, saídas dos 19 comandos Restic, tempos, tamanhos, snapshots e hashes de cada arquivo restaurado. [Scripts e instruções](../../tests/labs/gg02b/README.md).

A preparação anterior, em `1e1b03a`/`2b69fbe`, estava corretamente BLOCKED por Restic ausente. Sua [evidência histórica](../../tests/labs/gg02b/results/20261106-preflight.json) foi preservada. Dois ensaios novos completos passaram; os números abaixo correspondem exclusivamente ao segundo, realizado com o código final citado. A variação entre ensaios é esperada, pois cada inicialização gera parâmetros de chunking próprios.

Referências: [AGENTS](../../AGENTS.md), [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md), [C30_BACKUP_GAPS](C30_BACKUP_GAPS.md), [DR histórico](../planning/02_RESTORE_DRILL.md), [GG-01](C30_GG01_INVENTORY_20261105.md), [GG-02](GG02_BACKUP_INICIAL_DRIVE_20261105.md), ADR-008 e Plano Diretor. A [revisão GG-02A na PR #106](https://github.com/The-Vonky/Gaucha-Gestao/pull/106#issuecomment-6689925774) é a fonte disponível do parecer fornecido ao mantenedor; seu texto integral não foi localizado no checkout. Drive como repositório principal do pacote completo segue a decisão atual, sem presumir merge da PR #106.

## Ambiente e procedência do Restic

- Baseline da tarefa: `origin/main` `1c704f84efa0650e6fbed3354fc7ab77e75fe73f`. Branch e alterações preexistentes `supabase/snippets/` preservadas; nenhum worktree criado.
- Linux amd64, Python 3.14.4, UID 1000, sem sudo. Nenhum acesso a Docker, Supabase, banco, Storage, C30 ou Drive nesta continuação.
- **Restic 0.19.1**, executável informa `compiled with go1.26.4 on linux/amd64`. Versão estável obtida da [release oficial](https://github.com/restic/restic/releases/tag/v0.19.1).
- [Arquivo oficial Linux amd64](https://github.com/restic/restic/releases/download/v0.19.1/restic_0.19.1_linux_amd64.bz2) e [SHA256SUMS oficial](https://github.com/restic/restic/releases/download/v0.19.1/SHA256SUMS), ambos via HTTPS. SHA-256 publicado e observado do arquivo comprimido: **`f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c`**.
- SHA-256 adicional do executável descomprimido: `20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`. Este segundo hash é registro local; a comparação oficial exigida é a do `.bz2`. A descompressão e execução ocorreram somente depois da igualdade do checksum.
- Binário e downloads em `/tmp/gg-02b-tools-26a6355a74bd4c9c9afa130a026a7e83`, diretório privado 0700, executável 0700, fora do checkout, origens e repositórios. PATH ajustado somente nos comandos da POC. Rclone não instalado.
- Acesso de rede do shell inicialmente falhou por DNS no sandbox; download foi feito pela execução de rede autorizada, sem sudo. Nenhum espelho ou gerenciador de pacotes utilizado. Assinatura GPG não foi verificada; não alegar essa garantia adicional.

## Código e testes de segurança

O laboratório aceita apenas `/tmp/gg-02b-<uuid>`, propriedade do usuário, modo 0700 e marcador conhecido. Confere nomes, tamanhos e SHA-256 da receita sintética antes de backup; recusa caminhos operacionais/remotos, links, hardlinks, FIFO e conteúdo diferente. Senhas aleatórias próprias por repositório ficam 0600 e nunca são impressas/publicadas. Subprocessos não herdam credenciais, proxies ou configuração Restic/Rclone.

Foram executados os **13 testes originais + 2 novos = 15 PASS** no SHA indicado. Os novos cobrem timeout e exclusão dos diretórios selados do primário na validação secundária. O teste de timeout simula somente uma falha de processo; não é evidência de backup nem de interrupção real do Restic.

Timeout de **120 s por comando Restic**, e 10 s para `version`. Estouro registra FAIL e preserva os recursos; não há reparo ou limpeza automática. Operações de recuperação secundária possuem guarda explícita de repositório/credencial e não percorrem as árvores seladas do primário. Logs registram papel do repositório, operação, modo secundário e ausência de cache.

## Matriz de resultados reais

| ID | Prova | Resultado / evidência |
| --- | --- | --- |
| LAB-01 | Pré-voo e massa sintética | PASS: ferramentas, espaço, 5 arquivos/33.554.555 bytes; laboratório novo |
| LAB-02 | Contenção e casos negativos | PASS: 15 testes; a ausência de Restic continua sendo recusada no teste negativo |
| BAK-01 | Criptografia e credenciais distintas | PASS: dois repositórios Restic v2; credencial do outro repositório recusada em ambos, código 12; restauração correta com a credencial própria |
| BAK-02 | Snapshot inicial e duplicata | PASS: duplicata exata de 16 MiB; 33.554.555 bytes processados, ~16,78 MB acrescentados |
| BAK-03 | Backup sem alterações | PASS: 5 arquivos inalterados, zero blobs/trees e zero bytes de dados novos; 452 bytes de metadados |
| BAK-04 | Alteração e adição | PASS: 2 arquivos alterados, 1 novo, 3 inalterados; crescimento de 5.425.250 bytes |
| BAK-05 | Três versões históricas restauradas | PASS: 5/5/6 arquivos, nomes/tamanhos/SHA-256 idênticos à receita; arquivo novo ausente nas versões antigas |
| BAK-06 | Cópia secundária com credencial própria | PASS: `restic copy`, três snapshots encontrados, sem sincronizar exclusões |
| BAK-07 | Recuperação somente pelo secundário | PASS: primário, senha primária e origem sem seus caminhos originais, sem percorrer árvores seladas, sem cache; três versões restauradas |
| BAK-08 | Integridade com leitura completa | PASS: `check --read-data` em cada repositório, retorno 0 e sem erros |
| BAK-09 | Perda física de host e senha fora do host | **BLOCKED**: dois diretórios no mesmo host/filesystem; não prova recuperação em outro computador |
| LAB-03 | Interrupção real de backup/cópia | NÃO EXECUTADA: somente timeout sintético do controle, sem danificar repositórios |

A cifra é a fornecida pelo Restic oficial verificado; rejeição de senha e restore demonstram seu uso no ensaio, não uma auditoria da implementação criptográfica. Nenhum FAIL foi observado nas provas reais executadas.

## Espaço, incrementos e tempos

Laboratório final: `/tmp/gg-02b-aa2bd6bcedd645dabc5a66c593b361d3`. Arquivos determinísticos pouco compressíveis; compressão de backup explicitamente `off`, evitando atribuir economia de compressão à deduplicação. A massa inclui estrutura e manifesto fictícios, sem configuração empresarial.

| Snapshot | Arquivos / bytes lógicos recuperáveis | Crescimento do repositório | Repositório acumulado | Backup |
| --- | --- | --- | --- | --- |
| `initial` | 5 / 33.554.555 | 16.781.471 bytes | 16.782.084 bytes | 1,086366 s |
| `unchanged` | 5 / 33.554.555 | 452 bytes | 16.782.536 bytes | 0,812530 s |
| `changed` | 6 / 34.603.131 | 5.425.250 bytes | 22.207.786 bytes | 1,922783 s |

Repositório vazio: 613 bytes. A mudança substituiu 4096 bytes de um blob de 16 MiB, alterou a linha de versão e adicionou 1 MiB. A deduplicação trabalha com chunks: crescimento não precisa ser igual aos bytes editados. A duplicata inicial resulta em aproximadamente **49,99% de economia** frente aos bytes lógicos da primeira captura. A repetição evita regravar o conteúdo e cresce só em metadados. O delta ocupa aproximadamente **84,32% menos** que uma nova cópia integral de 34.603.131 bytes.

Os três conjuntos integrais somariam **101.712.241 bytes**; o primário final ocupa **22.207.786 bytes lógicos**, diferença de **78,17%**. Comparação com conjuntos de arquivos completos sem compressão, não com outro software de backup. Primário alocado: **22.241.280 bytes**. Secundário final: **22.208.322 bytes lógicos / 22.233.088 alocados**. Repositórios são independentes e seus metadados/cifra diferem; não esperar tamanho ou ID idêntico.

| Operação | Tempo observado |
| --- | --- |
| Inicialização primário / secundário | 2,699156 / 3,319266 s |
| Cópia secundária | 1,946609 s |
| `check --read-data` primário / secundário | 1,173753 / 0,883015 s |
| Restore primário initial / unchanged / changed | 0,812706 / 0,833628 / 0,879575 s |
| Restore secundário initial / unchanged / changed | 0,784322 / 0,908971 / 1,150803 s |
| Soma dos 19 comandos Restic | 22,713460 s |

Tempos medidos por relógio monotônico do Python, incluindo a invocação do comando. A soma não é o tempo total do ensaio, pois não inclui geração/hash da massa ou validações Python. `/tmp` é tmpfs; valores não representam disco persistente, rede, Drive, quota, RPO ou RTO operacional.

## Restauração e independência

Foram conferidos **32 arquivos restaurados**: 5 + 5 + 6 no primário e outros 5 + 5 + 6 no secundário. Manifestos SHA-256 observados estão na evidência. A lista exata de caminhos é conferida, além de bytes/hash; não basta o código 0 do restore.

Após `copy`, o roteiro renomeou apenas os recursos do laboratório para `primary-unavailable`, `primary-password-unavailable` e `source-unavailable`. A etapa secundária usa exclusivamente `secondary-computer/repository` e `secondary-computer/recovery-password`, sem `--from-repo`, sem cache e sem varrer o conteúdo selado. Nenhuma senha/repositório foi apagado; todas as evidências foram conservadas. Isso prova independência **lógica** do procedimento; não simula perda física da máquina nem custódia externa da senha.

## Diagnóstico da CI AUD-IMG-02

No SHA anterior `2b69fbe`, [validate run 42255446456, job 128021293941](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/42255446456/job/128021293941) falhou em `tests/audit-evidence-database.test.ts:325:63`, cenário `global_new processa duas auditorias novas...`: UUID recebido diferente do esperado, **1116 PASS / 1 FAIL**. Typecheck/lint passaram; build, verify:build e audit foram pulados após a falha. Integrações e infra passaram nessa revisão conforme os jobs consultados; isso não torna `validate` verde.

O teste e a migration `20261106112635_audit_derivative_global_new_uploads.sql` são idênticos aos do commit **`32db697bab08bf019f3e927bd90c5ffa742efb12`**, onde [Validate foundation run 42218870010, job 127895608791](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/42218870010/job/127895608791) concluiu **success**, inclusive npm test. O diff da PR de backup não altera Auditoria ou migrations.

**Diagnóstico:** intermitência preexistente no caminho de teste é sustentada por PASS/FAIL com o mesmo código de Auditoria. **Hipótese de causa, ainda sem reprodução instrumentada:** o teste exige a evidência `a` antes de `b`; a fila ordena `next_attempt_at`, `created_at`, UUID. Se os horários coincidirem em PGlite, o UUID aleatório pode selecionar `b` antes de `a`. O helper gera as duas evidências em sequência, mas não fixa horários distintos. Não atribuir a causa definitivamente sem capturar os valores da fila no instante da falha.

Node/npm não foram encontrados no PATH deste executor; não se instalaram runtimes adicionais nem se acessou banco existente. A investigação foi leitura de Git, SQL e jobs/logs GitHub. **Nenhum código/teste AUD-IMG foi modificado**. Encaminhamento para a frente AUD-IMG/[Issue #57](https://github.com/The-Vonky/Gaucha-Gestao/issues/57): reproduzir com horários/ordem instrumentados e decidir ajuste do teste ou contrato de ordem em entrega própria. Não repetir CI antiga só para mascarar a falha. Resultado da CI do novo HEAD deve ser consultado na PR e não apaga a ocorrência anterior.

## Limitações e próximas dependências

Não foram capturados PostgreSQL/Auth/roles, bytes reais de Storage ou configuração operacional. Faltam consistência entre dump/globals/objetos, coordenação dos escritores, drenagem/watchdog, restauração funcional com RLS e compatibilidade de versões. Não copiar PGDATA em uso como substituto.

Ainda pendentes: cópia física e senha recuperável fora do host, governança/MFA da conta Drive, Rclone e falhas de rede, quota e capacidade do pacote completo/pendrive, retenção e proteção contra exclusão, alertas, metas RPO/RTO e WAL/PITR. D02/D03/D04/D08/D12, GG-02/GG-03 e O3/O4 permanecem abertos. Scripts/ops, systemd, serviços, Docker/Supabase e dados empresariais não foram alterados.

PR mantida draft, sem merge. A decisão de integração pertence ao mantenedor único; não houve segunda revisão humana. Este PASS é limitado à POC sintética local e não concede GO à C30, ao piloto com dados reais ou à produção.
