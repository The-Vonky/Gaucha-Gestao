# Agendamento de Salas v1 — Critérios de aceite e matriz de testes

Status: PROPOSTO (AG-00; revisão documental de 23/10/2026, Issue #83) — **sem aceite humano integral**  
Brief: `docs/briefs/ROOM_BOOKING_V1.md`

Cada critério indica a etapa que o comprova. Uma etapa só é concluída com evidência executada (comando, SHA e resultado) e não com a afirmação de quem implementou. Itens que dependem de decisões ainda pendentes estão marcados com **[Dn]**.

## Gate AG-00 — decisões, evidências e aceite humano

- [ ] Fluxos, máquinas de estado, visibilidade de `booked_for`/**observações públicas** e matriz de acesso validados pela secretária e dono do produto, com privacidade revisada.
- [ ] Registrar como **escolhas comunicadas**, não como aprovações: D2 (pedidos pendentes concorrentes), D3 (leitura de `booked_for`), D5-A (administrador pode delegar **e gerenciar**), D8 (início estritamente futuro inclusive hoje; até 23:59 no mesmo dia; sem limites fixos) e C1 (antecipação do desenvolvimento).
- [ ] **F2:** decidir se pedido sobre reserva já confirmada deve ser rejeitado no envio (comportamento atual do brief); D2 não responde F2.
- [ ] **D8:** aceitar tratamento de pedido pendente vencido e edição histórica; validar semântica de `23:59`, precisão de entrada e relógio do backend.
- [ ] Revisão humana **independente de segurança** da D5-A, incluindo grant real de `manage`, delegação, revogação e auditoria; orientação operacional não é proteção técnica.
- [ ] Confirmar D1/D4/D6/D7/D9/D10/D11, provisionamento de solicitantes e preservação do legado.
- [ ] Inventário real do legado e agenda atual conferidos por pessoa autorizada, sem importar ou publicar dados privados.
- [ ] Prioridade C1 ratificada formalmente, sem afastar Qualidade P1–P9/O1–O8 e PROD NO-GO.
- [ ] Aceite rastreável do responsável/secretária, PR **somente documental** com revisão humana e integração; **não iniciar AG-01** antes de fechar todo o gate.

## Critérios funcionais

| ID | Critério | Etapa |
|---|---|---|
| F1 | Pedido válido fica `pending` e **não** aparece na agenda de confirmados | AG-02/03 |
| F2 | **PENDENTE DE DECISÃO:** regra do brief atual rejeita pedido sobre reserva **já confirmada** no envio com “horário ocupado”; D2 sobre pedidos pendentes não autoriza alterá-la. Testar o resultado **após aprovação humana de F2** | AG-00/02/03 |
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
| F13 | Banco/RPC: `ends_at > starts_at`, mesmo dia civil em São Paulo, término `<= 23:59`, início estritamente no futuro inclusive hoje. **Sem** limite de expediente, duração mínima/máxima, antecedência máxima ou grade compulsória de 15 min; verificações em T4–T9 **[D8: bordas pendentes]** | AG-01/02/04 |
| F14 | Consulta da agenda limitada por período; não carrega o histórico inteiro | AG-02/03 |
| F15 | Gestora cria/edita `secretary_notes` opcional de reserva confirmada/direta, sem alterar `purpose` privado do pedido; preservar versão/auditoria | AG-02/03/04 |
| F16 | Pedidos `pending` sobrepostos coexistem sem ocupar agenda; somente reserva `confirmed` bloqueia horário, inclusive na corrida (F4/C1/C2) | AG-02/04 |

## Autorização e privacidade

| ID | Critério | Etapa |
|---|---|---|
| S1 | Sem papel do módulo: leitura e mutações negadas via UI, REST e RPC | AG-01/02 |
| S2 | Perfil inativo com sessão válida: tudo negado | AG-01/02 |
| S3 | Revogação do papel durante a sessão: a próxima chamada é negada, sem esperar o JWT expirar | AG-01/02 |
| S4 | Solicitante não aprova, recusa, cria reserva direta, edita nem cancela reserva — inclusive por RPC direta | AG-01/02 |
| S5 | Solicitante não lê pedidos alheios por ID adivinhado, por REST nem por RPC | AG-01/02 |
| S6 | Agenda autorizada (`schedule.read` + perfil ativo) retorna **apenas confirmadas** com identificador/sala/início/fim, **`booked_for` e `secretary_notes`**; não retorna `purpose`, `requester_user_id`, `decided_by`, decisões internas nem pedidos pendentes **[D3: privacidade a validar]** | AG-02/03/04 |
| S7 | `requester_user_id` enviado pelo cliente é ignorado ou rejeitado; vale `auth.uid()` | AG-02 |
| S8 | Sem `insert/update/delete` direto nas tabelas para `authenticated`/`anon`; RLS habilitada em todas | AG-01 |
| S9 | RPCs `SECURITY DEFINER` com `search_path=''` e `execute` revogado de `public`/`anon` | AG-01/02 |
| S10 | Sob **D5-A escolhida mas ainda sem parecer de segurança**, `platform_administrator` com `manage` pode **tecnicamente** delegar e aprovar/recusar/criar/editar/cancelar via RPC; validar alcance real, revisão independente e auditoria, sem alegar bloqueio apenas por UI | AG-00/01/02/04 |
| S11 | Atribuição de `room_booking_manager` a uma substituta e a revogação no retorno funcionam e ficam auditadas **[D5/D6]** | AG-01/05 |
| S12 | Auditoria registra ator, ação e entidade de cada mutação, sem `purpose` nem texto integral de `secretary_notes` nos metadados por padrão | AG-02/04 |
| S13 | `anon` não acessa nada do schema | AG-01 |
| S14 | Usuário autorizado `schedule.read` vê `booked_for` e notas **de confirmadas**; usuário sem papel, perfil inativo, anônimo ou com permissão revogada não acessa esses campos, nem por REST/RPC/ID adivinhado | AG-01/02/04 |
| S15 | `secretary_notes` com HTML/script é renderizado como **texto inerte** na agenda, não vaza a pedidos alheios, fila pública nem logs; solicitante não pode escrever/editar notas por payload forjado | AG-02/03/04 |

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
| T4 | Criação por RPC de pedido ou reserva com **data civil anterior a hoje em São Paulo** é recusada no banco, independentemente de relógio/locale do cliente | AG-01/02/04 |
| T5 | Criação **hoje** com `starts_at <= now()` do backend/banco (hora passada **ou exatamente agora**) é recusada por RPC; navegador com relógio adiantado/atrasado não contorna a regra | AG-01/02/04 |
| T6 | Pedido e reserva direta que passam da meia-noite são recusados; término exatamente **23:59** no mesmo dia é permitido se os demais invariantes forem válidos; não converter para 00:00 | AG-01/02/04 |
| T7 | Durações positivas arbitrárias, sem expediente, antecedência máxima ou grade fixa de 15 minutos, e horários adjacentes com intervalo `[início, fim)` são válidos, observado o limite do dia | AG-01/02/04 |
| T8 | Backend revalida o instante na gravação após o formulário ficar aberto/relógio avançar; início que deixou de ser futuro é recusado na criação. Resultado de **aprovação de pedido já vencido fica pendente de decisão D8** | AG-00/02/04 |
| T9 | Mesmo dia civil e instante efetivo `timestamptz` são avaliados em `America/Sao_Paulo` com processo/navegador em `TZ=UTC` e `TZ=Asia/Tokyo` | AG-02/03/04 |

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
| U9 | Agenda confirmada apresenta `booked_for` e observação pública como texto seguro, com orientação contra informações sensíveis; finalidade privada e pedidos pendentes não aparecem | AG-03/04/05 |

## Interpretação das etapas

A numeração **canônica** é **AG-03: interface completa (inclusive secretaria)**, **AG-04: QA/revisão independente**, **AG-05: homologação humana**. O plano de 19/10 usava AG-04 para a interface da secretária e AG-05 para QA; essa nomenclatura foi corrigida para as etapas futuras, **sem reescrever o parecer histórico** `AG04_AG05_AUDIT_20261021.md`. Os casos F/S/C/T/U acima são **especificações de testes futuros**, não testes automatizados/executados pelo AG-00.

## Regressão e verificação técnica

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:build` executados no SHA do PR, com saída registrada.
- [ ] `npm run test:rls` e `npm audit --audit-level=moderate` quando pertinentes, com resultado e SHA registrados.
- [ ] Testes de banco do Core, Audit, Action Plans e ABC continuam passando.
- [ ] Migration aplicada do zero em PostgreSQL real; disponibilidade de `btree_gist` confirmada no alvo.
- [ ] Rollback da migration descrito e testado em ambiente isolado.

## Homologação (AG-05)

- [ ] Roteiro de 15–20 min executado pela secretária com dados sintéticos: fila, aprovar, recusar, reserva direta, editar, cancelar.
- [ ] Dois usuários comuns enviam pedidos conflitantes, e o resultado é o esperado em F4.
- [ ] Validar `booked_for` e observações públicas com solicitantes autorizados e negação a não autorizados; testar texto potencialmente sensível e política de exposição.
- [ ] Confirmar comportamento de hoje, futuro, `23:59` e mensagens nas bordas já decididas, com pendências D8/F2 fechadas antes da homologação.
- [ ] Desktop e pelo menos um celular real validados.
- [ ] Aceite expresso da secretária sobre facilidade de uso, visibilidade e decisões.

## Corte (AG-06) — somente com GO global

- [ ] Reservas futuras conferidas no computador da secretária e reconciliadas no módulo.
- [ ] Legado congelado durante a janela; nunca duas agendas aceitando reservas ao mesmo tempo.
- [ ] Backup do legado e do novo, e rollback com reconciliação documentado.
