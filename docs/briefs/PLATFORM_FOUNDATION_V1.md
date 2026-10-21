# Brief de implementação — Fundação da plataforma v1

**Estado histórico: FECHADO PARA PREPARAÇÃO DE IMPLEMENTAÇÃO**  
**Data: 24/09/2026**

> Este brief definiu **a primeira fundação de código** da Gaúcha Gestão. Não autorizava implantar produção, configurar infraestrutura produtiva nem migrar dados de negócio dos legados. Suas tarefas de Core foram posteriormente implementadas; não iniciar trabalho novamente apenas por este texto. Consultar [README atual](../../README.md) e [mapa de implementação](../architecture/IMPLEMENTATION_MAP.md).

## Objetivo

Criar a menor plataforma funcional que suportasse Auditoria como primeiro módulo, incluindo:
- App Shell;
- cliente Supabase;
- identidade/perfil Core;
- unidades e setores;
- RBAC com atribuições por escopo;
- navegação por permissões;
- auditoria sistêmica;
- schemas/migrations;
- validação automatizada.

**Não migrar o domínio Auditoria neste brief inicial.**

## Leituras exigidas originalmente

`AGENTS.md`; ADR-001, ADR-002, ADR-004, ADR-005; `docs/architecture/PRODUCT_STRUCTURE.md`, `AUTHORIZATION.md`, `DATA_MODEL.md`, `SECURITY.md`. Não ler módulos não relacionados sem dependência.

## Stack e estrutura inicial

Usar stack aceita: **React, TypeScript, Vite, supabase-js, arquivos de migration PostgreSQL/Supabase e workspaces npm** adequados ao monólito modular.

Não configurar ML350, Cloudflare, R2 nem deploy Supabase produtivo. **A escolha física da ML350 foi posteriormente substituída pelo ADR-008 (C30).**

Estrutura conceitual mínima:

~~~text
apps/
  web/
    src/
      app/
      core/
      modules/
      shared/
supabase/
  migrations/
docs/
~~~

Não criar pastas/arquivos vazios para nove módulos: placeholders somente quando exigidos por contrato de navegação.

## Fundação frontend

Implementar aplicação React/Vite/TS, router, App Shell, sidebar responsiva desktop, drawer mobile, fronteira de sessão/login, bootstrap perfil/usuário atual, estados carregando/erro/negado e registro de navegação filtrado por permissões.

Mostrar somente destinos realmente suportados; **não fabricar dashboards** para módulos inexistentes.

O registro precisa comportar grupos: Qualidade, Custos, Administrativo, Comercial, Transporte, Administração. Cada destino define permissões necessárias. Grupos sem destino visível são omitidos. Na fundação v1, páginas de Administração e entrada/placeholder da Auditoria só aparecem com contratos de permissão reais.

## Schemas e tabelas Core

Migrations versionadas criam schemas `core` e `private`, enums/domains apenas quando necessários, tabelas do ADR-005/DATA_MODEL, índices, grants, RLS e helpers de autorização.

Tabelas:
- `core.profiles`;
- `core.units`;
- `core.sectors`;
- `core.unit_sectors`;
- `core.permissions`;
- `core.roles`;
- `core.role_permissions`;
- `core.user_role_assignments`;
- `core.system_audit_log`.

Não criar tabelas de negócio Auditoria/Planos neste brief.

## Integração Auth

Usar Supabase Auth. Exigências:
- identidade autenticada vinculada a `core.profiles`;
- perfil inativo **não** recebe acesso;
- browser sem chave `service_role`/secret;
- bootstrap do primeiro administrador explícito e seguro;
- cadastro comum não concede acesso de negócio automaticamente;
- criação/convite preferencialmente administrados, se cadastro público não fizer parte do fluxo corporativo;
- **não** implementar armazenamento próprio de senhas.

## Autorização

Seguir ADR-005: usuário pode ter várias `user_role_assignments`, cada uma com escopo `global`, `unit` ou `sector`. Helpers de banco limitados avaliam permissões efetivas; **RLS é autoridade**.

Frontend pode manter `can(permission)` e equivalentes com escopo para exibir acesso, mas isso **não substitui** validação de banco.

### Catálogo inicial de permissões

**Auditoria:** `audit.inspection.read`, `audit.inspection.create`, `audit.inspection.edit`, `audit.inspection.finalize`, `audit.inspection.reopen`, `audit.inspection.export`.

**Planos de Ação:** `action_plan.read`, `action_plan.create_manual`, `action_plan.write`, `action_plan.verify`.

**Administração:** `admin.user.read/manage`, `admin.role.read/manage`, `admin.unit.read/manage`, `admin.sector.read/manage`, `admin.audit_log.read` (as expressões abreviadas representam ambas as chaves, não uma chave literal).

**Não** pré-criar permissões dos outros módulos.

### Papéis iniciais

Semear **Administrador da Plataforma, Qualidade e Visualizador de Qualidade**. Composição pertence ao seed/migration e a lógica **não deve testar a chave do papel**. Administrador bootstrap recebe papel Administrador da Plataforma com escopo global.

## UI mínima de Administração

**Usuários:** listar perfis e status ativo/inativo, consultar atribuições, ativar/desativar, conceder/revogar papel por escopo. Sem exclusão física.

**Papéis:** listar/composição, criar/editar papel não sistêmico quando seguro, atribuir permissões, proteger papéis de sistema contra exclusão destrutiva.

**Unidades:** listar/criar/editar/ativar/desativar; não excluir fisicamente unidade com histórico.

**Setores:** listar/criar/editar/ativar/desativar e relacionar às unidades.

**Permissões:** catálogo somente leitura suficiente para v1; não permitir criar strings arbitrárias na UI comum.

**Logs:** visão sistêmica paginada e somente leitura, protegida por permissão, com filtros básicos data, ator, módulo/ação quando viável.

## Eventos de auditoria sistêmica

Registrar no mínimo: ativação/inativação de perfil, criação/edição de papel, alteração de permissões, concessão/revogação de papel, criação/edição/ativação/inativação de unidade ou setor e mudança de vínculo unidade–setor.

Clientes **não** escrevem linhas arbitrárias de log diretamente.

## Segurança / RLS

Para cada tabela Core exposta:
- habilitar RLS;
- grants mínimos;
- testar negação anônima;
- testar negação autenticada sem permissão;
- testar escopo autorizado e incorreto.

Helpers internos residem em schema `private` quando não precisam Data API. `SECURITY DEFINER` exige `search_path` fixo/vazio, nomes qualificados e `EXECUTE` mínimo. **Botão escondido não é segurança.**

## Concorrência

Mutações administrativas passíveis de sobrescrever outra edição usam estratégia otimista simples (`updated_at`/`version`) quando conveniente, sem framework genérico. Não superprojetar concorrência para seeds imutáveis de permissões.

## Experiência

Shell corporativo profissional e responsivo, acessibilidade por teclado/foco visível, estados carregando/vazio/erro claros, sem `alert()`, `confirm()`, `prompt()` nativos. Ações destrutivas/inativação usam modal/diálogo da aplicação. Teclado mobile abre apenas por interação explícita com campo. Não criar dashboard decorativo sem dados úteis.

## Explicitamente fora do escopo original

- inspeções/checklist da Auditoria;
- tabelas/UI de negócio Planos de Ação;
- ISO, Satisfação, ABC, Planejado×Realizado, Contratos, Reuniões, Vendas, Frota;
- deploy Cloudflare, buckets R2, Docker Compose produtivo, Ansible, scripts PITR, observabilidade, Studio exposto e segredos produtivos.

**Nota histórica:** Audit/Planos/ABC foram implementados **depois**, em briefs próprios. O «fora do escopo» deste brief não é proibição permanente.

## Testes automatizados exigidos originalmente

1. Negar usuário inativo.
2. Negar autenticado sem atribuição.
3. Negar sem permissão específica.
4. Permitir grant global pertinente.
5. Permitir grant por unidade somente na unidade certa.
6. Negar outra unidade.
7. Permitir grant por setor somente em unidade/setor compatíveis.
8. Compor múltiplas atribuições **sem misturar escopos**.
9. Papel de um domínio não libera outro.
10. Administração exige permissão administrativa.
11. Cliente comum não insere/atualiza/exclui log arbitrariamente.
12. IDs adivinhados não burlam RLS.

Frontend deve testar navegação por permissão e fluxos Admin críticos quando o stack de testes permitir.

## Validação e Git da época

Antes de concluir: dependências instalam, typecheck, lint quando configurado, testes, build, migration nova aplica em Supabase/PostgreSQL de teste e RLS funciona; diff sem segredos, sem `alert(`/`confirm(`/`prompt(` nativos; nenhum deploy produtivo.

Se não houver Supabase local, declarar **essa limitação**, nunca simular PASS.

Commits atômicos possíveis: workspace/shell, migrations/helpers, Auth/bootstrap, navegação, UI Admin e testes/hardening. A divisão pode variar mantendo commits focados.

**Relatório esperado:** arquivos, migrations, checks executados, pendências reais e commits. Este brief permanece **histórico**, não uma issue para implementar novamente.
