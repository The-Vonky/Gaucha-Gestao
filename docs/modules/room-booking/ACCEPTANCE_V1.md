# Agendamento de Salas v1 — Critérios de aceite e matriz de testes

Status: PROPOSTO (AG-00; revisão documental de 23/10/2026, Issue #83) — **sem aceite humano integral**  
Brief: `docs/briefs/ROOM_BOOKING_V1.md`

Cada critério indica a etapa que o comprova. Uma etapa só é concluída com evidência executada (comando, SHA e resultado) e não com a afirmação de quem implementou. Itens que dependem de decisões ainda pendentes estão marcados com **[Dn]**.

## Gate AG-00 — decisões, evidências e aceite humano

- [x] **Decisões atuais dos fluxos, matriz e exposição de `booked_for`/`secretary_notes` validadas com a secretária conforme relato do responsável (23/10)**. Relato não equivale a ata/review assinados; formalizar no aceite documental.
- [x] **Decisões de produto D2/D3/D5-A/D8/C1 registradas**; D5-A aprovou ampliação de capacidade do administrador apenas na esfera do responsável, **não** substitui parecer independente de segurança.
- [x] **F2 — escolha expressa do responsável:** pedido que conflita com reserva confirmada é rejeitado no envio sem criar registro; validar com a secretária e testar via RPC em AG-02/04. D2 permanece distinta.
- [x] **D8 — escolhas expressas do responsável:** aprovação tardia bloqueada com pedido mantido `pending` até recusa manual; impedir edição de horário de reunião iniciada/histórica, permitir correção textual auditada; horas e minutos livres, fim até 23:59.
- [x] **D8 — campos de correção histórica aprovados pelo responsável:** apenas `booked_for` e `secretary_notes`; `purpose`, horários e demais campos não são editáveis na exceção histórica.
- [ ] **D8 — validação de bordas:** conferir com a secretária e executar futuramente testes de autorização, versão, precisão, relógio do backend, 23:59 e passagem de tempo em AG-02/04.
- [ ] **Revisão humana independente de segurança D5-A**, apesar de aprovação do responsável para administrador geral com `room_booking.manage` completo; avaliar grants, delegação, revogação e auditoria **antes de AG-01**.
- [x] **Decisões de produto D1/D4/D6/D7/D9/D10/D11 confirmadas pelo responsável em 23/10/2026**, incluindo atribuição individual explícita de `room_booking_requester` no Core, substituta temporária, cancelamento próprio só antes do início, avisos internos, rota `/rooms` e preservação do legado.
- [x] **Validação operacional da secretária relatada pelo responsável** para as decisões atuais (D1/D2/D3/D4/D6/D7/D8/D9/D10/D11/F2/observações); sem contato direto nesta sessão.
- [ ] **Evidência humana rastreável da validação**, com papel, data, escopo e aprovação/revisão documental, sem expor nomes ou dados de reuniões.
- [x] **D11 substituída:** nova implementação totalmente independente do legado; **não** conferir ZIP/agenda, importar/reconciliar reservas ou modificar instalação antiga como gate de AG-00/AG-01.
- [ ] Prioridade C1 ratificada formalmente, sem afastar Qualidade P1–P9/O1–O8 e PROD NO-GO.
- [ ] Registrar relato de validação da secretária e aceite final AG-00 de modo rastreável; concluir revisão independente D5-A e PR documental revisada/integrada; **não iniciar AG-01** antes de fechar todo o gate.

## Critérios funcionais

| ID | Critério | Etapa |
|---|---|---|
| F1 | Pedido válido fica `pending` e **não** aparece na agenda de confirmados | AG-02/03 |
| F2 | Novo pedido que se sobreponha a reserva **já confirmada** é rejeitado sem inserção, retornando “horário ocupado”, inclusive quando a confirmação ocorrer entre a abertura do formulário e o envio; verificar via UI e RPC/banco. Pedidos apenas `pending` não bloqueiam (D2) | AG-02/03/04 |
| F3 | Faixas adjacentes (fim A = início B) são aceitas | AG-01/02 |
| F4 | Dois pedidos pendentes idênticos coexistem; aprovar o primeiro funciona; aprovar o segundo retorna conflito e ele continua `pending` **[D2]** | AG-02/04 |
| F5 | Aprovação cria exatamente uma reserva vinculada ao pedido, com `decided_by = auth.uid()` | AG-02 |
| F6 | Recusa grava o motivo opcional, e o solicitante vê o status e o motivo em "Meus pedidos" | AG-02/03/04 |
| F7 | Estados terminais não mudam: aprovar/recusar/cancelar de novo retorna erro sem efeito | AG-02 |
| F8 | Reserva direta respeita a mesma exclusividade e registra a autoria | AG-02/04 |
| F9 | Edição com versão desatualizada retorna conflito e não sobrescreve | AG-02/04 |
| F10 | Cancelamento leva a `cancelled`, libera a faixa e mantém o registro; não há exclusão física | AG-02/04 |
| F11 | Solicitante cancela somente **seu** pedido `pending` com início ainda estritamente futuro no banco; nega pedido de terceiros, já aprovado ou `pending` vencido (este segue para recusa manual pela gestora) **[D7 aprovado]** | AG-02/03/04 |
| F12 | Clique duplo / reenvio do mesmo pedido cria um único registro (idempotência) | AG-02/03 |
| F13 | Banco/RPC: `ends_at > starts_at`, mesmo dia civil em São Paulo, término `<= 23:59`, início estritamente no futuro inclusive hoje. **Sem** limite de expediente, duração mínima/máxima, antecedência máxima ou grade compulsória de 15 min; verificações em T4–T11 (decisões de produto D8 registradas; testes e detalhe textual pendentes) | AG-01/02/04 |
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
| S6 | Agenda com `schedule.read` e perfil ativo **deve exibir** apenas reservas confirmadas com horário/sala, `booked_for` e `secretary_notes` para todos os leitores autorizados. Sem `purpose`, identidade técnica de solicitante, decisões privadas, pedidos pendentes ou exposição anônima **[D3 confirmada em produto]** | AG-02/03/04 |
| S7 | `requester_user_id` enviado pelo cliente é ignorado ou rejeitado; vale `auth.uid()` | AG-02 |
| S8 | Sem `insert/update/delete` direto nas tabelas para `authenticated`/`anon`; RLS habilitada em todas | AG-01 |
| S9 | RPCs `SECURITY DEFINER` com `search_path=''` e `execute` revogado de `public`/`anon` | AG-01/02 |
| S10 | **D5-A aprovada pelo responsável, mas revisão independente ainda pendente:** administrador com `room_booking.manage` pode delegar e **operar** fila/gestão de reservas via RPC; auditar grants, concessão/revogação e cada mutação, sem alegar bloqueio técnico por regra operacional | AG-00/01/02/04 |
| S11 | Atribuição de `room_booking_manager` a uma substituta e a revogação no retorno funcionam e ficam auditadas **[D5/D6]** | AG-01/05 |
| S12 | Auditoria registra ator, ação e entidade de cada mutação, sem `purpose` nem texto integral de `secretary_notes` nos metadados por padrão | AG-02/04 |
| S13 | `anon` não acessa nada do schema | AG-01 |
| S14 | Leitor autenticado autorizado vê `booked_for`/`secretary_notes` de confirmadas, mas sem papel, com perfil inativo, anônimo ou após revogação não recebe tais campos via REST/RPC/ID adivinhado; escopo de exposição confirmado pelo responsável | AG-01/02/04 |
| S15 | `secretary_notes` com HTML/script é renderizado como **texto inerte** na agenda, não vaza a pedidos alheios, fila pública nem logs; solicitante não pode escrever/editar notas por payload forjado | AG-02/03/04 |
| S16 | Papel `room_booking_requester` não é recebido automaticamente por qualquer usuário ativo/novo; concessão **individual e auditável** pelo administrador no Core, com revogação imediata e sem ampliação implícita de escopo; viabilidade do grant D5-A sujeita à revisão humana independente | AG-01/02/04 |

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
| T5 | Criação **hoje** com `starts_at` menor ou igual ao instante corrente aferido no backend/banco durante a validação (hora passada **ou exatamente agora**) é recusada por RPC; navegador com relógio adiantado/atrasado não contorna a regra | AG-01/02/04 |
| T6 | Pedido e reserva direta que passam da meia-noite são recusados; término exatamente **23:59** no mesmo dia é permitido se os demais invariantes forem válidos; não converter para 00:00 | AG-01/02/04 |
| T7 | Durações positivas arbitrárias, sem expediente, antecedência máxima ou grade fixa de 15 minutos (ex.: 14:07–14:23), e horários adjacentes com intervalo `[início, fim)` são válidos, observado o limite do dia | AG-01/02/04 |
| T8 | Backend revalida o instante na gravação após o formulário ficar aberto/relógio avançar; início que deixou de ser futuro é recusado na criação. pedido já vencido não pode ser aprovado e permanece `pending` até recusa manual pela gestora (T10) | AG-00/02/04 |
| T9 | Mesmo dia civil e instante efetivo `timestamptz` são avaliados em `America/Sao_Paulo` com processo/navegador em `TZ=UTC` e `TZ=Asia/Tokyo` | AG-02/03/04 |
| T10 | Pedido `pending` cujo `starts_at` já transcorreu: `approve_request` é negado no banco, nenhuma reserva/auditoria de aprovação é criada, status permanece `pending`; recusa manual posterior funciona e é auditada, inclusive sob corrida temporal | AG-02/04/05 |
| T11 | Reunião iniciada/histórica: alteração de horários, `purpose` e demais campos é negada por RPC/banco, inclusive com payload forjado; **somente `booked_for` e `secretary_notes` corrigíveis** por `manage`, com versão/auditoria e renderização pública segura | AG-02/04/05 |
| T12 | Pedido `pending` cujo início já chegou/passou: cancelamento pelo solicitante negado, sem mudança de status; recusa pela gestora continua permitida. Testar borda do instante atual pelo relógio do banco e cliente em fuso diferente | AG-02/04 |

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
| U10 | `Meus pedidos` e fila da secretária exibem estados/avisos internos, sem disparar e-mail, WhatsApp ou notificações externas **[D9 aprovado]** | AG-03/04/05 |

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
- [ ] Confirmar comportamento de hoje, futuro, `23:59`, cancelamento de pedido vencido e mensagens nas bordas, com escolhas F2/D7/D8 registradas e testes previstos executados nas etapas correspondentes antes da homologação.
- [ ] Desktop e pelo menos um celular real validados.
- [ ] Aceite expresso da secretária sobre facilidade de uso, visibilidade e decisões.

## Transição operacional futura (AG-06) — somente com GO global

- [ ] **Não importar/reconciliar reservas antigas** no novo módulo. Definir de modo independente se, quando e como ocorrerá qualquer transição/desativação da solução legada, sem acessar dados reais nesta etapa.
- [ ] Preservar a solução antiga enquanto vigente; qualquer desativação/corte e início de uso oficial do novo módulo dependem de GO operacional separado, sem presumir duas agendas oficiais em paralelo.
- [ ] Plano de continuidade, backup e rollback de eventual transição aprovado em AG-06; **sem reconciliação/importação de dados antigos** por padrão.
