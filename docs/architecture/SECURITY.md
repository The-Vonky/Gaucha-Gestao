# Linha de base de segurança

**VIGENTE na `main`.** O [modelo de autorização](AUTHORIZATION.md) descreve a composição efetiva dos papéis. O [modelo de ameaças](THREAT_MODEL.md) registra riscos e evidências.

## Princípios

Aplicar negação por padrão e menor privilégio da autenticação até a autorização de domínio, Storage e auditoria. O navegador é entrada não confiável. Menus, rotas e modos visuais orientam a experiência. A decisão de acesso cabe aos serviços confiáveis, grants, RLS e RPCs.

## Identidade

Cada pessoa deve usar uma conta individual identificável. Evite contas compartilhadas para preservar autoria e revogação individual. Use os mecanismos consolidados do GoTrue para autenticação, senhas, tokens e sessões, sem criptografia própria. O Core vincula o perfil ao UUID Auth e exige perfil ativo. No DEV com Identity habilitado, o componente interno do Core medeia login por senha, admissão, troca obrigatória, criação e redefinição. Kong limita os caminhos de Auth e Storage. PostgREST usa `public.identity_pre_request()`; as políticas de Storage também exigem admissão. Cada nova requisição protegida precisa da sessão viva para aquele titular, da finalidade e da geração vigentes e da autorização de domínio.

A PR #24 encerrou uma proposta anterior sem merge e a Issue #49 teve encerramento administrativo. A GG-05B, integrada pela PR #127 e evoluída pela PR #129, foi autorizada para o DEV. A revisão de segurança aplicável, a recuperação administrativa emergencial e a adoção fora do DEV têm gates próprios. [D01](../planning/DECISION_REGISTER.md) · [Contrato GG-05B](GG05B_IDENTITY_DESIGN.md#contrato-vigente-no-dev).

## Autorização

Grants, políticas e RPCs reavaliam capacidade e escopo a cada operação. Escritas sensíveis também verificam autoria, versão e invariantes de domínio. Em Salas, a vista Requester oculta controles de gestão do administrador global. A capacidade `room_booking.manage` continua efetiva no servidor. [AG-D5-C](../modules/room-booking/D5C_ADMIN_MODES.md).

## Segredos

O navegador usa chave pública de cliente publishable/anon e JWT de usuário. A chave administrativa GoTrue fica no runtime servidor e é usada nas chamadas administrativas. A credencial SQL de `gg_identity` é distinta, com acesso aos contratos privados necessários e sem DML direto nas tabelas. Chaves secretas, senhas, arquivos privados de configuração, JWTs e URLs assinadas ficam fora do Git, de artefatos e dos logs. No ciclo de credenciais, a temporária é devolvida uma vez ao operador autorizado para entrega privada ao titular. GoTrue guarda o verificador. [Manifesto Identity](../../infra/local/compose.identity.yaml) · [Serviço](../../apps/core-identity/server.mjs).

## Dados sensíveis

Antes de migração ou uso real, classificar os dados financeiros, contratuais, pessoais e operacionais e limitar a coleta à finalidade de negócio. Manter dados e credenciais reais fora de DEV e CI.

## Uploads

Tratar bytes, metadados e chaves indicadas pelo cliente como entradas não confiáveis. Cada domínio define tipos, tamanhos, chave reservada no servidor, estados de confirmação e capacidades de leitura e remoção. A reserva de metadados e o upload de bytes são etapas distintas. Reconciliação e retenção física seguem procedimento autorizado.

Na Curva ABC, o browser interpreta o XLSX e a RPC revalida payload, somas e metadados. O SQL não decodifica nem recalcula o hash do XLSX físico. A conferência posterior é uma prova distinta. [Modelo de ameaças](THREAT_MODEL.md) · [Contrato ABC](../briefs/ABC_DOMAIN_V1.md).

## Storage privado e miniaturas

| Perfil | Leitura de objetos e autorização | Miniaturas de Auditorias |
| --- | --- | --- |
| Base | Buckets privados. As políticas autorizam o download autenticado ou a emissão de uma URL curta, conforme o adaptador do módulo. Uma URL assinada já entregue pode ser usada até o TTL enquanto o resgate estiver disponível. | Com transformação habilitada, Storage verifica a política do original e emite URL de transformação de até 60 s. imgproxy processa sob demanda sem sobrescrever o original. |
| DEV com Identity | O ingresso estrito permite operações enumeradas por bucket e caminho, com JWT de sessão admitida para os módulos. Storage reavalia a sessão e as políticas de domínio. O ingresso fecha emissão e resgate por assinatura, inclusive de URLs antigas. O proxy responde com `private, no-store` e `nosniff`. | A transformação nativa usa o caminho de renderização autenticado. O browser pede o derivado sob demanda com JWT; o imgproxy usa a montagem de objetos somente leitura. |

Os adaptadores no modo estrito usam leitura autenticada para evidências de Auditorias e Planos de Ação, fotos de Salas, capas de unidade, originais ABC e imagens de relatórios. A autorização preserva estado, escopo e limites dos contratos. Bytes já entregues e arquivos exportados permanecem fora do alcance da revogação. [Gateway Identity](../../apps/core-identity/storage.mjs) · [Cliente de Storage privado](../../apps/web/src/core/auth/privateStorage.ts) · [Runbook imgproxy](../operations/AUD_IMG_02_IMGPROXY_LOCAL_RUNBOOK.md) · [Relatórios com evidências](../modules/audit/REPORT_EVIDENCE_EXPORT.md).

Para Relatos, a omissão de `feedback-attachments` no ingresso estrito barrava o envio e o download antes das políticas do bucket. O ingresso admite agora apenas upload sem upsert e download autenticado no caminho de objeto com UUID canônico e extensão `.png` ou `.jpg`. A sessão admitida e o JWT do titular continuam obrigatórios. A RLS exige reserva pendente do titular no upload e Platform Administrator global com autoridade atual no download de relato recebido. [Ingresso Identity](../../apps/core-identity/storage.mjs) · [Contrato GG-11 e testes](../modules/feedback/FEEDBACK_V1.md#provas-da-compatibilidade-com-identity).

## Auditoria sistêmica

Mutações sensíveis devem produzir trilha imutável ou resistente à adulteração, com autor, horário, entidade, ação, dados antes/depois pertinentes e correlação. O `core.system_audit_log` é a trilha do Core, distinta da Auditoria de Qualidade, com gravações por mecanismos confiáveis e leitura por capacidade e escopo. A proteção contra mutação pelo cliente comum tem alcance distinto da autoridade do operador privilegiado do PostgreSQL, que pode alterar o banco. Política de acesso operacional, retenção, exportação e monitoramento de alterações sensíveis ainda requer definição e validação. [Contrato da trilha Core](CORE_FOUNDATION_V2.md#11-contrato-da-trilha-de-sistema) · [Gate de auditoria sistêmica](FOUNDATION_GATES.md#gate-7--auditoria-sistêmica).

Operações de Identity registram protocolo, resultado e correlação com o alvo sem guardar senha ou token. Falha de confirmação entre Core e Auth exige reconciliação supervisionada. O estado em quarentena fecha admissões e impede repetir o efeito por tentativa cega. [Runbook GG-05B](../operations/GG_05B_IDENTIDADE_DEV.md#reconciliação).

## Infraestrutura

O DEV usa o [Compose local](../operations/DOCKER_LOCAL_STANDARDIZATION.md). A revisão do estado implantado na C30 usa seu [AS-BUILT datado](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md). Para operação, exigir SO e runtime suportados e atualizados, exposição e firewall revisados, TLS nas fronteiras de confiança, isolamento de serviços, PostgreSQL protegido e credenciais separadas. Uso de SO legado sem suporte depende de risco documentado e controles compensatórios. A verificação de WAF, origens, CSP, cabeçalhos, cache e superfícies expostas integra os [requisitos operacionais do modelo de ameaças](THREAT_MODEL.md#4-recomendações-to-be-não-implementações).

A proteção de banco e objetos exige destino independente, criptografia, controle de acesso, proteção contra exclusão e restauração consistente testada. O ensaio do Compose base tem escopo próprio. A recuperação integral de Identity e o backup/restore independente da C30 ainda exigem prova. [Backup e recuperação](BACKUP_RECOVERY.md#propriedades-exigidas) · [Gates](FOUNDATION_GATES.md).

## Dependências, erros e incidentes

Minimizar dependências, usar lockfile e tratar vulnerabilidades conhecidas. Mensagens ao usuário devem omitir stack traces, detalhes internos do banco, caminhos sensíveis e segredos. Logs devem excluir credenciais e dados pessoais excedentes. Antes do rollout, definir responsáveis e procedimentos para bloqueio de conta, revogação, consulta de logs, recuperação administrativa, rotação de segredos, reconciliação, rollback e restauração. Mudanças de segurança exigem diff, testes negativos pertinentes, avaliação de risco e aceite do mantenedor, com registro da revisão efetuada e das exigências específicas para identidade privilegiada. CI e homologação têm recortes próprios. **PROD NO-GO.**

## Login técnico de derivados — PR #101

**EVIDÊNCIA DATADA.** O executor de terminal da PR #101 usa login SQL temporário, emissor com lease e worker isolado. A derivação usa bucket privado próprio, sem fallback automático ao original. O supervisor legado condiciona o processamento ao escopo autorizado e ao corte de novos uploads. A [prova de 05/11](../history/modules/audit/AUD_IMG_02_LOCAL_GO_C_20261105.md) registrou a execução e seu alcance. O [contrato do executor](../history/modules/audit/AUD_IMG_02_LOCAL_EXECUTOR_20261105.md) e a [integração legada](../history/modules/audit/AUD_IMG_02_INTEGRATED_DEV_20261106.md) conservam os detalhes.

## Comunicados institucionais — GG-10 / Entrega B (05/11/2026, para revisão)

**EVIDÊNCIA DATADA.** O [contrato](../modules/announcements/ADMINISTRATION_V1.md) define gestão global e publicação com período. As tabelas privadas usam RLS restritiva e as RPCs gravam histórico versionado com autoria. O log Core recebe identificador, estado e versão. A [validação de 05/11](../history/modules/announcements/LOCAL_VALIDATION_20261105.md) cobre negativas e persistência no DEV. No perfil estrito, a leitura publicada exige admissão para a aplicação.

## Relatos dos funcionários — GG-11

O banco vincula autoria e horário à sessão. O log guarda o evento e o identificador, sem conteúdo nem nome do anexo. A leitura administrativa e o download autenticado reavaliam o acesso atual. [Contrato GG-11](../modules/feedback/FEEDBACK_V1.md) · [Perfis de Storage](#storage-privado-e-miniaturas).
