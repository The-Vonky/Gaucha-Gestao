# 01_DADOS_LIMPOS — Política de primeira implantação sem dados fictícios

**Gestão-Gaúcha · Issue #50 · versão 0.1 · 16/10/2026**  
**Status:** PROPOSTA DOCUMENTAL; revisão humana e gates de arquitetura/produção pendentes.  
**Escopo:** desenho para a futura instância PROD. **Não autoriza provisionar, migrar, resetar, limpar, executar SQL em produção nem cadastrar identidades reais.**

## 1. Decisão e critério de aceite

A primeira instância de produção será criada **do zero**, com banco PostgreSQL 17 novo, volumes novos, Auth novo, Storage novo e identidade/configurações específicas de PROD. Não copiar, restaurar ou aproveitar volumes, dumps, identidades, objetos, anexos, perfis, unidades, auditorias, planos ou usuários de DEV, STAGING, ambiente local ou do antigo Windows/WSL2 da C30.

**Banco limpo não é banco sem dados técnicos.** Após as migrations aprovadas, é esperado existirem catálogos, papéis de sistema, permissões, modelo de auditoria, buckets privados vazios e trilhas técnicas iniciais. Em contrapartida, não pode existir **nenhum cadastro de negócio ou dado de testes**.

**Usuários da aplicação:** zero identidades antes do bootstrap; após o GO específico de identidade, **no máximo um único administrador inicial autorizado**, sem usuários de testes ou de outras pessoas. As unidades e demais cadastros reais só serão criados posteriormente, pela aplicação e com autorização, não por seed de desenvolvimento.

O encerramento da Issue #50 prova **apenas a definição da política**. O aceite operacional de PROD requer evidências posteriores, novas e independentes.

## 2. Base técnica revisada na main

Baseline do documento: commit d3685c3ac5b2eb093f819b930d8b599b6084fa1e (merge do PR #60).

Fontes verificadas:
- [infra/README.md](../../infra/README.md) e [ADR-006](../decisions/ADR-006-infra-v1-reused-hardware.md): stack reprodutível de **cinco serviços**, Postgres 17, Kong, GoTrue, PostgREST e Storage, para CI/STAGING descartáveis; não equivale a um deploy produtivo.
- [production.env.example](../../infra/env/production.env.example) e [scripts/ops/common.sh](../../scripts/ops/common.sh): exemplos de produção **não executáveis**; ferramentas atuais aceitam somente CI e STAGING isolados, com alvo explícito.
- [scripts/ops/apply-migrations.sh](../../scripts/ops/apply-migrations.sh): aplica SQL versionado a banco **novo** e identificado; exige ausência do Core/ledger existente; não possui modo de reset ou reaplicação.
- [supabase/migrations/](../../supabase/migrations): migrations de Core, auditoria, planos, evidências e cobertura de unidades; não contêm uma autorização de carga de dados de teste em PROD.
- [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md), [Plano Diretor](PLANO_DIRETOR_2026.md), [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md): recuperação, C30, infraestrutura física, RPO/RTO e aprovação de produção continuam sujeitos a gates.
- [ACCOUNT_LIFECYCLE_V1](../architecture/ACCOUNT_LIFECYCLE_V1.md): desenho de ciclo de vida de contas, **não implementação aprovada**. A identidade privilegiada do ADR-007 permanece NO-GO na [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49), após o encerramento sem merge do [PR #24](https://github.com/The-Vonky/Gaucha-Gestao/pull/24).

**Nota importante sobre catálogos:** foram encontrados **três** buckets privados versionados, não dois: action-plan-evidence, audit-checklist-evidence e unit-covers. O smoke atual de infraestrutura também verifica esses três buckets.

## 3. Separação obrigatória dos ambientes

| Propriedade | DEV/STAGING | Futura PROD |
| --- | --- | --- |
| Banco, Auth, volumes e Storage | Massa fictícia e instâncias descartáveis | **Novos e exclusivos**; sem restore de DEV/STAGING |
| Projeto Docker/identificadores/portas | Identificadores próprios de teste | Identificação própria, aprovada e distinta |
| URLs, redirects e acesso | Local/homologação | Definir via projeto de ingress e aprovar antes de provisionar |
| Segredos e chaves | Segredos não produtivos | Gerados/guardados separadamente; nunca publicados em Git, browser ou evidências |
| Migrations | Testadas em stack descartável | Aplicadas somente após gate e com hash/ordem registrados |
| Seeds | Massa sintética permitida | **Proibido** executar seeds, fixtures, smoke ou importação de cadastros de DEV |
| Usuários | Contas fictícias | Nenhuma pré-bootstrap; **até 1 administrador inicial**, depois contas reais por fluxo autorizado |
| Storage | Backend em arquivo só validado para laboratório | Backend/destino privado e backup ainda a decidir; não assumir que arquivo local é PROD |

O banco/volume antigo da C30 **não é fonte de dados para a primeira PROD**. A situação de outros sistemas que já usaram a C30 é tratada em sua própria trilha de preservação e não altera esta regra.

## 4. Lista positiva: dados técnicos permitidos após as migrations

Somente estruturas e referências produzidas pelas migrations **versionadas e aprovadas**, com registro da origem e da versão:
1. Esquemas, RLS, funções, triggers e ledger de migrations (quando aplicável).
2. Permissões e papéis **de sistema** de Core: core.permissions, core.roles e core.role_permissions, incluindo platform_administrator, quality e quality_viewer.
3. Catálogo canônico de auditoria: audit.checklist_templates, audit.checklist_sections e audit.checklist_items (**nove seções e 158 critérios**, no modelo versionado).
4. Três entradas de configuração em storage.buckets, **privadas**, com **nenhum objeto**: action-plan-evidence; audit-checklist-evidence; unit-covers.
5. Metadados internos de Auth/Storage necessários ao serviço e eventuais registros de auditoria **técnica gerados pelas migrations**. Esses registros serão comparados ao baseline reproduzido em uma stack virgem de mesmo SHA; não concedem permissão para importar logs de DEV/STAGING.

**Proibido** inserir uma unidade fictícia, funcionário, setor, cliente, usuário de teste, auditoria de exemplo, inspeção, resposta, plano, imagem, anexo ou objeto para “facilitar” a estreia da PROD. Não reaproveitar o banco já existente em desenvolvimento.

## 5. Lista negativa: dados operacionais obrigatoriamente ausentes

Após migrations técnicas **e antes de criar a identidade administrativa**:
- Auth e acesso: auth.users = 0; core.profiles = 0; core.user_role_assignments = 0.
- Estrutura organizacional: core.units, core.sectors, core.unit_sectors e core.unit_cover_assets = 0.
- Auditorias de negócio: audit.inspections, audit.inspection_answers e audit.checklist_evidence = 0.
- Planos de ação: action_plans.plans e action_plans.evidence = 0.
- Arquivos: storage.objects = 0; conteúdo físico de cada bucket = vazio.
- Outras tabelas operacionais adicionadas em migrations futuras: revisar e acrescentar ao checklist; não presumir que esta lista é exaustiva após mudanças de schema.

**Após bootstrap autorizado:** auth.users = 1, core.profiles = 1 e uma atribuição global platform_administrator ao mesmo usuário. Nenhum segundo usuário, unidade, auditoria, plano ou objeto. O sistema deve rejeitar login/cadastro público e qualquer usuário não autorizado; essa verificação depende dos gates de Auth e de acesso.

**Exceção fundamentada:** core.system_audit_log não recebe a regra ingênua de contagem zero. Há triggers de auditoria em core que podem registrar alterações dos catálogos durante as próprias migrations. Exigir baseline de referência compatível com o SHA, classificar eventos **técnicos** esperados e negar registros de atividade fictícia de negócio. Qualquer divergência não explicada bloqueia a liberação.

## 6. Bootstrap inicial de uma única identidade — DESIGN, NÃO EXECUTAR AGORA

1. **Pré-condições:** infraestrutura de PROD e contas de serviço aprovadas; migrations aplicadas em ambiente novo; validação de ausência de dados de teste; solução de criação/recuperação de contas autorizada após decisão independente do ADR-007; responsável pelo administrador designado; procedimento de rollback/recuperação e auditoria definidos.
2. Somente um operador autorizado poderá criar/confirmar uma identidade no Supabase Auth por **canal administrativo confiável**. Cadastro público deve continuar desativado. Não usar service_role no frontend, não expor segredos em URL, console, logs ou repositório.
3. A migration 202609240001_core_foundation.sql já define o trigger private.create_profile, que cria core.profiles a partir de auth.users. **Não fazer segundo INSERT manual no perfil**.
4. A migration 202609240002_permission_catalog.sql define **private.bootstrap_administrator(uuid)**: exige Auth confirmado e perfil ativo, atribui o papel global platform_administrator e recusa repetição caso já exista atribuição desse papel. Execução é limitada ao operador e não fica concedida a public/anon/authenticated.
5. **Não executar essa função nesta Issue.** O mecanismo de criação/recuperação de contas e os riscos de último administrador, sessão, AMR, concorrência e falhas ainda exigem a decisão da Issue #49. A presença da função SQL não constitui aprovação do fluxo produtivo.
6. Após GO explícito, registrar somente evidência saneada de **uma** identidade e **uma** atribuição administrativa, sem CPF, endereço, e-mail pessoal, tokens, senhas ou dumps no GitHub. Não criar segunda conta “de contingência” por padrão; recuperação precisa de mecanismo autorizado próprio.

O eventual cadastro de funcionários e a manutenção de administradores após esse bootstrap são operações futuras, não seeds nem escopo da primeira instalação.

## 7. Verificação SQL SOMENTE LEITURA — modelo para uso FUTURO autorizado

**Não executar hoje.** O trecho abaixo é um checklist técnico para uma instância PROD **nova** e previamente aprovada. Requer sessão administrativa controlada com visibilidade integral (RLS pode ocultar linhas de usuários comuns), sem expor credenciais na evidência.

~~~sql
BEGIN;
SET TRANSACTION READ ONLY;

-- Pré-bootstrap: todas estas contagens devem ser ZERO.
SELECT 'auth.users' AS objeto, count(*) AS linhas FROM auth.users
UNION ALL SELECT 'core.profiles', count(*) FROM core.profiles
UNION ALL SELECT 'core.user_role_assignments', count(*) FROM core.user_role_assignments
UNION ALL SELECT 'core.units', count(*) FROM core.units
UNION ALL SELECT 'core.sectors', count(*) FROM core.sectors
UNION ALL SELECT 'core.unit_sectors', count(*) FROM core.unit_sectors
UNION ALL SELECT 'core.unit_cover_assets', count(*) FROM core.unit_cover_assets
UNION ALL SELECT 'audit.inspections', count(*) FROM audit.inspections
UNION ALL SELECT 'audit.inspection_answers', count(*) FROM audit.inspection_answers
UNION ALL SELECT 'audit.checklist_evidence', count(*) FROM audit.checklist_evidence
UNION ALL SELECT 'action_plans.plans', count(*) FROM action_plans.plans
UNION ALL SELECT 'action_plans.evidence', count(*) FROM action_plans.evidence
UNION ALL SELECT 'storage.objects', count(*) FROM storage.objects
ORDER BY objeto;

-- Catálogos técnicos DEVEM existir; checklist com 158 itens.
SELECT count(*) AS checklist_itens FROM audit.checklist_items;
SELECT count(*) AS checklist_secoes FROM audit.checklist_sections;
SELECT key, system, active FROM core.roles ORDER BY key;

-- Três buckets privados, sem arquivos.
SELECT id, public, file_size_limit FROM storage.buckets ORDER BY id;

ROLLBACK;
~~~

Para o **pós-bootstrap**, repetir as leituras e acrescentar consulta autorizada da atribuição global única ao papel platform_administrator; conferir os totais 1/1/1 sem publicar identificadores pessoais. Verificar também conteúdo **físico** vazio em cada backend de Storage, não apenas linhas de storage.objects. Validar integridade/hash das migrations e comparar registros de auditoria técnica com referência gerada no mesmo commit.

Critérios de **FAIL/BLOCKED**: qualquer dado de DEV/STAGING; conta pré-bootstrap; bucket público, ausente ou com objeto inesperado; checklist inconsistente; migration não versionada, divergência do baseline de logs, conta administrativa extra, origem de dados desconhecida ou evidência insuficiente. Nunca “corrigir” uma PROD candidata apagando tudo às cegas; parar, documentar o desvio e refazer a preparação com autorização.

## 8. Gates antes de qualquer execução real

- [ ] ADR-007 revisto com parecer independente e GO humano para o bootstrap/lifecycle; nenhuma migração de identidade privilegiada sem aceite.
- [ ] Stack de PROD definida e aprovada separadamente da stack descartável atual; segredos, URLs e acesso privado preparados.
- [ ] C30 diagnosticada fisicamente (HD HPE/RAID/alimentação) e intervenção destrutiva expressamente autorizada; dados necessários preservados.
- [ ] Procedimento de migration PROD projetado, revisado e testado em stack virgem; scripts atuais **não oferecem** modo production.
- [ ] Decisão documentada sobre Storage privado de PROD, backup banco+objetos, destino externo, retenção, RPO/RTO e restauração real comprovada.
- [ ] Homologação P1–P9 e requisitos operacionais O1–O8 fechados; CI no SHA candidato e aceites institucionais.
- [ ] Responsável pelo primeiro administrador identificado, mecanismo autorizado, recuperação definida; execução com logging saneado e limites.
- [ ] Relatório pré e pós-bootstrap assinado, sem dados fictícios, com contagens/versões e resultado PASS/BLOCKED.

Enquanto qualquer gate crítico estiver aberto: **PRODUÇÃO = NO-GO**.

## 9. Evidências a produzir futuramente

| Evidência | Conteúdo permitido | Não incluir |
| --- | --- | --- |
| Manifesto de PROD limpa | SHA do release, hashes das migrations, versão de Postgres/serviços, identificadores não secretos de instância | Senhas, JWT, service_role, endpoints administrativos privados |
| Relatório pré-bootstrap | Contagens por tabela, três buckets privados vazios, catálogo 158/9 e divergências | Dumps e dados de pessoas reais |
| Registro do administrador inicial | Atestação de 1 identidade e 1 papel global, autorizações e operador | Email/CPF/senha, tokens ou credenciais |
| Relatório de restauração | Resultado de restore isolado, tempo, integridade de banco+objetos e limitações | Backups reais anexados ao Git |
| Parecer de liberação | Quem aprovou, quando, SHA e gates verificáveis | Suposição de GO com base apenas na documentação |

**Situação nesta Issue #50:** política especificada, **sem PROD criada, sem migrations aplicadas, sem banco consultado ou alterado, sem contas reais cadastradas**. A revisão deste texto por PR não substitui a aprovação operacional futura.
