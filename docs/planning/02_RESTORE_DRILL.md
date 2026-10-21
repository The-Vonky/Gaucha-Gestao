# 02_RESTORE_DRILL — ensaio isolado de recuperação de banco e arquivos

**Gaúcha Gestão · Issue #51 · preparação 16/10/2026 · revisão documental 21/10/2026**  
**Estado atualizado em 19/10/2026: ENSAIO SINTÉTICO EXECUTADO, ACEITE DOCUMENTAL PARCIAL.** O relatório da seção 9 registra as evidências fornecidas pelo operador; tarefas e nomes na seção 10 são históricos de preparação (16/10), não o inventário atual. A Issue #51 continua aberta por evidências operacionais incompletas; incorporar este relato ao repositório **não** altera os resultados do ensaio nem fecha automaticamente DR-08.  
**Base inicial do documento:** `main` `f016b3c2711a54775a470a7f01bb5c8c27dc2dd1` (PR #61). **Execução real documentada:** `1e818a45449c0720f7b5af5398e04e0a89c9b3ff` em 19/10, com **17 migrations** no snapshot. **Baseline de revisão:** `main` `f7f5dddbcc748c8fabf192b031ad658cfb57a8f5`, 21/10, com **18 SQL migrations**, incluindo Curva ABC. Estes estados **não foram submetidos ao mesmo teste de restore**.

## 1. Objetivo e limite da prova

Demonstrar que uma instalação **exclusivamente sintética** de cinco serviços (PostgreSQL 17, GoTrue/Auth, PostgREST, Storage API e Kong) pode ser copiada para um **segundo projeto Docker Compose isolado** e recuperar:
- dados relacionais e histórico técnico de aplicação;
- identidade Auth sintética e vínculo com o Core;
- metadados de Storage **e bytes reais** dos objetos;
- leitura/autenticação autorizada e negações de acesso entre **duas unidades fictícias**;
- configuração necessária e contrato de migrations versionadas.

**Critério de PASS:** origem e destino independentes, instância restaurada saudável, dados e arquivos conferidos (contagens e SHA-256), autenticação funcional, negações entre unidades efetivas e tempo cronometrado, com evidência saneada. **Restauração somente de PostgreSQL é FAIL.** Backup criado sem restauração é **NOT TESTED**, nunca PASS.

Este primeiro ensaio é uma **cópia física a frio de três volumes de laboratório**, não um backup online, PITR, replicação, recuperação após perda do host ou implementação do plano de backup de produção. **Não satisfaz O1/O3/O4/O8 nem libera PROD.** WAL-G versus pgBackRest, R2, retenção, RPO/RTO e backup fora do host permanecem em aberto.

## Visão visual — backup executado vs recuperação requerida

~~~mermaid
flowchart LR
  subgraph LAB["LAB — comprovado em 19/10 com dados sintéticos"]
    SRC["Origem parada: 5 serviços"] --> SNAP["Três volumes copiados a frio: db-data, db-config, storage-data"]
    SNAP --> TAR["3 arquivos tar + SHA-256"]
    TAR --> DST["Projeto Docker independente"]
    DST --> TEST["Auth, DB, bytes, RLS: PASS; DR-08 parcial"]
  end
  subgraph FUT["PROD — planejado, sem prova"]
    RUN["Postgres em operação"] -.-> WAL["Base backup + WAL/PITR TO-BE"]
    OBJ["Storage: metadados + bytes"] -.-> OFF["Cópia independente/off-site TO-BE"]
    WAL -.-> REST["Restore em host substituto + RPO/RTO medidos"]
    OFF -.-> REST
  end
~~~

**Leitura correta:** setas sólidas são etapas do ensaio **a frio, com origem parada e sem off-site**. Setas tracejadas são controles **futuros, não implementados**. A validação no laboratório provou DB/Auth/objetos/RLS na versão histórica do snapshot, **não** PITR, R2, destruição do servidor ou tempos de recuperação produtivos. A decisão técnica de [backup de produção](../architecture/BACKUP_RECOVERY.md) continua aberta.

## 2. Escopo exato e fontes

| Componente | Origem versionada | O que precisa acompanhar a recuperação |
| --- | --- | --- |
| Banco PostgreSQL 17 | `infra/supabase/docker-compose.yml` | Volume **db-data** completo, incluindo schemas Auth/Core/Audit/Action Plans, tabelas internas, dados sintéticos, migrações e auditoria |
| Configuração do Postgres | mesmo Compose | Volume **db-config**; validar necessidade e integridade |
| Storage local de CI/STAGING | mesmo Compose | Volume **storage-data** com arquivos físicos + tabelas `storage.buckets`/`storage.objects` no banco, tratados como conjunto |
| Serviços/versionamento | `infra/supabase/docker-compose.yml`, `infra/supabase/UPSTREAM.md` | Mesmo commit do código e versões de imagens; registrar SHA, hashes das 17 migrations e versões resolvidas |
| Configuração/segredos | `infra/env/staging.env.example`, `scripts/ops/gen-secrets.sh` | Referências e cópia protegida dos **segredos sintéticos temporários compatíveis com o snapshot**, fora do Git; nunca anexar valores ao relatório |
| Buckets no snapshot de ensaio | migrations históricas, 17 arquivos | `action-plan-evidence`, `audit-checklist-evidence` e `unit-covers`; privados. Quatro PDFs validados no cenário, **não** todos os objetos/buckets possíveis |
| Curva ABC após o snapshot | `20261020120000_abc_domain_v1.sql`, **18ª migration na main de 21/10** | O bucket privado `abc-source-files`, suas revisões e XLSX originais entram obrigatoriamente no **escopo de um novo ensaio** antes de alegar cobertura da plataforma atual. **Não foram testados no drill de 19/10** |

**Regra de consistência:** a cópia dos volumes do banco **não pode ser feita com o PostgreSQL em execução**, mesmo que a aplicação não tenha usuários ativos. Parar todos os serviços **somente do projeto sintético explicitamente criado para este ensaio**, aguardar término completo e então copiar os três volumes. Para o ensaio a frio, banco e Storage devem compartilhar o mesmo ponto de parada. Não misturar banco de um instante com arquivos de outro.

A documentação [infra/README.md](../../infra/README.md) suporta apenas `ci`/`staging` descartáveis. O script `apply-migrations.sh` é **somente primeira inicialização**, não deve ser executado sobre a cópia restaurada. A cópia física do banco preserva identidades, hashes/ledger e marcador de instância; **um destino restaurado NÃO é uma nova base vazia para replay de migrations**.

## 3. Pré-voo obrigatório — NO-GO automático se não cumprir

1. Selecionar um **computador de desenvolvimento** ou runner Linux isolado autorizado, **não a C30**, sem conexão com PROD nem com o ERP de Contratos ou seus volumes. O ambiente deve permitir Docker Engine/Compose v2, Bash, Node 22.12+, Git e espaço temporário suficiente para dois stacks e os arquivos de backup.
2. Separar **dois nomes de projetos novos**, exclusivos e diferentes, dentro do formato `gaucha-infra-...`, duas portas loopback livres e diretórios externos ao checkout distintos para env/backup/evidências. **Antes de criar**, inspecionar `docker ps -a`, `docker volume ls` e existência dos nomes para garantir que não coincidam com qualquer outro trabalho.
3. Registrar SHA Git, arquivos versionados, versão de Docker/Compose/PostgreSQL/GoTrue/Storage e espaço em disco. Usar somente o Compose da branch revisada e imagens fixadas. Não editar o Compose para apontar a volumes/serviços já existentes.
4. Segredos gerados por `scripts/ops/gen-secrets.sh --environment staging` **fora do repositório**, permissão 0600, ambiente sintético. Nunca imprimir env, tokens, credenciais ou caminhos privados na evidência.
5. Identificar os projetos e volumes antes de qualquer `stop`, cópia ou remoção. **Não usar** `docker volume prune`, `docker system prune`, `docker compose down -v` genérico nem operações em projetos existentes. O encerramento só pode afetar os dois projetos novos **com verificação e autorização específica**.
6. Não executar os comandos de laboratório na C30 nem no ambiente usado para o ERP real. Se não for possível provar isolamento, marcar **BLOCKED**.

**Nota histórica da preparação em 16/10:** naquela sessão documental ainda não havia execução Docker comprovada. Em 19/10 o operador executou o ensaio no Ubuntu/WSL; resultados e limitações estão na seção 9.

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

| ID | Prova | Critério | Resultado observado em 19/10/2026 |
| --- | --- | --- | --- |
| DR-01 | Origem e destino com projetos, portas, env e volumes distintos | Sem identificadores/volumes compartilhados | PASS — projetos, portas e volumes distintos |
| DR-02 | PostgreSQL 17 e migrations | Schemas/ledger e contagens coerentes com origem | PASS — 17/17 hashes SHA-256 do ledger idênticos aos arquivos locais do SHA validado; marcador e contagens confirmados |
| DR-03 | Duas unidades sintéticas | Inspeções/planos/atribuições correspondem ao manifesto | PASS — 2/2 atribuições `quality` ativas com escopo `unit` nas unidades A/B, nenhuma atribuição adicional; cenário e RLS já validados |
| DR-04 | Storage DB + bytes de arquivo | Metadados e objetos recuperados, SHA-256 idêntico | PASS — metadados e 4 arquivos com SHA-256 idêntico |
| DR-05 | Auth e vinculação a Core | Login sintético e permissões funcionais | PASS — logins A/B com JWT e acesso próprio ao banco/objetos |
| DR-06 | Isolamento entre A/B e anônimo | Negativas reais via tokens de usuário | PASS — negação cruzada A/B e de downloads anônimos |
| DR-07 | Saúde pós-restore | Cinco serviços healthy e APIs respondendo | PASS — 5/5 healthy e APIs funcionais no destino |
| DR-08 | Tempo e operação | Cronometria registrada, fonte íntegra, nenhuma alteração fora dos projetos de teste | PARCIAL — operação limitada aos projetos de laboratório; tempos rigorosos não medidos |
| DR-09 | Backup desligado da origem | Arquivos verificados, independentes dos volumes de origem | PASS — cópia a frio de 3 volumes; SHA-256 dos 3 tar OK; restore com origem desligada |

**Resultado do ensaio em 19/10/2026: 8 PASS, 1 PARCIAL (DR-08).** Restore funcional comprovado no escopo sintético; não equivale a backup operacional de PROD ou aprovação de GO.

## 8. WAL-G versus pgBackRest e armazenamento off-site (decisão futura)

| Tema | WAL-G | pgBackRest | Gate que falta |
| --- | --- | --- | --- |
| Método | Backups e arquivamento WAL voltados a destinos de objeto | Backups completos/diferenciais/incrementais e WAL com repositórios | Provar setup confiável no Postgres/infra escolhidos |
| Recuperação | Verificar PITR, cadeia WAL, segredos e object store | Verificar PITR, retenção, checagem de backups, repo independente | Simular falha, medir RPO/RTO e custo de restauração |
| Operação | Scripts, alerta e retenção específicos | Política/automação de repositório e monitoramento específicos | Definir dono operacional, alertas e manutenção |

**Nenhuma ferramenta escolhida.** O destino futuro para cópia independente do Storage (por exemplo R2 → outro destino) e o modelo de backup online **não** estão implementados nesta issue. A solução de laboratório baseada em volumes **não é recomendação automática para produção**.

## 9. Encerramento do ensaio e relatório de execução — 19/10/2026

**Fonte:** logs e saídas obtidos pelo operador no Ubuntu/WSL e compartilhados durante a execução. Este documento não afirma observação direta da máquina via GitHub. Informações de senha, JWT, token, dados de pessoas e URLs assinadas não são publicadas.

### 9.1 Identificação e isolamento

- Data/hora de conferência final: `2026-10-19T13:04:07-03:00` (America/Sao_Paulo).
- Executor: responsável Dev A na máquina temporária de desenvolvimento Ubuntu/WSL; **não** a ThinkStation C30. Docker Engine `29.8.2`; Docker Compose `5.6.0`; versão de aplicação/SHA base do cenário: `1e818a45449c0720f7b5af5398e04e0a89c9b3ff`.
- Origem: projeto `gaucha-infra-drill-src-v2-20261016`, porta loopback `54331`, 5 serviços e volumes `db-data`, `db-config`, `storage-data`.
- Backup local: `~/gg-drill-backup-v2-20261019` (~45 MB), três arquivos `db-data.tar`, `db-config.tar`, `storage-data.tar`, com manifesto `SHA256SUMS.txt` e `sha256sum -c`: **OK nos três**. Segredos sintéticos preservados em arquivos restritos fora do checkout, sem publicação.
- Destino restaurado: projeto `gaucha-infra-drill-restore-v2-20261019`, porta loopback `54332`, configuração própria com credenciais sintéticas compatíveis com o snapshot e três **novos** volumes rotulados. A origem foi desligada antes da inicialização do destino para limitar uso de memória. Não se executaram migrations nem reseed no destino.
- Projetos DEV compartilhado e ERP Contratos preservados; sem ações nesses projetos. Nenhum volume original ou restaurado foi excluído.

### 9.2 Execução e validação

| Teste | Resultado observado |
| --- | --- |
| Fonte e backup | Parada controlada dos 5 serviços de origem; cópia a frio dos três volumes; arquivos tar legíveis e três checksums SHA-256 OK; origem religada saudável após o backup |
| Volumes do destino | Volume `db-data` restaurado ~43,8 MB, `db-config` ~124 KB e `storage-data` ~68 KB; labels de projeto do destino confirmados |
| Saúde pós-restore | Cinco serviços **healthy** no destino: db, auth, rest, storage, kong |
| DB restaurado | Marcador `infra_control.target` conferido; `17|2|2|2|4|4|2|2|4|0` (migrations, unidades, Auth users, inspeções, respostas preenchidas, planos, evidências auditoria disponíveis, evidências planos disponíveis, objetos Storage, pendências) |
| Auth | Dois usuários sintéticos (A e B) fizeram login por `/auth/v1/token` na porta 54332 |
| Storage | Quatro PDFs de auditoria/planos, A e B, baixados por seus titulares; tamanho e SHA-256 iguais aos originais; leituras por outra unidade e anônimo rejeitadas |
| RLS de dados | Oito consultas via PostgREST em `audit.inspections` e `action_plans.plans`: próprios visíveis, outra unidade não visível (**8/8 PASS**) |
| Integridade posterior | Em 13:04 BRT, os três arquivos tar passaram novamente no `sha256sum -c`; destino 5/5 healthy, DEV compartilhado 5/5 healthy; origem desligada |
| Exceção observada | Serviço REST da **origem** exibiu `Exited (255)` na consulta final, após parada do laboratório; demais serviços de origem `Exited (0)`. Não há diagnóstico causal desse código. Banco da origem havia parado normalmente e o destino REST permaneceu saudável |

Os quatro arquivos do cenário e seus hashes SHA-256 originais (arquivos puramente sintéticos):

| Arquivo | SHA-256 |
| --- | --- |
| `drill-a-audit.pdf` | `c5f6fa1e42666f7db277ff7e2cc5987506559950067c1f1a26ac62559d3f3c59` |
| `drill-a-plan.pdf` | `c4b92b3ca7f2c747349f0f857a36431ed35bf02e7d5d4d257a9dc7561efc2789` |
| `drill-b-audit.pdf` | `5597f943dc09f5c3438c02fb9e3e920a1276ae94d734b51b071549a49871b122` |
| `drill-b-plan.pdf` | `3825d81ae7beab028485a4d4be101f64722c677e31e47a7bab0c6954962c362d` |

### 9.3 Resultado, limites e pendências

**Resultado funcional do ensaio:** **PASS no restore sintético de PostgreSQL, Auth, Storage e negação cross-unit.** Matriz DR-01–DR-09: **8 PASS, 1 PARCIAL (DR-08)**. Em verificação adicional de leitura informada pelo operador no Ubuntu, o cotejo entre `infra_control.migrations.sha256` e os 17 arquivos SQL da mesma versão resultou em **17/17 SHA-256 idênticos**, e as atribuições `core.user_role_assignments` totalizaram **2/2**, ambas ativas, com papel `quality` e escopo `unit` nas unidades sintéticas correspondentes; os totais não indicaram atribuições adicionais. DR-08 exige cronometração da interrupção/cópia/restore/validação e, para o aceite operacional final, reprodução ou revisão independente do procedimento. A evidência entregue valida o funcionamento, não a íntegra de todos os requisitos de aceitação documental.

**NÃO MEDIDO:** tempo total de interrupção, cópia, start, validação e RTO do laboratório. Não inferir duração de prints ou da data de consulta. Não definir RPO = 0 ou RTO operacional a partir deste ensaio.

**Não coberto:** alteração de usuário inativo, acesso ao terceiro bucket privado `unit-covers` por fluxo legítimo, cópia off-site, falha total do host, PITR/arquivamento WAL, retenção e monitoramento/alertas produtivos. Ferramenta WAL-G versus pgBackRest, RPO/RTO e políticas de backup ainda exigem decisão própria. O ensaio não comprova O1/O3/O4/O8 de PRODUÇÃO.

**Próximas ações:** completar ou registrar exceção formal justificada para a cronometração de DR-08; revisar o runbook e obter revisão humana na PR #62; demonstrar o procedimento ao Dev B e manter a decisão **PROD = NO-GO** até fechar os gates produtivos.

**Política de retenção/limpeza:** manter origem, destino, arquivos tar e segredos sintéticos protegidos até conclusão e autorização humana. Nunca executar `down -v` ou `docker volume prune` sobre projetos existentes; preservar ERP de Contratos e DEV compartilhado.

## 9.4 Como concluir DR-08 sem reescrever a história

O ensaio funcional é aproveitável como evidência histórica; **DR-08 permanece PARCIAL**. Para fechá-lo, planejar e executar **novo ensaio** ou obter decisão documentada sobre o limite metodológico, com responsável designado e evidência independente:

1. Identificar o SHA completo, versão das 18 migrations da plataforma corrente, duas instâncias Docker **novas e isoladas**, configuração compatível, volumes e buckets — inclusive `abc-source-files` e um XLSX **sintético** autorizado — ou registrar explicitamente o que ficará não coberto.
2. Registrar horários confiáveis para **parada da origem, fim da cópia, início da restauração, primeira resposta de Auth/REST/Storage, validações e recuperação funcional**. Declarar cronômetro, fuso, volumes (bytes) e resultado; não deduzir os tempos do ensaio anterior.
3. Reexecutar Auth com usuários sintéticos, grants/RLS cross-unit, checks de banco e ledger, SHA-256 de **cada arquivo efetivamente selecionado**, incluindo original ABC se presente. Garantir que os objetos e os metadados estejam no **mesmo ponto consistente**.
4. Repetir o ciclo em host/destino independente **somente quando** houver operação autorizada e controlada para isso; separar `RTO observado no laboratório` da meta/aceite **RTO de produção**. Não alegar RPO=0 por haver backup de volume.
5. Registrar falhas, duração, método, evidência sanitizada, aprovador, plano corretivo e limite da prova na [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51), sem revelar tokens, senhas, dados reais ou caminhos sensíveis.

**Pendências de produção independentes de DR-08:** escolha e ensaio WAL-G/pgBackRest (ou equivalente), WAL/PITR, política de retenção, destino externo ao host, criptografia/chaves recuperáveis, backup de objetos e metadados, UPS/capacidade C30, alertas, RPO/RTO definidos e aprovados. Não tratar o sucesso sintético como gate O1/O3/O4/O8 concluído.

## 9.5 Regras rápidas para operar ou auditar este procedimento

| Situação | Ação segura | Nunca concluir |
| --- | --- | --- |
| Origem/volumes não estão inequivocamente identificados | **BLOCKED**, inventariar e obter autorização | Que uma pasta antiga ou prefixo `gaucha` é descartável |
| Banco ativo durante cópia de `PGDATA` | **FAIL** para o backup físico a frio; parar **somente** o laboratório definido | Que `docker cp` ou tar de banco em execução são backups consistentes |
| Restore do DB sem os bytes de Storage | **FAIL** para recuperação integral | Que somente `storage.objects` preserva arquivos |
| DR-08 sem medidas cronológicas | **PARCIAL**, repetir ensaio com cronometria | Que o tempo pode ser calculado retroativamente |
| Evidência do snapshot 17 migrations | Preservar como histórico, planejar repetição com ABC/18 migrations | Que a `main` corrente já foi validada pelo ensaio antigo |
| Necessidade de desligar/deletar projetos | Inventário + allowlist + aceite explícito, preservar ERP, C30, DEV compartilhado | Que esta PR autoriza `prune`, reset ou `down -v` |

A exclusão de **branches Git** após o merge é independente da **limpeza de contêineres e volumes**. Nenhuma operação de Docker, banco ou host decorre automaticamente da integração do documento.

## 10. Histórico da preparação de 16/10 — computador temporário Windows/Docker Desktop e descarte controlado

**Nota de cronologia:** esta seção preserva decisões e nomes propostos *antes* da execução. Os nomes de projeto efetivamente usados e os resultados de 19/10 estão registrados na seção 9. Não usar identificadores desta seção histórica para operações de limpeza.

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
