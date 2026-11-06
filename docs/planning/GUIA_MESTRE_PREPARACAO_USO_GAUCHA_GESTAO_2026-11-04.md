# Gaúcha Gestão — Guia mestre de preparação para uso real

**Versão:** 1.0  
**Data-base da análise:** 04/11/2026  
**Responsável pelas decisões de produto, aprovações e liberação:** mantenedor/titular do projeto  
**Repositório de referência:** [The-Vonky/Gaucha-Gestao](https://github.com/The-Vonky/Gaucha-Gestao)  
**Classificação:** documento de planejamento, acompanhamento e orientação; **não** é autorização para implantar em produção, alterar ambientes persistentes ou executar operações privilegiadas.  
**Estado-base para uso produtivo:** **PROD NO-GO**, até fechamento e aceite dos requisitos aplicáveis.

> **Propósito deste documento.** Reunir a análise dos cuidados finais levantados pelo responsável, registrar o estado verificável do projeto e estabelecer um método de trabalho para que o assistente atue como guia técnico no desenvolvimento, na preparação do servidor, na homologação e na liberação gradual. Este documento deve ser consultado junto com o código, os ADRs e os contratos canônicos atualizados, não em substituição a eles.

---

## 1. Resumo executivo e recomendação

A Gaúcha Gestão já oferece funcionalidades úteis, mas há uma diferença entre **funcionalidade desenvolvida**, **versão integrada na `main`**, **versão publicada na C30**, **função homologada por usuários** e **serviço autorizado para operação**. Essas condições **não são equivalentes**.

O caminho recomendado é uma **liberação gradual e controlada**, iniciando por módulos selecionados e funcionários autorizados, somente após proteger os dados, comprovar recuperação do ambiente, validar as permissões e preparar um processo seguro de atualização. É possível desenvolver pequenas melhorias em paralelo às tarefas de infraestrutura; **não** se deve confundir essa liberdade de desenvolvimento com autorização para promover a versão ao servidor persistente.

**Prioridades práticas:**

1. Conferir o inventário real da C30 e implementar backup remoto cifrado, automatizado, monitorado e com **restauração completa testada em destino independente**.
2. Revisar o modelo de Vendas/Maquininhas para operação completa versus consulta/exportação, respeitando escopos por unidade.
3. Definir e validar um procedimento seguro para criar, ativar, bloquear e revogar contas; a tela de criação pode vir depois de um provisionamento manual restrito e auditado.
4. Preparar e homologar uma release candidata, incluindo migrations, testes negativos de autorização e procedimento de atualização/retorno da C30.
5. Ajustar o Agendamento de Salas: contato da responsável, revisão do histórico de solicitações existente e histórico separado de reservas diretas.
6. Disponibilizar aviso de fase de testes e canal interno de relatos/evidências.
7. Ajustar descrições e cores da página inicial.
8. Avaliar Cloudflare Turnstile e controles de borda como proteção complementar, sem substituírem autenticação, RLS, backups ou monitoramento.

A **ordem de desenvolvimento** pode ser parcialmente paralela; a **ordem de liberação** depende dos bloqueadores operacionais. O primeiro objetivo não é “marcar tudo como feito”, mas demonstrar que é possível operar, recuperar e corrigir a plataforma com segurança.

---

## 2. Escopo, critérios de evidência e limitações

### 2.1. Fontes consultadas na análise de 04/11/2026

- Código e documentação acessados no repositório GitHub privado da Gaúcha Gestão, por leitura de arquivos e histórico de PRs.
- [README.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/README.md) — arquitetura, módulos e ressalvas de prontidão.
- [AGENTS.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/AGENTS.md) — regras de agentes, governança, preservação de ambientes e fluxo do mantenedor único.
- [Plano Diretor 2026](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/planning/PLANO_DIRETOR_2026.md) — gates e definição de pronto.
- [BACKUP_RECOVERY.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/architecture/BACKUP_RECOVERY.md) e [C30_BACKUP_GAPS.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/operations/C30_BACKUP_GAPS.md) — continuidade e lacunas.
- [C30 STAGING — AS-BUILT Cloudflare 30/10](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e [guia de release da C30](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/operations/C30_STAGING_RELEASE_GUIDE.md).
- [AUTHORIZATION.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/architecture/AUTHORIZATION.md) e [THREAT_MODEL.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/architecture/THREAT_MODEL.md).
- [VEN05A_EXCEL_EXPORT.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/modules/sales/VEN05A_EXCEL_EXPORT.md), [PR #94](https://github.com/The-Vonky/Gaucha-Gestao/pull/94) e [PR #98](https://github.com/The-Vonky/Gaucha-Gestao/pull/98).
- [Agendamento — EXPERIENCE_V1.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/modules/room-booking/EXPERIENCE_V1.md), [RequestHistory.tsx](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/apps/web/src/modules/rooms/RequestHistory.tsx) e [PR #88](https://github.com/The-Vonky/Gaucha-Gestao/pull/88).
- [QUALITY_ACCEPTANCE_V1.md](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/modules/audit/QUALITY_ACCEPTANCE_V1.md) e [ACCEPTANCE_V1.md de Agendamento](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/modules/room-booking/ACCEPTANCE_V1.md).
- [navigation.ts](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/apps/web/src/app/navigation.ts) e [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49).

**Limites da evidência:** houve inspeção documental e de arquivos relevantes, além da consulta ao estado de PRs. **Não** houve acesso interativo ao servidor C30, execução de comandos na instalação real, teste de restauração, pentest, auditoria linha a linha de todo o repositório nem aceite por funcionários nesta análise. A documentação de operação relata observações até 30/10; uma eventual atualização posterior na C30 deve ser verificada na máquina, e não inferida da `main`.

### 2.2. Semântica obrigatória de status

| Status | Significado | Não significa |
| --- | --- | --- |
| **Implementado** | Código existe em determinado commit/branch. | Que foi integrado ou implantado. |
| **Integrado à `main`** | PR mergeada na linha principal. | Que a C30 executa essa versão. |
| **Validado tecnicamente** | Testes executados com ambiente, SHA e resultados documentados. | Que houve homologação humana, desempenho ou recuperação comprovados. |
| **Implantado em STAGING** | Versão específica publicada no servidor de testes. | Que a produção foi autorizada. |
| **Homologado** | Fluxos de negócio e segurança testados com evidência e aceite aplicáveis. | Que todas as condições operacionais estão atendidas. |
| **GO produtivo** | Responsável autorizou expressamente após os gates aplicáveis. | Que existe garantia absoluta de disponibilidade ou zero perda de dados. |

Sempre identificar **ambiente, commit/versão, data e evidência** ao declarar um resultado.

---

## 3. Retrato técnico conhecido do projeto

### 3.1. Arquitetura e operação

O repositório descreve frontend React + TypeScript, autenticação Supabase Auth, PostgreSQL, RPCs de negócio, autorização por grants/RLS e arquivos via Supabase Storage. O módulo Core centraliza perfis, papéis, unidades e auditoria. O host de testes documentado é uma Lenovo ThinkStation C30 com Ubuntu Server, serviços persistentes, Caddy e Cloudflare Tunnel. Esse conjunto é um **servidor único**, sem alta disponibilidade automática.

A arquitetura de produção planejada inclui escolhas ainda não integralmente implantadas ou comprovadas — por exemplo, a separação do frontend e o eventual uso de R2. Essas propostas não devem ser tratadas como infraestrutura já existente. Cloudflare Tunnel viabiliza entrada HTTPS, mas não garante isolamento de usuários, proteção de dados nem backup.

### 3.2. Divergência entre `main` e servidor

| Elemento | Evidência conhecida | Consequência |
| --- | --- | --- |
| **C30 STAGING** | AS-BUILT de 30/10 registra `f9f041e` e 18 migrations; troca de URL para `teste.gauchagestao.online` sem atualizar código/migrations. | Conferir **ao vivo** a versão e o ledger antes de qualquer implantação. |
| **Agendamento** | PR #88 mergeada em 27/10, com `/rooms`, gestão, foto, histórico de solicitações e D5-B. | Código integrado **não implica** módulo presente na C30. |
| **Vendas** | PR #94 mergeada em 03/11, com dashboard; PR #98 mergeada em 04/11, com exportação Excel e refinamentos. | O servidor não deve receber a `main` automaticamente. Migrations e compatibilidade exigem plano. |
| **README e outros registros** | Partes do README e de documentos de aceitação conservam fotografias históricas anteriores àquelas PRs. | Resolver divergências consultando estado Git, código e decisões vigentes; **não** atualizar status sem evidência. |

O procedimento de atualização deve observar especificamente o [guia de release da C30](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/operations/C30_STAGING_RELEASE_GUIDE.md): **backup consistente e restaurável**, release candidata congelada, CI do SHA, migrations **append-only**, preservação do bundle anterior, verificações negativas e registro da operação. O script de aplicação de migrations do laboratório não é presumidamente seguro para o banco STAGING persistente.

### 3.3. Bloqueadores já reconhecidos no projeto

- Backup remoto automático de banco + Auth + Storage e recuperação independente **não comprovados** no registro operacional.
- RPO/RTO, retenções e tempos de recuperação **sem definição/medição técnica suficiente** para encerrar os gates.
- Matriz negativa de acessos, visibilidade entre unidades, inativação/revogação e arquivos pendente no ambiente candidato.
- Provisionamento privilegiado de identidades sem solução arquitetural aprovada e testada; a [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) foi **encerrada administrativamente**, sem resolver o bloqueio técnico descrito nela.
- Monitoramento, alertas, proteção da borda pública e procedimentos operacionais ainda a demonstrar.
- Aceite humano e operacional P1–P9/O1–O8 e verificações específicas de cada módulo ainda requerem evidências no ambiente candidato.

---

## 4. Critérios de liberação: piloto versus produção

### 4.1. Piloto controlado

Objetivo: permitir que **um grupo pequeno e identificado** utilize módulos escolhidos em condições acompanhadas, preferencialmente com dados sintéticos ou autorizados, sem substituir imediatamente processos antigos.

**Condições mínimas recomendadas para um piloto que persista informações relevantes:**

1. Responsável e escopo do piloto definidos (módulos, participantes, unidades, datas, restrições e canal de suporte).
2. Backup independente do conjunto relevante e **restauração isolada testada**; recuperação e limitações conhecidas.
3. Contas criadas e atribuídas por processo seguro, com revogação e rastreabilidade.
4. Negativas de autorização por perfil, unidade, sessão expirada, usuário inativo e chamadas diretas à API demonstradas.
5. Release exata implantada conscientemente e verificada (código, migrations, frontend, Auth, Storage).
6. Fluxos principais de cada módulo incluído validados por funcionário responsável, em dispositivos de uso real.
7. Aviso de fase de testes, comunicação de indisponibilidades, tratamento de incidentes e canal para apontar defeitos.
8. Aprovação humana explícita do **piloto**, sem rotulá-lo como produção definitiva.

Se o ambiente ou o dado do piloto for mais restrito, o responsável pode definir controles específicos, mas não deve declarar recuperação/segurança demonstradas quando não houver prova.

### 4.2. Uso produtivo definitivo

Além do piloto, exige fechamento dos gates do Plano Diretor, aceite físico/operacional aplicável, critérios de cada módulo, operação/monitoramento, plano de contingência, metas RPO/RTO/retenção decididas e medidas, ausência de bloqueadores críticos e **GO humano explícito**. A data de liberação não deve ser inventada ou fixada antes de conhecer o resultado desses testes.

---

## 5. Backlog priorizado — recomendações com critérios de aceite

**Legenda:** P0 = bloqueador para uso persistente relevante; P1 = necessário ou altamente desejável antes/amarrado ao piloto; P2 = melhoria não bloqueadora. A prioridade é recomendação desta análise, **não** decisão de produto já aprovada.

| ID | Entrega | Prioridade | Dependência | Critério objetivo de conclusão |
| --- | --- | --- | --- | --- |
| **GG-01** | Inventário real de ambientes e versões | **P0** | Acesso de leitura/autorização ao alvo | SHA, branch, migrations, serviços, volumes, disco, DNS e responsáveis registrados **sem segredos**. |
| **GG-02** | Backups independentes automatizados | **P0** | GG-01; decisão de RPO/retenção/destino | DB/Auth/roles/Storage/configs cobertos, cópia externa cifrada, alertas e retenção funcionando. |
| **GG-03** | Restauração de falha total | **P0** | GG-02 | Outro ambiente/volumes: login, dados, arquivos, RLS e app funcionando; tempo/perda medidos. |
| **GG-04** | Sales Manager e Sales Viewer | **P0 para Vendas** | Estado real de roles/grants e regras de produto | Operação completa vs. leitura/exportação; negativos e escopo unitário comprovados. |
| **GG-05** | Provisionamento seguro de usuários | **P0 como processo; P1 para UI** | Fronteira Auth/Core aprovada | Criar, vincular, atribuir unidade/papel, bloquear e revogar com auditoria; sem segredo administrativo no frontend. |
| **GG-06** | Validação transversal de segurança | **P0** | Contas de teste e release candidata | RLS/RPC/Storage negam acesso indevido, revogação e cross-unit; evidência por SHA. |
| **GG-07** | Release candidata e atualização controlada da C30 | **P0** | GG-01–03, GG-06 e plano de mudança | Migrations verificadas, release anterior preservada, smoke tests e reversão/forward-fix documentados. |
| **GG-08** | Agendamento: contato da responsável | **P1** | Regra de exibição e dado institucional definido | Nome/ramal visíveis para usuários autorizados e atualizáveis por processo definido. |
| **GG-09** | Agendamento: histórico completo de gestão | **P1** | Contratos do módulo; D5-B | Histórico existente revisado; reservas diretas consultáveis sem pedidos artificiais; filtros e permissões testados. |
| **GG-10** | Aviso de testes | **P1** | Política de ambiente | Aviso claro, não intrusivo e configurável; não confunde STAGING com PROD. |
| **GG-11** | Canal de bugs e sugestões com evidências | **P1** | Contrato de dados, Storage e envio seguro | Relato persistido, anexos privados e notificação por e-mail; erro de e-mail não perde o relato. |
| **GG-12** | Ajustes de cores e descrição de Administrativo | **P2** | Revisão visual | Descrição incorporada; cores e contrastes revisados em desktop/celular. |
| **GG-13** | Cloudflare Turnstile e endurecimento da borda | **P1/P2 conforme ameaça** | Verificar self-hosted Auth e regras Cloudflare | Testes de login, falha/expiração/validação, ausência de bloqueio indevido de APIs. |
| **GG-14** | Monitoramento e observabilidade | **P0 para operação real** | Host e arquitetura alvo | Alertas para host, disco, serviços, banco, storage, túnel e falha do backup; responsáveis sabem como reagir. |
| **GG-15** | Homologação e autorização do piloto | **P0 final** | P0 aplicáveis e funcionalidades do piloto | Aceites funcionais/operacionais registrados; público, limites, suporte e GO do piloto assinados pelo responsável. |

> **Regra de paralelismo:** melhorias de UI e módulos podem avançar em branches locais sem aguardar o restore da C30. **Mudança em ambiente persistente não herda essa autorização**. O gate de backup/restore deve preceder upgrades arriscados e uso relevante com dados que não podem ser perdidos.

---

## 6. Especificações das entregas mais importantes

### GG-01 a GG-03 — backup, perda total do HD e restauração

**Problema existente:** foram documentados dumps locais do PostgreSQL e um ensaio histórico sintético de outra baseline, mas isso não comprova backup remoto/restauração atual de PostgreSQL + Auth + bytes de Storage + configuração do servidor.

**Escopo mínimo:**

- Descobrir e registrar onde estão volumes, bases, arquivos, configurações, artefatos de release, migrations, segredos e dependências externas — **sem publicar material sensível**.
- Escolher destino externo **independente da C30**, com controle de acesso mínimo, criptografia autenticada, chaves recuperáveis e, quando viável, retenção protegida contra exclusão indevida/ransomware.
- Definir políticas de frequência, retenção, RPO técnico, RTO no expediente e fora dele, custos e responsável por alertas. Não afirmar **RPO = 0** apenas pela intenção de não perder salvamentos.
- Garantir cópia consistente do banco/roles/Auth e dos **metadados + bytes** de Storage; evitar situação em que DB aponta para objeto não restaurado.
- Criar monitoramento de sucesso/falha e rotina documentada de verificação.
- **Ensaio de desastre:** considerar o HD indisponível; restaurar em infraestrutura isolada com volumes novos, versão de aplicação correspondente, credenciais recuperadas por canal seguro, login e checagem de permissões/arquivos. Nunca sobrescrever STAGING para testar.
- Registrar tempo real, ponto de recuperação, divergências, hashes/quantidades quando aplicáveis, tentativas, operador, data e medidas corretivas.

**Critério de aceite:** um operador designado consegue seguir um runbook e recuperar o serviço funcional **sem depender dos dados do HD original**; evidência de pelo menos um ensaio completo. A periodicidade dos ensaios seguintes deve ficar estabelecida.

### GG-04 — Vendas/Maquininhas: composição dos perfis

**Fato encontrado:** o código/documento `AUTHORIZATION.md` descreve sete capacidades de Vendas:

- `sales.entry.read`, `sales.entry.create`, `sales.entry.edit`, `sales.entry.delete`;
- `sales.dashboard.read`;
- `sales.export.filtered`, `sales.export.full`.

Há papéis existentes: `sales_manager` com as sete; `sales_operator` com leitura e criação; e `platform_administrator` com as sete capacidades na composição institucional documentada. A exportação VEN-05A foi mergeada em 04/11. **Não assumir que a C30 já recebeu esses papéis/migrations.**

**Composição proposta (depende de aceite do negócio):**

| Papel | Consultar | Criar | Editar | Excluir logicamente | Dashboard | Exportar filtrado | Exportar completo |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Sales Manager** (existente) | Sim | Sim | Sim | Sim | Sim | Sim | Sim |
| **Sales Viewer** (**novo, proposto**) | Sim | Não | Não | Não | Sim | Sim | Sim |
| **Sales Operator** (existente; futuro a decidir) | Sim | Sim | Não | Não | Não | Não | Não |

Manter escopo **global/unidade** conforme grants efetivos, nunca transformar um papel em acesso a todas as unidades automaticamente. Verificar se a atribuição de exportação completa é de fato desejada para todo Viewer. `platform_administrator` possui acesso às sete capacidades na composição atual: confirmar se essa regra continua desejada antes da liberação.

**Testes de aceite:** usuário com unidade A não lê, altera, calcula nem exporta B; Viewer não escreve nem por RPC direta; Manager opera apenas unidades permitidas; usuário sem papel, inativo ou revogado recebe negação; relatórios não agregam dados fora da interseção das permissões; mudanças de grants durante a sessão são respeitadas.

### GG-05 — criação de usuários e Identity Boundary

**Fato encontrado:** Core oferece administração de perfis e grants, mas o desenho privilegiado de identidade (Auth) não foi aprovado/implantado de modo comprovado. A Issue #49 foi fechada em 23/10 como registro administrativo, sem encerrar a pendência arquitetural. Não converter issue fechada em “problema resolvido”.

**Proposta de execução em dois níveis:**

- **Nível temporário para piloto:** procedimento operacional restrito, controlado e auditado para criar as poucas contas autorizadas, com reconciliação Auth ↔ Core, validação de ativação e bloqueio. Somente após avaliação explícita de segurança.
- **Nível definitivo:** implementar fluxo confiável de provisionamento, recuperação, inativação e revogação após decisão arquitetural. Não colocar `service_role`, segredo de banco, credenciais privilegiadas nem equivalentes no JavaScript do navegador. Tratar criação parcial/erro, corrida de último administrador, sessões antigas e consequências de revogação.

**Critério de aceite:** conta criada tem vínculo único e consistente, acesso mínimo explícito, unidade correta, procedimento de recuperação, trilha de auditoria e retirada efetiva de acesso. A interface administrativa é entrega de UX adicional, não justificativa para improvisar o backend privilegiado.

### GG-08 e GG-09 — Agendamento de Salas

**Fato encontrado:** a PR #88 já implementou histórico paginado das solicitações com status (`pending`, `approved`, `rejected`, `cancelled`), intervalo de datas, nomes de Core e decisão. O arquivo `RequestHistory.tsx` afirma que **reservas diretas permanecem na agenda e auditoria**. Logo, criar novamente o histórico de pedidos seria retrabalho.

**Melhorias propostas:**

1. Exibir responsável institucional e ramal na área do módulo, com política para substituta e configuração que evite editar código a cada mudança de pessoa.
2. Revisar filtros e legibilidade do histórico atual com a secretária, preservando paginação e registros anteriores.
3. Adicionar **histórico de reservas diretas**, sem inventar um pedido `request` para uma reserva direta. Preferir leitura autorizada dos registros efetivos, com filtros de data/estado/autoria quando necessários e retenção do histórico de cancelamento.
4. Preservar **D5-B**: `room_booking_manager` gerencia; o administrador geral não recebe automaticamente capacidade de gestão nem acesso ao histórico privado, mesmo com atribuição simultânea conflitante, conforme contrato vigente.
5. Testar conflitos de horário, aprovação/recusa, fuso `America/Sao_Paulo`, começo apenas no futuro, término até 23:59, cancelamentos, revogações e acesso por papel.

**Aceite:** secretária consegue consultar reservas diretas e solicitações passadas sem depender de varrer a agenda; solicitante e administrador sem `manage` não acessam as informações privadas da gestão.

### GG-10 e GG-11 — aviso de testes e coleta de feedback

**Objetivo:** funcionário autorizado informa erro ou melhoria diretamente no aplicativo sem depender de mensagens dispersas, e o responsável recebe aviso no e-mail corporativo.

**Fluxo proposto:** botão/entrada “Relatar problema ou sugerir melhoria” → tipo (erro/sugestão) → módulo/tela → descrição → anexos opcionais, como print → confirmação com identificador → notificação por e-mail.

**Requisitos técnicos:**

- Persistir o relato e referência aos anexos **antes** de tentar a notificação. E-mail é canal de aviso, **não** única cópia da evidência.
- Buckets privados, checagem de usuário, limitação de tamanho/tipo, controles de upload, permissões de leitura administrativa e política de retenção/exclusão.
- Coletar contexto útil (rota, versão, horário, navegador quando adequado), **sem** guardar automaticamente JWT, token, senha, segredo, dados financeiros ou fotografia sensível desnecessária.
- Exibir instrução para ocultar informações pessoais/sensíveis de capturas quando possível e limitar o acesso aos relatos.
- Tratar envio duplicado, falta de rede, falha de e-mail, estado “recebido” e possibilidade de encaminhamento manual.
- Tornar aviso de testes e ponto de feedback configuráveis por ambiente; remover o aviso em eventual PROD sem destruir histórico útil.

**Critério de aceite:** erro de e-mail não perde relato; acesso indevido a anexos é negado; responsável pode localizar o registro e a evidência; usuário obtém confirmação clara.

### GG-12 — tela inicial

**Fato confirmado:** `apps/web/src/app/navigation.ts` possui descrições para Qualidade, Custos, Comercial e Administração, mas **não** para `Administrativo`. As duas categorias têm finalidades distintas.

**Texto proposto para `Administrativo`:**

> Organize as atividades administrativas da empresa, consulte agendas, acompanhe solicitações e acesse os serviços internos em um só lugar.

Revisar cores/faixas pela identidade visual existente e verificar contraste, legibilidade, responsividade e estados de navegação. **Baixa prioridade operacional**; ótima tarefa paralela.

### GG-13 — Cloudflare Turnstile e controles de borda

**Fato conhecido:** o STAGING foi publicado por Cloudflare Tunnel; o AS-BUILT de 30/10 não comprova Cloudflare Access ou novas regras WAF. **Recomendação técnica, não decisão aprovada:** avaliar Turnstile para fluxos adequados de autenticação e verificar a compatibilidade com a versão efetivamente implantada do Supabase Auth self-hosted.

Antes de implementar, definir ameaça concreta (robôs, força bruta, abuso), local correto de verificação de token no backend, condições de falha, acessibilidade e testes de login/celular. Evitar aplicar desafios indiscriminados às chamadas Auth/REST/Storage. Examinar rate limiting, proteção de credenciais, Cloudflare Access para STAGING quando compatível com a experiência de login e políticas de cache/cabeçalhos. Proteção de borda **não** substitui RBAC/RLS/RPC/segredos/backup.

### GG-14 e GG-15 — operação e aceite final

Monitorar saúde de PostgreSQL, Auth, PostgREST, Storage, Caddy/Cloudflare Tunnel, uso de disco, memória, alertas de backup e expiração de recursos críticos. O projeto tem um host único; definir quem recebe alertas e como registrar incidentes. Testar reinício do host em janela apropriada, manutenção e recuperação.

Cada módulo incluído no piloto deve ter uma pequena matriz de **fluxos felizes, entradas inválidas, falha de rede, permissões e dispositivos reais**, além dos gates canônicos aplicáveis. O responsável formaliza o aceite e registra limitações restantes.

---

## 7. Plano de execução por etapas e dependências

### Etapa 0 — Fotografia operacional

- [ ] Confirmar ambiente e data do último deploy da C30.
- [ ] Confirmar commit/branch, migrations, volumes, espaço livre/SMART e serviços **por leitura segura**.
- [ ] Registrar quais módulos realmente estão publicados e quais existem apenas na `main`/notebook.
- [ ] Identificar dados reais/sintéticos atualmente presentes e usuários autorizados a acessar o STAGING.
- [ ] Registrar as divergências entre AS-BUILT, README, código e banco sem corrigir por inferência.

**Saída:** inventário datado GG-01 + mapa dos riscos e dependências.

### Etapa 1 — Continuidade (primeira prioridade operacional)

- [ ] Definir RPO, RTO, frequência, retenção, destino, custo, acesso e responsabilidade.
- [ ] Implementar backup remoto cifrado e alertas, preservando banco/Auth/objetos/configurações.
- [ ] Executar restore de todo o conjunto **em destino isolado**.
- [ ] Conferir login, perfis, auditoria, arquivos, RLS e capacidade de iniciar a release correspondente.
- [ ] Registrar evidência, duração, perda potencial e procedimento de substituição de host.

**Saída:** GG-02/GG-03 com prova e runbook, não apenas “script criado”.

### Etapa 2 — Identidades e permissões (pode ser desenvolvida em paralelo)

- [ ] Confirmar matriz de Sales Manager/Viewer/Operator e administrador.
- [ ] Implementar/ajustar papéis sem ampliar escopos existentes.
- [ ] Validar casos de autorização positivos e **negativos** via API/DB.
- [ ] Decidir processo provisório de provisionamento e requisitos do definitivo.
- [ ] Conferir acesso e revogação do `room_booking_manager` (D5-B).

**Saída:** GG-04/GG-05/GG-06 testados em ambiente autorizado.

### Etapa 3 — Ajustes de experiência e suporte

- [ ] Exibir responsável e ramal no Agendamento.
- [ ] Melhorar histórico de pedidos **existente** e desenvolver histórico de reservas diretas.
- [ ] Implementar aviso de fase de testes e canal de feedback/evidências.
- [ ] Ajustar descrição/cores de `Administrativo`.
- [ ] Avaliar Turnstile e controles Cloudflare sem introduzir regressão.

**Saída:** GG-08–GG-13 validados e documentados.

### Etapa 4 — Release candidata e homologação

- [ ] Congelar SHA e identificar todas as migrations/novos serviços/variáveis necessárias.
- [ ] Executar testes automáticos/CI e negativos no SHA candidato.
- [ ] Ensaiar mudanças e forward-fix em ambiente apropriado, sem usar reset no STAGING.
- [ ] Preparar comunicação, janela autorizada, backup antes do deploy e release anterior preservada.
- [ ] Atualizar STAGING **somente após autorização específica**, executar smoke e registrar resultado.
- [ ] Validar no celular e computador com usuários representativos, acompanhando a secretária e outros responsáveis de negócio.
- [ ] Conferir métricas/alertas, permissões, feedback e processo de suporte.

**Saída:** GG-07/GG-14/GG-15 e decisão documentada: **GO PILOTO**, **GO CONDICIONADO** ou **NO-GO**, com limites explícitos.

### Etapa 5 — Piloto e expansão

- [ ] Identificar usuários/unidades do primeiro grupo e canal de comunicação.
- [ ] Definir processos cobertos e sistemas legados que **continuam válidos**.
- [ ] Registrar relatos e classificar por severidade/impacto.
- [ ] Tratar defeitos críticos com mudança versionada, evidências e re-homologação pertinente.
- [ ] Ampliar público somente mediante novo aceite; não desligar o legado por inferência.

**Saída:** relatório de piloto e decisão posterior sobre ampliação/produção.

---

## 8. Matriz de testes críticos (mínimo sugerido)

| Área | Caso positivo | Caso negativo / falha | Evidência necessária |
| --- | --- | --- | --- |
| Backup | Banco, Auth e anexos restaurados. | HD original indisponível, objeto ausente/corrompido, chave indisponível. | Runbook, hashes/contagens, tempo e resultado. |
| Sales | Manager A cria/edita/consulta/exporta A. | Viewer tenta escrever; A tenta exportar B; usuário inativo acessa RPC. | JWT/usuários distintos, respostas e registros saneados. |
| Administração | Criar conta e conceder papel/unidade. | Criar conta parcial, autoelevação, revogar e reutilizar sessão antiga. | Auditoria, Auth/Core coerentes, permissões após revogação. |
| Agendamento | Pedir, aprovar, recusar, reservar diretamente e consultar históricos. | Aprovação simultânea, horário passado, usuário sem `manage`, solicitação alheia. | Banco/RPC + navegação da secretária. |
| Feedback | Criar erro/sugestão com imagem e notificação. | Falha de e-mail, anexo indevido, leitura por terceiro, duplicidade. | Registro preservado, acesso negado, aviso rastreável. |
| Release | Login, consulta, escrita autorizada e Storage após atualização. | Migration incompatível, configuração inválida, falha de frontend. | SHA, ledger, logs saneados, retorno/forward-fix. |
| Cloudflare | Navegação segura, Auth e APIs operacionais. | Falha de desafio, bloqueio indevido, cache de dado sensível. | Teste no ambiente/celular, cabeçalhos e regras documentadas. |
| Operação | Reinício e alertas recebidos. | Serviço parado, disco quase cheio, backup falho, Tunnel indisponível. | Registro de alerta, responsável e reação. |

**Princípio:** esconder um botão não é teste de autorização. As ações indevidas precisam ser negadas no banco/RPC/Storage com contas e escopos representativos.

---

## 9. Pendências de decisão humana — não inferir

As decisões abaixo precisam ser registradas explicitamente quando a tarefa chegar ao respectivo gate:

1. **RPO/RTO** aceitáveis para perda do host e para falhas durante o expediente; política de retenção e custo da nuvem.
2. **Destino e operação do backup**: provedor, contas de serviço, criptografia, responsáveis pelas chaves, alertas e retenção protegida.
3. **Perfis de Vendas**: confirmar novo Viewer, destino do Operator existente, exportação completa para Viewer e privilégio financeiro do administrador geral.
4. **Criação de usuários**: aprovação da solução privilegiada definitiva e política temporária para piloto.
5. **Agendamento**: nome/ramal oficiais, substituta, filtros desejados para reservas diretas e aceite da secretária.
6. **Canal de feedback**: endereço corporativo destinatário, retenção, quem vê relatos/anexos e limites dos arquivos.
7. **Cloudflare**: ameaça/prioridade real, eventual uso de Access e política de acesso externo ao STAGING.
8. **Piloto**: participantes, unidades, módulos, dados permitidos, processos antigos, suporte e autorização de início/ampliação.

Este guia registra **propostas**. Nunca converter recomendações em ADR aceito, migration aprovada, concessão de acesso ou GO operacional sem decisão do responsável.

---

## 10. Protocolo de trabalho do assistente como guia do projeto

Quando este documento estiver disponível nas fontes do projeto, o assistente deverá utilizá-lo como **referência de planejamento**, em conjunto com a fonte canônica do GitHub. O acompanhamento ocorre **durante as conversas e tarefas solicitadas**; a existência do guia não implica monitoramento automático de servidor, GitHub, e-mail ou progresso.

### 10.1. Antes de recomendar ou executar uma tarefa

1. Confirmar **qual entrega** (GG-XX), objetivo, ambiente (local, DEV compartilhado, STAGING, PROD) e resultado esperado.
2. Ler o **estado atual** da `main`, PRs, arquivos relevantes, decisões vigentes, status do servidor quando houver evidência operacional, e dependências do módulo.
3. Distinguir o que está **implementado**, **integrado**, **aplicado**, **testado**, **homologado** e **autorizado**.
4. Observar `AGENTS.md`, ADRs aceitos, Plano Diretor, contratos do módulo e políticas de preservação. **Regras históricas revogadas, como D5-A, não devem ser reaplicadas por engano após D5-B.**
5. Identificar riscos de dados, Auth, RLS, Storage, migrations, segredos, ambiente compartilhado e impacto no legado.
6. Propor a menor alteração funcional suficiente e critérios de aceite verificáveis. Não ampliar escopo por conveniência.

### 10.2. Durante o desenvolvimento

- Trabalhar em alteração focalizada, versionada, rastreável e com testes pertinentes.
- Reutilizar o Supabase/Docker **local existente** por padrão, após identificar o ambiente correto; não provisionar containers/volumes por rotina.
- Não executar `supabase db reset`, `db push`, `--linked`, `docker compose down -v`, `prune`, formatação, SQL destrutivo ou migrations na C30/STAGING/PROD sem autorização explícita e plano próprio.
- **Nunca** inserir segredos privilegiados no frontend, documentação, evidências de testes, issue ou PR.
- Tratar migrations já aplicadas como **append-only**; preparar estratégia de migração/reversão/forward-fix para dados persistentes.
- Preservar princípios de autorização por capacidade e escopo no banco; testes negativos são obrigatórios quando a entrega alterar permissões.
- Atualizar documentação do módulo, diagramas/roadmap e evidência de CI quando a mudança exigir.
- Como o projeto possui **um mantenedor humano**, ele decide o merge e o GO. Não inventar revisão independente; registrar os riscos e os controles efetivamente executados.

### 10.3. Formato padrão dos próximos pareceres do assistente

Ao analisar uma tarefa, responder preferencialmente com:

1. **Estado encontrado:** arquivos/PRs/versões e o que já existe.
2. **Lacuna real:** o que falta, sem duplicar funcionalidade presente.
3. **Plano de execução:** passos mínimos, ordem/dependências e áreas afetadas.
4. **Segurança e preservação:** ambientes proibidos, dados, migração, credenciais e autorização.
5. **Critérios de aceite/testes:** positivos, negativos, dispositivos, evidência exigida.
6. **Resultado constatado:** PASS/FAIL/BLOCKED/NOT EXECUTED, com SHA/ambiente/data.
7. **Próximo passo recomendado:** uma ação objetiva, que desbloqueia a seguinte.

O assistente deve sinalizar inconsistências entre documentos e código, pedir **decisão humana apenas quando ela for de fato necessária**, e nunca declarar teste/merge/deploy/restore realizado sem evidência concreta. Não atribuir ao sistema capacidades, disponibilidade ou proteção que não foram comprovadas.

### 10.4. Modelo de registro por tarefa

Copiar a estrutura abaixo ao iniciar uma entrega:

```markdown
## GG-XX — [título]
- Status: NÃO INICIADO | EM ANÁLISE | EM DESENVOLVIMENTO | EM TESTE | BLOQUEADO | ACEITO
- Prioridade e escopo:
- Ambiente permitido / proibido:
- Referências canônicas e SHA de partida:
- Estado encontrado / lacuna:
- Dependências e decisões necessárias:
- Alterações previstas:
- Riscos e medidas de preservação:
- Testes positivos, negativos e de regressão:
- Evidências: comandos, data, ambiente, SHA, logs saneados, PR:
- Resultado e limitações:
- Aprovação humana e próximo passo:
```

**Estados não são sinônimos de evidência:** “EM TESTE” não é “ACEITO”; “PR mergeada” não é “implantado”; “backup criado” não é “restore comprovado”.

---

## 11. Checklist mestre para decisão de piloto

Marcar cada item apenas com evidência verificável; usar **N/A justificado** quando realmente fora do escopo do piloto.

### Continuidade e operação

- [ ] GG-01 — ambiente/versão/volumes atuais identificados.
- [ ] GG-02 — backup automático independente, cifrado, com retenção e alertas.
- [ ] GG-03 — restauração completa isolada executada e documentada.
- [ ] RPO/RTO e responsável por incidentes definidos/aceitos.
- [ ] GG-14 — saúde, disco, serviços, Tunnel e falhas de backup monitorados.
- [ ] Plano de interrupção, comunicação e recuperação definido.

### Segurança, identidade e dados

- [ ] GG-04 — matriz Sales Manager/Viewer aprovada e testada por unidade.
- [ ] GG-05 — procedimento seguro de criar/inativar/revogar usuários comprovado.
- [ ] GG-06 — negativas de RLS/RPC/Storage e cross-unit testadas na versão candidata.
- [ ] Acesso externo, portas, segredos, credenciais e cache/cabeçalhos revisados.
- [ ] Dados de teste e eventuais dados reais autorizados/classificados.

### Fluxos de negócio e experiência

- [ ] Agendamento: responsável/ramal e histórico de solicitações e reservas diretas validados.
- [ ] Vendas: CRUD, dashboard, cálculos e exportação conciliados com resultados esperados.
- [ ] Aviso de testes e canal de bugs/sugestões funcionando e com privacidade.
- [ ] Interface e fluxo essenciais testados em dispositivos/navegadores utilizados pela empresa.
- [ ] P1–P9/O1–O8 e aceites específicos dos módulos avaliados conforme escopo.

### Implantação e autorização

- [ ] GG-07 — SHA candidato, migrations e compatibilidade conferidos.
- [ ] CI e testes relevantes PASS **no SHA correto**, falhas e itens não executados registrados.
- [ ] Backup anterior ao deploy, plano de retorno/forward-fix e release anterior preservados.
- [ ] Smoke tests pós-deploy e acompanhamento operacional concluídos.
- [ ] GG-15 — participantes, responsabilidades, limites e início do piloto formalmente aprovados.
- [ ] Soluções legadas preservadas até decisão expressa de transição.

**Decisão final:** `NO-GO` / `GO PILOTO CONTROLADO` / `GO PILOTO CONDICIONADO` / `GO PRODUTIVO` (**preencher somente com autorização e evidências; padrão permanece NO-GO produtivo**).

---

## 12. Histórico e manutenção deste guia

| Versão | Data | Alteração |
| --- | --- | --- |
| **1.0** | **04/11/2026** | Consolidação da análise da lista de cuidados finais; checagem de documentação/código/PRs; backlog GG-01 a GG-15, gates e protocolo de acompanhamento. |

**Como manter atualizado:**

- Registrar revisões neste documento com data, autor, fonte e motivo.
- Para cada GG-XX, manter evidência específica em issue/PR/documentação operacional, **não** apenas aqui.
- Se a `main` ou a C30 avançar, atualizar o retrato datado da seção 3 após verificação. Não editar o passado para fazê-lo parecer já realizado.
- Preferir links para fontes canônicas e não duplicar segredos, dados pessoais, scripts de implantação perigosa ou grandes trechos do código.
- Revisar prioridades após o primeiro restore, após cada merge relevante e antes de qualquer liberação.

**Próxima ação recomendada neste documento:** iniciar **GG-01 (inventário em modo leitura)** e, com o estado real confirmado, executar **GG-02/GG-03 (backup remoto e restauração independente)**. Em desenvolvimento local, pode-se avançar paralelamente no desenho/validação de **GG-04 (Sales Manager/Viewer)** sem instalar alterações na C30 por inferência.