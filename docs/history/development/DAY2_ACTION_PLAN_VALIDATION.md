# Correções do Dia 2 — Planos de Ação

## Política provisória de datas (P1)

Somente no formulário: novas datas ou alterações de prazo/acompanhamento aceitam
01/01/2000 até 31/12 do ano atual + 5. Os dois limites estão centralizados em
`planningDates.ts` (`PLANNING_DATE_POLICY`) para confirmação/ajuste pelo responsável.
Não são uma regra permanente de banco. Valores existentes fora dessa janela podem
ser mantidos ao editar outros campos; datas modificadas seguem a janela atual.

O acompanhamento continua opcional, exige ambas as datas quando informado e início
não posterior ao fim. A duração mostra dias decorridos (mesmo dia = 0) e meses/anos
completos de calendário; não representa a data de criação ou o prazo do plano.
Datas são calculadas em UTC somente como coordenadas de calendário, sem converter
datas de negócio pelo fuso local. Nenhuma migration ou campo persistido foi criado.

## Carregamento (P2)

A listagem aguardava `Promise.all([summaries(), creationScopes()])`: escopos lentos
ou com erro bloqueavam planos já recebidos. Agora os escopos são consultados somente
ao abrir Novo plano, com erro/repetição independentes. A API paginada permanece igual.

Ensaio reproduzível: `tests/action-plans-api.test.ts`, 1.001 planos e 1.001 escopos
sintéticos, páginas de 500, latência simulada de 10 ms por página de planos e 80 ms
por página de escopos. Em 16/10/2026: antes **282 ms / 6 requisições**; depois
**43 ms / 3 requisições**, preservando os mesmos 1.001 planos. Ao abrir o formulário,
as 3 requisições de escopos ainda são feitas. Os tempos variam por máquina/carga.

Esse ensaio mede a dependência de carregamento no cliente. Não mede SQL, rede real
ou produção; a latência real continua pendente em ambiente isolado representativo.
