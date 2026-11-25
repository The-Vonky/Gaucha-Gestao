# Gaúcha Gestão — Plano Diretor 2026

> **Revisão documental DOC-03 — 25/11/2026.** Baseline da `main` `e0b6f5c` (PR #134). O [Mapa de Implementação](../architecture/IMPLEMENTATION_MAP.md) descreve software e validações por módulo. A [matriz GG-01–GG-15](GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md#51-matriz-gg-01gg-15) acompanha execução, evidência e dependências. As definições estratégicas e gates deste Plano Diretor permanecem aplicáveis. **PROD NO-GO.**

> **Evidência posterior — 30/10/2026, sem revisão dos gates deste Plano Diretor v1.3:** STAGING na C30 passou a ter acesso HTTPS de testes por [Cloudflare Tunnel](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) em `teste.gauchagestao.online`. Operador validou login, auditoria preservada, fotos, nova auditoria e download em PC/celular. **Não** foram demonstrados backup off-site, restauração independente, matriz negativa de permissões, políticas Cloudflare Access, ensaio de carga ou aceite P1–P9/O1–O8. A proposta de **Workers Static Assets + R2 para PROD** continua futura. **PROD NO-GO**.

Plano diretor técnico, financeiro e de implantação · **Versão 1.4** · revisão documental de 25 de novembro de 2026

> **Atualização de governança — 10/11/2026:** há **um único desenvolvedor/mantenedor humano**; o antigo segundo desenvolvedor saiu da equipe. O plano de cinco dias e a divisão **Dev A/Dev B** da versão de outubro pertencem ao planejamento histórico e **não atribuem tarefas, revisões, handovers ou pendências atualmente**. As prioridades atuais estão no [Guia Mestre GG-01–GG-15](GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md), e o fluxo de homologação pré-merge está em [AGENTS.md](../../AGENTS.md). Este esclarecimento não declara os antigos itens concluídos, não altera por inferência gates de segurança ou autoriza operações na C30.

> Fonte canônica: este arquivo. As versões .docx 1.0 e 1.1, distribuídas fora do repositório, ficam superadas. Mudanças entram por PR, com registro na seção 12.

Escopo: Qualidade v1 como primeira entrega operacional; expansão progressiva para os demais sistemas corporativos. Hipótese econômica: desenvolvimento por equipe interna e reaproveitamento do hardware já disponível.

## Resumo executivo

Objetivo: consolidar os sistemas internos da Gaúcha Alimentação em uma plataforma modular segura, auditável, recuperável e financeiramente sustentável. Recomenda-se manter o monólito modular aprovado e a arquitetura de produção planejada no ADR-004, com frontend estático Cloudflare e backend Supabase self-hosted. O perfil mínimo reproduzível do ADR-006 segue Proposed. A Lenovo ThinkStation C30 é o host do projeto, substituindo o servidor legado e a HP ML350 prevista no ADR-004 ([ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md)); a máquina ainda precisa cumprir os critérios de aceite do ADR-008 antes de produção.

Decisão atual: NO-GO para produção. Core v2, Identity e os módulos registrados no mapa estão integrados à main, com evidência de CI por entrega. Faltam evidências físicas P1–P9 e operacionais O1–O8, metas numéricas de RPO/RTO e carga, restauração independente, comprovação da infraestrutura real e revisão de segurança aplicável, recuperação administrativa emergencial e GO operacional da identidade privilegiada ([D01](DECISION_REGISTER.md)). **Governança da `main`:** proteção técnica adiada pelo responsável para a fase final, com risco conscientemente aceito, sem configuração de ruleset agora; até lá, PR/CI/revisão humana permanecem controles operacionais manuais, sem enforcement automático. A ordem do fechamento deverá ser confirmada antes do GO. A viabilidade do piloto depende de capacidade, isolamento e recuperação demonstrados na C30, além do aceite do escopo escolhido.

## 1. Objetivos, limites e definição de pronto

- Primeira entrega: Auditorias de Qualidade com checklist versionado, Planos de Ação, evidências, relatórios XLSX/PDF, administração e autenticação autorizada.

- Core compartilhado: identidade, RBAC/RLS, unidades, setores, logs administrativos, contratos de arquivos e navegação.

- Expansão operacional gradual, com gates por módulo. O [roadmap](../migration/MODULE_ROADMAP.md) separa as entregas integradas dos domínios em descoberta.

- Pronto para uso produtivo = commit candidato com CI verde + homologação real P1–P9 + aceite operacional O1–O8 + ausência de bloqueadores críticos + autorização de liberação.

- Fora do escopo imediato: migrar todos os módulos, alta disponibilidade automática, Kubernetes, IA local e refatoração total de sistemas legados.

- Metas operacionais já registradas (BACKUP_RECOVERY, 01/10): requisito de negócio de que dado confirmado como salvo não pode ser perdido; janela provisória seg–sex, 07:00–18:00 (America/Sao_Paulo); infraestrutura ligada 24x7 sem garantia de disponibilidade. Não registrar RPO = 0.

- Destino do servidor legado pendente: desligar ou manter como host de STAGING / testes de restore.

- Metas pendentes de decisão do responsável: RPO técnico, RTO dentro e fora da janela, retenção de backups, logs de auditoria e objetos removidos, número esperado de usuários e unidades e meta de latência p95. Sem elas, os gatilhos da seção 7 e o gate da etapa 8 não são verificáveis.

## 2. Situação e riscos residuais — 25/11/2026

| Tema | Estado e condição estratégica |
| --- | --- |
| Implementação | `e0b6f5c` contém Core v2 e Identity, Auditorias e Planos, Curva ABC, Vendas, Salas, Comunicados e Relatos. O [mapa](../architecture/IMPLEMENTATION_MAP.md) rastreia os contratos e os recortes de DEV/CI. |
| Identidade e autorização | A GG-05B opera no DEV opt-in. Revisão aplicável, recuperação emergencial, restore integral e adoção dependem dos gates D01. A matriz GG-06 deve fechar as negativas integradoras da candidata. |
| Infraestrutura | AS-BUILT de 30/10 e inventário de 05/11 registram C30/STAGING. SHA, ledger, capacidade, isolamento e estado atual dependem de GG-01. Perda de host continua risco da topologia de host único. |
| Continuidade | Os ensaios sintéticos e do Compose base têm escopos próprios. A C30 requer backup independente, proteção do destino, retenção, alertas e restauração comprovada com RPO/RTO medidos. |
| Operação e aceite | Ingresso, monitoração, incidentes, release/reversão, P1–P9/O1–O8 e aceite por módulo ainda condicionam o GO. A C30 exige autorização para cada mudança persistente. |
| Governança | O mantenedor único revisa diff, CI e risco e decide merge e liberação. A proteção técnica da main segue adiada por decisão registrada, com controles manuais de PR, CI e revisão. |

A [versão de outubro e seus dados de referência](https://github.com/The-Vonky/Gaucha-Gestao/blob/e0b6f5cf563eb66a45a16e03a9137d36211d9ef3/docs/planning/PLANO_DIRETOR_2026.md) preservam o recorte original para auditoria.

## 3. Inventário técnico da ThinkStation C30

| Item              | Diagnóstico                                                                                                                                                                                                                                  |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Modelo            | Lenovo ThinkStation C30, tipo 1097A58; BIOS A1KT46AUS (2013), UEFI                                                                                                                                                                           |
| CPU               | Intel Xeon E5-2620 geração original, 6 núcleos/12 threads, 2,00 GHz                                                                                                                                                                          |
| Memória           | 8 GB DDR3 ECC reportados; 4 × 2 GB Hynix HMT325U7CFR8C, 1333 MHz. O código “U7” indica UDIMM ECC (inferido; confirmar pela etiqueta). Não misturar com RDIMM; com uma única CPU só os slots do soquete 1 ficam ativos (confirmar quantidade) |
| Disco             | SSD SATA MARKVISION 256 GB; 237,5 GB C:, 46,34 GB livres na primeira coleta (≈19,5% livre, 80,5% ocupado: abaixo da folga mínima da seção 6); health Healthy; 6.054 horas e 30 °C na segunda                                                 |
| Rede              | Intel 82579LM 1 Gbps ativa e Intel Gigabit CT2 secundária desconectada; IP interno no relatório original                                                                                                                                     |
| GPU               | NVIDIA Quadro 400, 512 MB; não serve como acelerador de IA moderno                                                                                                                                                                           |
| Sistema atual     | Windows 11 Pro 23H2; Docker Desktop 4.83.0; WSL2 ativo; Docker 29.6.2                                                                                                                                                                        |
| Docker atual      | 13 contêineres (11 ativos, 2 não operacionais); engine com 3,799 GiB de RAM disponibilizados. Stack diferente do perfil mínimo de 5 serviços do ADR-006                                                                                      |
| Falhas observadas | Supabase edge-runtime Exited(255); vector reiniciando. Ambos estão fora do perfil mínimo do ADR-006 e o produto não depende deles: desativar em vez de depurar                                                                               |
| Recursos          | Memória livre entre ~0,27 e ~1 GB nas capturas (gatilho de RAM da seção 7 já disparado); host submetido a aplicações desktop simultâneas                                                                                                     |
| Riscos            | Um SSD, sem contingência comprovada, plataforma antiga e provável limitação energética; temperatura de CPU/SMART completo não demonstrados                                                                                                   |

Capacidade: adequada a homologação e poucos serviços leves; produção pequena depende de monitoramento, RPO/RTO aceitos e teste de carga. Não há base para prometer N usuários simultâneos. As medições atuais refletem Windows + Docker Desktop + aplicativos de desktop + stack completa e não servem como base de capacidade: a medição válida exige Ubuntu Server, host dedicado e o compose do projeto (infra/supabase/docker-compose.yml).

## 4. Arquitetura e stacks: por que e como

| Componente                            | Função e decisão                                                                                                                                                                                                                                                      |
|---------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| React 19 + TypeScript + Vite          | Frontend do monólito modular, build estático reproduzível; manter App Shell e Design System Elo.                                                                                                                                                                      |
| Cloudflare Workers Static Assets      | Entrega do frontend sem consumir RAM/CPU da C30; testar limites do plano.                                                                                                                                                                                             |
| Cloudflare DNS/WAF/Tunnel             | Entrada HTTPS e barreira externa; origin protegido, serviços administrativos não públicos.                                                                                                                                                                            |
| Supabase self-hosted                  | Perfil mínimo do ADR-006: Postgres, Kong, GoTrue, PostgREST e Storage. Realtime, Functions, imgproxy, Supavisor, analytics/Logflare, Vector, Studio, Meta e Mailpit ficam fora. Base: compose oficial self-hosted v0.8.1, com versões fixadas.                        |
| PostgreSQL 17 + RLS                   | Persistência transacional, políticas por papel/unidade, funções RPC e migrations versionadas. Imagem fixada: supabase/postgres:17.6.1.136.                                                                                                                            |
| GoTrue / PostgREST / Kong             | Sessão/JWT, REST sob RLS e roteamento API; proibir acesso direto público ao banco.                                                                                                                                                                                    |
| Storage API + Cloudflare R2           | Buckets privados para evidências; validação de assinatura, conteúdo, exclusão e recuperação.                                                                                                                                                                          |
| Ubuntu Server LTS + Docker Compose    | Ubuntu direto no hardware da C30 (ADR-008) e serviços reprodutíveis; dev Windows/WSL separado de prod.                                                                                                                                                                                                 |
| GitHub Actions + Ansible              | CI, publicação controlada de artefatos e provisionamento reproduzível.                                                                                                                                                                                                |
| Restic + backup físico PostgreSQL/WAL | Restic para arquivos/objetos, com retenção criptografada. Restic não faz PITR: a recuperação pontual do banco usa WAL-G ou pgBackRest, decisão pendente no ADR-006. Ambas as escolhas exigem ADR e teste real.                                                        |
| Backblaze B2                          | Candidato a destino independente (o ADR-006 também cita Google Drive/rclone); escolha por ADR, avaliando residência de dados, retenção e custo. Os objetos ficam no R2, não na C30: o mecanismo R2 → destino (ex.: rclone ou restic via rclone) precisa ser definido. |
| Observabilidade leve                  | Health checks externos, CPU/RAM/disco, conexões, backup e alarmes; ferramentas dimensionadas à RAM.                                                                                                                                                                   |
| Segredos de recuperação               | JWT secret, chaves anon/service_role, credenciais R2/B2 e senha do repositório de backup em cofre separado do host. Sem eles, restaurar o banco não recompõe a plataforma (cenário 6 do BACKUP_RECOVERY).                                                             |

Fluxo: navegador → frontend Cloudflare → API por Tunnel/WAF → gateway Kong → Auth, PostgREST e Storage → PostgreSQL (dados e políticas); Storage API → R2 (bytes). Backup independente exporta cópias consistentes do banco e objetos para outro provedor. Não expor Supabase Studio, PostgreSQL ou Docker socket publicamente.

Host decidido ([ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md), 15/10/2026): Lenovo ThinkStation C30 dedicada, com Ubuntu Server LTS direto no hardware (sem VM), substituindo a VM na HP ProLiant ML350 do ADR-004. O restante do ADR-004 continua valendo. A C30 só é aceita para produção depois de cumprir os critérios do ADR-008: backup antes da reinstalação, remedição no Ubuntu, teste de carga contra as metas, nobreak com desligamento seguro e backup off-site com restore demonstrado.

## 5. Economia: custo mais próximo de zero

Regra: evitar novas licenças e compras até medir gargalos. O piloto pode reutilizar PC, rede, domínio existente (se disponível), GitHub e tiers gratuitos. Gratuidade de armazenamento não elimina eletricidade, conectividade, horas de trabalho, testes nem o custo de risco de parada.

| Faixa/etapa                  | Custo inicial planejado       | Recorrência ou observação                                                                                                  |
|------------------------------|-------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| Piloto isolado/DEV           | R\$ 0–300 adicionais          | Sem compra, usando os recursos existentes; não apropriado a dados críticos sem backup externo                              |
| Produção mínima condicionada | R\$ 350–1.500                 | Backup externo/nobreak ou correção de gargalo; nenhuma garantia de viabilidade sem benchmark                               |
| Produção mais segura na C30  | R\$ 2.000–4.500               | 32 GB ECC compatível (UDIMM, trocando todos os módulos), SSD, nobreak e mídia/cópia externa; faixa indicativa, cotar antes |
| Operação mensal              | ~R\$ 75–250/mês como hipótese | Energia + reserva de backup; domínio eventual ~R\$ 40/ano; não inclui mão de obra e falhas                                 |
| Desenvolvimento interno      | Sem desembolso a terceiro     | Horas da equipe não são custo econômico zero; calcular custo de oportunidade                                               |

Faixas monetárias são orçamento de planejamento em BRL, não cotação de estoque. Não comprar DDR3 ECC, SSD ou nobreak sem conferir compatibilidade, watts e qualidade elétrica; comparar custo total da C30 versus máquina moderna.

## 6. Armazenamento externo: preço, limite gratuito e gatilhos

| Serviço                | Franquia / referência                                                                 | Quando aumenta custo                                                                                               |
|------------------------|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| Cloudflare R2 Standard | 10 GB-mês + 1 milhão operações A + 10 milhões B gratuitos/mês                         | Acima disso: US\$ 0,015/GB-mês; A US\$ 4,50/milhão; B US\$ 0,36/milhão; sem egress tarifado                        |
| Backblaze B2           | Primeiros 10 GB gratuitos; modelo proporcional, valores segundo região/tarifa vigente | Quando backup retido exceder franquia; verificar custo exato de cobrança/egress na contratação                     |
| Domínio .br            | R\$ 40/ano no Registro.br                                                             | Se ainda não existe domínio adequado                                                                               |
| Backups                | Retenção implica múltiplas gerações                                                   | Espaço total = dados ativos + histórico + WAL + margem; 10 GB gratuitos podem acabar antes de 10 GB de dados úteis |

Exemplo didático de R2 (somente GB-mês, sem operações): 10 GB ≈ US\$ 0; 50 GB ≈ US\$ 0,60/mês; 100 GB ≈ US\$ 1,35/mês; 500 GB ≈ US\$ 7,35/mês. Usar média mensal, não apenas tamanho no último dia.

Limiares propostos: alertar em 60%/80% do tier gratuito; migrar automaticamente para tier pago sem interromper backup se houver verba aprovada; reduzir uploads/comprimir fotos quando custo por auditoria crescer; proibir exclusão de retenção somente para economizar sem aprovação. Reservar 20–30% de folga de disco local (hoje a C30 tem ≈19,5%) e monitorar WAL diariamente.

## 7. Upgrades inevitáveis e quando fazer

| Gatilho objetivo                                                                                                | Ação necessária                                                                                                 | Prioridade                        |
|-----------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|-----------------------------------|
| RAM disponível \< 1 GB de forma persistente, swap sustentado ou OOM (já observado no estado atual, sob Windows) | Remedir após Ubuntu + perfil mínimo; se persistir, ampliar para 16–32 GB ECC compatível; repetir teste de carga | Alta                              |
| Disco ≥ 70% ocupado (alerta) ou ≥ 80% (crítico); WAL crescendo sem controle. Crítico já atingido hoje (80,5%)   | SSD maior; separar logs/volumes; retenção e alertas; nunca excluir volumes cegamente                            | Alta                              |
| Ausência de backup externo restaurável                                                                          | Contratar armazenamento externo e validar restore antes de PROD                                                 | Bloqueador                        |
| Quedas de energia com perda de serviço                                                                          | Nobreak compatível, desligamento seguro e autoteste                                                             | Bloqueador para operação sensível |
| Latência p95 ou erros fora da meta sob carga real (meta a definir; seção 1)                                     | Otimizar consultas/índices e medir; se CPU saturar, avaliar novo host                                           | Conforme medição                  |
| RTO depende de peça rara ou indisponibilidade do único host                                                     | Host de contingência ou migração a hardware moderno/cloud                                                       | Alta para sistema crítico         |
| R2/B2 ultrapassam franquias ou frequência de objetos aumenta                                                    | Aprovar pequeno orçamento recorrente e acompanhar custo por GB e por operação                                   | Sob demanda                       |

## 8. Sequência de execução, dependências e marcos

O [Guia Mestre](GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md#7-plano-de-execução-por-etapas-e-dependências) mantém a ordem recomendada, tarefas DEV, autorizações operacionais e dependências detalhadas. A sequência proposta avança com Identity, recuperação e validação de permissões no DEV, e com inventário GG-01 seguido de continuidade GG-02/GG-03 no ambiente autorizado. DOC-04 e DOC-05 seguem agenda própria.

A liberação segue estas dependências estratégicas.

1. Identificar a candidata por SHA e ledger. Fechar as condições de identidade privilegiada e autorização aplicáveis ao escopo.
2. Confirmar estado e capacidade real da C30 conforme ADR-008, metas de carga e continuidade e recuperação independente antes de mudança de risco. Reinstalação ou intervenção física requer decisão específica.
3. Preparar procedimento de release, verificação de ingresso e alertas, reversão e simulação de incidentes. Aplicar ou ensaiar no ambiente aprovado com autoridade própria.
4. Registrar P1–P9 e O1–O8 e os aceites de domínio aplicáveis. O mantenedor decide sobre piloto ou corte e operação assistida.

Datas, responsáveis e aplicação dessa ordem dependem de decisão registrada. A coordenação Dev A/Dev B do plano de cinco dias está no [Mapa de Execução histórico](EXECUTION_MAP.md).

## 9. Checklist operacional obrigatório

- [ ] Código e migrations pinados; CI no commit que será implantado
- [ ] Metas definidas: RPO técnico, RTO dentro/fora da janela, retenções, usuários/unidades e p95
- [ ] ADR-008 aceito e critérios de aceite da C30 cumpridos
- [ ] Destino do servidor legado decidido (desligar ou usar como STAGING/restore)
- [ ] Auth/GoTrue e fronteira privilegiada concluídos
- [ ] Testes negativos de RLS e permissões por unidade aprovados
- [ ] P1–P9 comprovados em aparelhos reais
- [ ] O1 RPO/RTO/retention; O2 headers e HTTPS reais
- [ ] O3 backup independente; O4 restauração DB+objetos
- [ ] O5 reconciliação; O6 purge/retention auditáveis
- [ ] O7 métricas e alertas; O8 rollback/release aprovado
- [ ] Testes de reboot, queda de internet e falha de contêiner
- [ ] Host dedicado com Ubuntu Server rodando o perfil mínimo do ADR-006
- [ ] Local do STAGING definido e isolado de PROD
- [ ] Ferramenta de WAL/PITR, destino off-site e mecanismo R2 → destino decididos por ADR
- [ ] Segredos de recuperação em cofre separado e exercitados no restore
- [ ] Decisão de adiar a proteção técnica da `main` registrada, risco aceito e PR/CI/revisão humana praticados; reavaliar proteção na fase final e sequência antes do GO
- [ ] Segredos fora do Git, privilégios mínimos e acesso privado
- [ ] Custos mensais, franquias e alertas configurados
- [ ] Responsável humano autoriza o início de produção

## 10. Segurança, privacidade e responsabilidades

Adotar políticas de acesso por menor privilégio, segregação DEV/STAGING/PROD, rotatividade de segredos, criptografia de backup, VPN administrativa, auditoria de alterações, retenção proporcional, revisão de dados pessoais conforme LGPD e avaliação de localização geográfica de objetos/backups. Realizar teste de recuperação sem copiar dados sensíveis para máquinas não autorizadas.

Responsabilidades atuais (BACKUP_RECOVERY, 01/10): o responsável do projeto acumula operação e backup/restore; alertas vão para ele e para o supervisor. A concentração em uma pessoa é risco operacional; recomenda-se registrar um substituto para incidentes.

## 11. Referências e premissas

1. <https://github.com/The-Vonky/Gaucha-Gestao>

2. <https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/architecture/OVERVIEW.md>

3. <https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/modules/audit/QUALITY_ACCEPTANCE_V1.md>

4. <https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/briefs/CORE_V2_CONSOLIDATION_READINESS.md>

5. <https://github.com/The-Vonky/Gaucha-Gestao/commit/aee20eca3824e4f482b26d1e19f2a0615526432f>

6. <https://developers.cloudflare.com/r2/pricing/>

7. <https://help.backblaze.com/hc/en-us/articles/217667478-Understanding-B2-Pricing-Structure>

8. <https://registro.br/dominio>

9. <https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/decisions/ADR-004-platform-stack.md>

10. <https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/decisions/ADR-006-infra-v1-reused-hardware.md>

11. <https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/architecture/BACKUP_RECOVERY.md>

12. <https://github.com/The-Vonky/Gaucha-Gestao/commit/ac2f5482979135ef51acb6b901d0f4effef35395>

13. [ADR-008 — host ThinkStation C30](../decisions/ADR-008-production-host-thinkstation-c30.md)

Fontes locais: Diagnostico_Servidor_2.txt e Texto colado(20261014-181013).txt, fornecidos pelo responsável e não versionados no repositório. Propostas, alvos e valores são hipóteses explicitamente condicionadas a testes, cotação e autorização.

## 12. Controle de revisões

| Versão | Data       | Alterações                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|--------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1.0    | 15/10/2026 | Versão inicial.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1.1    | 15/10/2026 | Conferência contra o main (HEAD aee20ec). Core v2 registrado como consolidado (PR \#38); ADR-006 incorporado (perfil mínimo, pendência WAL-G/pgBackRest); medições da C30 reclassificadas como não válidas para capacidade; gatilhos de RAM e disco marcados como já disparados; limiar de disco corrigido (70% alerta / 80% crítico); sequência reordenada (metas antes do host, reinstalação explícita, STAGING antes da homologação P1–P9); segredos de recuperação, mecanismo R2 → destino, proteção da main, metas operacionais e Anexo A adicionados. |
| 1.2    | 15/10/2026 | Plano movido para o repositório (docs/planning). Host decidido pelo responsável: ThinkStation C30 substitui o servidor legado (ADR-008); comparação com a ML350 removida; etapa 4 passa a ser aceite da C30; destino do servidor legado e local do STAGING registrados como pendências; README corrigido (Core v2 na main). |
| 1.3    | 15/10/2026 | Registra decisão de adiar proteção técnica da `main` para a fase final com risco aceito e práticas manuais de PR/CI/revisão; corrige sequência de ADR-007; fixa responsabilidades Dev A/Dev B/Matheus e propõe cadência dos cinco dias, sujeita a confirmação. Nenhum ruleset, alteração produtiva ou GO autorizado. |
| 1.4 | 25/11/2026 | DOC-03 reconcilia implementação, riscos e dependências na baseline `e0b6f5c`. Guia Mestre concentra acompanhamento. Decisões de arquitetura e critérios de liberação preservados. |

## Anexo A — Gates de aceite

Resumo de docs/modules/audit/QUALITY_ACCEPTANCE_V1.md; status conforme a matriz do repositório consultada em 15/10/2026.

| Gate | Descrição                                                                                               | Status  |
|------|---------------------------------------------------------------------------------------------------------|---------|
| P1   | Android Chrome — navegação e Audit (login, drawer, histórico, inspeção de 158 itens, finalizar/reabrir) | PENDING |
| P2   | iOS Safari — mesmo fluxo de P1, incluindo teclado, viewport e foco                                      | PENDING |
| P3   | Android Chrome — evidências do checklist (câmera, galeria, arquivos, upload, retry, download, remoção)  | PENDING |
| P4   | iOS Safari — evidências do checklist (JPEG esperado, HEIC rejeitado com clareza)                        | PENDING |
| P5   | Android Chrome — evidências de plano de ação (anexar, baixar, remover, verificar)                       | PENDING |
| P6   | iOS Safari — mesmo contrato de P5 com seletor nativo                                                    | PENDING |
| P7   | Android + iOS — XLSX de inspeção (abas Resumo/Checklist/Secoes/Evidências, imagens offline)                                         | PENDING |
| P8   | Android + iOS — XLSX de histórico (abas Historico/Metadados, filtros)                                   | PENDING |
| P9   | Android + iOS — impressão e PDF de inspeção e histórico                                                 | PENDING |
| O1   | RPO/RTO e retenções definidos e medidos                                                                 | PARTIAL |
| O2   | Ambiente real: HTTPS, origem, nosniff, cache e download assinado                                        | UNKNOWN |
| O3   | Backup independente de PostgreSQL + objetos                                                             | OPEN    |
| O4   | Restore drill: DB + objetos em ambiente isolado, com negação cross-unit                                 | OPEN    |
| O5   | Reconciliação monitorada de evidências com alerta                                                       | PARTIAL |
| O6   | Retenção/purge operacional via Storage API, com autorização humana                                      | PARTIAL |
| O7   | Observabilidade: health checks, métricas, alertas, backup/WAL                                           | OPEN    |
| O8   | Release/rollback e aceite operacional assinado                                                          | OPEN    |

## Acompanhamento de tráfego de evidências — 04/11/2026

**Continuação local autorizada em 05/11:** [executor temporário e atualização automática do checklist](../modules/audit/AUD_IMG_02_LOCAL_EXECUTOR_20261105.md), limitado a novos uploads de uma auditoria explícita. Migration incremental e mesmos grants técnicos; NOLOGIN ao encerrar. Prova Chromium: JPEG 77.834 → 39.929 bytes; JPEG 11.028 bytes sem redução viável, estado terminal claro e original preservado. Sem serviço permanente/backfill/deploy; a pendência HTTP de escrita negada anterior não foi declarada resolvida.

O [GO C local de 05/11](../modules/audit/AUD_IMG_02_LOCAL_GO_C_20261105.md) registrou duas migrations, uma imagem sintética `ready` e redução de 92,6463% para aquela imagem. Em 06/11, a [integração ao `npm run dev`](../modules/audit/AUD_IMG_02_INTEGRATED_DEV_20261106.md) registrou a prova em duas auditorias. Esses ensaios antecedem o lote MED-01.

[MED-01 / AUD-IMG-01–05](../modules/audit/EVIDENCE_IMAGE_TRAFFIC.md). As PRs #99/#101 integraram o cache volátil e o executor legado de derivados, com Política A e exceção restrita E3 autorizadas. As PRs #120/#121 disponibilizaram a transformação privada nativa no Compose DEV. Na [medição de 06/11](../modules/audit/MED01_FRONTEND_CLOSURE_20261106.md), o executor legado foi avaliado em 10/30/100 imagens com três repetições por modo. A redução de corpo foi de **77,47%** neste lote sintético, abaixo da meta de 80%. As rotas sob demanda reduziram o JS inicial gzip de 272.112 para 164.605 bytes (39,51%). O aviso de chunk acima de 500 kB permanece. A revisão HTTP local foi concluída. A captura da API nas transições de sessão e o POST/upsert negado pelo gateway permanecem parciais. AUD-IMG-03/05, homologação ampliada em dispositivos físicos, backfill, restore e validação de headers/cache na borda seguem na Issue #100. Políticas B/C seguem sem aprovação. PROD NO-GO.
