# Implementation Brief — Agendamento de Salas v1 (AG-00)

Status: PROPOSTO — aguardando aceite humano (dono do produto + secretária). **Não autoriza implementação.**  
Date: 2026-10-20  
Baseline: `main` em `fed0e0f`  
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
| `docs/migration/MODULE_ROADMAP.md` | Legado "finished, weak"; recriar na plataforma. **4º item da Fase 2, depois do fechamento da Qualidade** (ver conflito C1). |
| `docs/architecture/AUTHORIZATION.md`, `supabase/migrations/202609240001_core_foundation.sql` | Modelo de permissão/escopo, `private.has_global_permission`, `private.can_delegate`, `core.system_audit_log`. |
| `supabase/migrations/20261020120000_abc_domain_v1.sql` | Padrão atual para registrar permissões e papéis de um módulo novo. |
| `supabase/config.toml` | Schemas expostos: `public, graphql_public, core, audit, action_plans, abc`. |
| `docs/planning/PLANO_DIRETOR_2026.md` | Plataforma em **NO-GO** de produção. |

Nenhum teste operacional foi feito com a secretária ou no computador dela.

## Conflitos com a documentação existente

| # | Conflito | Proposta | Decide |
|---|---|---|---|
| C1 | O roadmap põe o Agendamento como 4º item da Fase 2, *depois* do fechamento da Qualidade, das Propostas ISO, de Vendas e da Pesquisa de Satisfação. | Se o responsável antecipar o módulo, atualizar o `MODULE_ROADMAP.md` no PR de aceite, como foi feito com a Curva ABC (D1 de `ABC_DOMAIN_V1.md`). | Dono do produto |
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
| Bloqueio de conflito `[início, fim)` | sim, na aplicação | sim, no banco, sob concorrência; adjacência permitida | CÓDIGO → reforçado |
| Atualização a cada 5 s + manual | polling | recarregar após mutação e ao voltar à aba; polling moderado opcional | CÓDIGO → adaptado |
| Login/cookie/senha próprios | sim | **não migrar**; Supabase Auth | CÓDIGO → descartado |
| Pedido → aprovação/recusa | não existe | fila da secretária | NOVO |
| Meus pedidos | não existe | status e motivo da recusa | NOVO |
| Auditoria | não existe | `core.system_audit_log` | NOVO |

## Objetivo v1

Ao final, um usuário autorizado deve conseguir:

- abrir `Administrativo > Agendamento de Salas`;
- ver os horários **confirmados** de um dia/semana, sem dados pessoais de terceiros (D3);
- pedir um horário e ver o pedido como "Aguardando aprovação", nunca como reserva;
- acompanhar em "Meus pedidos" o status e o motivo da recusa;
- cancelar o próprio pedido enquanto estiver pendente (D7).

A secretária (gestora) deve conseguir:

- ver a fila de pedidos pendentes com os dados completos;
- aprovar (cria a reserva de forma atômica) ou recusar, com motivo opcional;
- receber conflito tratável se a faixa já tiver sido ocupada;
- criar reserva direta, por exemplo para um pedido feito por telefone;
- alterar ou cancelar uma reserva confirmada, preservando o histórico.

## Fora de escopo v1

Recorrência; várias salas operáveis; convites/participantes; Outlook/Google Calendar; e-mail/WhatsApp; anexos; aprovação por várias pessoas; acesso sem login; migração de código; sincronização com a intranet; dashboards; "propor outro horário" (v1: recusar com motivo e o usuário faz novo pedido); Realtime e Edge Functions.

## Decisões propostas (defaults — nenhuma está aprovada)

| # | Decisão | Default proposto | Estado |
|---|---|---|---|
| D1 | Salas | Uma sala, "Sala de Reunião", sem vínculo com unidade (permissões de escopo global) | Validar com a secretária (Q1) |
| D2 | Pedidos em colisão | Pedidos pendentes não bloqueiam a agenda e podem coexistir. A exclusividade só vale para reservas confirmadas e é garantida no banco | Validar (Q4) |
| D3 | Visibilidade pública | Solicitantes veem apenas "Ocupado" + faixa de horário. `booked_for`, finalidade, solicitante e decisões ficam visíveis só ao dono do pedido e à gestora | Validar (Q2/Q7) — o legado mostrava o nome |
| D4 | Permissões | Catálogo e papéis abaixo; nada de `role === 'secretaria'` | Aprovar |
| D5 | Atribuição da gestão (C2) | **Opção A (recomendada):** incluir `room_booking.manage` no `platform_administrator`, que já é um papel privilegiado e auditado, apenas para viabilizar a atribuição. Registrar a regra operacional "administrador não opera a fila" e auditar toda decisão com o `auth.uid()`. **Opção B:** não incluir; a gestora e a substituta são provisionadas por operação privilegiada fora da UI, com runbook (mais restrito, porém cada troca de substituta passa a depender de operação técnica). **Opção C:** mudar o Core — fora do escopo deste módulo | Decisão humana obrigatória |
| D6 | Ausência da secretária | Papel `room_booking_manager` atribuído temporariamente a uma substituta nomeada e revogado no retorno; ambos os atos auditados pelo Core | Validar (Q6) |
| D7 | Cancelar o próprio pedido | Permitido enquanto estiver `pending`; reservas confirmadas só a gestora cancela | Aprovar |
| D8 | Horário | Hora civil em `America/Sao_Paulo`; `timestamptz` no banco; fim > início; início e fim no mesmo dia civil; sem pedido/reserva no passado; granularidade de 15 min. Expediente, duração mín./máx. e antecedência máxima ficam **pendentes** (Q3) até a resposta da secretária | Validar (Q3) |
| D9 | Alertas | Somente na aplicação (fila e status); sem e-mail/WhatsApp | Aprovar |
| D10 | Rota | `/rooms` no grupo `Administrativo` | Aprovar |
| D11 | Legado | Sem migração de código. No corte, cadastro manual (ou importação pontual) **só das reservas futuras**, conferidas na agenda atual do computador da secretária | Validar (Q8) |
| D12 | Liberação | Staging/homologação apenas. Produção depende de AG-05 + GO global do Plano Diretor | Restrição documental |

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
| `platform_administrator` | depende de D5 |

**Provisionamento dos solicitantes:** a plataforma não tem "todos os usuários ativos" como papel implícito. Cada funcionário precisa receber `room_booking_requester` (escopo global). O administrador consegue fazer isso hoje, desde que tenha as três permissões de solicitante (C2). Pendência para o AG-01: decidir se o papel é atribuído a cada usuário pela tela atual ou por um passo de provisionamento em lote auditado. Não criar uma regra "qualquer usuário ativo pode", porque isso contorna o modelo de permissões.

Matriz:

| Ação | Solicitante | Gestora | Sem papel / inativo |
|---|:-:|:-:|:-:|
| Ver horários confirmados (saneados) | ✔ | ✔ | ✘ |
| Ver `booked_for`/finalidade de terceiros | ✘ | ✔ | ✘ |
| Criar pedido | ✔ | ✔ | ✘ |
| Ver/cancelar o próprio pedido pendente | ✔ | ✔ | ✘ |
| Ver pedidos de outros | ✘ | ✔ | ✘ |
| Aprovar/recusar | ✘ | ✔ | ✘ |
| Reserva direta, alterar, cancelar reserva | ✘ | ✔ | ✘ |
| Administrar usuários/papéis | não pelo módulo | não pelo módulo | ✘ |

## Fluxos

**Pedido.** Agenda → escolher data, início, fim, "reservado para" e finalidade (opcional) → validação no cliente **e** no banco → `pending`. Se a faixa já cruza uma reserva confirmada, o pedido é recusado na hora com a mensagem "horário ocupado" e não é criado. O solicitante vem de `auth.uid()` e nunca do cliente.

**Decisão.** A fila mostra os pendentes em ordem de início (desempate: criação). *Aprovar* faz numa única transação: trava, revalida status e versão, insere a reserva confirmada com `request_id`, marca o pedido `approved` e registra a auditoria. Se houver colisão, nada é gravado, o pedido continua `pending` e a gestora recebe a mensagem de conflito. *Recusar* leva o pedido a `rejected` com motivo opcional.

**Reserva direta.** A gestora informa faixa e `booked_for`. Aplica-se a mesma regra de exclusividade e a autoria fica registrada.

**Alterar/cancelar reserva.** Só a gestora, com controle de versão: uma edição concorrente gera conflito, nunca sobrescreve em silêncio. O cancelamento leva a reserva a `cancelled` e libera a faixa. Se a reserva veio de um pedido, o solicitante vê "Reserva cancelada pela secretaria".

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
- `room_booking.bookings`: `id`, `room_id`, `request_id` (opcional, único), `booked_for`, `starts_at`/`ends_at`, `status`, `created_by`, `updated_by`, `cancelled_by`/`cancelled_at`/`cancel_reason`, `version`, timestamps.
- Exclusividade: restrição de exclusão sobre `tstzrange(starts_at, ends_at, '[)')` por sala, apenas onde `status = 'confirmed'`. Exige `btree_gist`, que **ainda não é usado no repositório**: o AG-01 precisa confirmar a disponibilidade no PostgreSQL 17 alvo (dev e self-host). A trava transacional por sala complementa a restrição.
- Mutação apenas por RPC `SECURITY DEFINER` com `search_path=''`, `execute` concedido só a `authenticated` e autorização interna no padrão `action_plans_private.authorize` (perfil ativo + permissão, revalidados na transação).
- Leitura da agenda por RPC/visão saneada com período limitado (por exemplo, no máximo 31 dias por consulta). Sem `select` direto nas tabelas para solicitantes.
- Auditoria em `core.system_audit_log` com `module = 'room_booking'`, sem copiar `purpose` para `metadata`.
- O schema `room_booking` só é exposto em `supabase/config.toml` e na configuração real do ambiente se houver tabela/visão acessível pelo cliente. Se tudo for RPC, avaliar expor apenas o necessário.

## Contratos (para AG-02, nomes indicativos)

| Operação | Quem | Retorno / erros |
|---|---|---|
| `list_schedule(from, to)` | `schedule.read` | faixas confirmadas `{id, starts_at, ends_at}`; `booked_for` apenas para `manage` · `22023` período inválido/longo |
| `create_request(starts_at, ends_at, booked_for, purpose?, idempotency_key)` | `request.create` | pedido · `23P01`/conflito: horário ocupado · `22023` validação |
| `list_my_requests(limit, cursor)` | `read_own` | próprios pedidos + estado da reserva vinculada |
| `cancel_my_request(id, version)` | `read_own` + dono | `409` versão/estado |
| `list_queue(status, limit, cursor)` | `manage` | pedidos com dados completos |
| `approve_request(id, version)` / `reject_request(id, version, reason?)` | `manage` | reserva/pedido · conflito de faixa · estado terminal |
| `create_booking(...)`, `update_booking(id, version, ...)`, `cancel_booking(id, version, reason?)` | `manage` | reserva · conflito · versão |

Os códigos exatos de erro seguem o padrão já adotado em `action_plans`/`abc` e são definidos no AG-01/02.

## Ameaças principais

| Ameaça | Controle |
|---|---|
| Solicitante aprova via REST/RPC direto | `manage` checado dentro da RPC; sem grants de escrita nas tabelas |
| Leitura de pedidos alheios por ID | RLS/RPC filtra por `auth.uid()`; sem `select` direto |
| Dupla reserva sob corrida | restrição de exclusão + trava por sala + teste concorrente em PG real |
| Revogação durante a sessão | permissão revalidada no banco em cada chamada; nada vem do JWT |
| Vazamento de dados pessoais na agenda | visão saneada (D3); auditoria sem `purpose` |
| Gestão concedida amplamente | D5 decidida explicitamente; papel `global_only`; teste "admin sem manage não aprova" se A não for escolhida |
| Fuso errado | `timestamptz` + conversão explícita `America/Sao_Paulo` + testes com TZ do processo diferente |

## Operação com o legado

O legado continua oficial e não é alterado. O desenvolvimento usa apenas dados sintéticos. No pré-corte (AG-06), as reservas futuras são conferidas **diretamente no computador da secretária**: o ZIP é só um retrato e não prova a agenda atual. No corte, o legado é congelado por uma janela curta, as reservas são reconciliadas e o endereço único é comunicado. Duas agendas não podem aceitar reservas ao mesmo tempo. O rollback inclui reconciliar o que foi criado no módulo novo.

## Perguntas para a secretária / dono do produto

1. Uma única sala para toda a empresa? O nome é "Sala de Reunião"? Há unidade/filial relevante? (D1)
2. Os outros funcionários veem só "ocupado" ou também quem reservou e a finalidade? (D3)
3. Qual o expediente da sala, a duração mínima/máxima, a antecedência máxima e se aceita pedido no mesmo dia? (D8)
4. Pedidos em conflito podem coexistir e você decide (recomendado), ou o segundo deve ser bloqueado? (D2)
5. Recusar com motivo e pedir novo pedido atende, sem "propor outro horário" na v1?
6. Quem substitui você em férias/ausência, e quem autoriza essa substituição? (D6)
7. Que campos o pedido precisa ter: assunto, setor, nº de participantes? Quais são públicos? (D3)
8. Quantas reservas futuras existem hoje e quem confere a equivalência no corte? (D11)
9. Todos os usuários entram pelo login do Gaúcha Gestão? (assumido: sim)
10. O administrador técnico pode ter capacidade de gestão para emergência? Quem autoriza? (D5)
11. (Dono do produto) O módulo é antecipado em relação à ordem da Fase 2? (C1)

## Próximo passo

Aceite humano deste brief e de `ACCEPTANCE_V1.md` (fluxo, matriz, D2, D3, D5, operação com o legado). Só depois disso o AG-01 (dados/RLS) pode começar. Nenhum agente deve avançar para a implementação de forma autônoma.
