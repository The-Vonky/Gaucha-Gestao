# Gaúcha Gestão — Protocolo de trabalho paralelo e atualização contínua

**Versão:** 1.0  
**Data de criação:** 04/11/2026  
**Projeto:** Gaúcha Gestão — preparação para uso real  
**Repositório:** https://github.com/The-Vonky/Gaucha-Gestao  
**Natureza:** instruções complementares para orientar o assistente em futuras conversas. Este texto não concede autorização para alterar repositórios, executar migrations, acessar dados sensíveis ou implantar em servidores.

## 1. Contexto permanente de colaboração

O responsável pela Gaúcha Gestão desenvolve o sistema **simultaneamente em outros chats, projetos e fluxos de trabalho**. Durante uma conversa neste projeto, outras pessoas ou agentes podem estar realizando análises, criando branches, abrindo/mesclando pull requests, alterando código, documentação, migrations e configurações.

**Consequência:** toda análise anterior é uma fotografia histórica, e não uma descrição garantida do estado atual. A lista de tarefas GG-01 a GG-15 e o Guia Mestre devem ser reavaliados à luz de evidências recentes antes de qualquer recomendação, implementação ou alteração de status.

## 2. Fontes de verdade e precedência

- **Código e histórico atuais:** o GitHub (branch `main`, commits, PRs, branches, migrations e arquivos relevantes) é a principal referência para o que foi integrado e para o que está em revisão. Consultar fontes atuais, não apenas a lembrança da conversa.
- **Trabalho ainda não publicado:** alterações locais ou existentes apenas em outros chats **podem não aparecer no GitHub**. Não presumir que a ausência de uma PR significa inexistência de trabalho em andamento. Quando esse ponto afetar a segurança da tarefa, sinalizar a limitação e pedir somente a informação estritamente necessária.
- **Ambiente executando de fato:** apenas uma verificação apropriada do ambiente pode atestar qual versão está no DEV, STAGING C30 ou PROD. Um merge em `main` não comprova deploy, nem o documento operacional histórico comprova o estado de hoje.
- **Decisões e regras:** respeitar `AGENTS.md`, ADRs aceitos, contratos canônicos, Plano Diretor, procedimentos operacionais e autorizações do responsável. Este protocolo e o Guia Mestre **complementam**, mas não substituem, essas regras.
- **Guia Mestre:** o arquivo `GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md` mantém as prioridades e critérios originais, sujeitos à revisão baseada em evidência.

## 3. Verificação obrigatória antes de cada tarefa relevante

Antes de recomendar, modificar ou considerar concluída uma entrega GG-XX:

1. Identificar **objetivo, ambiente e escopo** da tarefa solicitada.
2. Verificar a situação recente do GitHub: `main`, commits, PRs abertas/mescladas, branches e arquivos relacionados; examinar issues quando aplicável.
3. Conferir contratos, permissões, migrations e dependências que possam ter mudado desde a análise anterior.
4. Comparar a tarefa com o backlog: **já concluída**, **parcialmente realizada**, **em desenvolvimento paralelo**, **ainda pendente** ou **estado não verificável**.
5. Identificar riscos de conflito de código, divergência de schema, incompatibilidade de frontend/backend, perda de dados e ampliação involuntária de acesso.
6. Propor a menor intervenção que ainda faça sentido no estado encontrado, evitando implementar novamente algo que outro fluxo já entregou.
7. Informar o **SHA/branch, data da verificação e limitações da evidência** ao declarar um resultado técnico.

Se não houver acesso ao GitHub ou ao ambiente necessário naquele momento, declarar isso explicitamente. Não substituir a verificação por suposições.

## 4. Coordenação e prevenção de conflitos

- Priorizar mudanças **focalizadas**, em branch identificada e PR própria, quando houver pedido explícito de implementação.
- Antes de alterar arquivos compartilhados — especialmente Core, Auth, RLS, SQL/migrations, tipos comuns, rotas, infraestrutura e configuração de deploy — conferir se há trabalho paralelo potencialmente conflitante.
- Não sobrescrever arquivos, descartar alterações locais, reescrever histórico, forçar push ou resolver conflitos de forma destrutiva sem autorização apropriada.
- Para migrations: preservar abordagem **append-only** e checar a sequência atual; alterações de schema em paralelo exigem coordenação e testes da combinação final.
- Não assumir que diferentes branches/worktrees isolam o mesmo banco Docker local. Reutilizar o ambiente de desenvolvimento autorizado conforme `AGENTS.md`, sem criar ou destruir infraestrutura por rotina.
- A existência de trabalho em outro chat **não equivale a autorização** para integrar, mesclar, publicar ou alterar ambientes compartilhados.
- O mantenedor humano decide merges, mudanças privilegiadas, janela de implantação, liberação para testes com funcionários e GO produtivo. Não inventar revisão humana independente.

## 4.1. Adendo operacional — homologação no notebook antes de merge (10/11/2026)

**Decisão posterior à versão 1.0 deste protocolo:** o mantenedor definiu o notebook como ambiente ativo de desenvolvimento e homologação. A entrega de funcionalidades testáveis inclui **disponibilizar o HEAD da PR no checkout do notebook que serve o localhost, antes de pedir aceite ou merge**. Não se deve manter código apenas no clone/worktree do agente por excesso de isolamento. A sequência vigente está em [`AGENTS.md`](../../AGENTS.md) e no [`PARALLEL_AGENT_WORKFLOW.md`](../development/PARALLEL_AGENT_WORKFLOW.md).

Essa sincronização **não equivale** a merge na `main`, deploy, migration na C30 ou liberação de produção. O agente com acesso local deve atualizar e verificar o checkout, reutilizando o Supabase/Docker local com migrations incrementais seguras quando aplicável. Alterações não commitadas requerem tratamento reversível e identificação, não reset/limpeza indiscriminados. Quando houver conflito real, declarar o impeditivo específico. Se o agente só dispõe de GitHub/nuvem, registrar `PENDENTE DE SINCRONIZAÇÃO LOCAL`, apresentar instruções aplicáveis e **não fingir que atualizou o notebook**. O mantenedor valida no localhost, solicita ajustes na mesma PR e só então decide o merge.

## 5. Segurança operacional e distinção dos estados

Manter separados, em toda avaliação:

| Estado | Evidência requerida |
| --- | --- |
| Implementado em branch | Código e commit específicos. |
| Integrado à `main` | Merge/commit verificado. |
| Validado tecnicamente | Testes realmente executados, ambiente, SHA e resultado. |
| Publicado no STAGING | Versão e estado operacional conferidos no destino. |
| Homologado | Testes de negócio e aceite humano registrados. |
| Liberado para uso real | Gates aplicáveis atendidos e autorização expressa. |

A C30 é um ambiente persistente, não uma sandbox descartável. Não executar `db reset`, migrations remotas, alterações de volume, deploy, limpeza, restauração sobre dados existentes ou outras ações potencialmente destrutivas sem autorização específica, inventário, backup restaurável e plano de mudança. **PROD permanece NO-GO até evidências e decisão expressa.**

## 6. Como atualizar o acompanhamento do Guia Mestre

Para cada GG-XX analisada, registrar de forma verificável:

- **Situação atual:** não iniciado / em análise / em desenvolvimento / PR aberta / integrado / implantado / validado / homologado / bloqueado / não verificável.
- **Origem da evidência:** link de PR/arquivo/issue, SHA e data; ou resultado de inspeção autorizada do ambiente.
- **Contribuição de outros fluxos:** o que apareceu novo desde a análise anterior; dependências ou conflitos identificados.
- **Lacuna remanescente:** o que realmente falta para cumprir os critérios de aceite da GG-XX.
- **Próximo passo seguro:** uma recomendação concreta, com ambiente e autorização necessários.

Nunca marcar uma entrega como concluída somente porque um chat informou intenção, uma issue foi fechada, um PR foi aberto, um script foi escrito ou uma versão foi mesclada. Para tarefas operacionais, exigir **prova de funcionamento no ambiente correspondente**.

## 7. Limites do acompanhamento entre chats

O assistente **não acompanha automaticamente** GitHub, servidor, outros chats ou mudanças futuras enquanto a conversa está parada. Também não deve fingir ter visto alterações locais ou discussões de outros projetos às quais não teve acesso.

**Procedimento ao retomar trabalho:** reler este protocolo e o Guia Mestre quando estiverem disponíveis nas fontes, consultar as fontes técnicas atuais e elaborar novo diagnóstico pontual. Caso uma mudança paralela ainda não esteja publicada ou não seja observável, pedir ao responsável apenas o contexto indispensável.

## 8. Padrão de resposta para orientar o responsável

Nas próximas tarefas, apresentar de forma objetiva:

1. **O que mudou desde a última análise** (com evidência quando houver).
2. **O que já existe e o que continua faltando**.
3. **Se há risco de interferência com trabalhos paralelos**.
4. **Qual solução e ordem de execução são recomendadas**.
5. **Quais testes e critérios de aceite comprovam conclusão**.
6. **Qual é o próximo passo**, distinguindo orientação, implementação, integração e implantação.

**Regra central:** _verificar antes de afirmar; coordenar antes de alterar; testar antes de considerar pronto; obter autorização antes de publicar ou impactar dados persistentes._

---

**Relação com os demais documentos:** este protocolo deve ser mantido nas fontes do projeto **ao lado** do Guia Mestre de 04/11/2026. Se houver divergência com `AGENTS.md`, decisões aceitas, código atualizado ou ordens explícitas do responsável, apontar a divergência e aplicar a autoridade correta; nunca tratar esta fotografia de 04/11/2026 como imutável.