# GG-02 — Estratégia inicial de backup de custo zero (decisão do mantenedor, 05/11/2026)

> **DECISÃO DE DIRETRIZ ARQUITETURAL, NÃO IMPLEMENTAÇÃO NEM GO OPERACIONAL.** Em conversa com o mantenedor em 05/11/2026 foi selecionada a abordagem inicial descrita abaixo, buscando **R$ 0 de custo recorrente** nesta etapa. O mantenedor informou ter criado uma conta Google associada ao seu e-mail da empresa, sem informar credenciais nem solicitar conexão à C30. Não registrar endereço da conta, credenciais, dados pessoais ou identificadores aqui. **PROD e piloto com funcionários utilizando dados reais: NO-GO** até que controles e provas sejam satisfeitos.

## 1. Decisão aprovada quanto ao objetivo e à arquitetura inicial

Adotar o **Google Drive gratuito como repositório principal do pacote de recuperação COMPLETA**, abrangendo **dados + estrutura + manifestos de compatibilidade e restauração**, em formato cifrado e com snapshots incrementais/deduplicados (até 15 GB de cota total compartilhada, sujeita ao espaço livre real). Isso substitui a interpretação anterior de que o Drive guardaria apenas os dados. O pacote completo pode ser composto por snapshots e metadados vinculados, sem criar duplicação física integral a cada dia. Não ativar Google One/teste pago/assinatura ou aceitar cobrança nesta etapa. Termos de uso, integração API, limites, controle da conta institucional e adequação à política de proteção de dados precisam ser verificados.

A estratégia separa *três funções de recuperação*, sem obrigação de gerar três cópias físicas redundantes e independentes em toda execução:

| Função | Conteúdo | Destino inicial escolhido |
| --- | --- | --- |
| Backup de dados | Captura consistente de PostgreSQL (negócio, Supabase Auth, papéis/roles e permissões), metadados **e bytes** de Supabase Storage, manifestos/hashes | **Integra o pacote completo criptografado no Google Drive**, com snapshots incrementais e histórico adequado |
| Backup estrutural | Código e SHA de referência, migrations e hashes, versões/imagens, Compose/overrides, unidades systemd, Caddy, documentos de reconstrução e referências seguras a segredos | **Integra o mesmo pacote completo criptografado no Google Drive**; cópias adicionais de código no GitHub e kit estrutural no **pendrive de 8 GB**, conforme capacidade |
| Pacote de recuperação completa | **O conjunto principal no Drive:** dados + estrutura compatíveis + manifesto de integridade/versões + instruções de restauração. A chave de descriptografia deve ser recuperável por canal independente | **Google Drive é a fonte principal de recuperação**, enquanto notebook e/ou PCs da empresa guardam **cópia secundária cifrada e independente** dos snapshots necessários, sem executar o sistema; preferir cópia offline ou protegida contra alteração |

O pendrive de 8 GB serve inicialmente para o **kit estrutural**; não presumir que comporte todos os dados.

**Precisão operacional (06/11/2026):** um conjunto restaurável no Drive não exige um arquivo ZIP monolítico nem a duplicação física integral em cada snapshot. A restauração deve recuperar o snapshot selecionado com todos os blocos e metadados de que ele depende, mais o kit estrutural da mesma versão. É obrigatório testar que a cópia secundária em notebook/PC recupera o conjunto **sem depender da C30 nem do acesso ao Drive**. Não armazenar a única chave de descriptografia no Drive ou no servidor de origem. Não comprar outro pendrive/HD antes do dimensionamento. **Fase futura:** substituir preventivamente HDD envelhecido e adquirir discos externos novos para cópias completas periódicas, sem confundir RAID/disco extra com backup off-host.

**A seleção da arquitetura não aprova ferramentas específicas**. Restic (snapshots/deduplicação/cifra) e rclone (backend Google Drive) são candidatos a validar; outras soluções podem ser comparadas. Para PostgreSQL, criar procedimento de captura online consistente (dump/alternativa aprovada); jamais copiar PGDATA “ao vivo” como backup válido. A deduplicação de dumps inteiros não garante economia alta; medir empiricamente a taxa incremental e o crescimento de imagens. Um conjunto completo pode **referenciar** snapshots verificados e compatíveis em vez de duplicar bytes; manter capacidade de recuperação independente e offline quando possível.

## 2. Objetivo de custo zero: limites e plano de expansão

- Exigir **R$ 0 de custo recorrente nesta fase**; não ativar promoção de Google One nem assinatura automática. Sem espaço suficiente na cota, **não reduzir cobertura ou retenção crítica silenciosamente**. Sinalizar bloqueio, revisar política ou solicitar orçamento/aprovação.
- Verificar quota livre na conta, uso de Gmail/Fotos e previsão de crescimento de fotografias e documentos; não presumir 15 GB integralmente livres.
- Futuramente, se houver decisão orçamentária humana, aumentar Google Drive/Google One ou solução corporativa aplicável **sem necessidade de trocar necessariamente o formato dos backups**. Conta com e-mail corporativo não prova por si só que seja conta institucional gerida por Workspace; validar titularidade, recuperabilidade, MFA, saída do empregado e administração.
- Definir limites preventivos de consumo e alertas de falha/quota, política de retenção, proteção contra exclusão e recuperação de chave. A ausência de cobrança **não** elimina risco de bloqueio, suspensão, alteração de termos ou perda da conta.

## 3. Escopo obrigatório da recuperabilidade

- Banco de dados, Supabase Auth e suas tabelas, papéis/roles globais e configurações necessárias (com tratamento seguro dos segredos).
- Auditorias, planos, histórico, anexos, fotos de evidências, planilhas e todos os buckets efetivamente utilizados.
- Metadados PostgreSQL e **bytes reais** do Storage precisam referir-se a um conjunto compatível e consistente; evitar órfãos e links quebrados.
- Migrations, SHA, imagens dos containers, runtime, frontend, configuração Caddy, systemd, Docker/Compose e referências a certificados/chaves/segredos, com armazenamento cifrado quando necessário.
- Teste de restauração para ambiente **isolado e sem acesso à produção**: Auth sintético, permissões e testes RLS negativos, auditorias, downloads e hashes dos arquivos, versões corretas, temporização e documentação de resultados.
- Coexistência na C30: **ERP de Contratos** deve permanecer intocado. Este plano não inclui seus dados ou backup sem escopo e autorização próprios.

## 4. Pré-voo: dados ainda desconhecidos

A decisão de destino é **condicional à viabilidade técnica**; antes de configurar qualquer ferramenta, medir por consultas somente leitura autorizadas:

1. Tamanho atual dos diretórios **efetivamente montados** como PostgreSQL/Storage na C30, configuração estrutural e uso da quota livre do Drive (sem credenciais em chat ou PR).
2. Taxa esperada de auditorias, imagens e outros arquivos no piloto.
3. Volume comprimido do backup lógico e impacto de snapshots sucessivos no espaço.
4. Frequência, retenção, momento de recuperação por conjuntos, cópias separadas, integridade e limites de quota.
5. Recursos do notebook/PC para guardar pacote completo; espaço em disco e cifragem; localização e política de retenção offline.
6. Métodos de autenticação de ferramenta no Google Drive, conta institucional, MFA, revogação de acesso e procedimento de sucessão/recuperação de conta sem segredo exposto.
7. Preservação de arquivos locais não rastreados no checkout C30 e de dados existentes do ERP.

O inventário GG-01 evidenciou até 05/11: HDD de 1 TB com aproximadamente 1,4 GB ocupados no filesystem; **isso não representa tamanho isolado da Gaúcha Gestão** e não comprova que a cota de 15 GB bastará. O HDD registrou 79.988 horas de funcionamento e SMART geral PASSED; mitigar risco físico sem assumir ausência de falhas.

## 5. Rotina: hipóteses para dimensionar, não políticas aprovadas

- **Dados:** estudar captura consistente diária (ou mais frequente, conforme RPO aprovado), criptografada e incremental no repositório de backup, com verificação de falha.
- **Estrutura:** atualizar o kit a cada mudança operacional/release, não por necessidade de duplicação diária do código já versionado.
- **Pacote completo nos outros computadores:** estudar cópia cifrada periódica, preferencialmente com uma cópia offline; verificar hashes e possibilidade de abertura com chave sob custódia adequada.
- **Restauração:** realizar antes da liberação e repetir periodicamente em ambiente isolado; nunca testar restore sobre volumes de STAGING/ERP.

**NÃO** inferir RPO=0 ou RTO garantido. Backup diário pode perder aproximadamente até 24 horas de atualizações em cenário de falha entre pontos de cópia; taxa de backup, sincronização completa e retenção alteram o valor efetivo. Aprovação explícita do mantenedor e medição em testes são obrigatórias.

## 6. Decisões abertas e gates

| Identificador canônico | Estado após esta decisão |
| --- | --- |
| D02 (RPO/RTO) | **ABERTO**: definir metas e medir em recuperação isolada |
| D03 (retenção e exclusões) | **ABERTO**: definir prazo e rotação sem perda de recuperabilidade |
| D04 (ferramenta, PITR, destino, chaves) | **PARCIALMENTE DIRECIONADO**: Google Drive gratuito é destino inicial selecionado, mas ferramentas, PITR, recuperação de chaves e testes pendentes |
| D08 (alertas/monitoramento) | **ABERTO**: definir verificações, frequência e alertas |
| D12 (objeto/R2) | **ABERTO**: Google Drive é destino inicial de backup; isso **não decide** a arquitetura futura de Storage/R2 da aplicação |
| GG-02/03 | **NÃO IMPLEMENTADOS**: desenho detalhado, execução autorizada e restore comprovado pendentes |
| Piloto com funcionários / PROD | **NO-GO**: não autorizado apenas por esta decisão |

## 7. Referências e escopo do PR

- [Backup e recuperação](../architecture/BACKUP_RECOVERY.md) — princípios e requisitos.
- [Lacunas de backup da C30](C30_BACKUP_GAPS.md) — sete passos de implementação não executados.
- [Ensaio isolado de recuperação](../planning/02_RESTORE_DRILL.md) — 17 migrations em laboratório, 8 PASS/1 PARCIAL; não comprova a C30 atual.
- [Matriz de operações](OPERATIONS_MATRIX.md), [registro de decisões](../planning/DECISION_REGISTER.md), [Plano Diretor](../planning/PLANO_DIRETOR_2026.md).
- [GG-01 — inventário de 05/11/2026](https://github.com/The-Vonky/Gaucha-Gestao/pull/104) — PR documental separada, não presumir merge.

**Esta entrega é somente registro da escolha do mantenedor.** Não envolve instalação de ferramentas, acesso a Google Drive/conta, execução de backups, acesso à C30, escrita em dados ou integração na main. Qualquer operacionalização requer proposta técnica, teste isolado e GO explícito.

## 8. Confirmações do inventário e próximo trabalho (06/11/2026)

**Montagens efetivas confirmadas por inspeção Docker somente leitura do mantenedor:**

| Container | Mounts relevantes |
| --- | --- |
| PostgreSQL | /armazenamento2/gaucha-gestao/staging/postgres; /armazenamento2/gaucha-gestao/staging/db-config; três arquivos de inicialização jwt.sql, roles.sql e 99-target.sql sob /opt/gaucha-gestao/staging/infra/supabase/volumes/db/ |
| Storage | /armazenamento2/gaucha-gestao/staging/storage |
| Auth e REST | Nenhum bind mount retornado; serviços ainda dependem de banco/configuração de runtime |
| Kong | kong-entrypoint.sh e kong.yml sob /opt/gaucha-gestao/staging/infra/supabase/volumes/api/ |

**Tamanhos consultados com du -sh:** PostgreSQL 61 MB, Storage 139 MB, db-config 124 KB, frontend publicado 5 MB, backups históricos 1,4 MB. Total nominal das pastas ~206 MB; não confundir com backup lógico/comprimido, espaço livre real na conta Google ou taxa futura de crescimento. Não publicar conteúdo dos arquivos confidenciais de configuração.

### Sequência de implementação a aprovar

1. GG-02A: engenharia documental sem acesso à C30; revisar BACKUP_RECOVERY, C30_BACKUP_GAPS, 02_RESTORE_DRILL, GG-01 e esta decisão. Desenhar a captura consistente de PostgreSQL/Auth/roles + Storage sem corrida com uploads. Não presumir que dumps integrais diários deduplicam bem.
2. Verificar espaço livre e titularidade da conta Google sem divulgar credenciais, margem de crescimento, capacidade de cópia secundária, retenção, recuperação de chave fora da origem, alertas, RPO e RTO para aprovação humana.
3. Testar Restic + Rclone ou alternativa em ambiente local explicitamente selecionado, com dados sintéticos. Demonstrar snapshots incrementais, integridade, recuperação do Drive e recuperação offline da cópia secundária, sem tocar no ERP.
4. Somente após autorização operacional específica, instalar/ativar mecanismos na C30, preservando containers e o ERP. Executar ensaio isolado de recuperação do conjunto real, tratando dados e credenciais como confidenciais, sem domínio público.
5. Registrar evidências e decisões dos gates GG-02/GG-03. Piloto persistente com dados reais e PROD continuam NO-GO enquanto demais gates não forem fechados.

**A escolha da arquitetura não é autorização para instalar, conectar a conta Google ou modificar a C30.**
