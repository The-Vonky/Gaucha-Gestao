# GG-02B — laboratório Restic exclusivamente sintético

**Executado em 06/11/2026: BAK-01–08 PASS com Restic 0.19.1 oficial verificado.**
O [relatório](../../../docs/operations/GG02B_RESTIC_LOCAL_POC_20261106.md) contém medições, hashes, procedência e limites. BAK-09 físico/off-site permanece BLOCKED. Esta área não é um mecanismo operacional de backup.

## Dependências e limites

- Linux, Python 3.10+ e pelo menos 512 MiB livres em `/tmp`. Usar usuário comum, sem sudo.
- Restic com suporte a repositório v2 (0.14+), `copy`, `--copy-chunker-params`, JSON e `check --read-data`. Versão efetivamente ensaiada: **0.19.1**, Linux amd64.
- Rclone é inspecionado, mas **não é necessário para repositórios locais**; não é executado. Ausência de Restic bloqueia `run` antes de criar repositórios/credenciais.
- O roteiro `lab.py` não instala ferramentas nem acessa rede, Docker, SQL, SSH, Drive, serviço ou agendamento. Não executar na C30. A obtenção prévia do portátil foi uma ação separada expressamente autorizada.
- Destinos fixos sob `/tmp/gg-02b-<uuid>` criados pelo próprio `prepare`; não há opção de origem externa, backend remoto ou caminho arbitrário de repositório.

Se faltar Restic em outra execução, manter BLOCKED até disponibilização autorizada. Nesta execução o mantenedor autorizou apenas o portátil oficial em ambiente descartável local, sem sudo ou instalação global. Foram baixados o `.bz2` Linux amd64 e `SHA256SUMS` da [release 0.19.1](https://github.com/restic/restic/releases/tag/v0.19.1), via HTTPS; o arquivo foi comparado por SHA-256 antes de descomprimir e executar. O checksum conferido e o diretório privado 0700 constam da [evidência](results/20261106-execution.json). Não houve verificação GPG. A integração futura com Drive terá autorização e ensaio próprios, incluindo Rclone.

O binário fica fora de `source/`, dos repositórios e do checkout. Para reutilizar o portátil já verificado nesta sessão, prefixar **somente os comandos do laboratório** com:

```bash
PATH=/tmp/gg-02b-tools-26a6355a74bd4c9c9afa130a026a7e83:$PATH python3 tests/labs/gg02b/lab.py preflight
```

O mesmo prefixo vale para `prepare` e `run`. Em outro ambiente, verificar novamente a procedência e usar o diretório privado correspondente; `/tmp` não é instalação persistente. Nenhuma alteração no perfil do shell é necessária.

## Execução

Na raiz do checkout, inspecionar primeiro `git status --short --branch`, disponibilidade das ferramentas e espaço. A consulta inicial a Docker é somente leitura; sua falha não exige sudo para este laboratório de arquivos.

```bash
python3 tests/labs/gg02b/lab.py preflight
PYTHONDONTWRITEBYTECODE=1 python3 tests/labs/gg02b/test_safety.py
python3 tests/labs/gg02b/lab.py prepare
```

`preflight` retorna código 2 quando Restic estiver ausente; não declara falha de Rclone como impeditivo local. `prepare` funciona mesmo sem Restic, cria apenas arquivos fictícios e imprime o diretório exclusivo. Copiar o valor de `lab` para o comando seguinte, substituindo o exemplo inteiro:

```bash
python3 tests/labs/gg02b/lab.py run /tmp/gg-02b-<uuid-retornado-por-prepare>
```

Não usar diretório existente de outro ensaio. A execução não é retomável nem sobrescreve evidências. Se houver erro/interrupção: preservar o laboratório e seus logs locais, registrar o resultado e preparar outro após conferir espaço. Não há rotina de reparo, expurgo ou limpeza. Dados de `/tmp` podem desaparecer no reboot: guardar somente evidências saneadas na PR; não tratar este local como backup persistente.

## Roteiro implementado e ensaiado com Restic 0.19.1

1. Recusar root/sudo, destino fora da allowlist, marcador incorreto, diretório que não seja próprio/0700, symlinks, hardlinks e arquivos especiais. Conferir nomes, tamanhos e SHA-256 contra conteúdo determinístico antes de qualquer backup. Um arquivo extra ou alterado impede a execução.
2. Gerar duas credenciais aleatórias de 256 bits, em arquivos 0600, sem imprimi-las. Inicializar repositórios v2 distintos, com parâmetros de chunking compatíveis. A credencial secundária fica em `secondary-computer/recovery-password`, fora do repositório cifrado.
3. Exigir que cada repositório recuse a credencial do outro com diagnóstico de senha incorreta. Isso verifica a proteção por senha no ensaio; não constitui auditoria criptográfica.
4. Capturar `initial`, repetir em `unchanged`, alterar 4096 bytes de um blob e a linha de versão, adicionar 1 MiB e capturar `changed`. A compressão é desabilitada para separar deduplicação de compressibilidade.
5. Exigir zero blobs de dados novos e zero aumento de packs no backup inalterado; testar que a duplicata inicial não dobrou os packs; exigir crescimento do delta positivo e menor que a captura inicial.
6. Executar `check --read-data` no primário e restaurar as três versões em diretórios novos. Conferir lista exata, tamanho e SHA-256 contra os bytes sintéticos esperados, incluindo a ausência do arquivo novo nas versões anteriores.
7. Copiar os três snapshots via `restic copy` para o secundário com credencial própria. Mapear IDs por tags, pois o ID no destino pode diferir do original.
8. Renomear **somente dentro do laboratório** `primary`, `primary-password` e `source` para os nomes terminados em `-unavailable`, preservando seu conteúdo. Sem esses caminhos, sem percorrer as árvores seladas do primário, sem cache e com ambiente de processo sem credenciais/configurações herdadas, listar os snapshots secundários, executar `check --read-data` e restaurar as três versões usando somente o repositório secundário e sua credencial. O processo de recuperação não usa `--from-repo` e possui guarda explícita que recusa repositório/credencial primários.
9. Gravar `evidence/result.json` como PASS somente após todas as verificações acima. Erro gera código diferente de zero e preserva as evidências parciais. Timeout explícito de 120 s por comando e 10 s para `version`; nenhum reparo automático. Os testes de segurança não simulam sucesso Restic nem geram PASS para backup; apenas o teste negativo de timeout simula falha de processo.

`recover-secondary LAB` também existe como etapa separada para investigar uma execução interrompida **após** a indisponibilidade simulada do primário. Não sobrescreve restaurações/logs de uma recuperação anterior. Não é necessário após um `run` bem-sucedido, que já executa essa etapa.

```text
/tmp/gg-02b-<uuid>/                   0700
  source/                           arquivos sintéticos; depois source-unavailable/
  primary/                          depois primary-unavailable/
  primary-password                  0600; depois primary-password-unavailable
  secondary-computer/
    repository/                     repositório com credencial própria
    recovery-password               0600; nunca publicar
  restore-primary-{initial,unchanged,changed}/
  restore-secondary-offline-{initial,unchanged,changed}/
  evidence/                         métricas, logs sintéticos e SHA-256
  home/ e tmp/                      temporários internos de subprocessos
```

Renomear os caminhos comprova apenas a independência lógica do roteiro. Os dois repositórios e as credenciais continuam no **mesmo host/filesystem**. A prova física em outro computador e a recuperação da senha fora do host permanecem pendentes. O marcador e as verificações evitam acidentes; não são uma barreira contra um processo malicioso com o mesmo UID modificando arquivos durante a execução.

## Medições e evidências

`prepared.json` registra a massa original e o pré-voo. `expected-v1.json`/`expected-v2.json` guardam hashes, tamanhos e caminhos relativos esperados, sem incluir senhas. Cada comando Restic grava saída, código, tempo monotônico em segundos, bytes lógicos, bytes alocados (`st_blocks × 512`) e bytes dos packs de dados antes/depois. A contagem alocada inclui diretórios e depende do filesystem; não é previsão de quota do Drive.

`measurement-{initial,unchanged,changed}.json` e `measurements.json` agregam o resumo JSON de backup, inclusive `data_blobs`, `data_added`, `data_added_packed`, bytes processados e crescimento físico observado. Os JSON de restore registram tempos; `restore-*-sha256.json` registra nomes, bytes e SHA-256 observados de cada arquivo. `offline-independence.json` registra os caminhos originais ausentes. Cada comando registra papel do repositório, modo secundário e ausência de cache. Preservar o JSON bruto antes de calcular percentuais. Medir inicialização e cópia separadamente do backup e da restauração.

Backup sem alteração ainda pode acrescentar metadados/snapshot; não exigir crescimento total de zero. `data_added` inclui estruturas novas e não equivale sozinho aos bytes de conteúdo único. O fixture possui 32 MiB de blobs, mas apenas 16 MiB de conteúdo binário único inicial. O crescimento do delta varia conforme chunking, índices e packs. Não extrapolar este resultado para dumps PostgreSQL ou imagens Docker.

Não publicar o laboratório inteiro, senhas, diretórios de credenciais ou repositórios. Versionar apenas código e evidências saneadas. Os testes deixam seus recursos sintéticos em `/tmp`, sem remoção automática; conferir espaço antes de repeti-los.

## Referências de implementação

- [Restic: inicialização e senha](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).
- [Restic: backup e caminhos relativos](https://restic.readthedocs.io/en/stable/040_backup.html).
- [Restic: cópia, chunking e verificação completa](https://restic.readthedocs.io/en/stable/045_working_with_repos.html).
- [Restic: restauração](https://restic.readthedocs.io/en/stable/050_restore.html).
- [Restic: contrato JSON e códigos de saída](https://restic.readthedocs.io/en/stable/075_scripting.html).

Fontes oficiais consultadas em 06/11/2026; não substituem ensaio com o executável real.
