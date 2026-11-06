# GG-02B — prova de conceito local de backup incremental

**06/11/2026 · Estado: PREPARAÇÃO VALIDADA / EXECUÇÃO RESTIC BLOCKED.**
**Critério de aceite de backup ainda não atingido. PROD e piloto com dados reais: NO-GO.**

## Escopo e fontes

Brief autorizado: pedido GG-02B do mantenedor neste trabalho. Área de escrita: `tests/labs/gg02b`, este relatório e referências documentais de navegação/continuidade. Nenhuma alteração em `scripts/ops`, systemd, Docker/Supabase, banco ou aplicação.

Foram consultados [AGENTS](../../AGENTS.md), [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md), [C30_BACKUP_GAPS](C30_BACKUP_GAPS.md), [ensaio histórico](../planning/02_RESTORE_DRILL.md), [GG-01](C30_GG01_INVENTORY_20261105.md), [diretriz GG-02](GG02_BACKUP_INICIAL_DRIVE_20261105.md), ADR-008 e gates do Plano Diretor. A [PR #106](https://github.com/The-Vonky/Gaucha-Gestao/pull/106), consultada em 06/11, estava **aberta e draft**, head `0d8916a4ce7e1e61d50b34f177d349eb308779e4`, sem merge.

A [revisão GG-02A registrada na PR #106](https://github.com/The-Vonky/Gaucha-Gestao/pull/106#issuecomment-6689925774) permite avançar ao ensaio sintético e exige medição de deduplicação, cópia com chave própria e restauração independente. O parecer integral fornecido ao mantenedor não foi localizado como arquivo no checkout; a fonte disponível é essa revisão, sem presumir aprovação dos horários, retenção ou metas sugeridas no parecer.

Vale o pedido atual: Drive gratuito como repositório principal do **pacote completo**, secundário independente em notebook/PC e kit estrutural em pendrive de 8 GB. A versão de 05/11 do documento na main tem redação anterior, revista na PR #106 ainda não integrada; esta POC segue a confirmação atual do mantenedor, sem reescrever aquela PR. Nenhum acesso ao Drive ou à C30 foi feito.

## Inspeção e mudanças

- Baseline `origin/main`: `1c704f84efa0650e6fbed3354fc7ab77e75fe73f`; branch criada: `codex/gg-02b-restic-lab`. O checkout anterior estava em `codex/med-01-cache-frontend`, com `supabase/snippets/` não rastreado; esses arquivos foram preservados.
- Python `3.14.4`, usuário comum (UID 1000). Restic e Rclone **não encontrados no PATH**. Nada foi instalado ou baixado.
- `docker ps --format ...` foi tentado somente para inventário; retornou **permission denied** no socket. Não houve sudo, consulta de schema, acesso a configuração de serviços nem modificação de runtime. Não há necessidade de acesso ao Docker para a POC de arquivos.
- `/tmp` é tmpfs: aproximadamente 5,9 GiB totais, 5,8 GiB livres no pré-voo inicial. O pré-voo do laboratório preparado registrou 6.136.500.224 bytes livres antes da escrita da evidência final.
- Scripts usam somente a biblioteca padrão Python, com allowlist `/tmp/gg-02b-<uuid>`, validação da massa sintética e ambiente restrito para subprocessos. O [guia reproduzível](../../tests/labs/gg02b/README.md) descreve o roteiro completo e as saídas esperadas, sem afirmar que Restic já foi ensaiado.

## Medições realmente observadas

Laboratório: `/tmp/gg-02b-907d07ab363a46748f1da9becaf6e20d`. Somente arquivos fictícios gerados pelo código; nenhum arquivo empresarial lido ou copiado.

| Medida | Resultado observado |
| --- | --- |
| Arquivos iniciais | 5 |
| Bytes lógicos dos arquivos | **33.554.555** (~32 MiB) |
| Bytes alocados dos arquivos, sem diretórios | **33.566.720** |
| Conteúdo único teórico da massa inicial | **16.777.339 bytes**; inclui um blob de 16 MiB com duplicata exata |
| Alteração prevista | 4096 bytes do blob A, linha de versão e adição de 1 MiB; **não executada** |
| Tamanho inicial/incrementos dos repositórios | **BLOCKED; não medidos** |
| Tempo de backup/cópia/check/restore | **BLOCKED; não medido** |
| Repositórios ou credenciais criados | **Nenhum** |

O conteúdo único teórico resulta da geração conhecida da massa e **não é uma medição de deduplicação do Restic**. A verificação SHA-256 da origem passou, mas ainda não existe arquivo restaurado para comparar. Não registrar tamanho de repositório como zero: ele não foi criado.

## Validações e matriz

Comandos efetivamente executados:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tests/labs/gg02b/test_safety.py
python3 tests/labs/gg02b/lab.py preflight
python3 tests/labs/gg02b/lab.py prepare
python3 tests/labs/gg02b/lab.py run /tmp/gg-02b-907d07ab363a46748f1da9becaf6e20d
```

| ID | Prova | Estado | Evidência / limite |
| --- | --- | --- | --- |
| LAB-01 | Inventário Git, ferramentas e espaço | PASS | Consultas locais; Docker não pôde ser inventariado |
| LAB-02 | Disponibilidade Restic | BLOCKED | `preflight` código 2; binário ausente |
| LAB-03 | Disponibilidade Rclone | BLOCKED | Ausente; não é dependência do backend local |
| LAB-04 | Massa exclusivamente sintética | PASS | 5 arquivos, bytes medidos, hashes idênticos à receita |
| LAB-05 | Contenção e bloqueios negativos | PASS | **13 testes**; caminhos operacionais/remotos/relativos, links, FIFO, permissões, marcador, arquivo extra, hash alterado, ambiente e sobrescrita |
| LAB-06 | Falha fechada sem ferramenta | PASS | `run` código 2, sem repositório, senha ou marcador de início |
| BAK-01 | Repositórios cifrados e senha incorreta | BLOCKED | Roteiro implementado; Restic não executado |
| BAK-02 | Snapshot inicial e deduplicação da duplicata | BLOCKED | Tamanho e tempo pendentes |
| BAK-03 | Snapshot sem alteração | BLOCKED | Novos blobs/packs e crescimento de metadados pendentes |
| BAK-04 | Snapshot com alteração e arquivo novo | BLOCKED | Crescimento incremental e tempo pendentes |
| BAK-05 | Restore das três versões e SHA-256 | BLOCKED | Planejado em destinos novos, sem sobrescrita |
| BAK-06 | Cópia para repositório com chave própria | BLOCKED | `copy` previsto, sem sincronizar exclusões |
| BAK-07 | Restore somente do secundário, sem cache/origem | BLOCKED | Primário, senha primária e origem terão caminhos indisponíveis por renomeação local |
| BAK-08 | Integridade com leitura integral dos dois repos | BLOCKED | `check --read-data` previsto |
| BAK-09 | Recuperação física em outro PC e senha fora do host | BLOCKED | Não comprovável com dois diretórios no mesmo host |
| LAB-07 | Falhas/interrupções durante backup ou cópia | BLOCKED | Sem Restic; nenhum sinal enviado ou repositório danificado |

**Nenhum FAIL observado nos controles executados. BLOCKED não significa PASS.** Os testes Python não substituem o executável Restic e não usam um backend falso para fabricar resultados de backup. Checks de frontend/RLS/integração/build não foram executados: nenhuma alteração nesses domínios. CI e revisão humana são registrados na PR, sem presumir aprovação.

## Retomada e dependências

1. Disponibilizar Restic por instalação já autorizada, ou obter autorização específica antes de instalar. Não é necessário instalar Rclone para esta etapa local. Não houve tentativa de instalação.
2. Rodar o guia em Linux local autorizado, conferir espaço e registrar versão/SHA do código e do executável. Conservar evidências de todos os comandos, tamanhos e tempos. Scripts preservam os dados do ensaio e não fazem manutenção destrutiva.
3. Preencher BAK-01–08 com resultados reais; investigar qualquer retorno diferente de zero sem reparo automático. A interrupção de processo não foi ensaiada; nenhum comportamento de retomada é garantido.
4. Para custódia externa e perda física de host, autorizar etapa própria em outro computador, com recuperação da credencial por canal independente. A chave sintética secundária continua neste host; não é prova de cofre, sucessão, MFA ou recuperação de senha fora dele.
5. Manter decisão de merge com o mantenedor único, sem segunda revisão humana declarada. O risco residual de revisão individual e a falta de execução Restic impedem chamar a POC de concluída.

## Limites antes de PostgreSQL, Storage e Google Drive

Este ensaio não captura PostgreSQL/Auth/roles nem bytes reais do Storage. Não prova consistência entre dump transacional, globals e objetos, coordenação de todos os escritores, drenagem, recuperação de falha, watchdog, integridade de metadados ou RLS após restauração. Não copiar PGDATA em uso como substituição de captura consistente.

Ainda faltam dimensionamento do pacote completo (incluindo imagens/runtime/estrutura/segredos por canal protegido), taxa de mudança de dumps/objetos, capacidade do pendrive de 8 GB, disponibilidade da cópia secundária física, integração com Rclone/Drive, quota, titularidade/MFA/recuperação de conta e falhas de rede. A massa determinística não prevê taxa incremental de dumps ou fotografias, nem garante caber em 15 GB.

Retenção, RPO/RTO, alertas, proteção contra exclusão/ransomware, WAL/PITR e D02/D03/D04/D08/D12 permanecem pendentes. **GG-02/GG-03 e O3/O4 não foram fechados; nenhuma implantação ou ação na C30 foi autorizada por esta POC.**
