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
