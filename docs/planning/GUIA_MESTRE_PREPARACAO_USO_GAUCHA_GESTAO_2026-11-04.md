# Gaúcha Gestão — Guia mestre de preparação para uso real

**Versão:** 1.2\
**Data-base da análise:** 04/11/2026  
**Responsável pelas decisões de produto, aprovações e liberação:** mantenedor/titular do projeto  
**Repositório de referência:** [The-Vonky/Gaucha-Gestao](https://github.com/The-Vonky/Gaucha-Gestao)  
**Classificação:** documento de planejamento, acompanhamento e orientação; **não** é autorização para implantar em produção, alterar ambientes persistentes ou executar operações privilegiadas.  
**Estado-base para uso produtivo:** **PROD NO-GO**, até fechamento e aceite dos requisitos aplicáveis.

> **Revisão DOC-03 — 25/11/2026.** A [matriz GG-01–GG-15](#51-matriz-gg-01gg-15) usa a baseline de código `e0b6f5cf563eb66a45a16e03a9137d36211d9ef3` (merge da PR #134). O [Mapa de Implementação](../architecture/IMPLEMENTATION_MAP.md) reúne rotas, código, contratos e evidências por módulo. Datas anteriores registram os respectivos recortes.

> **Propósito deste documento.** Reunir a análise dos cuidados finais levantados pelo responsável, registrar o estado verificável do projeto e estabelecer um método de trabalho para que o assistente atue como guia técnico no desenvolvimento, na preparação do servidor, na homologação e na liberação gradual. Este documento deve ser consultado junto com o código, os ADRs e os contratos canônicos atualizados, não em substituição a eles.

---

## 1. Resumo executivo e recomendação

A Gaúcha Gestão já oferece funcionalidades úteis, mas há uma diferença entre **funcionalidade desenvolvida**, **versão integrada na `main`**, **versão publicada na C30**, **função homologada por usuários** e **serviço autorizado para operação**. Essas condições **não são equivalentes**.

O caminho recomendado é uma **liberação gradual e controlada**, iniciando por módulos selecionados e funcionários autorizados, somente após proteger os dados, comprovar recuperação do ambiente, validar as permissões e preparar um processo seguro de atualização. É possível desenvolver pequenas melhorias em paralelo às tarefas de infraestrutura; **não** se deve confundir essa liberdade de desenvolvimento com autorização para promover a versão ao servidor persistente.

A ordem atual recomendada e suas dependências estão no [plano de execução](#7-plano-de-execução-por-etapas-e-dependências). A próxima tarefa técnica no DEV é fechar a evidência do ciclo integral de Identity pelo Vite. A próxima tarefa operacional é atualizar GG-01 com autorização própria, para preparar a continuidade da C30. DOC-04 e DOC-05 seguem como frentes documentais separadas.

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

| Estado | Evidência exigida |
| --- | --- |
| **PLANEJADO** | Intenção, proposta ou brief sem implementação demonstrada. |
| **EM DESENVOLVIMENTO** | Implementação em branch ainda fora da `main`. |
| **INTEGRADO** | Código ou artefato presente na `main`, identificado por PR/commit. |
| **VALIDADO AUTOMATICAMENTE** | Testes pertinentes executados, com SHA, ambiente, resultado e recorte. |
| **HOMOLOGADO NO DEV** | Aceite funcional do mantenedor registrado para o recorte testado. |
| **PENDENTE DE HOMOLOGAÇÃO OPERACIONAL** | A prova técnica existe e o aceite de uso real segue incompleto. |
| **GO OPERACIONAL** | Autorização expressa, para ambiente e escopo definidos. |
| **HISTÓRICO** | Evidência ou descrição de uma baseline anterior. |
| **SUBSTITUÍDO** | Contrato ou decisão superada, com referência à sucessora. |

Os estados podem coexistir. Registre a presença no DEV e o estado implantado no ambiente-alvo por versão, configuração e ledger próprios.

Sempre identificar **ambiente, commit/versão, data e evidência** ao declarar um resultado.

---

## 3. Retrato técnico conhecido do projeto

### 3.1. Arquitetura e operação

O repositório descreve frontend React + TypeScript, autenticação Supabase Auth, PostgreSQL, RPCs de negócio, autorização por grants/RLS e arquivos via Supabase Storage. O módulo Core centraliza perfis, papéis, unidades e auditoria. O host de testes documentado é uma Lenovo ThinkStation C30 com Ubuntu Server, serviços persistentes, Caddy e Cloudflare Tunnel. Esse conjunto é um **servidor único**, sem alta disponibilidade automática.

A arquitetura de produção planejada inclui escolhas ainda não integralmente implantadas ou comprovadas — por exemplo, a separação do frontend e o eventual uso de R2. Essas propostas não devem ser tratadas como infraestrutura já existente. Cloudflare Tunnel viabiliza entrada HTTPS, mas não garante isolamento de usuários, proteção de dados nem backup.

### 3.2. Divergência entre `main` e servidor

| Ambiente | Evidência datada | Conferência necessária |
| --- | --- | --- |
| **DEV pessoal Ubuntu** | [PR #133](https://github.com/The-Vonky/Gaucha-Gestao/pull/133) registra `gaucha-gestao-local` com Identity, nove serviços, Vite via `npm run dev` e ledger de 47 migrations. [PR #134](https://github.com/The-Vonky/Gaucha-Gestao/pull/134) usa esse perfil e confere as migrations de Salas. | Versão servida, serviços e ledger em cada entrega que dependa de runtime. |
| **Windows / CI / DEV compartilhado** | Windows com WSL2 e Docker Desktop é suportado. CI usa recursos descartáveis. A [#68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68), encerrada, documenta um recorte histórico do DEV compartilhado. | Seguir a [matriz de ambientes](../architecture/STACK_INTEGRATION.md#ambientes-e-topologias), com destino e credenciais próprios. |
| **C30 STAGING** | [AS-BUILT de 30/10](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) registra `f9f041e` e 18 migrations. O [inventário de 05/11](../operations/C30_GG01_INVENTORY_20261105.md) aponta lacunas. | Revalidar a C30 na GG-01. O ledger do checkout pessoal se aplica apenas àquele recorte DEV. |
| **PROD** | Arquitetura planejada e **NO-GO**. | Gates do Plano Diretor, aceites aplicáveis, recuperação e GO explícito. |

O procedimento de atualização deve observar especificamente o [guia de release da C30](https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/operations/C30_STAGING_RELEASE_GUIDE.md): **backup consistente e restaurável**, release candidata congelada, CI do SHA, migrations **append-only**, preservação do bundle anterior, verificações negativas e registro da operação. O script de aplicação de migrations do laboratório não é presumidamente seguro para o banco STAGING persistente.

### 3.3. Bloqueadores já reconhecidos no projeto

- Backup remoto automático de banco + Auth + Storage e recuperação independente **não comprovados** no registro operacional.
- RPO/RTO, retenções e tempos de recuperação **sem definição/medição técnica suficiente** para encerrar os gates.
- Matriz negativa de acessos, visibilidade entre unidades, inativação/revogação e arquivos pendente no ambiente candidato.
- **GG-05B já implementada e homologada no DEV** ([PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127)); ainda faltam revisão de segurança aplicável, recuperação emergencial do administrador, adoção segura na C30 e GO operacional. A Issue #49 foi encerrada administrativamente, não autoriza outros ambientes.
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
| **GG-09** | Agendamento: histórico completo de gestão | **P1** | Contratos do módulo; AG-D5-C | Histórico existente revisado; reservas diretas consultáveis sem pedidos artificiais; filtros e permissões testados. |
| **GG-10** | Aviso de testes | **P1** | Política de ambiente | Aviso claro, não intrusivo e configurável; não confunde STAGING com PROD. |
| **GG-11** | Canal de bugs e sugestões com evidências | **P1** | Contrato de dados, Storage e recebimento interno | Relato persistido, anexos privados e consulta exclusiva do Platform Administrator. |
| **GG-12** | Ajustes de cores e descrição de Administrativo | **P2** | Revisão visual | Descrição incorporada; cores e contrastes revisados em desktop/celular. |
| **GG-13** | Cloudflare Turnstile e endurecimento da borda | **P1/P2 conforme ameaça** | Verificar self-hosted Auth e regras Cloudflare | Testes de login, falha/expiração/validação, ausência de bloqueio indevido de APIs. |
| **GG-14** | Monitoramento e observabilidade | **P0 para operação real** | Host e arquitetura alvo | Alertas para host, disco, serviços, banco, storage, túnel e falha do backup; responsáveis sabem como reagir. |
| **GG-15** | Homologação e autorização do piloto | **P0 final** | P0 aplicáveis e funcionalidades do piloto | Aceites funcionais/operacionais registrados; público, limites, suporte e GO do piloto assinados pelo responsável. |

<a name="51-estado-atual-das-15-ggs--23112026"></a>

### 5.1. Matriz GG-01–GG-15

**Revisão da matriz em 25/11/2026.** Sete etapas têm implementação integrada (GG-04, GG-05, GG-08 a GG-12), três têm evidência parcial (GG-01, GG-02, GG-06) e cinco permanecem abertas como entregas operacionais (GG-03, GG-07, GG-13 a GG-15). A leitura combina código, CI e aceites documentados por recorte.

| Etapa | Estado técnico | Evidência | Pendência operacional | Dependências | Próxima ação |
| --- | --- | --- | --- | --- | --- |
| **GG-01** Inventário | Parcial | [Inventário de 05/11](../operations/C30_GG01_INVENTORY_20261105.md), [AS-BUILT de 30/10](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e [PR #104](https://github.com/The-Vonky/Gaucha-Gestao/pull/104). | Estado atual, dados/volumes, rede, capacidade e recuperação da C30. | Acesso e autorização de leitura. | Revalidar SHA, serviços, ledger, mounts e separação do ERP. |
| **GG-02** Backup | Parcial, ensaios sintéticos validados | Laboratórios B/C e [PR #114](https://github.com/The-Vonky/Gaucha-Gestao/pull/114) e [Issue #113](https://github.com/The-Vonky/Gaucha-Gestao/issues/113), com `Preflight`/`Run` relatados no Drive sintético em 10/11. DEV base tem procedimento próprio. | Cópia independente da C30, proteção do destino/chaves, frequência, retenção, alertas e operação verificável. | GG-01 e decisões de custódia, RPO/RTO e autorização. | Validar o desenho da captura, a proteção do destino e os alertas. |
| **GG-03** Recuperação total | Aberta, ensaios sintéticos parciais | [Ensaio a frio](../history/operations/02_RESTORE_DRILL.md) e [limite do backup DEV](../operations/DOCKER_LOCAL_STANDARDIZATION.md#limite-do-backup-com-identity). | Recuperação completa do DEV com Identity e restore independente da instalação C30 com tempo/perda medidos. | Para C30, GG-01/GG-02 e destino independente autorizado. Para DEV, insumos privados e runbook próprio. | Preparar ensaios separados e provar Auth, RLS, bytes e versão recuperada. |
| **GG-04** Perfis Vendas | Integrada, validada e homologada no DEV | [PR #126](https://github.com/The-Vonky/Gaucha-Gestao/pull/126), `189106a`, e [autorização](../architecture/AUTHORIZATION.md#perfis-institucionais-de-vendas--gg-04). | Matriz integradora na candidata, conferência de escopos em ambiente-alvo e VEN-07/08. | GG-06/GG-07 e gates VEN. | Reusar negativas de catálogo, escopo, CRUD, analytics e exportações. |
| **GG-05** Cadastro/Identity | Integrada, validada e homologada nos recortes DEV | [PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127), `df113c2`, e [runbook](../operations/GG_05B_IDENTIDADE_DEV.md). | Ciclo integral no Vite, recuperação emergencial do administrador, recuperação integral com Identity, revisão de segurança e GO de adoção. | D01, ambiente DEV com Identity e plano de recuperação. | Registrar ciclo completo pelo `npm run dev`, com sessão e revogação. |
| **GG-06** Permissões | Parcial, recortes automatizados | [validate.yml](../../.github/workflows/validate.yml), [infra-validate.yml](../../.github/workflows/infra-validate.yml), [PR #133](https://github.com/The-Vonky/Gaucha-Gestao/pull/133) e [PR #134](https://github.com/The-Vonky/Gaucha-Gestao/pull/134). | Evidência unificada por papel/unidade/setor, identidade, Storage, revogação, ações cruzadas e negativas na candidata. | Contratos atuais, GG-04/GG-05, AG-D5-C e candidata GG-07 para a etapa operacional. | Montar matriz e executar lacunas primeiro no DEV autorizado. |
| **GG-07** Release candidata | Aberta, runbooks existentes | [Guia da C30](../operations/C30_STAGING_RELEASE_GUIDE.md) e [AS-BUILT](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md). | Versão implantada, ledger comparado, migrations incrementais, verificação pós-update e reversão comprovada. | GG-01–03, CI do SHA e revisão de segurança, com GO da mudança. | Preparar plano e comparar ledger do alvo com migrations da candidata. |
| **GG-08** Contato de Salas | Integrada e validada automaticamente | [PR #116](https://github.com/The-Vonky/Gaucha-Gestao/pull/116) e [regressão #134](https://github.com/The-Vonky/Gaucha-Gestao/pull/134), com contato persistido no Vite/Identity. | Aceite de contato institucional e AG-05. | AG-D5-C, autorização da responsável e candidata para uso operacional. | Homologar com a responsável, incluindo aparelho físico. |
| **GG-09** Histórico de Salas | Integrada e validada automaticamente | [PR #116](https://github.com/The-Vonky/Gaucha-Gestao/pull/116), [#129](https://github.com/The-Vonky/Gaucha-Gestao/pull/129) e [#134](https://github.com/The-Vonky/Gaucha-Gestao/pull/134), com solicitações e reservas diretas no recorte DEV. | Aceite AG-05 de fila, históricos, privacidade e dispositivo real. | AG-D5-C e [#84](https://github.com/The-Vonky/Gaucha-Gestao/issues/84). | Homologar os fluxos com secretária e mantenedor. |
| **GG-10** Comunicados | Integrada e validada em recortes DEV/CI | [PR #117](https://github.com/The-Vonky/Gaucha-Gestao/pull/117) e [contrato](../modules/announcements/ADMINISTRATION_V1.md). | Responsáveis, publicação institucional, vigência e aceite no alvo. | GG-06/GG-07 e configuração do piloto. | Validar gestão, leitura e vigência na candidata. |
| **GG-11** Relatos | Integrada, correção Identity validada e homologada no DEV | [PR #117](https://github.com/The-Vonky/Gaucha-Gestao/pull/117) e [#133](https://github.com/The-Vonky/Gaucha-Gestao/pull/133), `84ed3c0`. | Aceite integral, retenção, responsáveis e recuperação de anexos. | GG-05/GG-06/GG-07 e continuidade de Storage. | Validar ciclo e governança de suporte na candidata. |
| **GG-12** Página inicial | Integrada | [PR #115](https://github.com/The-Vonky/Gaucha-Gestao/pull/115), descrição de Administrativo e faixas fixas por grupo. Roteiros da [#134](https://github.com/The-Vonky/Gaucha-Gestao/pull/134) exercitam viewports em Salas. | Evidência visual própria da home, contraste e aparelhos de uso real. | Candidata, permissões e dispositivos representativos. | Conferir a home em larguras e dispositivos previstos. |
| **GG-13** Proteção de ingresso | Planejada | [AS-BUILT](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) comprova Tunnel de teste. [Requisitos GG-13](#gg-13--cloudflare-turnstile-e-controles-de-borda). | Compatibilidade de Auth, proteção proposta e resposta a abuso/falhas. | Inventário do ingresso, análise de ameaça e decisão de mudança. | Avaliar Turnstile/rate limiting com cenários de falha e acessibilidade. |
| **GG-14** Monitoramento | Planejada, health checks técnicos disponíveis | [Matriz operacional](../operations/OPERATIONS_MATRIX.md) e [plano da C30](../operations/C30_BACKUP_OPERATIONAL_PLAN.md). | Alertas reais, plantão/escalonamento, manutenção, incidentes e ensaio de reinício. | GG-01–03, ambiente-alvo e responsáveis definidos. | Definir sinais e testar entrega e resposta aos alertas, inclusive de backup. |
| **GG-15** Piloto/GO | Aberta | [Critérios do piloto](#41-piloto-controlado) e [gates P1–P9/O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md). | Aceite por módulo, operação assistida e GO humano com escopo, ambiente e participantes. | GG-06/GG-07/GG-14, continuidade, segurança e aceites aplicáveis. | Registrar evidências, limitações, responsáveis e decisão de liberação. |

A avaliação da GG-06 parte das negativas existentes em Core/Governança, Qualidade e Planos, ABC, Vendas, Salas, Comunicados e Relatos. O catálogo por domínio está no [Mapa de Implementação](../architecture/IMPLEMENTATION_MAP.md). A validação integradora ainda deve cruzar JWT/session admission, escopos, perfis inativos ou revogados, permissões dos buckets, concorrência e ações entre módulos para o mesmo SHA e ambiente.

---

## 6. Especificações das entregas mais importantes

### GG-01 a GG-03 — backup, perda total do HD e restauração

**Evidência de novembro:** GG-01 tem [inventário inicial](../operations/C30_GG01_INVENTORY_20261105.md) da C30, com ressalvas. Na GG-02, o mantenedor comprovou `Preflight` e `Run` sintéticos no Drive real em 10/11 ([PR #114](https://github.com/The-Vonky/Gaucha-Gestao/pull/114)); automatização na C30 não está comprovada. GG-03 permanece sem restore independente da instalação atual. A [recuperação do Compose base](../operations/DOCKER_LOCAL_STANDARDIZATION.md#backup-e-restauração-de-um-dev-compose) abrange oito serviços no DEV. O pacote integral com Identity exige quiescência, manifests e insumos privados da extensão, ordem de recuperação e prova pós-restore. Os dumps da C30 têm inspeção estrutural registrada. As provas sintéticas e o fluxo base têm escopos próprios.

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

**Decisão do mantenedor (18/11/2026):** dois perfis institucionais operacionais,
com atribuição global ou por unidade. A exportação completa do Viewer se limita
às unidades autorizadas. O `platform_administrator` mantém as sete capacidades
de Vendas em sua atribuição administrativa global.

| Papel | Consultar | Criar | Editar | Excluir logicamente | Dashboard | Exportar filtrado | Exportar completo |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Sales Manager** | Sim | Sim | Sim | Sim | Sim | Sim | Sim |
| **Sales Viewer** | Sim | Não | Não | Não | Sim | Sim | Sim |

A [composição definitiva](../architecture/AUTHORIZATION.md#perfis-institucionais-de-vendas--gg-04)
usa uma migration incremental para remover o papel de operação anterior e criar o
Viewer sem atribuições automáticas. **GG-04 foi homologada pelo mantenedor no notebook e integrada pela [PR #126](https://github.com/The-Vonky/Gaucha-Gestao/pull/126) (merge `189106a`, 18/11/2026).** O `sales_operator` foi removido do catálogo operacional do DEV. A C30 exige inventário e autorização operacional próprios.

**Testes de aceite:** usuário com unidade A não lê, altera, calcula nem exporta B; Viewer não escreve nem por RPC direta; Manager opera apenas unidades permitidas; usuário sem papel, inativo ou revogado recebe negação; relatórios não agregam dados fora da interseção das permissões; mudanças de grants durante a sessão são respeitadas.

### GG-05 — criação de usuários e Identity Boundary

**Estado em 23/11: GG-05A/B concluídas no desenvolvimento, homologadas no notebook e integradas à `main`** pela [PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127) (merge `df113c2`). O [runbook GG-05A](../operations/GG_05A_PROVISIONAMENTO.md) documenta diagnóstico/reconciliação; a [GG-05B](../operations/GG_05B_IDENTIDADE_DEV.md) implementa cadastro administrativo por nome/e-mail/papel/escopo, componente interno de identidade, senha temporária individual sem expiração por tempo, troca obrigatória, redefinição e controle de sessões/gerações.

**Validação registrada:** fluxo homologado pelo mantenedor no notebook com identidade sintética, incluindo refinamentos de interface e senhas; nove checks de CI aprovados no HEAD homologado. A temporária vale até troca, substituição ou bloqueio; senha definitiva mínima de oito caracteres. Não há chave administrativa exposta no navegador.

**Limite:** concluída como funcionalidade no **DEV**, não como implantação/GO da C30, STAGING, PROD ou piloto. Recuperação emergencial do administrador, revisão de segurança aplicável, adoção/recuperação de contas legadas, ciclo integral pelo Vite com `npm run dev`, recuperação integral do DEV com Identity e homologação do ambiente-alvo continuam pendentes. A antiga PR #24 não foi mergeada; a Issue #49 foi encerrada administrativamente, sem equivaler a GO. Ver [D01](DECISION_REGISTER.md).

### GG-08 e GG-09 — Agendamento de Salas

**Ambas implementadas e integradas à `main`** na [PR #116](https://github.com/The-Vonky/Gaucha-Gestao/pull/116), em 10/11/2026.

- **GG-08:** responsável e ramal consultáveis na agenda, editáveis pela gestão efetiva com versão e auditoria.
- **GG-09:** duas abas de histórico — solicitações e reservas diretas, inclusive canceladas — com filtros/paginação; sem pedidos artificiais para reservas diretas.
- **AG-D5-C vigente:** `room_booking_manager` e Platform Administrator globais têm gestão efetiva. O administrador alterna as vistas Requester e Manager sem alterar a capacidade no banco. AG-05 mantém o aceite próprio. [Decisão](../modules/room-booking/D5C_ADMIN_MODES.md).

**Evidência posterior:** a PR #134 validou Gestão e UX com Auth/REST simulados e integração real pelo Vite com Identity, incluindo persistência de contato e foto, substituição/enquadramento, remoção, objeto aposentado negado e restauração/limpeza das fixtures.

**Pendência operacional:** contato institucional autorizado, aceite da secretária/gestora com dados e dispositivos reais e release na C30. Não reimplementar o histórico já integrado. Ver [contrato](../modules/room-booking/EXPERIENCE_V1.md).

### GG-10 e GG-11 — aviso de testes e coleta de feedback

**Ambas implementadas e integradas à `main`** na [PR #117](https://github.com/The-Vonky/Gaucha-Gestao/pull/117), com testes documentados. A C30 ainda exige release autorizada, revisão dos registros e política de retenção.

O funcionário ativo relata um problema ou sugere uma melhoria pela barra de
comunicados ou pela ação permanente no cabeçalho. O fluxo interno confirma o
identificador após persistência. O Platform Administrator consulta a fila e os
anexos em **Administração > Relatos e sugestões**. A correção da [PR #133](https://github.com/The-Vonky/Gaucha-Gestao/pull/133) habilitou o upload reservado e o download autenticado desse bucket no perfil estrito. O mantenedor homologou a correção no DEV. O aceite integral do módulo, retenção e critérios da release candidata seguem pendentes. O ensaio de Relatos cobre login admitido e o fluxo do módulo. [Contrato e provas GG-11](../modules/feedback/FEEDBACK_V1.md#provas-da-compatibilidade-com-identity).

O aviso institucional mantém categoria e cor independentes e reserva um único
período de publicação por instante. A fila usa Storage privado e registra
contexto mínimo. A retenção depende de política do mantenedor.

Consulte os contratos de [Comunicados](../modules/announcements/ADMINISTRATION_V1.md)
e [Relatos e sugestões](../modules/feedback/FEEDBACK_V1.md) para os critérios de
aceite e a validação da release candidata.

### GG-12 — tela inicial

**Implementada e integrada à `main`** na [PR #115](https://github.com/The-Vonky/Gaucha-Gestao/pull/115). A descrição de `Administrativo` foi adicionada em `apps/web/src/app/navigation.ts`; o padrão de faixas institucionais passou a alternar verde e laranja. A categoria `Administração` permanece distinta.

A aceitação de contraste e responsividade em dispositivos do ambiente candidato não deve ser confundida com a conclusão do código.

### GG-13 — Cloudflare Turnstile e controles de borda

**Fato conhecido:** o STAGING foi publicado por Cloudflare Tunnel; o AS-BUILT de 30/10 não comprova Cloudflare Access ou novas regras WAF. **Recomendação técnica, não decisão aprovada:** avaliar Turnstile para fluxos adequados de autenticação e verificar a compatibilidade com a versão efetivamente implantada do Supabase Auth self-hosted.

Antes de implementar, definir ameaça concreta (robôs, força bruta, abuso), local correto de verificação de token no backend, condições de falha, acessibilidade e testes de login/celular. Evitar aplicar desafios indiscriminados às chamadas Auth/REST/Storage. Examinar rate limiting, proteção de credenciais, Cloudflare Access para STAGING quando compatível com a experiência de login e políticas de cache/cabeçalhos. Proteção de borda **não** substitui RBAC/RLS/RPC/segredos/backup.

### GG-14 e GG-15 — operação e aceite final

Monitorar saúde de PostgreSQL, Auth, PostgREST, Storage, Caddy/Cloudflare Tunnel, uso de disco, memória, alertas de backup e expiração de recursos críticos. O projeto tem um host único; definir quem recebe alertas e como registrar incidentes. Testar reinício do host em janela apropriada, manutenção e recuperação.

Cada módulo incluído no piloto deve ter uma pequena matriz de **fluxos felizes, entradas inválidas, falha de rede, permissões e dispositivos reais**, além dos gates canônicos aplicáveis. O responsável formaliza o aceite e registra limitações restantes.

---

## 7. Plano de execução por etapas e dependências

**Ordem recomendada para avaliação do mantenedor.** DOC-04, DOC-05 e as próximas tarefas funcionais dependem dos respectivos briefs e autorizações.

| Ordem proposta | Frente e ambiente | Dependência e risco tratado |
| --- | --- | --- |
| 1 | **DEV: ciclo integral de Identity no Vite.** [Runbook](../operations/GG_05B_IDENTIDADE_DEV.md). DOC-04 (curadoria) e DOC-05 podem seguir em paralelo com briefs próprios. | Consolidar evidência de cadastro, troca, reset, readmissão e revogação na entrada normal. As próximas etapas documentais preparam a manutenção das fontes. |
| 2 | **DEV: recuperação administrativa emergencial e restauração integral com Identity.** | Ensaio sintético autorizado, insumos privados e revisão de segurança. Define retomada do privilégio e do serviço após falha. |
| 3 | **DEV: GG-06 e AG-05.** | Fechar negativas transversais da candidata. Para Salas, reservar secretária, mantenedor e aparelho físico. Registrar resultado ABC D13 e homologações por módulo conforme o escopo do piloto. |
| 4 | **Operacional: GG-01 → GG-02/GG-03.** | GO de leitura no ambiente real, depois autorização para backup independente e restore em destino isolado. Medir tempo e perda e verificar proteção da cópia. |
| 5 | **Operacional: GG-07 com GG-13/GG-14.** | Candidata por SHA e ledger, recuperação e reversão verificadas, ingresso revisado, alertas e responsáveis testados. Repetir a matriz GG-06 no ambiente-alvo autorizado. |
| 6 | **Ambiente-alvo: P1–P9/O1–O8 e GG-15.** | Evidência física e operacional, aceites aplicáveis, suporte e janela de piloto. O mantenedor decide GO por ambiente e escopo. |


### Etapa 0 — Fotografia operacional

- [ ] Confirmar ambiente e data do último deploy da C30.
- [ ] Confirmar commit/branch, migrations, volumes, espaço livre/SMART e serviços **por leitura segura**.
- [ ] Registrar quais módulos realmente estão publicados e quais existem apenas na `main`/notebook.
- [ ] Identificar dados reais/sintéticos atualmente presentes e usuários autorizados a acessar o STAGING.
- [ ] Registrar as divergências entre AS-BUILT, README, código e banco sem corrigir por inferência.

**Evidência parcial:** inventário GG-01 de 05/11 ([PR #104](https://github.com/The-Vonky/Gaucha-Gestao/pull/104)). **Ainda necessário:** atualizar a fotografia operacional da C30 antes da release.

### Etapa 1 — Continuidade (primeira prioridade operacional)

- [ ] Definir RPO, RTO, frequência, retenção, destino, custo, acesso e responsabilidade.
- [ ] Implementar backup remoto cifrado e alertas, preservando banco/Auth/objetos/configurações.
- [ ] Executar restore de todo o conjunto **em destino isolado**.
- [ ] Conferir login, perfis, auditoria, arquivos, RLS e capacidade de iniciar a release correspondente.
- [ ] Registrar evidência, duração, perda potencial e procedimento de substituição de host.

**Evidência parcial:** laboratório Restic/Rclone com Drive real e dados sintéticos. **Ainda necessário:** backup automatizado/alertado na C30 e restore independente de todo o conjunto, com medidas e runbook.

### Etapa 2 — Identidades e permissões (pode ser desenvolvida em paralelo)

- [x] Definir os dois papéis de Vendas, removendo `sales_operator` do DEV (GG-04).
- [x] Implementar/homologar composição e escopos de Vendas no notebook (PR #126).
- [x] Implementar/homologar cadastro, troca obrigatória e reset administrativo (GG-05A/B, PR #127).
- [ ] Homologar o ciclo integral de Identity no Vite e ensaiar recuperação do DEV com Identity.
- [ ] Fechar a validação transversal GG-06 na release candidata do ambiente-alvo, incluindo AG-D5-C, JWT e Storage.
- [ ] Homologar adoção da identidade e recuperação administrativa antes de eventual corte na C30.

**Saída de desenvolvimento:** GG-04 e GG-05 integradas. **Saída operacional:** GG-06 e liberação da identidade na C30 ainda pendentes.

### Etapa 3 — Ajustes de experiência e suporte

- [x] Implementar contato e ramal no Agendamento (GG-08, PR #116).
- [x] Implementar histórico de solicitações e reservas diretas (GG-09, PR #116).
- [x] Implementar Comunicados/aviso e relatos com evidências (GG-10/11, PR #117).
- [x] Implementar descrição/cores de `Administrativo` (GG-12, PR #115).
- [ ] Avaliar Turnstile e controles Cloudflare (GG-13).
- [ ] Homologar conteúdo, perfis e dispositivos das GG-08–12 no ambiente-alvo.

**Saída de desenvolvimento:** GG-08–GG-12 integradas. **Saída operacional:** aceite da release e eventual GG-13 pendentes.

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
3. **Perfis de Vendas (decisão encerrada no DEV):** Sales Manager e Viewer homologados, Operator removido ([PR #126](https://github.com/The-Vonky/Gaucha-Gestao/pull/126)); resta conferir migração/escopos na release candidata da C30.
4. **Criação de usuários (decisão de produto implementada no DEV):** GG-05B homologada e integrada ([PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127)); permanecem os ensaios DEV da matriz GG-05, revisão de segurança aplicável, recuperação administrativa emergencial e GO nominal da identidade/piloto no ambiente-alvo.
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
4. Observar `AGENTS.md`, ADRs aceitos, Plano Diretor, contratos do módulo e políticas de preservação. Para Salas, aplicar AG-D5-C e consultar D5-A e D5-B como histórico.
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

Marcar cada item apenas com evidência verificável; usar **N/A justificado** quando realmente fora do escopo do piloto. **O checklist a seguir é do ambiente candidato/piloto, não do desenvolvimento:** itens integrados na `main` podem permanecer desmarcados enquanto não forem aceitos na C30.

### Continuidade e operação

- [ ] GG-01 — ambiente/versão/volumes atuais identificados.
- [ ] GG-02 — backup automático independente, cifrado, com retenção e alertas.
- [ ] GG-03 — restauração completa isolada executada e documentada.
- [ ] RPO/RTO e responsável por incidentes definidos/aceitos.
- [ ] GG-14 — saúde, disco, serviços, Tunnel e falhas de backup monitorados.
- [ ] Plano de interrupção, comunicação e recuperação definido.

### Segurança, identidade e dados

- [ ] GG-04 — homologada no DEV; validar a migração e a matriz Sales Manager/Viewer na release candidata.
- [ ] GG-05 — homologada no DEV; validar identidade, recuperação administrativa e sessões no ambiente-alvo.
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
| **1.2** | **25/11/2026** | DOC-03 reconcilia a baseline `e0b6f5c`, a evidência por ambiente, as 15 GGs e a ordem recomendada. |
| **1.1** | **23/11/2026** | Atualização dos 15 estados com `main` `df113c2`, integração de GG-04/05/08–12, evolução do laboratório GG-02D e preservação dos gates operacionais. |

**Como manter atualizado:**

- Registrar revisões neste documento com data, autor, fonte e motivo.
- Para cada GG-XX, manter evidência específica em issue/PR/documentação operacional, **não** apenas aqui.
- Se a `main` ou a C30 avançar, atualizar o retrato datado da seção 3 após verificação. Não editar o passado para fazê-lo parecer já realizado.
- Preferir links para fontes canônicas e não duplicar segredos, dados pessoais, scripts de implantação perigosa ou grandes trechos do código.
- Revisar prioridades após o primeiro restore, após cada merge relevante e antes de qualquer liberação.

**Próximas ações recomendadas:** fechar o ciclo integral de Identity no Vite em DEV e preparar a revalidação autorizada do inventário GG-01 da C30. A [sequência da seção 7](#7-plano-de-execução-por-etapas-e-dependências) detalha riscos e dependências.
