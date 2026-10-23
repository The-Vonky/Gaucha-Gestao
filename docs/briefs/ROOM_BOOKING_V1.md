# Implementation Brief — Agendamento de Salas v1 (AG-00)

Status: PROPOSTO — AG-00 em revisão documental; requer aceite humano do dono do produto e da secretária, e parecer de segurança para D5-A. **Não autoriza implementação.**  
Elaboração: 2026-10-20 · Revisão documental: 2026-10-23 (Issue #83)  
Baseline desta revisão: `main` em `338cd4adb8eab00ff85312833f29919a6294893d`  
Critérios de aceite: `docs/modules/room-booking/ACCEPTANCE_V1.md`

> Este brief define o módulo **Administrativo > Agendamento de Salas**. Funcionários autenticados consultam horários confirmados e pedem o uso da sala. A secretária aprova ou recusa os pedidos e também pode reservar diretamente. O sistema legado da intranet continua sendo a fonte oficial até o corte (AG-06). Este brief não traz SQL, TypeScript, menu nem infraestrutura.

## Princípio de adaptação

A plataforma prevalece. O sistema legado (`Agendamento_funcional/`: React + servidor Node + `data/bookings.json` no computador da secretária) é **referência de comportamento**, não código a portar. Nada no Core, na stack ou na infraestrutura muda para acomodar o módulo.

Não entram neste repositório nem em PR/issue: `config/admin.json`, `data/bookings.json`, logs, nomes reais de pessoas ou reuniões e senhas do legado.

## Evidência e limites desta análise

| Fonte | Como foi usada |
|---|---|
| `Agendamento.zip` | **Não disponível nesta sessão.** O inventário abaixo vem do plano `01_PLANO_IMPLEMENTACAO_AGENDAMENTO.md`, que fez revisão estática do ZIP. É evidência de segunda mão e precisa ser conferida no aceite. |
| `docs/architecture/PRODUCT_STRUCTURE.md` | Local do menu: Administrativo > Agendamento de Salas (domínio Meetings/Room Booking). |
| `docs/migration/MODULE_ROADMAP.md` | Legado "finished, weak"; recriar na plataforma. 4º item histórico da Fase 2; antecipação de desenvolvimento comunicada em 23/10 (C1), com registro de aceite da prioridade ainda pendente e gates globais preservados. |
| `docs/architecture/AUTHORIZATION.md`, `supabase/migrations/202609240001_core_foundation.sql` | Modelo de permissão/escopo, `private.has_global_permission`, `private.can_delegate`, `core.system_audit_log`. |
| `supabase/migrations/20261020120000_abc_domain_v1.sql` | Padrão atual para registrar permissões e papéis de um módulo novo. |
| `supabase/config.toml` | Schemas expostos: `public, graphql_public, core, audit, action_plans, abc`. |
| `docs/planning/PLANO_DIRETOR_2026.md` | Plataforma em **NO-GO** de produção. |

Nenhum teste operacional foi feito com a secretária ou no computador dela.

## Conflitos com a documentação existente

| # | Conflito | Proposta | Decide |
|---|---|---|---|
| C1 | O roadmap punha o Agendamento como 4º item da Fase 2. | Responsável comunicou em 23/10 a antecipação do **desenvolvimento**; documentar no roadmap e obter confirmação rastreável, sem antecipar GO de implantação ou dispensar gates da Qualidade. | Dono do produto; confirmação formal pendente |
| C2 | `private.can_delegate` exige que **quem atribui** um papel tenha todas as permissões desse papel. Se só a secretária tiver `room_booking.manage`, nenhum administrador consegue atribuí-la a ela (nem a uma substituta) pela tela de usuários. | Ver decisão D5. | Dono do produto + responsável de segurança |
| C3 | `AUTHORIZATION.md`: "Do not create future module permissions before those modules are implemented". | O catálogo abaixo é **proposta**. A migration AG-01 o cria junto com as tabelas, e a seção "First permission catalog" é atualizada no mesmo PR. | — |

## Inventário: legado × v1

Legenda: **CÓDIGO** = confirmado no legado (via plano); **NOVO** = requisito novo; **REC** = recomendação deste brief.

| Capacidade | Legado | v1 | Origem |
|---|---|---|---|
| Uma sala, "Sala de Reunião" | constante no frontend | uma sala ativa vinda do banco (seed), sem UI de várias salas | CÓDIGO |
| Agenda consultável | `GET /app-api/bookings` sem login, na LAN | só para usuário autenticado com perfil ativo e permissão | CÓDIGO → mudança |
| Criar/editar/excluir reserva | só a responsável, com login próprio | só quem tem `room_booking.manage`, usando a sessão da plataforma | CÓDIGO → adaptado |
| Exclusão | física no JSON | cancelamento com histórico; sem exclusão física | REC |
| `booked_by` texto | texto livre | `booked_for` texto, **separado** do `requester_user_id` (identidade) | CÓDIGO + NOVO |
| Observação da secretária | não evidenciada no legado revisado | texto livre público nas reservas confirmadas, separado de `purpose` privado, editável por quem tem `manage` | NOVO; validação de privacidade pendente |
| Bloqueio de conflito `[início, fim)` | sim, na aplicação | sim, no banco, sob concorrência; adjacência permitida | CÓDIGO → reforçado |
| Atualização a cada 5 s + manual | polling | recarregar após mutação e ao voltar à aba; polling moderado opcional | CÓDIGO → adaptado |
| Login/cookie/senha próprios | sim | **não migrar**; Supabase Auth | CÓDIGO → descartado |
| Pedido → aprovação/recusa | não existe | fila da secretária | NOVO |
| Meus pedidos | não existe | status e motivo da recusa | NOVO |
| Auditoria | não existe | `core.system_audit_log` | NOVO |

## Objetivo v1

Ao final, um usuário autorizado deve conseguir:

- abrir `Administrativo > Agendamento de Salas`;
- ver os horários **confirmados** com `booked_for` e observações da secretária, apenas com `schedule.read`; não ver pedidos ou finalidades de terceiros (D3 e privacidade em validação);
- pedir um horário e ver o pedido como "Aguardando aprovação", nunca como reserva;
- acompanhar em "Meus pedidos" o status e o motivo da recusa;
- cancelar o próprio pedido enquanto estiver pendente (D7).

A secretária (gestora) deve conseguir:

- ver a fila de pedidos pendentes com os dados completos;
- aprovar (cria a reserva de forma atômica) ou recusar, com motivo opcional;
- receber conflito tratável se a faixa já tiver sido ocupada;
- criar reserva direta, por exemplo para um pedido feito por telefone;
- alterar ou cancelar uma reserva confirmada, inclusive editar suas observações públicas, preservando o histórico.

## Fora de escopo v1

Recorrência; várias salas operáveis; convites/participantes; Outlook/Google Calendar; e-mail/WhatsApp; anexos; aprovação por várias pessoas; acesso sem login; migração de código; sincronização com a intranet; dashboards; "propor outro horário" (v1: recusar com motivo e o usuário faz novo pedido); Realtime e Edge Functions.

## Decisões AG-00 — escolhas comunicadas versus aceites pendentes

A [Issue #83](https://github.com/The-Vonky/Gaucha-Gestao/issues/83) e o plano local revisado em **23/10/2026** registram escolhas comunicadas pelo responsável. **Escolha comunicada não é aceite integral** do AG-00 nem dispensa validação com a secretária, privacidade ou segurança. Os defaults anteriores do brief não devem prevalecer silenciosamente sobre as escolhas, mas decisões abertas continuam explicitamente abertas.

| # | Regra/revisão de 23/10 | Estado / gate |
|---|---|---|
| D1 | Uma sala inicial, “Sala de Reunião”, sem escopo por unidade. | Proposta; confirmar nome, quantidade e escopo com a secretária. |
| D2 | Dois ou mais pedidos `pending` podem ocupar a mesma faixa; **pendentes não bloqueiam a agenda**. Apenas uma reserva `confirmed` por sala/faixa, garantida também sob concorrência; conflito na aprovação preserva o segundo pedido pendente. | Escolha do responsável; validar fluxo com a secretária. **Não resolve F2.** |
| D3 | Na agenda **somente de reservas confirmadas**, usuário autenticado, com perfil ativo e `room_booking.schedule.read`, vê horário, `booked_for` e observação pública da secretária. `purpose`, `requester_user_id`, dados de decisões, fila e pedidos de terceiros não são públicos. | Escolha do responsável; confirmar exposição, privacidade e operação com a secretária. |
| D4 | Quatro permissões e papéis do Core descritos abaixo, sem concessão implícita a qualquer usuário autenticado. | Aprovação e provisionamento de solicitantes pendentes. |
| D5 (C2) | **Opção A escolhida:** `platform_administrator` recebe `room_booking.manage` para poder delegar `room_booking_manager`. Isto **também autoriza tecnicamente** aprovar/recusar/criar/editar/cancelar reservas; “admin não opera a fila” é procedimento, não bloqueio de RPC. | Escolha do responsável **sem aprovação de segurança**. Revisão humana independente e testes de concessão/revogação/auditoria obrigatórios antes do AG-01. |
| D6 | Gestora substituta via papel temporário, com concessão e revogação auditadas. | Confirmar quem autoriza e o fluxo. |
| D7 | Solicitante pode cancelar **seu** pedido enquanto `pending`, não uma reserva confirmada. | Proposta pendente de aceite. |
| D8 | Sem expediente fixo, duração mínima/máxima de negócio, antecedência máxima ou grade obrigatória de 15 minutos. Exigir `ends_at > starts_at`; armazenar `timestamptz` e apresentar a hora em `America/Sao_Paulo`. | Escolha do responsável; validar implementação e precisão de entrada. |
| D8 — futuro | Criação de pedido e reserva direta só com `starts_at` **estritamente maior** que o instante do servidor/banco, **inclusive hoje**. Data civil anterior a hoje em São Paulo é inválida; relógio do navegador não é fonte de autoridade. | Escolha expressa de 23/10, **ainda sem teste e aceite integral**. Tratamento de pedido pendente vencido e edição histórica permanece em aberto. |
| D8 — fim do dia | Início e término no **mesmo dia civil de São Paulo**, com término **no máximo 23:59**, sem exigir término exatamente às 23:59. Intervalo técnico `[início, fim)`; não converter silenciosamente `23:59` em `00:00`. | Escolha do responsável; testar borda de 23:59 e adjacência. |
| D9 | Avisos apenas na aplicação; sem e-mail/WhatsApp. | Proposta pendente de aceite. |
| D10 | Rota `/rooms` em `Administrativo`. | Proposta pendente de aceite. |
| D11 | Legado preservado até corte futuro; reconciliar apenas reservas futuras com agenda oficial atual, mediante autorização. | Procedimento de corte pendente. |
| D12 | Homologação em ambiente autorizado; **PROD NO-GO** até AG-06 e GO global P1–P9/O1–O8. | Restrição obrigatória, não uma decisão a presumir resolvida. |
| C1 | Agendamento antecipado na **fila de desenvolvimento**, não na de implantação/produção. | Escolha comunicada; aceite formal da priorização no PR pendente. |
| Novo — observações | Texto livre da gestora na **reserva confirmada** (inclusive direta), independente da finalidade `purpose` do pedido; editável somente com `manage`, visível a quem tem `schedule.read`. | Escolha do responsável; privacidade, prevenção de dados sensíveis e homologação pendentes. |

**F2 permanece independente de D2:** o fluxo/critério atual rejeita a criação de pedido que colida com uma reserva **já confirmada**. Manter esta regra **como comportamento proposto histórico**, não como decisão aprovada; confirmar se a rejeição no envio deve ser mantida. Não implementar `create_request` sem fechar F2.

**Bordas ainda abertas de D8:** definir como tratar a aprovação de pedido `pending` cujo horário passou e a edição de reservas históricas; confirmar precisão de entrada em minutos e semântica de `23:59`. Validar o instante novamente na transação pertinente, sem deduzir que pedidos antigos possam ser aprovados retroativamente.

## Permissões e papéis (D4)

| Permissão | Capacidade |
|---|---|
| `room_booking.schedule.read` | ver horários confirmados (visão saneada) |
| `room_booking.request.create` | criar pedido próprio |
| `room_booking.request.read_own` | ver os próprios pedidos e cancelá-los enquanto pendentes (D7) |
| `room_booking.manage` | ver a fila completa, aprovar, recusar, reservar diretamente, alterar e cancelar reservas |

`request.cancel_own`, sugerida no plano, foi incorporada a `read_own` para não criar uma permissão que nunca existe sem a outra. Se o responsável preferir separar, a mudança é simples.

| Papel (sistema, `global_only`) | Permissões |
|---|---|
| `room_booking_requester` | `schedule.read`, `request.create`, `request.read_own` |
| `room_booking_manager` | as três acima + `manage` |
| `platform_administrator` | com as quatro permissões **na proposta D5-A**, sujeita à aprovação independente de segurança |

**Provisionamento dos solicitantes:** a plataforma não tem "todos os usuários ativos" como papel implícito. Cada funcionário precisa receber `room_booking_requester` (escopo global). O administrador consegue fazer isso hoje, desde que tenha as três permissões de solicitante (C2). Pendência para o AG-01: decidir se o papel é atribuído a cada usuário pela tela atual ou por um passo de provisionamento em lote auditado. Não criar uma regra "qualquer usuário ativo pode", porque isso contorna o modelo de permissões.

Matriz de capacidades **proposta**, não aprovada (D4/D5-A):

| Ação | Solicitante autorizado | Gestora | `platform_administrator` (D5-A) | Sem papel / inativo / anônimo |
|---|:-:|:-:|:-:|:-:|
| Ver confirmados: horário, `booked_for`, observação pública | ✔ | ✔ | ✔* | ✘ |
| Criar pedido próprio e consultar seus pedidos | ✔ | ✔ | conforme grants* | ✘ |
| Ver `purpose`, autoria e fila de pedidos de terceiros | ✘ | ✔ | ✔* | ✘ |
| Aprovar/recusar, reserva direta, alterar/cancelar | ✘ | ✔ | **✔*** | ✘ |
| Criar/editar observação pública da reserva | ✘ | ✔ | **✔*** | ✘ |
| Delegar/revogar `room_booking_manager` pelo Core | ✘ | não por este módulo | **✔*** | ✘ |

*D5-A requer revisão de segurança; não representa um privilégio já implementado. Quem pode ver uma agenda não recebe acesso à fila, finalidade privada ou identidades técnicas de terceiros. O administrador **poderia operar a fila via RPC** com `manage` — uma orientação operacional em contrário não o impede.

## Fluxos

**Pedido.** Agenda → escolher data, início, fim, "reservado para" e finalidade (opcional) → validação no cliente **e** no banco → `pending`. **F2 pendente:** o brief anterior prevê rejeitar imediatamente pedido que cruze reserva já confirmada (mensagem “horário ocupado”); manter como proposta não aprovada até decisão explícita. A coexistência de dois pedidos `pending` em D2 não altera F2. O solicitante vem de `auth.uid()` e nunca do cliente.

**Decisão.** A fila mostra os pendentes em ordem de início (desempate: criação). *Aprovar* faz numa única transação: trava, revalida status e versão, insere a reserva confirmada com `request_id`, marca o pedido `approved` e registra a auditoria. Se houver colisão, nada é gravado, o pedido continua `pending` e a gestora recebe a mensagem de conflito. Revalidar permissões e horário no backend/banco; caso o início do pedido já tenha transcorrido, o resultado/transição segue **pendente de decisão D8**. *Recusar* leva o pedido a `rejected` com motivo opcional.

**Reserva direta.** A gestora informa faixa, `booked_for` e observação pública opcional, respeitando início estritamente futuro e fim no mesmo dia até 23:59. Aplica-se a mesma regra de exclusividade e a autoria fica registrada.

**Alterar/cancelar reserva.** Só a gestora (ou quem tenha `manage`, conforme D5-A), inclusive para alterar a observação pública, com controle de versão: uma edição concorrente gera conflito, nunca sobrescreve em silêncio. A política de edição de reserva histórica continua pendente. O cancelamento leva a reserva a `cancelled` e libera a faixa. Se a reserva veio de um pedido, o solicitante vê "Reserva cancelada pela secretaria".

**Cancelar o próprio pedido.** `pending → cancelled`, apenas pelo próprio solicitante.

**Idempotência.** O clique duplo/reenvio de *criar pedido* usa uma chave de idempotência do cliente. Uma decisão em estado terminal é rejeitada (não aprova duas vezes).

### Máquinas de estado

```text
Pedido:   pending ──approve──▶ approved
          pending ──reject───▶ rejected
          pending ──cancel───▶ cancelled   (solicitante)
          (approved/rejected/cancelled são terminais)

Reserva:  confirmed ──edit──▶ confirmed (versão+1)
          confirmed ──cancel─▶ cancelled   (terminal)
```

O cancelamento de uma reserva aprovada **não** reabre o pedido: ele continua `approved`, e a tela do solicitante mostra o estado da reserva vinculada.

## Modelo conceitual (sem SQL; detalhado no AG-01)

- `room_booking.rooms`: `id`, `name`, `active`. Seed: uma sala.
- `room_booking.requests`: `id`, `room_id`, `requester_user_id → core.profiles`, `booked_for` (texto), `purpose` (texto opcional, privado), `starts_at`/`ends_at` `timestamptz`, `status`, `decided_by`, `decided_at`, `decision_reason`, `idempotency_key`, `version`, timestamps.
- `room_booking.bookings`: `id`, `room_id`, `request_id` (opcional, único), `booked_for`, `secretary_notes` (texto livre opcional, público **apenas** na agenda autorizada; nome físico proposto para AG-01), `starts_at`/`ends_at`, `status`, `created_by`, `updated_by`, `cancelled_by`/`cancelled_at`/`cancel_reason`, `version`, timestamps.
- Exclusividade: restrição de exclusão sobre `tstzrange(starts_at, ends_at, '[)')` por sala, apenas onde `status = 'confirmed'`. Exige `btree_gist`, que **ainda não é usado no repositório**: o AG-01 precisa confirmar a disponibilidade no PostgreSQL 17 alvo (dev e self-host). A trava transacional por sala complementa a restrição.
- Mutação apenas por RPC `SECURITY DEFINER` com `search_path=''`, `execute` concedido só a `authenticated` e autorização interna no padrão `action_plans_private.authorize` (perfil ativo + permissão, revalidados na transação).
- Leitura da agenda por RPC/visão saneada com período limitado (por exemplo, no máximo 31 dias por consulta). Sem `select` direto nas tabelas para solicitantes.
- Auditoria em `core.system_audit_log` com `module = 'room_booking'`, sem copiar `purpose` nem texto integral de observações públicas para `metadata` por padrão.
- O schema `room_booking` só é exposto em `supabase/config.toml` e na configuração real do ambiente se houver tabela/visão acessível pelo cliente. Se tudo for RPC, avaliar expor apenas o necessário.

## Contratos (para AG-02, nomes indicativos)

| Operação | Quem | Retorno / erros |
|---|---|---|
| `list_schedule(from, to)` | `schedule.read` | **somente confirmadas**, visão saneada `{id, sala, starts_at, ends_at, booked_for, secretary_notes}`; sem `purpose`, solicitante/decisões ou fila · período inválido/longo |
| `create_request(starts_at, ends_at, booked_for, purpose?, idempotency_key)` | `request.create` | pedido pendente · validação de início estritamente futuro/mesmo dia/23:59; regra de colisão com confirmados **F2 pendente**, sem fixar erro/SQLSTATE antes de AG-02 |
| `list_my_requests(limit, cursor)` | `read_own` | próprios pedidos + estado da reserva vinculada |
| `cancel_my_request(id, version)` | `read_own` + dono | `409` versão/estado |
| `list_queue(status, limit, cursor)` | `manage` | pedidos com dados completos |
| `approve_request(id, version)` / `reject_request(id, version, reason?)` | `manage` | reserva/pedido · conflito de faixa · estado terminal |
| `create_booking(...)`, `update_booking(id, version, ...)`, `cancel_booking(id, version, reason?)` | `manage` | reserva · conflito · versão; `secretary_notes` opcional/editável e visível na consulta saneada; política de edição histórica ainda pendente |

Os códigos exatos de erro seguem o padrão já adotado em `action_plans`/`abc` e são definidos no AG-01/02.

## Ameaças principais

| Ameaça | Controle |
|---|---|
| Solicitante aprova via REST/RPC direto | `manage` checado dentro da RPC; sem grants de escrita nas tabelas |
| Leitura de pedidos alheios por ID | RLS/RPC filtra por `auth.uid()`; sem `select` direto |
| Dupla reserva sob corrida | restrição de exclusão + trava por sala + teste concorrente em PG real |
| Revogação durante a sessão | permissão revalidada no banco em cada chamada; nada vem do JWT |
| Exposição excessiva de dados na agenda | `schedule.read` + perfil ativo; apenas confirmadas com `booked_for` e `secretary_notes`; excluir `purpose`, autoria técnica e decisões; auditoria sem texto integral de observações por padrão; aviso de privacidade | 
| HTML/script ou dado confidencial em `secretary_notes` | renderizar como texto (sem HTML executável), orientar a não incluir dados sensíveis e validar exposição na homologação |
| Gestão concedida amplamente | D5 decidida explicitamente; papel `global_only`; teste "admin sem manage não aprova" se A não for escolhida |
| Fuso errado | `timestamptz` + conversão explícita `America/Sao_Paulo` + testes com TZ do processo diferente |

## Operação com o legado

O legado continua oficial e não é alterado. O desenvolvimento usa apenas dados sintéticos. No pré-corte (AG-06), as reservas futuras são conferidas **diretamente no computador da secretária**: o ZIP é só um retrato e não prova a agenda atual. No corte, o legado é congelado por uma janela curta, as reservas são reconciliadas e o endereço único é comunicado. Duas agendas não podem aceitar reservas ao mesmo tempo. O rollback inclui reconciliar o que foi criado no módulo novo.

## Perguntas e deliberações ainda necessárias (AG-00)

1. Confirmar quantidade/nome da sala e se existe escopo de unidade (D1).
2. Validar com a secretária **múltiplos pedidos pendentes** para o mesmo horário e o desempate operacional (D2).
3. Confirmar que quem tem `schedule.read` verá `booked_for` **e observação livre da secretária** nas confirmadas, mas jamais `purpose`, identidade do solicitante, fila ou decisões de terceiros; aceite de privacidade (D3).
4. **F2:** pedido novo que cruza reserva **já confirmada** deve ser recusado no envio (regra histórica) ou aceito como pendente? Não confundir com D2.
5. **D5-A:** obter revisão de segurança independente sobre `platform_administrator` poder **delegar e efetivamente gerenciar** reservas; definir auditoria e revogação; não alegar bloqueio técnico de operação.
6. **D8:** apesar do início estritamente futuro ter sido escolhido, definir pedido pendente cuja hora passou, aprovação tardia e edição de reserva histórica; validar `23:59`, precisão em minutos e intervalos `[início, fim)`.
7. Aprovar D4 e o provisionamento não implícito de `room_booking_requester`; confirmar responsável por substituta D6, cancelamento D7 e avisos D9.
8. Confirmar rota D10, procedimento de preservação/corte D11 e campos operacionais indispensáveis.
9. Conferir, sem copiar nem expor dados reais, a instalação e agenda atual da secretária; o ZIP não foi reavaliado nesta revisão.
10. Registrar aceite formal da **antecipação do desenvolvimento** C1, sem alterar gates de Qualidade, C30/STAGING ou produção.
11. Registrar na Issue #83 responsáveis, datas, evidências e decisão final do brief/matriz antes de AG-01.

## Sequência AG-00 a AG-06 e conciliação histórica

O plano inicial de 19/10 chamava **AG-04** a interface da secretária e **AG-05** os testes/QA. A convenção **canônica** do brief/Issue #83 e desta revisão é: **AG-03 = interface completa** (agenda, meus pedidos, fila e editor da gestora); **AG-04 = revisão técnica/QA**; **AG-05 = homologação com secretária e responsável**. Não eliminar a interface da secretária nem renumerar o relatório histórico `AG04_AG05_AUDIT_20261021.md` retroativamente.

| Etapa | Conteúdo | Gate |
|---|---|---|
| AG-00 | Documentação, decisões D1–D12/C1/F2, privacidade e aceites humanos | PR documental revisada **e integrada**, decisões fechadas, revisão de segurança D5-A |
| AG-01 | Modelo, catálogo Core, RLS/grants e invariantes em migration **nova** | AG-00 aceito |
| AG-02 | RPCs de consulta e mutação, idempotência, concorrência e auditoria | AG-01 + F2 resolvido |
| AG-03 | **Toda** interface, inclusive fila/editor da secretária e observações públicas | AG-02 estável |
| AG-04 | QA, matriz F/S/C/T/U e revisão independente em banco real isolado | AG-01/02/03 |
| AG-05 | Homologação funcional com contas sintéticas e aceite humano | AG-04 |
| AG-06 | Corte e reconciliação do legado em ocasião posterior | GO global P1–P9/O1–O8, backups e autorização formal |

As operações ficam no banco com permissão atual e checagem de perfil ativo; esconder UI não é controle de autorização. Nenhuma etapa aqui autoriza mudanças no DEV compartilhado, STAGING da C30 ou PROD.

## Próximo passo

Fechar F2, as bordas de D8, D4/D6/D7/D9/D10/D11, privacidade e a revisão de segurança D5-A; obter aceite humano rastreável deste brief e de `ACCEPTANCE_V1.md`, atualizar o registro e integrar a PR AG-00. Só depois disso o AG-01 (dados/RLS) pode começar. Nenhum agente deve avançar para a implementação de forma autônoma.
