# GG-02C — laboratório Restic + Rclone sem conta Google

Somente Linux amd64, Python 3 padrão e usuário comum. Nada é agendado ou instalado globalmente. O backend é o filesystem temporário através de `rclone serve restic --stdio --append-only`, mecanismo oficial; não é um mock do Restic, nem uma emulação do Google Drive. Não abre servidor TCP. [Procedimentos, limites e aprovação da Fase B](../../../docs/operations/GG02C_RCLONE_DRIVE_20261106.md).

## Reprodução da Fase A

1. Conferir branch/status e preservar trabalhos concorrentes. Não usar C30, Docker, bancos, Storage, dados empresariais ou uma configuração Rclone existente. Reservar ao menos 512 MiB em `/tmp`.
2. Executar `python3 tests/labs/gg02c/test_safety.py`. Os testes negativos preservam seus próprios diretórios em `/tmp`; não fazem limpeza.
3. O Restic 0.19.1 do GG-02B precisa estar disponível em seu bundle portátil original privado `/tmp/gg-02b-tools-<uuid>`, contendo o arquivo `.bz2` oficial e o executável. A PR #108 é referência somente leitura; não é dependência de código nem deve ser mesclada para executar estes scripts. Se o bundle não existir, obter autorização para disponibilizar Restic; não instalar globalmente por inferência.
4. Executar, substituindo **somente o UUID pelo bundle conferido**:

   ```bash
   python3 tests/labs/gg02c/fetch_tools.py --restic-bundle /tmp/gg-02b-tools-<uuid>
   ```

   O script verifica o Restic herdado, baixa **apenas Rclone 1.76.0 Linux amd64** do mirror oficial GitHub e compara SHA256SUMS e checksum fixado. Não usa `sudo`, shell remoto ou instalador. Imprime um novo `/tmp/gg-02c-tools-<uuid>`. Em erro de procedência/checksum, permanecer **BLOCKED**, sem executar binário nem trocar silenciosamente a versão. HTTPS + SHA-256 não equivalem a assinatura GPG verificada.
5. Executar com o caminho **impresso no passo anterior**:

   ```bash
   python3 tests/labs/gg02c/lab.py --tools /tmp/gg-02c-tools-<uuid>
   ```

   O próprio programa gera outro `/tmp/gg-02c-<uuid>` 0700; não recebe origem, repositório, remote ou senha do operador. Confere hashes dos executáveis antes de iniciá-los. Os únicos comandos Restic permitidos são `init`, `backup`, `snapshots`, `restore`, `check`, `copy`. Não há modo operacional/Drive nem passagem genérica de argumentos pela CLI.
6. Conferir `execution.json` no diretório impresso. `PASS` depende de comandos reais, três snapshots, seis restaurações com lista exata/SHA-256, leitura integral dos dois repos e verificações negativas. Falha preserva os recursos; **não** tentar manutenção de locks ou apagar repositórios. Repetir requer novo laboratório.

## Controles e evidências

- Allowlist lexical/canônica exclusiva; propriedade e modos privados; recusa de symlinks, hardlinks, FIFO, fixture divergente e repositório arbitrário. Origem determinística inclui dados, estrutura, instruções e manifesto de versões/hashes fictícios.
- Subprocessos recebem HOME/TMPDIR privados e ambiente mínimo, sem herdar `RESTIC_*`, `RCLONE_*`, proxies ou credenciais. Sem shell e sem leitura de configuração do operador. Limite de 120 s por comando/10 s para versão; indisponibilidade simulada tem limite de 10 s. Timeout encerra o grupo de processos, preserva artefatos e não declara sucesso de backup.
- `--compression off` separa deduplicação de compressão. Bytes lógicos são somados por snapshot; `data_added_packed` mede novos blobs cifrados; `new_persisted_object_bytes` mede o payload efetivamente aceito como **novos objetos duráveis** no backend Rclone local, incluindo índices/snapshot, excluindo locks transitórios. Hashes anteriores devem permanecer idênticos. Tamanho do repo é soma de `st_size`, não quota Drive ou blocos alocados no disco.
- `rclone_accounted_bytes_sample` é amostra periódica de tráfego contabilizado, sujeita ao encerramento do subprocesso; não é total final nem medição de upload WAN. Não usar zero/ausência de amostra para inferir zero envio. HTTP2, leituras e locks não estão incluídos no payload durável. Bytes de upload pela internet: **NÃO MEDIDOS**, pois a conta não foi conectada.
- Senha errada é testada em ambos os repos; remote ausente testa erro de configuração local, **não** OAuth expirado. Destino indisponível é um arquivo sintético bloqueando o diretório de backend, sem alterar repo válido. `check --read-data` e backups seguintes provam recuperação do erro.
- Secundário é criado com chave própria e `init --copy-chunker-params`, seguido de `restic copy`. Antes de recuperá-lo, origem, primário e senha primária são renomeados e ficam 000. O modo secundário não percorre essas árvores, só permite repo secundário, usa HOME/TMPDIR novos e `--no-cache`, sem opções Rclone ou credencial do primário. Não prova perda física do host ou recuperação da senha fora dele.
- Logs privados mantêm comandos/saídas reais. Antes de publicar, conferir ausência das senhas sintéticas e marcadores de token; não publicar os diretórios/repositórios, arquivos de senha ou binários. Uma busca sem canário em texto claro ajuda a validar a cifra, sem constituir auditoria criptográfica.
- O processo pressupõe ausência de escritor hostil com o mesmo UID. As verificações de caminhos não são isolamento de kernel contra substituições concorrentes maliciosas. Não executar sobre diretório reaproveitado ou compartilhado.

Artefatos versionados em `results/` são somente evidências saneadas. Não há testes de banco, restore de runtime, imagens Docker, Windows ou dispositivo físico nesta entrega. Frontend não foi alterado; checks npm dependem do CI e não são substitutos do ensaio Python.
