# GG-02D — Ensaio sintético cifrado no Google Drive

**Escopo:** conta gratuita dedicada da Gaúcha Gestão, OAuth no Windows pelo mantenedor e somente dados gerados pelo laboratório. A [Issue #113](https://github.com/The-Vonky/Gaucha-Gestao/issues/113) registra a autorização. **Piloto com dados reais e PROD permanecem NO-GO.**

| Prova | Estado em 10/11/2026 |
| --- | --- |
| Recuperação da conta e verificação em duas etapas | Confirmadas pelo mantenedor, sem detalhes sensíveis |
| Windows, backend local e cópia lógica | **PASS**, três snapshots, leitura integral e quatro restaurações conferidas |
| OAuth, quota, pasta, três snapshots, leitura integral e restaurações do Drive | Cliente Desktop publicado pelo mantenedor. Primeiro pré-voo bloqueado com o cliente compartilhado. Novo pré-voo manual pendente. |
| Cópia secundária física com restauração sem Drive | **BLOCKED**, mantenedor confirmou que ainda não há segundo computador autorizado |
| Backup operacional e recuperação da C30 | Fora da autorização da Issue #113 |

## Diagnóstico do primeiro pré-voo

O `Prepare` passou no Windows do mantenedor. O navegador exibiu HTTP 400 (`malformed request`) na seleção da conta exclusiva, e o Rclone foi encerrado após 180 s sem concluir a autenticação. Quota, pasta e upload ficaram sem execução. O HTTP 400 é observação do navegador. O timeout é resultado do subprocesso local. [Relato do mantenedor na PR #114](https://github.com/The-Vonky/Gaucha-Gestao/pull/114#issuecomment-6748789699).

No código do Rclone 1.76.0, `scope=drive.file` gera o escopo OAuth por arquivo, `config_shared_client_id=true` aceita o cliente embutido, `config_is_local=true` seleciona o navegador com retorno em `127.0.0.1:53682` e `config_change_team_drive=false` mantém o destino fora de Shared Drives. A API `about.get` lista `drive.file` entre os escopos aceitos. O aviso de descontinuação do cliente compartilhado durante 2026 torna sua recusa plausível. O registro disponível não determina se houve recusa do cliente, erro de parâmetros ou outro problema no fluxo. [Backend Drive v1.76.0](https://github.com/rclone/rclone/blob/v1.76.0/backend/drive/drive.go), [OAuth v1.76.0](https://github.com/rclone/rclone/blob/v1.76.0/lib/oauthutil/oauthutil.go), [cliente compartilhado](https://rclone.org/drive/#making-your-own-client-id), [Google Drive API](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get).

## Procedimento no Windows

Preserve a pasta e as evidências da tentativa anterior. Para o novo ensaio, use o cliente Desktop do projeto **Gaucha Gestao Backup** e um UUID gerado por `Prepare`. O mantenedor confirmou a publicação do consentimento, a ativação da Drive API e a configuração de `drive.file`. Confira o estado de billing na sua sessão antes de autorizar o pré-voo. [Marco confirmado pelo mantenedor](https://github.com/The-Vonky/Gaucha-Gestao/pull/114#issuecomment-6766680181).

Use uma conta de usuário comum, uma sessão **Windows PowerShell 5.1 de 64 bits** e o navegador do próprio Windows. Abra o perfil do navegador reservado para a conta Google dedicada e deixe esse perfil pronto para o fluxo aberto pelo navegador padrão. Verifique a conta no seletor do Google antes de consentir. Caso o navegador abra em outro perfil, o consentimento mostre uma conta diferente ou o cliente seja recusado pelo Google, cancele.

1. Obtenha o script `tests/labs/gg02d/gg02d.ps1` da revisão da PR e confira seu SHA-256. Em um clone Windows existente, os comandos a seguir extraem a versão da branch sem mudar de branch ou sobrescrever o checkout.

   ```powershell
   git fetch origin codex/gg-02d
   if ($LASTEXITCODE -ne 0) { throw 'Falha no fetch' }
   $destino = Join-Path ([IO.Path]::GetTempPath()) ('GG02D-script-' + [Guid]::NewGuid().ToString('N'))
   $null = New-Item -ItemType Directory -Path $destino
   $arquivo = Join-Path $destino 'script.zip'
   git -c core.autocrlf=false archive --format=zip -o "$arquivo" FETCH_HEAD tests/labs/gg02d/gg02d.ps1
   if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair a revisao Git' }
   Expand-Archive -LiteralPath $arquivo -DestinationPath $destino
   $roteiro = Join-Path $destino 'tests\labs\gg02d\gg02d.ps1'
   $hashEsperado = 'a888de97470771d46618d1037310be82cfcf484bc0ab2709d4ede486d515a9ec'
   if ((Get-FileHash -LiteralPath $roteiro -Algorithm SHA256).Hash -ne $hashEsperado) {
       throw 'SHA-256 divergente da revisao testada'
   }
   ```

2. Compare o hash com o da revisão da PR. Execute `Prepare` e anote apenas o nome `GG02D-SYNTHETIC-<uuid>` exibido no `PASS`. Esta etapa baixa os dois ZIPs oficiais, verifica os hashes, cria o diretório privado e valida a massa fictícia. Se houver erro, pare antes do OAuth.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "$roteiro" -Phase Prepare
   ```

3. Abra a raiz privada criada por `Prepare`. Na sessão privada do Google Cloud, em **Google Auth Platform → Clients**, selecione o cliente **Desktop app** já criado e salve o JSON diretamente nessa raiz com o nome `oauth-desktop.json`. Use a opção de escolher onde salvar do navegador, fora de pastas sincronizadas. Mantenha o JSON sob sua custódia e o conteúdo fora do terminal. O script exige a chave `installed` e confere a ACL exclusiva do arquivo antes de lê-lo.

   ```powershell
   $ensaio = 'GG02D-SYNTHETIC-<uuid>'
   $raiz = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $ensaio
   explorer.exe "$raiz"
   ```

4. Execute `Preflight` com o UUID novo e confirme `OAUTH-PRODUCAO` após verificar o projeto e a conta. No navegador, confira a conta exclusiva e o aplicativo antes de consentir. Ao voltar, informe o e-mail dedicado no prompt local. O script confere o par de credenciais após o OAuth e valida o e-mail pelo Drive antes de consultar a quota. Exige ao menos **128 MiB livres** e verifica que o nome UUID está ausente nas pastas visíveis ao cliente. Em caso de HTTP 400 pressione **4** no console. Pressione **Esc** para outro cancelamento. O pré-voo preserva a evidência, sem criação de pasta nem envio.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "$roteiro" -Phase Preflight -Lab $ensaio
   ```

5. **Pare antes de `Run`.** Informe `PASS` com o nome sintético e os bytes livres, ou `BLOCKED` com o motivo exibido. Preserve os arquivos privados da sessão. Uma nova tentativa exige outro `Prepare` e outro UUID. A criação exclusiva do log marca o início do pré-voo, inclusive se houver interrupção sem resultado final.

6. Após a conferência do pré-voo, execute `Run` na mesma conta Windows. Confirme digitando o nome exato do ensaio no prompt, após revisar o destino `GG02D-SYNTHETIC-<uuid>/repository`. O script confere o resultado do pré-voo, a versão do próprio script, a configuração OAuth vinculada e a quota novamente antes do `mkdir`. Em caso de falha, preserve o laboratório e reporte o código mostrado. Repetir requer um novo UUID gerado por `Prepare`.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "$roteiro" -Phase Run -Lab $ensaio
   ```

| Código saneado | Interpretação |
| --- | --- |
| `oauth-browser-http-400-reported` | O mantenedor sinalizou HTTP 400 com a tecla **4**. |
| `oauth-operator-cancelled` | O mantenedor cancelou com **Esc**. |
| `oauth-loopback-bind-failed`, `oauth-browser-launch-failed` | O Rclone relatou falha ao abrir o callback local ou iniciar o navegador. |
| `oauth-client-rejected`, `oauth-access-denied`, `oauth-request-rejected` | A saída do Rclone trouxe um código OAuth reconhecido. |
| `oauth-callback-timeout`, `oauth-after-callback-timeout`, `oauth-process-timeout` | Tempo esgotado, classificado pelos marcos observáveis do subprocesso. |
| `desktop-client-file-required`, `desktop-client-json-required`, `private-oauth-file-acl` | O JSON Desktop está ausente, tem formato inválido ou ACL incompatível. |
| `own-desktop-client-required`, `oauth-desktop-client-changed`, `refresh-token-required` | A configuração ficou sem cliente próprio, divergiu do par fornecido ou ficou sem token válido para continuidade. |
| `preflight-already-attempted` | O UUID contém vestígio de pré-voo e exige um novo `Prepare`. |

Um erro renderizado apenas no navegador pode chegar ao relatório pelo mantenedor. O script registra categorias fixas e mantém as saídas brutas em memória. O prazo de 180 s continua sendo o limite do subprocesso OAuth.

## Cliente OAuth próprio para uso contínuo

1. O mantenedor usa um projeto dedicado sob custódia institucional, **sem billing vinculado**, trial ou cartão, com apenas a Google Drive API. Se houver exigência de cobrança, verificação, marca/política/URL sem aprovação, ou escopo maior, registre BLOCKED e leve a exigência ao mantenedor. O projeto OAuth não aumenta a quota da conta. [Criação de projetos](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects), [limites da API](https://developers.google.com/workspace/drive/api/guides/limits).
2. Em Google Auth Platform configure **External / In production** e, em **Data Access**, somente `https://www.googleapis.com/auth/drive.file`, escopo não sensível por arquivo. A publicação do consentimento retira a regra de expiração em sete dias do estado Testing. O refresh token ainda pode ser revogado ou expirar em outras condições. [Consentimento e testadores](https://developers.google.com/workspace/guides/configure-oauth-consent), [escopos do Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [expiração de tokens](https://developers.google.com/identity/protocols/oauth2#expiration).
3. Em **Clients**, crie um **Desktop app** para retorno local. Mantenha o JSON e o `rclone.conf` na raiz privada do Windows, sem comandos que revelem seus valores, transcrição, sincronização ou compartilhamento de tela. A autorização real e a configuração do projeto permanecem na sessão privada do mantenedor. [Criação de credenciais](https://developers.google.com/workspace/guides/create-credentials#desktop-app), [OAuth para aplicativos instalados](https://developers.google.com/identity/protocols/oauth2/native-app).

Em 10/11/2026, as páginas públicas de início, privacidade e termos responderam por HTTPS e a navegação entre elas funcionou. Os textos descrevem `drive.file`, quota, criptografia antes do envio, revogação e o estágio de validação. A política de privacidade ainda pode explicitar que o `Preflight` lê o e-mail retornado pelo Drive para compará-lo localmente com a conta dedicada e mantém esse dado fora da evidência. [Início](https://backup.gauchagestao.online/), [privacidade](https://backup.gauchagestao.online/privacidade/), [termos](https://backup.gauchagestao.online/termos/).

## Procedência e isolamento

| Ferramenta portátil Windows amd64 | SHA-256 oficial do ZIP |
| --- | --- |
| [Restic 0.19.1](https://github.com/restic/restic/releases/tag/v0.19.1) | `da948ad707ed690426473aaba2046cd61f8f90f6f0e7dab6be0d5796531de67d` |
| [Rclone 1.76.0](https://github.com/rclone/rclone/releases/tag/v1.76.0) | `8b4fd2737ade4e70c057ef4a49deb7cffe94b0fb9d7587c189d149823f21a1dc` |

Os hashes foram conferidos nos `SHA256SUMS` oficiais. A cada fase o script deriva o hash do executável a partir do ZIP verificado e exige igualdade antes de executá-lo. A verificação é HTTPS e SHA-256. Assinaturas GPG ficam fora desta prova.

O roteiro usa uma raiz nova em `LocalApplicationData` num volume NTFS fixo, com ACL exclusiva para o usuário. Gera e verifica os caminhos, tamanhos e SHA-256 de cada arquivo de origem, recusa links e caminhos extras e usa a mesma receita para validar a restauração. Use a raiz apenas para este laboratório e preserve-a contra escritores concorrentes da mesma conta Windows. As verificações de caminho e ACL pressupõem um Windows confiável e controle exclusivo da sessão pelo mantenedor.

A pasta remota leva um UUID e é fixada pelo ID retornado ao Rclone depois de criada. O ID só circula em memória e no ambiente dos processos que precisam dele. O repositório Restic v2 usa senha aleatória em arquivo privado. O transporte por Rclone roda em stdio com `--append-only`, que admite a remoção dos locks temporários usados pelo próprio Restic. Snapshots e objetos do repositório são preservados. As verificações e restaurações usam `--no-cache` e `--no-lock`. [Backend Restic via Rclone](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#other-services-via-rclone), [Rclone serve restic](https://rclone.org/commands/rclone_serve_restic/).

## Medições e evidências

No diretório privado do ensaio, compartilhe somente os arquivos explicitamente saneados `Prepare-result.json`, `Preflight-result.json`, `Run-result.json` e seus respectivos `*-commands.jsonl`, após revisão local. Os registros incluem procedência dos binários, SHA do script, rótulo da operação, código de saída, tempo e dados selecionados do comando. As saídas brutas dos binários ficam em memória e são descartadas. Preserve `rclone.conf`, arquivos de senha, vínculo de configuração, repositórios, diretórios de restore e tokens exclusivamente na custódia local. Não publique capturas do navegador, caminhos locais de perfil nem arquivos internos da configuração.

O `Run` mede a quota antes e depois, inventaria bytes de objetos duráveis no repositório após cada snapshot, compara os incrementos com a carga cifrada informada pelo Restic e registra duração por comando. O crescimento líquido em bytes é carga persistida no Drive, incluindo metadados do repositório. A amostra de contabilidade do Rclone, quando emitida, é reportada separadamente. Ela pode omitir operações curtas, leituras, novas tentativas, locks e overhead HTTP/TLS. A variação da quota é uma medida da conta, sujeita a atraso e a outros consumos da mesma conta. Nenhuma dessas métricas representa uma captura exata de bytes bidirecionais na rede.

O relatório inclui os IDs completos dos três snapshots e os manifestos observados na restauração de `initial` e `changed`. O snapshot `unchanged` deve acrescentar zero blobs de dados. A prova de senha errada exige o código 12 do Restic, após abertura bem-sucedida com a senha correta. Quota insuficiente, falha OAuth, falha de rede ou timeout interrompem a fase com evidência saneada e preservação dos recursos. Depois de qualquer tentativa de escrita, a falha é registrada como `FAIL`.

## Cópia secundária e recuperação em outro computador

O `Run` inicializa um segundo repositório com senha independente, copia os três snapshots com `restic copy` para um backend Rclone local via stdio, rejeita a senha do primário e verifica e restaura o secundário por acesso somente local. Após a cópia, a verificação abre o repositório diretamente com Restic local, sem executar Rclone nem fornecer a configuração OAuth. Isso demonstra independência lógica se a fase passar. [Restic copy](https://restic.readthedocs.io/en/stable/045_working_with_repos.html#copying-snapshots-between-repositories).

Quando houver outro Windows autorizado, execute `Prepare` nele para baixar e verificar as ferramentas antes de ficar offline. Transfira o diretório cifrado `secondary` intacto para a raiz privada recém-criada. Use mídia autorizada e custódia local separada para posicionar `secondary-password` na mesma raiz para a recuperação. A prova usa somente esses dois artefatos. Desligue Wi-Fi, retire o Ethernet e desconecte qualquer outro meio de acesso à rede. Execute `-Phase Offline -Lab <novo-ensaio>`, digite `OUTRO-PC-OFFLINE` e revise os arquivos saneados `Offline-result.json` e `Offline-commands.jsonl`. O script também verifica a ausência de adaptador físico ativo e rota padrão, faz leitura integral e confere SHA-256 dos dois restores. O mantenedor atesta que se trata de outro computador. O laboratório do primeiro computador continua preservado.

## Validação preparatória no Windows — primeira revisão

Baseline GitHub verificada em 09/11/2026: `a0d479e2a1b035b390dab9840a3b61faf46ec266`. O checkout de engenharia foi separado porque o checkout principal continha trabalho local de outras frentes. Os comandos abaixo foram executados no Windows PowerShell 5.1 amd64, com os arquivos do checkout de engenharia acessados pela ponte WSL. A política de execução foi ajustada somente para esse processo por causa do caminho UNC.

- `-Phase Prepare` verificou os ZIPs oficiais, os executáveis e a massa inicial. Um teste anterior bloqueou porque o formato da linha de versão do Rclone divergia da expressão esperada. A checagem foi corrigida e reexecutada.
- `-Phase Run -Lab <uuid>` antes do pré-voo foi bloqueado com `verify-preflight / preflight-required`. O bloqueio ocorreu antes de qualquer comando contra o Drive.
- `test_guards.ps1` passou em 11 casos de origem, junction, configuração sintética, quota simulada e seleção de UUID. A tentativa preparatória de criar um hardlink pelo executor Windows retornou erro de volume, portanto o caso de hardlink não foi comprovado neste executor.
- Ensaios locais anteriores detectaram incompatibilidades na passagem da opção `rclone.program` e na leitura de arrays JSON no PowerShell 5.1. O backend nativo de escrita do Restic também falhou ao renomear o arquivo temporário do secundário na ponte Windows. A escrita do secundário passou para o backend local via Rclone, e sua leitura permanece via Restic local.

- `-Phase LocalTest -Lab <uuid>` passou com três snapshots e 26 arquivos conferidos nas quatro restaurações. A leitura integral passou nos dois repositórios. O primário recusou a senha errada e o secundário recusou a senha do primário, ambos com código 12.
- SHA-256 do `gg02d.ps1` ensaiado: `e202b89e8f09310284323618d9e759e430fdd489c95daf45f3dd13b31705428d`. SHA-256 do `test_guards.ps1`: `727deb385333b65e86c54f5db5cdcdee858faacd071fc27f48850cc811a86b55`.

| Snapshot local | ID abreviado | Bytes do repo | Incremento de payload persistido | Duração do backup |
| --- | --- | ---: | ---: | ---: |
| Inicial | `85eb132c0baa` | 8.395.273 | 8.394.657 | 1,406 s |
| Idêntico | `7196fd504b4e` | 8.395.763 | 490 | 1,023 s |
| Alterado | `473efeb5b925` | 10.498.221 | 2.102.458 | 1,118 s |

[IDs completos e comparação de SHA-256](../../tests/labs/gg02d/results/20261109-LocalTest-result.json), [comandos e tempos](../../tests/labs/gg02d/results/20261109-LocalTest-commands.jsonl), [guardas](../../tests/labs/gg02d/results/20261109-guards.txt), [Prepare](../../tests/labs/gg02d/results/20261109-Prepare-result.json), [Run bloqueado](../../tests/labs/gg02d/results/20261109-Run-result.json).

O modo `LocalTest` exercita o transporte stdio e a restauração no filesystem local. OAuth, quota real e escrita no Drive exigem as etapas manuais acima. Os testes de frontend e integração Supabase ficaram fora da validação local deste laboratório.

## Validação local da revisão OAuth

No Windows PowerShell 5.1 amd64, `Prepare` e `LocalTest` passaram. A execução de `Preflight` com um log sintético de tentativa anterior bloqueou antes de iniciar o navegador. `Run` sem pré-voo aprovado também bloqueou. O teste de guardas passou em 30 casos, incluindo classificação, cancelamento simulado com processo local, timeout e bloqueio de configuração parcial. A regressão local repetiu os três snapshots, as leituras integrais, as recusas de senha e a conferência de 26 arquivos restaurados. A captura física das teclas no console e o novo consentimento ainda dependem do teste manual do mantenedor. [Evidência saneada da revisão OAuth](../../tests/labs/gg02d/results/20261109-oauth-revision-local.json).

## Validação local do cliente Desktop próprio — 09/11/2026

No Windows PowerShell 5.1, `Prepare` e `LocalTest` passaram com o SHA-256 histórico `ef42272863dd428b3562528bcacc1fe3d72a4857ee30529e9f7561927e3b1a9f`. No UUID novo `GG02D-SYNTHETIC-17045bb9386048cdbcd3f596dd359201`, `Run` sem pré-voo bloqueou em `preflight-required`. O ensaio local produziu três snapshots, leu ambos os repositórios e verificou 26 arquivos em quatro restaurações. O Rclone 1.76.0 chegou à opção de OAuth local com configuração fictícia em modo não interativo, sem navegador ou Drive.

## Revalidação local — 10/11/2026

- Windows PowerShell 5.1 amd64. `Prepare` e `LocalTest` passaram em novo UUID. `Run` sem pré-voo aprovado bloqueou em `preflight-required`. A regressão criou três snapshots em cada repositório, conferiu 26 arquivos por SHA-256 em quatro restaurações, leu os dois repositórios integralmente e verificou as duas recusas de senha.
- Os 46 casos de `test_guards.ps1` passaram. A revisão cobre JSON inválido, ACL, troca de ID ou segredo, escopo adicional, refresh token ausente, conta divergente, cancelamento e timeout. A captura física das teclas no console continua pendente do teste manual.
- O Rclone 1.76.0 oficial recebeu um JSON fictício e a configuração do `Preflight`. A inspeção do redirect local, com navegador desativado e sem seguir o redirect, confirmou o ID fictício, somente `drive.file`, retorno em `127.0.0.1` e solicitação de acesso offline. O callback de recusa simulado encerrou o Rclone com `oauth-access-denied` e deixou a configuração sem token. Essa verificação não chamou o Google.
- Os sete testes sintéticos de `scripts/ops/c30-backup` passaram. O próximo marco é `Preflight` pelo mantenedor, seguido da conferência antes de `Run`. Quota, upload e restore no Drive, recuperação em outro PC e operação C30 exigem evidências próprias.

[Resultado saneado da revalidação](../../tests/labs/gg02d/results/20261110-own-client-local.json).

## Preparação operacional separada

A [proposta operacional C30](C30_BACKUP_OPERATIONAL_PLAN.md) separa os scripts e os gates da recuperação de dados reais deste laboratório. OAuth real, quota, upload, recuperação física e autorização para operar na C30 permanecem pendentes.
