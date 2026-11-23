# Agendamento — foto, status temporal e histórico de gestão

> **Atualização de 23/11/2026 (AG-D5-C):** a regra D5-B abaixo é histórica. Administrador global passa a gerir a sala e alterna entre **Room Booking Requester** e **Room Booking Manager**. Para cadastro da secretária e autorização efetiva, prevalece [D5-C](D5C_ADMIN_MODES.md); a interface antiga e seus testes descritos neste documento correspondem à versão de 26/10/2026.

Melhorias aprovadas pelo responsável em 26/10/2026, na mesma PR #88 e branch `feat/ag-01-room-booking-schema-20261023`, após testes manuais do módulo. D5-B permanece vigente: administrador geral não opera gestão, mesmo com atribuição simultânea conflitante. Sem merge/deploy automático; mantenedor único revisa e decide.

## GG-08 e GG-09 — contato e histórico de gestão

### GG-08 · Contato da sala

A sala ativa exibe **Responsável** e **Ramal** para quem pode consultar a agenda. Sem cadastro, a interface informa **Contato ainda não informado**. A gestora efetiva usa **Editar contato** e recebe a versão gravada sem recarregar a página. O nome é preenchido no formulário e pode diferir do nome cadastrado no Core. Informe somente o nome institucional e o ramal.

| RPC pública | Capacidade efetiva | Contrato |
|---|---|---|
| `room_booking_contact` | `room_booking.schedule.read` | Identifica a sala ativa e devolve nome, ramal e versão. Versão 0 indica que ainda não existe contato. |
| `room_booking_save_contact` | `room_booking.manage` | Revalida D5-B depois de travar a sala. Exige a mesma sala e a versão lida pelo formulário, inclusive na primeira gravação. Conflito retorna `40001` e a interface oferece nova consulta. |

`room_booking.room_contacts` contém uma configuração por sala, com RLS de negação e sem acesso direto do cliente. O banco apara espaços nas extremidades e normaliza o nome. Aceita até 120 caracteres, com letras, espaços, ponto, apóstrofo e hífen. O ramal contém de 1 a 8 dígitos e preserva zeros iniciais. O evento `contact_save` em `core.system_audit_log` registra sala, autoria, data, versões e quais campos mudaram. O evento guarda indicadores de mudança para evitar duplicar o nome e o ramal no log. A substituta com atribuição de gestão efetiva exerce a mesma função até a revogação prevista em D6.

### GG-09 · Solicitações e reservas diretas

A área **Histórico do agendamento** tem abas **Solicitações** e **Reservas diretas** para gestão efetiva. A aba **Solicitações** usa a RPC `room_booking_history` e preserva os estados e os dados do contrato anterior. Horário, nome, solicitante e estado aparecem no resumo, assim como eventual cancelamento da reserva vinculada. A criação, a decisão e o motivo da recusa ficam nos detalhes.

A aba **Reservas diretas** usa `room_booking_direct_history` e consulta as reservas existentes com `request_id IS NULL`, inclusive canceladas. Exibe estado gravado, responsável pela criação, registro, última atualização, cancelamento e, se houver, observações da secretaria e motivo do cancelamento. Uma reserva passada que permanece `confirmed` continua **Confirmada**. A consulta apresenta os valores persistidos e os nomes de exibição atuais do Core. A edição anterior de nome ou observações pode ter deixado somente metadados no log, de modo que o histórico da interface apresenta a última versão registrada.

As duas abas filtram pelo estado do próprio registro e pelo dia de início da reunião em `America/Sao_Paulo`. Cada limite é opcional e inclusivo. Exibem até 25 itens por página, com cursor decrescente `(starts_at, id)`. Alterar um filtro ou trocar de aba retorna à primeira página. O índice parcial `bookings_direct_history_order` atende a consulta de diretas. A paginação reflete o estado consultado em cada chamada, inclusive reservas que mudaram de data ou de estado desde a página anterior.

```mermaid
flowchart LR
    L[Leitor da agenda] --> C[Consultar contato da sala]
    G[Gestão efetiva D5-B] --> E[Gravar contato com versão esperada]
    E --> A[Configuração por sala e auditoria Core]
    G --> H[Histórico do agendamento]
    H --> P[Solicitações e situação da reserva vinculada]
    H --> D[Reservas diretas inclusive canceladas]
```

### Reprodução dos testes de GG-08 e GG-09

- `npm test -- tests/room-booking-management.test.ts tests/room-booking-ui.test.tsx tests/room-booking-experience.test.ts` cobre as permissões, gravação e conflitos de contato, auditoria, históricos, filtros e cursor em PGlite e na interface.
- `node tests/integration/room-booking-management-local.mjs` usa exclusivamente o container local identificado no runner. Confere atividade e ausência das duas migrations, executa as novas definições e os casos sintéticos sob `ROLLBACK` com limite de espera por locks, e confirma a ausência das mudanças no schema e no ledger após o teste.
- Para reproduzir a navegação sintética, executar `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_gg0809_fixture npm run build` e então `node tests/integration/room-booking-management-browser.mjs` com Chromium do Playwright disponível. O runner intercepta o carregamento do bundle, Auth e REST. Nenhum servidor é iniciado e nenhum registro persistente é usado.

Capturas com dados sintéticos do ensaio em Chromium de 10/11/2026

- [GG-08 · Formulário de contato em desktop](evidence/gg08-gg09/contato-desktop.png)
- [GG-09 · Solicitações em desktop](evidence/gg08-gg09/solicitacoes-desktop.png)
- [GG-09 · Reservas diretas em 320 px](evidence/gg08-gg09/diretas-320.png)

O ensaio no PostgreSQL confirma a releitura depois de gravar dentro da transação e a rejeição de versões antigas. A persistência após reinício de um ambiente, o fluxo integrado Auth/REST com as migrations aplicadas, a corrida entre conexões simultâneas e a homologação em dispositivo físico dependem de ambiente autorizado.

### Aplicação futura em ambiente autorizado

1. Inventariar destino, versão, ledger, dependências do Agendamento e volume de `bookings`. Confirmar a D5-B e a sequência das migrations. Ensaiar a duração da criação do índice com carga representativa e preservar a versão anterior do frontend.
2. Validar backup independente e restauração antes da janela. Depois de GO específico, aplicar em ordem `20261110131044_room_booking_contact.sql` e `20261110131045_room_booking_direct_history.sql` pelo processo de release autorizado. São mudanças aditivas, sem preenchimento retroativo de contato, escrita em registros de reservas ou conversão de pedidos.
3. Confirmar ledger e recarga do schema da API. Antes de liberar a UI, executar smoke com gestora, leitor e administrador sem gestão. Homologar nome/ramal, substituição e os dois históricos com dados autorizados.
4. Se a UI precisar voltar, restaurar a versão anterior do frontend e preservar a configuração e o log. Após commit de migration, corrigir o banco com migration incremental revisada, preservando a configuração e os registros. Se a primeira migration concluir e a segunda falhar, adiar a nova UI, diagnosticar o lock ou erro da segunda e conferir o ledger antes de retomar.

## Contratos de banco anteriores a GG-08 e GG-09

Migration append-only `20261026181548_room_booking_experience.sql`, posterior às 22 migrations existentes. Aplicada uma única vez no `gaucha-gestao-local`, totalizando **23**. Comparação em transação preservou usuários, papéis, atribuições, pedidos e reservas existentes. Migrations anteriores não foram editadas.

| RPC pública | Autorização | Contrato |
|---|---|---|
| `room_booking_summary` | `room_booking.schedule.read` | Acrescenta `in_use_until`, término da confirmada em andamento, ou null; mantém `server_now`, `[início,fim)` e contador pendente somente para gestão efetiva |
| `room_booking_history` | `room_booking.manage` | Todos os estados de pedidos, inclusive passados; filtros opcionais de estado e período do horário solicitado em America/Sao_Paulo; cursor `(starts_at,id)` decrescente; 25 itens e `has_more` |
| `room_booking_cover` | `room_booking.schedule.read` | Versão atual, asset/chave privada quando pronta, enquadramento e dimensões; sem URL persistida |
| `room_booking_begin_cover_upload` | `room_booking.manage` | Valida JPEG declarado, 1 B–1 MiB, dimensões 1–2560; máximo de cinco pendentes válidos por sala por hora; chave única gerada pelo banco |
| `room_booking_save_cover` | `room_booking.manage` | `confirm`, `position`, `remove` exigem versão esperada; `cancel` aposenta somente pendente do próprio uploader; todas as ações revalidam acesso após trava da sala |

O histórico retorna nome de exibição do solicitante e do decisor pelo Core, nome da reserva, horários, estado, criação, decisão/motivo e situação/cancelamento posterior da reserva vinculada. Não retorna e-mails, finalidade privada ou UUIDs de identidade. Não é uma API de alteração nem outro local de aprovação. Reservas diretas não geram pedidos artificiais. Nomes refletem o cadastro atual do Core, não um snapshot histórico do nome.

Cursor composto evita que novas inserções no topo desloquem a próxima página. Filtros reiniciam o cursor. O índice `requests_history_order` acompanha a ordenação; não usa OFFSET. A consulta não congela um snapshot entre páginas: mudanças de estado podem mudar a participação em um filtro, e a interface pode ser atualizada para reconsultar.

## Foto e Storage privado

O módulo é proprietário de `room_booking.cover_assets` e `room_booking.room_covers`, sem SELECT/DML cliente, com RLS de negação. `room_covers` tem versão independente, enquadramento 0–100 e FK composta que só aceita asset da própria sala. Constraint deferred garante uma única foto pronta referenciada. Metadados do arquivo são imutáveis; ciclo `pending → ready → retired` ou `pending → retired`. Triggers auditam estado, autoria, enquadramento e versão em `core.system_audit_log`, sem object key ou URL assinada.

Bucket **`room-covers`**, privado, limite 1 MiB e `image/jpeg`. INSERT exige gestão efetiva D5-B, objeto pendente do uploader com menos de uma hora e operação de upload. SELECT/assinatura exige `room_booking.schedule.read` e foto atual pronta da sala ativa. Não existem políticas cliente de UPDATE/DELETE: sem sobrescrita, upsert, move ou copy. `unit-covers`, permissões de unidades e demais módulos não mudaram.

Confirmação confere objeto existente, uploader, tamanho e MIME registrados pelo Storage; substituição aposenta o anterior e muda a referência atomicamente. Versão esperada protege substituição, enquadramento e remoção; concorrência retorna `40001`. Arquivos aposentados/pendentes expirados não são apagados: expurgo e retenção física continuam fora do escopo, exigindo procedimento autorizado. Operador pode reconciliar `cover_assets` com `storage.objects` pela chave, sem dar acesso bruto ao cliente.

O processamento reutiliza **`core/unitCoverImage.ts`**, sem duplicar o codec: JPEG/PNG/WebP pelos bytes, entrada ≤8 MiB e ≤40 MP, reconversão JPEG com remoção de EXIF, lado ≤2560 px, alvo ≤512 KiB e teto ≤1 MiB. UI reutiliza Modal/Notice e estilos de prévia/enquadramento. Arquivo original não é enviado. A validação física/reconversão ocorre no browser; SQL/Storage verificam limites e metadata, **não decodificam pixels nem comprovam conteúdo/remoção de EXIF de payload forjado**. Sem nova garantia criptográfica ou scanner de malware.

URLs assinadas têm TTL de 300 s, somente em memória, com renovação a cada 240 s e ao voltar à aba. Mudança de principal/permissões remonta o estado e invalida respostas anteriores. Remoção/revogação bloqueia novas assinaturas; URL já emitida continua bearer token até expirar. Erro de assinatura/arquivo ou ausência de foto mantém o fundo institucional. Falha após begin tenta aposentar o pendente sem mascarar o erro original. Falha de cancelamento, inclusive por revogação, deixa pendente para reconciliação técnica.

A ação **Alterar foto da sala** só aparece com `manage` efetivo. Editor permite selecionar, pré-visualizar, centralizar, enquadrar horizontal/verticalmente, substituir e remover. Overlay preserva legibilidade. A foto não é vinculada a unidades nem usada por outros módulos.

## Status e contador

Badge verde **✓ Disponível agora**; vermelho **◷ Em uso**, inclusive no resumo lateral. Texto/ícone acompanham a cor, sem animação piscante. Em uso, `Termina em HH:mm:ss` usa `in_use_until - server_now - tempo monotônico transcorrido`, com `performance.now()`. A âncora é capturada quando a resposta do resumo chega, antes de aguardar outras consultas; o relógio civil do aparelho não governa a contagem. Há a tolerância normal de latência da amostra do servidor.

O timer local atualiza a cada segundo e nunca solicita o banco a cada segundo. Ao zerar, trava em zero, esconde a contagem vencida, mostra consulta em andamento e dispara uma atualização real uma única vez por amostra. Uma reunião imediatamente seguinte pode manter **Em uso** com novo término. Quando livre, `next_start` também agenda a reconsulta na borda. A página reconsulta periodicamente (60 s) e em `visibilitychange` ao retornar; o tick usa tempo transcorrido, sem acumular decrementos perdidos em aba inativa. Em erro de rede, não inventa disponibilidade; mantém feedback de erro e tenta na atualização normal/manual.

## Visão por permissão

Gestor efetivo não renderiza **ORGANIZE SEU ENCONTRO**, **Novo pedido** ou **Meus pedidos**, nem consulta pedidos próprios. Agenda ocupa a largura disponível. Mantém reserva direta, fila e decisões, edição/cancelamento autorizados, foto e histórico somente leitura. Os grants de solicitante do papel não foram removidos: a mudança é de apresentação. Administrador D5-B e solicitante continuam com seus próprios pedidos e agenda; sem foto editável, fila, contador privado ou histórico geral.

```mermaid
flowchart LR
    M[Gestor efetivo] --> U[Preparação JPEG no browser]
    U --> B[Begin: asset pendente privado]
    B --> S[Storage: upload sem overwrite]
    S --> C[Confirmar com versão e metadata]
    C --> A[Foto pronta e auditoria]
    R[Leitor de agenda] --> L[RPC autorizada e URL temporária]
    A --> L
    M --> H[Histórico paginado somente leitura]
```

## Validação e limites

- `tests/fixtures/room-booking-experience.sql`: negativas diretas de foto/histórico, metadata, versão obsoleta, enquadramento/substituição/remoção, RLS Storage, leitura, cancelamento pendente, auditoria, resumo, estados, passado, filtros e cursor. Executado em PGlite e PostgreSQL local com ROLLBACK e verificação de preservação.
- `tests/room-banner.test.tsx`: status, contagem, zero sem repetição/negativos, próxima reunião, retorno da aba sem ticks e atraso entre recebimento/renderização.
- `tests/room-photo-client.test.tsx`: upload falho, cancelamento pendente, `upsert:false`, versão/enquadramento esperados, falha de assinatura e fallback. Validação/codec completos cobertos também pelos testes preexistentes de `unit-cover-image`.
- `tests/room-booking-ui.test.tsx`: visões gestor/solicitante/D5-B, reserva direta preservada, estados/decisão/cancelamento posterior e filtro/cursor no histórico.
- `tests/integration/room-booking-experience-browser.mjs`: Auth/REST/Storage reais com contas existentes; upload PNG convertido em JPEG, substituição, enquadramento, versão antiga recusada, leitura por solicitante, anônimo negado, remoção ao encerrar; duas visões em 1440/390 px, sem `pageerror` ou overflow horizontal.

A conta solicitante local acumula `platform_administrator` e `room_booking_requester`; a secretária possui `room_booking_manager` sem conflito. Nenhuma conta/atribuição foi criada ou modificada para os testes. Solicitante sem administração também é testado em memória. O ensaio Storage usa imagem sintética, só quando não existe foto real, e remove logicamente a foto de teste ao fim. Seus assets aposentados e eventos de auditoria são preservados. As capturas mascaram listas com dados potencialmente pessoais e foram incluídas em `evidence/` para revisão. O bloco magenta é máscara de privacidade do teste, não parte da interface. A imagem de fundo nessas capturas é sintética, não a foto real da sala.

Testes não equivalem a homologação humana, celular físico, recuperação do bucket ou implantação. Não se alterou C30/STAGING/PROD/legado, nem se executou reset. Após COMMIT, correções por nova migration autorizada; sem editar a migration aplicada nem apagar arquivos para reverter. O mantenedor continua responsável pelo aceite e merge. PROD NO-GO.


## Entrega final — 27/10/2026

Código/testes no commit `53c5a01`; as verificações finais abaixo rodaram sobre os mesmos arquivos antes do commit. O commit documental seguinte acrescenta relatório e capturas sem modificar código.

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | PASS em 27/10 |
| `npm run lint` | PASS em 27/10 |
| `npm test -- --maxWorkers=4` | PASS em 27/10: **48 arquivos, 612 testes**, sem skips |
| `npm run build` | PASS em 27/10; aviso de chunk acima de 500 kB |
| `npm run verify:build` | PASS em 27/10 |
| `npm audit --audit-level=moderate` | PASS em 27/10: zero vulnerabilidades |
| `room-booking-experience-local.mjs` | PASS em 26/10, inclusive histórico passado; ROLLBACK e comparação do estado persistente |
| `room-booking-experience-browser.mjs` | PASS em 26/10: Auth/REST/Storage reais, duas contas existentes, 1440/390 px, foto e visões por permissão |
| RPCs de leitura em 27/10 | PASS: resumo/foto para gestor e solicitante; histórico permitido ao gestor e negado ao solicitante, sem mutações |
| Histórico local em 27/10 | **23 migrations**, última `20261026181548`; nenhuma reaplicação |
| `/rooms` em 27/10 | HTTP 200 em `http://127.0.0.1:5173/rooms` após retomar o Vite existente |
| `git diff --check` | PASS |

Na retomada, Docker Desktop estava fechado e a integração WSL ainda indisponível. Foi reaberto o aplicativo já instalado; os mesmos containers voltaram, sem criação/recriação de ambiente. A consulta do histórico foi feita pelo CLI Windows existente e a integração WSL voltou em seguida. Há uma foto cadastrada atualmente: foi preservada, sem repetir upload/substituição/remoção. A tentativa de nova navegação somente leitura em 27/10 não iniciou porque o Chromium temporário de `/tmp` não sobreviveu à interrupção; não se reapresenta a prova de 26/10 como nova execução. A auditoria npm antes bloqueada por limite da ferramenta foi concluída com sucesso nesta retomada.

A rodada completa de checks foi repetida apenas porque a saída do processo final anterior não pôde ser recuperada após a interrupção. O runner de mutação em Storage não foi repetido sobre a foto existente. O primeiro teste de navegador de 26/10 encontrou ambiguidade no nome acessível do filtro de status; o rótulo explícito foi corrigido e a rodada final passou.

Capturas de 26/10, sem listas pessoais:

- [Gestor — desktop](evidence/manager-desktop-20261026.png)
- [Gestor — celular](evidence/manager-mobile-20261026.png)
- [Solicitante — desktop](evidence/requester-desktop-20261026.png)
- [Solicitante — celular](evidence/requester-mobile-20261026.png)

Pendências reais: revisão/merge pelo titular, conclusão dos checks remotos do SHA enviado, homologação humana e celular físico. Restore do bucket e prontidão produtiva não foram comprovados. `supabase/snippets/` permanece preexistente e fora dos commits.

## Refinamento de interface após homologação da PR #129 — 23/11/2026

O hero apresenta o contato da sala no lugar do parágrafo institucional, sem faixa
separada nem título amarelo. A edição do contato continua exclusiva da gestão,
com a mesma versão otimista, validação e auditoria. O indicador de disponibilidade
e o temporizador permanecem no hero; o resumo elimina a repetição da situação.

A RPC `room_booking_summary` acrescenta `upcoming`: até duas reservas confirmadas
com início posterior a `server_now`, em ordem cronológica, sem limite de distância
entre datas. Cada item contém somente `booked_for`, `starts_at` e `ends_at`, campos
já públicos na agenda autorizada. O nome apresentado é o informado em **Reservado
para**, não a identidade de quem criou a reserva. Contagem de hoje, próxima data e
lista usam o mesmo instante do servidor e independem da data selecionada na agenda.
Não inclui canceladas, pedidos pendentes, finalidade privada nem identidade do autor.
A atualização periódica, retorno à aba, atualização manual e fronteira temporal
reconsultam o resumo. Ausência de reservas exibe “Nenhuma prevista”.

A agenda e **Solicitar horário** compartilham uma seção. **Novo pedido**, **Reserva
direta** e **Editar reserva** usam o mesmo `Modal` de Comunicados: diálogo nativo,
foco contido, retorno ao acionador, fechamento por botão, overlay ou Escape. Enquanto
a gravação aguarda resposta, os fechamentos ficam bloqueados. Validações e falhas
ficam dentro do modal. Solicitar, aprovar, recusar e alternar modos preservam D5-C.

```mermaid
flowchart LR
    A[Agenda] --> B[Solicitar horário]
    B --> C[Modal Novo pedido]
    C --> D[Pedido pendente]
    D --> E[Decisão da gestão]
    E --> F[Reserva confirmada na agenda e resumo]
```

Os papéis `room_booking_manager` e `room_booking_requester` permanecem `global_only`.
A sala é recurso global sem `unit_id`/`sector_id`; RPCs usam permissões globais do
Core. Está coerente com AG-01 e ADR-005. Eventual catálogo de salas por unidade
exigirá contrato próprio, revisão dos escopos, RPCs e RLS; não basta liberar unidade
no seletor de atribuições.

Migration append-only `20261123175533_room_booking_hero_upcoming.sql`: substitui
somente a projeção da RPC, conserva assinatura, owner, ACL e autorização existentes,
e reutiliza o índice parcial `bookings_schedule`. Não muda papéis, políticas RLS,
atribuições nem dados de reservas. O frontend conserva leitura da data antiga se
`upcoming` ainda não estiver disponível; duas reservas nominais exigem a migration.
No DEV local, aplicação incremental deve ser ensaiada com rollback e conferir os
dados e o ledger. Não aplicar em C30/STAGING/PROD por esta entrega. Reversão visual
pode usar o commit anterior, mantendo a projeção aditiva; eventual correção de banco
deve ser uma nova migration, preservando os dados.

Validação de UI reproduzível: `node tests/integration/room-booking-ux-browser.mjs`
com Vite ativo em `http://127.0.0.1:5173`. Usa Auth/REST sintéticos interceptados,
sem gravar no banco, e verifica requester, manager e administrador em 1280/320 px,
hero, integração da agenda, modal, foco, Escape, botão, overlay e estado vazio.
Capturas ficam em `/tmp/room-booking-ux` ou `ROOM_UX_ARTIFACTS`. A suíte
`room-booking-experience.test.ts` verifica a projeção real no PGlite, inclusive
reservas com meses de distância, campos restritos e negativa sem identidade.

Resultado no notebook em 23/11/2026: 70 testes das nove suítes de Salas/Comunicados
passaram; typecheck, build, verify:build e auditoria npm passaram (zero
vulnerabilidades). O lint passou excluindo `tmp/**`; a execução sem exclusão
continua apontando `no-empty` em um script local preexistente de limpeza. O smoke
Chromium acima passou nas três identidades sintéticas e nas duas larguras. A RPC
foi ensaiada com sessão local admitida e rollback, verificando formato, negativa
sem identidade e ACL; em seguida a migration foi aplicada e registrada no ledger
local. Comparação antes/depois confirmou usuários, atribuições, reservas, pedidos,
auditoria e objetos preservados. A suíte completa no sandbox teve 1.192 PASS e
10 falhas em duas suítes fora de Salas; ambas passaram isoladamente fora do sandbox
(39 testes). A repetição completa fora do sandbox terminou com sinal 143, sem
resultado conclusivo. A homologação humana desta nova apresentação e o aceite de
merge permanecem pendentes; o relato de homologação anterior da PR #129 refere-se
à funcionalidade antes deste refinamento.
