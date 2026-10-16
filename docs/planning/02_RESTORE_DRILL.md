# 02_RESTORE_DRILL — ensaio isolado de recuperação de banco e arquivos

**Gaúcha Gestão · Issue #51 · 16/10/2026 · versão 0.1**  
**Estado: PLANEJADO, NÃO EXECUTADO.** Este documento especifica o ensaio; nenhuma etapa prática, backup válido ou restauração passou por comprovação nesta versão.  
**Base inspecionada:** `main` `f016b3c2711a54775a470a7f01bb5c8c27dc2dd1` (PR #61 integrado).

## 1. Objetivo e limite da prova

Demonstrar que uma instalação **exclusivamente sintética** de cinco serviços (PostgreSQL 17, GoTrue/Auth, PostgREST, Storage API e Kong) pode ser copiada para um **segundo projeto Docker Compose isolado** e recuperar:
- dados relacionais e histórico técnico de aplicação;
- identidade Auth sintética e vínculo com o Core;
- metadados de Storage **e bytes reais** dos objetos;
- leitura/autenticação autorizada e negações de acesso entre **duas unidades fictícias**;
- configuração necessária e contrato de migrations versionadas.

**Critério de PASS:** origem e destino independentes, instância restaurada saudável, dados e arquivos conferidos (contagens e SHA-256), autenticação funcional, negações entre unidades efetivas e tempo cronometrado, com evidência saneada. **Restauração somente de PostgreSQL é FAIL.** Backup criado sem restauração é **NOT TESTED**, nunca PASS.

Este primeiro ensaio é uma **cópia física a frio de três volumes de laboratório**, não um backup online, PITR, replicação, recuperação após perda do host ou implementação do plano de backup de produção. **Não satisfaz O1/O3/O4/O8 nem libera PROD.** WAL-G versus pgBackRest, R2, retenção, RPO/RTO e backup fora do host permanecem em aberto.

## 2. Escopo exato e fontes

| Componente | Origem versionada | O que precisa acompanhar a recuperação |
| --- | --- | --- |
| Banco PostgreSQL 17 | `infra/supabase/docker-compose.yml` | Volume **db-data** completo, incluindo schemas Auth/Core/Audit/Action Plans, tabelas internas, dados sintéticos, migrações e auditoria |
| Configuração do Postgres | mesmo Compose | Volume **db-config**; validar necessidade e integridade |
| Storage local de CI/STAGING | mesmo Compose | Volume **storage-data** com arquivos físicos + tabelas `storage.buckets`/`storage.objects` no banco, tratados como conjunto |
| Serviços/versionamento | `infra/supabase/docker-compose.yml`, `infra/supabase/UPSTREAM.md` | Mesmo commit do código e versões de imagens; registrar SHA, hashes das 17 migrations e versões resolvidas |
| Configuração/segredos | `infra/env/staging.env.example`, `scripts/ops/gen-secrets.sh` | Referências e cópia protegida dos **segredos sintéticos temporários compatíveis com o snapshot**, fora do Git; nunca anexar valores ao relatório |
| Buckets | migrations existentes | `action-plan-evidence`, `audit-checklist-evidence` e `unit-covers`; todos privados, conferir metadados e bytes físicos |

**Regra de consistência:** a cópia dos volumes do banco **não pode ser feita com o PostgreSQL em execução**, mesmo que a aplicação não tenha usuários ativos. Parar todos os serviços **somente do projeto sintético explicitamente criado para este ensaio**, aguardar término completo e então copiar os três volumes. Para o ensaio a frio, banco e Storage devem compartilhar o mesmo ponto de parada. Não misturar banco de um instante com arquivos de outro.

A documentação [infra/README.md](../../infra/README.md) suporta apenas `ci`/`staging` descartáveis. O script `apply-migrations.sh` é **somente primeira inicialização**, não deve ser executado sobre a cópia restaurada. A cópia física do banco preserva identidades, hashes/ledger e marcador de instância; **um destino restaurado NÃO é uma nova base vazia para replay de migrations**.

## 3. Pré-voo obrigatório — NO-GO automático se não cumprir

1. Selecionar um **computador de desenvolvimento** ou runner Linux isolado autorizado, **não a C30**, sem conexão com PROD nem com o ERP de Contratos ou seus volumes. O ambiente deve permitir Docker Engine/Compose v2, Bash, Node 22.12+, Git e espaço temporário suficiente para dois stacks e os arquivos de backup.
2. Separar **dois nomes de projetos novos**, exclusivos e diferentes, dentro do formato `gaucha-infra-...`, duas portas loopback livres e diretórios externos ao checkout distintos para env/backup/evidências. **Antes de criar**, inspecionar `docker ps -a`, `docker volume ls` e existência dos nomes para garantir que não coincidam com qualquer outro trabalho.
3. Registrar SHA Git, arquivos versionados, versão de Docker/Compose/PostgreSQL/GoTrue/Storage e espaço em disco. Usar somente o Compose da branch revisada e imagens fixadas. Não editar o Compose para apontar a volumes/serviços já existentes.
4. Segredos gerados por `scripts/ops/gen-secrets.sh --environment staging` **fora do repositório**, permissão 0600, ambiente sintético. Nunca imprimir env, tokens, credenciais ou caminhos privados na evidência.
5. Identificar os projetos e volumes antes de qualquer `stop`, cópia ou remoção. **Não usar** `docker volume prune`, `docker system prune`, `docker compose down -v` genérico nem operações em projetos existentes. O encerramento só pode afetar os dois projetos novos **com verificação e autorização específica**.
6. Não executar os comandos de laboratório na C30 nem no ambiente usado para o ERP real. Se não for possível provar isolamento, marcar **BLOCKED**.

**Limitação desta sessão documental:** nenhuma máquina de execução Docker nem credenciais de um ambiente descartável foram fornecidas a esta atividade. Portanto, não há status de healthcheck ou de restore a relatar.

## 4. Roteiro de execução — origem sintética

### 4.1 Construir uma origem isolada

Conforme [infra/README.md](../../infra/README.md), usar o procedimento de `staging` descartável com **project name** e arquivo env exclusivos e explicitamente informados. Ordem documentada: `docker compose ... config --quiet` → `up -d` → `scripts/ops/apply-migrations.sh` **somente nessa origem fresca** → `up -d --wait` → `scripts/ops/healthcheck.sh`. Não trocar `--environment staging` por `production`.

O `smoke.mjs` é apenas um **pré-teste** do contrato básico; ele cria uma unidade fictícia e a conserva até a destruição explícita do stack, e elimina o objeto usado para testar Storage. **Não é suficiente como massa nem como teste de restauração**. Não executá-lo automaticamente se a contagem de dados do cenário já tiver sido congelada.

### 4.2 Criar a massa sintética controlada

Gerar um identificador de ensaio único (por exemplo, `DRILL-20261016-A` e `DRILL-20261016-B`, sem nomes de unidades reais) e um manifesto com:
- **Duas unidades fictícias**, setores artificiais se necessários, **duas contas de teste** Auth com e-mail fictício reservado ao laboratório, perfis Core e atribuições exclusivamente para as unidades A/B. Se o fluxo de criação das contas usar API Auth Admin, fazê-lo somente no laboratório e no contexto administrativo confiável; sem expor `service_role` no navegador.
- Pelo menos **uma inspeção por unidade**, respostas de checklist, histórico esperado e **um plano de ação por unidade**, gerados pelas APIs/RPCs autorizadas, sem inserir diretamente contra triggers/guardas para contornar RLS.
- **Arquivos distintos por unidade**, com pelo menos um objeto do Storage vinculado a uma evidência de auditoria e um objeto vinculado a evidência de plano de ação. Para validar o terceiro bucket, incluir uma imagem de capa de unidade sintética por API autorizada se o fluxo estiver disponível; se não estiver, marcar esse subcaso BLOCKED, não simular sucesso.
- Para cada arquivo: nome fictício, bucket, chave de objeto, tamanho, content-type, SHA-256 dos bytes e vínculo do metadado de domínio. Evitar arquivos externos reais e dados pessoais.
- Para cada tabela crítica: contagem e IDs **anonimizados ou pseudônimos de cenário**; registrar de forma separada a contagem de logs técnicos, que não precisa ser zero.

Os casos de RLS devem provar: usuário A lê A e **não** lê B; usuário B lê B e **não** lê A; anônimo não vê objetos privados; usuário inativo não obtém acesso operacional. Os testes negativos devem usar **tokens reais de usuários sintéticos via API**, não `postgres` nem credencial `service_role` que ignoraria RLS.

Antes de congelar a origem, verificar que o app/Storage estão saudáveis, registrar resultados do cenário e capturar hashes de referência.

## 5. Backup a frio em destino fora dos volumes

1. Congelar escritas do projeto de **origem sintética** e parar **somente seus cinco serviços**, garantindo que o processo `db` está parado. Não interromper stacks de terceiros. Registrar hora de início da indisponibilidade.
2. Ler a lista nominal de volumes do projeto de origem; validar correspondência inequívoca de `db-data`, `db-config` e `storage-data`. Confirmar que nenhum volume anônimo/desconhecido será tratado neste ensaio.
3. Copiar **todos os arquivos de cada volume** preservando nomes, permissões, UID/GID, symlinks e estrutura, para **três arquivos separados** em diretório externo ao projeto Docker. Usar contêiner utilitário isolado, com origem montada read-only, **após a parada**; não realizar snapshot de `PGDATA` com PostgreSQL ligado.
4. Calcular SHA-256, bytes e quantidade de entradas de cada arquivo. Guardar manifesto e referências de configuração. Segredos sintéticos necessários para a cópia devem permanecer em arquivo restrito, **não dentro do backup público, PR ou issue**.
5. Reiniciar a origem e confirmar que continua saudável. O backup não deve depender da permanência dos volumes de origem; o **destino dos arquivos deve ser separado dos volumes Docker**, ainda que nesta primeira etapa possa estar no mesmo computador (logo **não** é backup off-site).

**Se qualquer serviço for reiniciado durante a janela de cópia, um volume estiver ausente ou um hash não puder ser obtido, descartar o candidato a backup e classificar como FAIL.** Não “consertar” nem apagar a origem para conseguir uma restauração.

## 6. Restore em segundo projeto independente

1. Declarar e conferir um **novo** projeto Docker Compose de destino, com porta externa loopback **diferente**, volumes novos vazios e diretório env próprio. Não reutilizar nomes ou volumes; nunca apontar o destino para os volumes da origem.
2. **Com os serviços de destino parados**, restaurar os três arquivos em seus volumes correspondentes vazios. Garantir que nenhum processo Postgres tente inicializar `db-data` antes de receber a cópia. Conferir hashes dos arquivos de backup usados e conteúdo/ownership reconstituído.
3. Como o backup é uma **cópia física integral** do banco, recuperar temporariamente as **mesmas credenciais sintéticas de banco/JWT compatíveis com o estado copiado** em arquivo env distinto e protegido, alterando as configurações **não secretas** (porta de loopback, URL local/redirects) exigidas pelo destino. A identidade interna `INFRA_INSTANCE_ID` foi preservada com o snapshot e exige atenção ao contrato de marcador. **Essa reutilização temporária de segredos é uma limitação do ensaio a frio; não deve ser transposta para PROD.**
4. Iniciar **somente** o projeto de destino; validar que `db`, `auth`, `rest`, `storage` e `kong` ficam saudáveis e que dados e objetos restaurados estão disponíveis. **Não executar `apply-migrations.sh` ou qualquer reset/reseed no destino restaurado.**
5. Validar identidade, contagens, hashes da sequência de migrations, registros de negócios, logs esperados e objetos físicos, inclusive arquivos efetivamente baixados por API Storage. A conexão às URLs externas deve permanecer em loopback. Se Auth exigir reparo/reconciliação, registrar problema e **não declarar PASS**.
6. Medir separadamente o tempo de cópia, transferência, start dos serviços, validação de integridade e RTO observado **do laboratório**. Isso **não** é RTO operacional de produção.
7. Executar os **mesmos testes negativos** de acesso entre unidades no destino, usando usuário A/B; capturar PASS/FAIL/BLOCKED por caso. Comparar byte a byte os arquivos por SHA-256.

**Critério de FAIL:** destino sobe, mas não autentica; Storage mantém metadado sem arquivo; arquivo mudou de bytes; contagem inesperada; cross-unit access autorizado indevidamente; objeto público; migration/versão incompatível; ou apenas um dos três volumes recuperado. Nenhuma tentativa de alterar a origem é permitida.

## 7. Matriz obrigatória de evidências

| ID | Prova | Critério | Estado inicial |
| --- | --- | --- | --- |
| DR-01 | Origem e destino com projetos, portas, env e volumes distintos | Sem identificadores/volumes compartilhados | NOT TESTED |
| DR-02 | PostgreSQL 17 e migrations | Schemas/ledger e contagens coerentes com origem | NOT TESTED |
| DR-03 | Duas unidades sintéticas | Inspeções/planos/atribuições correspondem ao manifesto | NOT TESTED |
| DR-04 | Storage DB + bytes de arquivo | Metadados e objetos recuperados, SHA-256 idêntico | NOT TESTED |
| DR-05 | Auth e vinculação a Core | Login sintético e permissões funcionais | NOT TESTED |
| DR-06 | Isolamento entre A/B e anônimo | Negativas reais via tokens de usuário | NOT TESTED |
| DR-07 | Saúde pós-restore | Cinco serviços healthy e APIs respondendo | NOT TESTED |
| DR-08 | Tempo e operação | Cronometria registrada, fonte íntegra, nenhuma alteração fora dos projetos de teste | NOT TESTED |
| DR-09 | Backup desligado da origem | Arquivos verificados, independentes dos volumes de origem | NOT TESTED |

**Resultado consolidado inicial: BLOCKED / NOT TESTED.** Este documento não representa evidência de restauração.

## 8. WAL-G versus pgBackRest e armazenamento off-site (decisão futura)

| Tema | WAL-G | pgBackRest | Gate que falta |
| --- | --- | --- | --- |
| Método | Backups e arquivamento WAL voltados a destinos de objeto | Backups completos/diferenciais/incrementais e WAL com repositórios | Provar setup confiável no Postgres/infra escolhidos |
| Recuperação | Verificar PITR, cadeia WAL, segredos e object store | Verificar PITR, retenção, checagem de backups, repo independente | Simular falha, medir RPO/RTO e custo de restauração |
| Operação | Scripts, alerta e retenção específicos | Política/automação de repositório e monitoramento específicos | Definir dono operacional, alertas e manutenção |

**Nenhuma ferramenta escolhida.** O destino futuro para cópia independente do Storage (por exemplo R2 → outro destino) e o modelo de backup online **não** estão implementados nesta issue. A solução de laboratório baseada em volumes **não é recomendação automática para produção**.

## 9. Encerramento do ensaio e relatório

Preencher somente após execução efetiva:
- **Data/hora, executor, máquina (descrição sem endereço), SHA Git, versões de Docker/Compose/serviços:** PENDENTE
- **Projetos sintéticos origem/destino, confirmação do isolamento:** PENDENTE
- **Volumes completos e manifestos SHA-256 verificados:** PENDENTE
- **Contagens antes/depois e hashes de arquivos conferidos:** PENDENTE
- **DR-01 a DR-09:** NOT TESTED
- **Tempo de interrupção, backup, restore, verificações:** NÃO MEDIDO
- **Erros, limitações, evidências saneadas e ação corretiva:** PENDENTE
- **Decisão:** BLOCKED; não concluir a [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51) até haver restauração e testes reais.

Limpeza dos dois projetos sintéticos somente com revisão dos **nomes exatos** e autorização do responsável. Nunca usar comandos de exclusão de volume na C30, em ambientes persistentes nem sobre o ERP de Contratos.

**Próximo passo prático:** identificar a máquina de desenvolvimento/runner isolado que executará este ensaio. Após confirmar Docker/Compose nessa máquina e nomes de projetos inéditos, implementar um executor reproduzível com as salvaguardas acima, rodá-lo e preencher o relatório. A ausência de uma máquina executora na sessão atual impede afirmar sucesso.


## 10. Computador temporário Windows/Docker Desktop — descarte controlado

**Contexto relatado em 16/10/2026:** computador de desenvolvimento **temporário**, PowerShell em Windows, Docker Client/Engine 29.8.2, Docker Desktop 4.95.0 com engine Linux e Compose 5.6.0. O comando `docker ps -a` apresentou **um** contêiner **preexistente**, `erp-contratos-postgres` (`postgres:18.4`, porta loopback 5432, saudável); `docker volume ls` apresentou **um** volume preexistente, `infrastructure_erp_contratos_pgdata`. **Ambos são expressamente excluídos do escopo; nunca parar, montar, inspecionar conteúdo, alterar, sobrescrever, exportar ou excluir.** Esse inventário é apenas um snapshot; antes de executar, consultar novamente.

### 10.1 Nomes e limites de exclusividade (reserva lógica; ainda não criados)

| Item | Identificador proposto | Condição |
| --- | --- | --- |
| Origem sintética | `gaucha-infra-drill-src-20261016` | Novo projeto Compose; rejeitar se o nome já existir |
| Destino da cópia | `gaucha-infra-drill-dst-20261016` | Novo projeto Compose distinto; rejeitar se o nome já existir |
| Artefatos de backup e manifesto | Pasta exclusiva de laboratório fora do checkout, por exemplo `C:\GG-RESTORE-DRILL-20261016` ou pasta Linux equivalente no WSL | Criar apenas após pré-voo e aprovação do caminho; nada em `C:\Windows\system32`, nada no ERP e nada no Git |
| Portas gateway | Duas portas **loopback** livres, ainda não escolhidas | Não usar 5432 do ERP; conferir ocupação antes de fixar |
| Volumes | Nomes gerados automaticamente com prefixo de cada projeto Compose | Somente `db-data`, `db-config`, `storage-data` por projeto; verificar labels `com.docker.compose.project` |

A escolha dos nomes acima **não cria** projetos e **não demonstra** que as portas ou volumes estão disponíveis.

### 10.2 Comandos de pré-voo (somente leitura no PowerShell)

~~~powershell
wsl --list --verbose
docker compose ls --all
docker ps -a
docker volume ls
docker system df
Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free
~~~

- A saída de `docker compose ls --all` informa projetos existentes, e `wsl --list --verbose` informa se há uma distribuição Linux apta a executar os scripts Bash do repositório. A existência do backend `desktop-linux` **não prova** que Ubuntu/WSL já esteja disponível para os scripts.
- Antes de trabalhar, definir/confirmar uma **distribuição WSL Linux** ou outro executor Linux independente, compatível com os scripts atuais. Não executar `scripts/ops/*.sh` diretamente no PowerShell; não instalar software, reinicializar, criar arquivos, containers ou volumes sem validação prévia.
- Consultar o espaço disponível e confirmar que cabem **dois stacks**, o backup e uma margem de recuperação. Não adotar um número de GB não medido.
- Conferir também que os projetos e volumes reservados **não** aparecem entre os recursos preexistentes. Identificadores inesperados = **BLOCKED** para criação, não licença para apagá-los.

### 10.3 Contrato de limpeza futura

A limpeza será **por allowlist**, nunca por varredura global:
1. Manter manifesto dos **dois** nomes de projeto e da **única** pasta de artefatos, junto dos IDs/labels dos seis volumes **recém-criados**, sem segredos nem caminhos de terceiros.
2. Ao fim do teste, validar evidências e obter autorização específica para remover os recursos descartáveis.
3. Para cada projeto reservado e efetivamente criado, conferir `docker compose ls --all`, `docker ps -a --filter label=com.docker.compose.project=...` e `docker volume ls --filter label=com.docker.compose.project=...`, antes e depois da limpeza.
4. Utilizar exclusivamente `docker compose` apontando ao **mesmo nome de projeto e Compose/env do laboratório**, com parada e exclusão `down --volumes` apenas depois da autorização. A operação é destrutiva **somente para os recursos do projeto identificado**; validar os alvos antes de executar.
5. Remover a **pasta exclusiva do laboratório**, incluindo backups e segredos sintéticos temporários, apenas após a decisão sobre retenção das evidências saneadas e após conferir seu caminho absoluto.
6. Confirmar `erp-contratos-postgres` em funcionamento e `infrastructure_erp_contratos_pgdata` presente e intocado; registrar resultado final. Nunca usar `docker system prune`, `docker volume prune`, `docker compose down -v` sem `-p`/projeto exato, nem `docker rm`/`docker volume rm` por correspondência ampla.

**Estado deste adendo:** pré-voo Windows parcialmente verificado pelo usuário. Falta inventário Compose/WSL/espaço e execução da prova DR-01 a DR-09; **nenhuma limpeza foi executada**.

### 10.4 Confirmação do host — 16/10/2026

O responsável **confirmou** que o PC temporário onde foram executados os comandos PowerShell/Docker **não é a Lenovo C30**. A C30 será o host oficial futuro, após preparação e formatação autorizada. Assim, a suspeita provisória de identidade do host registrada na Issue #51 está encerrada. O projeto preexistente `infrastructure`, o contêiner `erp-contratos-postgres` e o volume `infrastructure_erp_contratos_pgdata` continuam **fora do escopo de qualquer intervenção**, apesar de estarem no computador temporário. Próximo teste: Docker CLI no Ubuntu WSL2; nenhum ambiente de restauração foi criado.
