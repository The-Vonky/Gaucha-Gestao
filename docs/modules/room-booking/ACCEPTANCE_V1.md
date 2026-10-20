# Agendamento de Salas v1 — Critérios de aceite e matriz de testes

Status: PROPOSTO (AG-00) — aguardando aceite humano  
Brief: `docs/briefs/ROOM_BOOKING_V1.md`

Cada critério indica a etapa que o comprova. Uma etapa só é concluída com evidência executada (comando, SHA e resultado) e não com a afirmação de quem implementou. Itens que dependem de decisões ainda pendentes estão marcados com **[Dn]**.

## Gate AG-00 — brief

- [ ] Fluxos, máquinas de estado e matriz de acesso aceitos pelo dono do produto.
- [ ] D2 (colisão), D3 (visibilidade), D5 (atribuição da gestão) e D8 (regras de horário) respondidas e registradas no brief.
- [ ] Inventário legado × v1 conferido contra o ZIP por quem tem acesso a ele.
- [ ] Prioridade em relação ao roadmap decidida (C1).
- [ ] Respostas da secretária registradas, sem dados pessoais.

## Critérios funcionais

| ID | Critério | Etapa |
|---|---|---|
| F1 | Pedido válido fica `pending` e **não** aparece na agenda de confirmados | AG-02/03 |
| F2 | Pedido que cruza uma reserva confirmada é rejeitado com a mensagem "horário ocupado" e não é criado | AG-02/03 |
| F3 | Faixas adjacentes (fim A = início B) são aceitas | AG-01/02 |
| F4 | Dois pedidos pendentes idênticos coexistem; aprovar o primeiro funciona; aprovar o segundo retorna conflito e ele continua `pending` **[D2]** | AG-02/04 |
| F5 | Aprovação cria exatamente uma reserva vinculada ao pedido, com `decided_by = auth.uid()` | AG-02 |
| F6 | Recusa grava o motivo opcional, e o solicitante vê o status e o motivo em "Meus pedidos" | AG-02/03/04 |
| F7 | Estados terminais não mudam: aprovar/recusar/cancelar de novo retorna erro sem efeito | AG-02 |
| F8 | Reserva direta respeita a mesma exclusividade e registra a autoria | AG-02/04 |
| F9 | Edição com versão desatualizada retorna conflito e não sobrescreve | AG-02/04 |
| F10 | Cancelamento leva a `cancelled`, libera a faixa e mantém o registro; não há exclusão física | AG-02/04 |
| F11 | Solicitante cancela o próprio pedido `pending`, mas não o de outro nem um já aprovado **[D7]** | AG-02/03 |
| F12 | Clique duplo / reenvio do mesmo pedido cria um único registro (idempotência) | AG-02/03 |
| F13 | Validações no banco: fim > início, mesmo dia civil, sem passado, granularidade e limites de D8 **[D8]** | AG-01/02 |
| F14 | Consulta da agenda limitada por período; não carrega o histórico inteiro | AG-02/03 |

## Autorização e privacidade

| ID | Critério | Etapa |
|---|---|---|
| S1 | Sem papel do módulo: leitura e mutações negadas via UI, REST e RPC | AG-01/02 |
| S2 | Perfil inativo com sessão válida: tudo negado | AG-01/02 |
| S3 | Revogação do papel durante a sessão: a próxima chamada é negada, sem esperar o JWT expirar | AG-01/02 |
| S4 | Solicitante não aprova, recusa, cria reserva direta, edita nem cancela reserva — inclusive por RPC direta | AG-01/02 |
| S5 | Solicitante não lê pedidos alheios por ID adivinhado, por REST nem por RPC | AG-01/02 |
| S6 | A agenda vista pelo solicitante não contém `booked_for`, `purpose`, solicitante nem dados de decisão **[D3]** | AG-02/03 |
| S7 | `requester_user_id` enviado pelo cliente é ignorado ou rejeitado; vale `auth.uid()` | AG-02 |
| S8 | Sem `insert/update/delete` direto nas tabelas para `authenticated`/`anon`; RLS habilitada em todas | AG-01 |
| S9 | RPCs `SECURITY DEFINER` com `search_path=''` e `execute` revogado de `public`/`anon` | AG-01/02 |
| S10 | Administrador da plataforma: comportamento conforme D5 testado explicitamente (pode ou não pode aprovar) **[D5]** | AG-01 |
| S11 | Atribuição de `room_booking_manager` a uma substituta e a revogação no retorno funcionam e ficam auditadas **[D5/D6]** | AG-01/05 |
| S12 | Auditoria registra ator, ação e entidade de cada mutação, sem `purpose` nos metadados | AG-02 |
| S13 | `anon` não acessa nada do schema | AG-01 |

## Integridade e concorrência (PostgreSQL real, não mock)

| ID | Critério | Etapa |
|---|---|---|
| C1 | Duas aprovações simultâneas de pedidos sobrepostos geram exatamente uma reserva | AG-01/02 |
| C2 | Aprovação + reserva direta simultâneas na mesma faixa geram exatamente uma reserva | AG-02 |
| C3 | Duas edições simultâneas da mesma reserva: uma vence e a outra recebe conflito de versão | AG-02 |
| C4 | Revogação concorrente com aprovação: a aprovação não é efetivada depois da revogação confirmada | AG-02 |
| C5 | Falha no meio da aprovação não deixa pedido `approved` sem reserva, nem reserva sem pedido atualizado | AG-02 |

## Datas e fuso

| ID | Critério | Etapa |
|---|---|---|
| T1 | Horário informado como 09:00 em `America/Sao_Paulo` é gravado como `12:00Z` e exibido como 09:00 | AG-02/03 |
| T2 | Exibição correta com o fuso do navegador/processo de teste diferente (por exemplo, `TZ=UTC` e `TZ=Asia/Tokyo`) | AG-03/04 |
| T3 | Formatos pt-BR em datas e horas | AG-03/04 |

## Interface

| ID | Critério | Etapa |
|---|---|---|
| U1 | Destino "Agendamento de Salas" em `Administrativo`, visível só com permissão do módulo; nada em `Administração` | AG-03 |
| U2 | Área de gestão visível só com `manage`, e o bloqueio real também existe no banco (S4) | AG-04 |
| U3 | Estados loading, vazio, erro, conflito, sessão expirada e sem permissão | AG-03/04 |
| U4 | Pedido nunca é exibido como reserva confirmada | AG-03 |
| U5 | Recarrega após mutação e ao voltar à aba | AG-03/04 |
| U6 | Uso por teclado, foco visível, labels associados, status não depende só de cor | AG-03/04 |
| U7 | Funciona em viewport de celular (fluxo de pedido e fila) | AG-03/04/05 |
| U8 | Sem segundo login nem senha própria do módulo | AG-03/04 |

## Regressão e verificação técnica

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:build` executados no SHA do PR, com saída registrada.
- [ ] Testes de banco do Core, Audit, Action Plans e ABC continuam passando.
- [ ] Migration aplicada do zero em PostgreSQL real; disponibilidade de `btree_gist` confirmada no alvo.
- [ ] Rollback da migration descrito e testado em ambiente isolado.

## Homologação (AG-05)

- [ ] Roteiro de 15–20 min executado pela secretária com dados sintéticos: fila, aprovar, recusar, reserva direta, editar, cancelar.
- [ ] Dois usuários comuns enviam pedidos conflitantes, e o resultado é o esperado em F4.
- [ ] Desktop e pelo menos um celular real validados.
- [ ] Aceite expresso da secretária sobre facilidade de uso, visibilidade e decisões.

## Corte (AG-06) — somente com GO global

- [ ] Reservas futuras conferidas no computador da secretária e reconciliadas no módulo.
- [ ] Legado congelado durante a janela; nunca duas agendas aceitando reservas ao mesmo tempo.
- [ ] Backup do legado e do novo, e rollback com reconciliação documentado.
