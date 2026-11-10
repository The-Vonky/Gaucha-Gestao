# Linha de base de segurança

## Princípios

Dados operacionais, financeiros, contratuais e de Qualidade exigem controles em toda a arquitetura. Postura obrigatória: **menor privilégio e negação por padrão**.

~~~text
Usuário -> Auth -> sessão -> permissão -> escopo
        -> autorização do domínio -> banco/Storage -> auditoria
~~~

Ocultar um botão ou menu **não é autorização**. Ver [modelo](AUTHORIZATION.md).

## Identidade

- Cada pessoa deve ter conta identificável. Evitar logins compartilhados.
- Preservar ativação/inativação e distinguir privilégio de acesso comum.
- Supabase Auth é a identidade aprovada (ADR-004/005); perfis Core ativos condicionam acesso.
- Senhas/tokens/sessões usam mecanismos consolidados, **não criptografia própria**.
- Serviço privilegiado de criação/reset (ADR-007) permanece **NO-GO** até [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) e decisão humana.

## Autorização

Avaliar **capacidade + escopo**: `fleet.expense.write` e unidade autorizada. Aplicar grants/RLS/RPC no banco, não apenas visibilidade React.

## Segredos

Não versionar: senhas de banco, material de assinatura, chaves API secretas, SMTP, credenciais Storage, envs produtivos, certificados e chaves privados. Injetar via runtime ou gerenciamento aprovado. `service_role`/secret jamais no browser.

## Dados sensíveis

Antes de cada migração, classificar dados financeiros, contratuais, pessoais, credenciais, arquivos e dados operacionais restritos. Coletar somente com finalidade de negócio.

## Uploads

Arquivos recebidos são **não confiáveis**. Contratos: [Evidence/Storage](../briefs/EVIDENCE_STORAGE_V1.md), [Checklist Evidence](../modules/audit/CHECKLIST_EVIDENCE_V1.md), [Unit Cover](../modules/core/UNIT_COVER_V1.md) e [Curva ABC](../briefs/ABC_DOMAIN_V1.md).

Cada módulo define tipos aceitos, tamanho, chaves de objeto, permissão para download/remoção, propriedade de metadata, riscos de malware e backup. No banco ficam preferencialmente referências/metadados, não bytes grandes.

**Curva ABC:** preview XLSX no browser e validação SQL de payload não significam verificação física de bytes pelo servidor; ver [ameaças](THREAT_MODEL.md).

## Auditoria sistêmica

Mutações sensíveis devem gerar trilha imutável ou resistente a adulteração, com **autor, horário, entidade, ação, dados antes/depois pertinentes e correlação**, sem senhas/segredos. `core.system_audit_log` é diferente do módulo de Auditoria de Qualidade.

## Infraestrutura

Não aprovar produção apenas porque o sistema inicia. Exigir SO/runtime suportados e atualizados, firewall/exposição revisados, TLS nas fronteiras de confiança, serviço de menor privilégio, Postgres protegido, backup configurado **e restauração testada**, segredos separados e logs de segurança/operação.

SO legado sem suporte depende de risco documentado e controles compensatórios.

## Dependências, erros e incidentes

- Minimizar bibliotecas, usar lockfile e tratar vulnerabilidades conhecidas; CI determinística.
- Mensagens ao usuário não expõem stack trace, segredo, detalhes internos de DB ou caminhos sensíveis. Logs também não armazenam credenciais.
- Agentes não fazem implicitamente deploy, migration produtiva, alteração de segredo ou exclusão de dados.
- Antes do rollout: definir responsáveis por bloqueio de conta, revogação, consulta de logs, rotação de segredos, rollback e restore.

**Produção permanece NO-GO** até gates operacionais e autorização humana.

## Login técnico de derivados — PR #101

O [executor local de terminal](../modules/audit/AUD_IMG_02_LOCAL_EXECUTOR_20261105.md) foi autorizado posteriormente: habilita temporariamente o login existente e volta a NOLOGIN ao encerrar, sem grants novos ao processador. Escopo por auditoria e corte do servidor evita seleção acidental de acervo; não é autorização adicional. A RPC mínima de estado usa perfil ativo, evidência available e permissão Core na unidade; não libera manifesto/bytes/execução a leitores indevidos. O decoder mantém limites e quatro tentativas conservadoras; ausência de ganho vira estado terminal explícito, sem fallback ao original.

Credencial SQL técnica não pode ler segredo global por GUC ou catálogo, herdar papel privilegiado ou executar processamento com SET ROLE administrativo. O [runtime e runbook de AUD-IMG-02](../operations/AUD_IMG_02_LOCAL_GO_C_RUNBOOK.md) separam emissor one-shot e worker isolado, vinculam lease ao session_user e restringem JWT a lease/bucket/chave/30 s, com revalidação na renovação. [GO C executado em 05/11](../modules/audit/AUD_IMG_02_LOCAL_GO_C_20261105.md) somente em `gaucha-gestao-local`: GUC legado removido após inspeção/backup, login mínimo e uma evidência sintética, com login novamente NOLOGIN ao final. Não há serviço/timer instalado nem autorização de produção; POST/upsert adicional da matriz local permanece parcial por timeout.

O decoder de AUD-IMG-02 é aberto pelo supervisor como subprocesso irmão em Bubblewrap sem rede/segredos, fora do namespace do worker. Pipes binários têm header até 4 KiB, entrada até 10 MiB e saída até 1 MiB. Escopo fresco de lease e conferência do hash contra o objeto autorizado precedem uma única codificação; timeout/encerramento cancela o subprocesso, sem fallback sem isolamento.

## Comunicados institucionais — GG-10 / Entrega B (05/11/2026, para revisão)

`announcements.notices`/`notice_history` não são expostos na Data API. RLS
restritiva + revogação de USAGE/DML impedem manipulação direta; RPCs públicas
pontuais têm EXECUTE revogado de PUBLIC/anon e concedido somente a authenticated,
`search_path=''`, relações qualificadas e autorização Core explícita. Gerência
exige `announcements.notice.manage` global atual e bloqueios compartilhados nas
referências de autorização; leitura comum exige perfil ativo e período publicado.

Cada escrita usa UUID+versão esperada, trava linha e registra snapshot imutável
no domínio. Core recebe somente id/estado/versão, sem texto institucional.
O SQL valida datas, tamanho, categoria e presets Elo independentes e rejeita
tags HTML. No refinamento GG-10/GG-11, uma constraint de exclusão protege a
agenda e novas escritas gravam prioridade zero por compatibilidade. A aplicação usa fonte RPC única e invalida dados por identidade;
JSON público foi retirado, sem fallback/exportação de dados internos.

Teste real adicional usa o stack já descartável do action-plans-integration e
recusa execução fora de CI hospedado. Testes em memória não comprovam JWT/Auth,
API nem disputa entre sessões. Migration proposta não autoriza aplicação persistente,
retenção/expurgo ou deploy. [Contrato](../modules/announcements/ADMINISTRATION_V1.md).

GG-10: [validação real local de 05/11](../modules/announcements/LOCAL_VALIDATION_20261105.md) registra aplicação incremental autorizada, Auth/API reais, negativas, persistência e preservação de dados no gaucha-gestao-local. Nenhuma autorização para outro ambiente.

Desde 06/11, o [supervisor local de desenvolvimento](../modules/audit/AUD_IMG_02_INTEGRATED_DEV_20261106.md) coordena frontend e executor pelo único `npm run dev`. O modo explícito `global_new` exige corte de início/confirmação dos uploads; não usa filtros nulos para selecionar o acervo. LOGIN existente tem validade de dez minutos renovada pelo supervisor enquanto ativo, com NOLOGIN ao encerrar; falhas forçadas exigem recuperação do lock/login e não retomam pendências de sessões anteriores automaticamente. Sem grants extras, credenciais no frontend ou serviço permanente.


## Relatos dos funcionários — GG-11

O banco registra autoria e horário de recebimento. A trilha sistêmica guarda
o evento de recepção e o identificador do relato. O conteúdo e o nome do
arquivo original ficam fora da auditoria. O download reavalia a autorização
atual e usa o bucket privado com operações limitadas a envio reservado e
download autenticado. A UI trata os bytes como conteúdo não confiável e entrega
o arquivo como download. [Contrato e limites GG-11](../modules/feedback/FEEDBACK_V1.md).
