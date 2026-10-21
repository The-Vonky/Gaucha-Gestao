> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Brief de desenho — Governança de acesso do Core v1

**Estado histórico: SOMENTE DESENHO**  
**Base:** `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`  
**Branch planejada à época:** `integration/core-foundation-v2`

## Objetivo

Projetar Administração para responder, com linguagem acessível: quem tem acesso; a quê; por qual papel e escopo; quem concedeu/revogou e quando; quem é afetado pela alteração de um perfil; quais acessos existem por unidade. **Sem implementação nesta frente original.**

## Problemas identificados

- Logs exigiam UUID do autor e mostravam UUID/JSON técnicos.
- Revisão de acessos era pessoa a pessoa, sem visão consolidada por unidade/papel.
- Histórico não mostrava claramente concedente/revogador e datas.
- Edição de permissões de papel não exibia impacto antes de salvar.
- Administração de unidades não possuía dossiê de setores, usuários/acessos e capa.
- Erros de desvinculação exibiam FK genérica, não diagnóstico de domínio.
- Necessidades de exportação/revisão exigiam definição.

## Desenho solicitado

Modelos de leitura/RPC/views para: resolução legível de autor/entidade preservando IDs imutáveis; resumo de acessos de usuário e unidade; impacto e membros de papel; histórico de concessão/revogação; dossiê de unidade; exportação/revisão; navegação «Ver logs deste usuário».

Definir exposição por `admin.user.read`, `admin.user.manage`, `admin.role.read/manage`, `admin.unit.read/manage`, `admin.audit_log.read`.

## Erros

Prever erros de domínio no servidor/RPC quando não for possível diferenciar autorização, versão obsoleta e bloqueio referencial. **Não enfraquecer RLS em nome da UX.**

## Entregável original

`docs/architecture/ACCESS_GOVERNANCE_V1.md`, contendo perguntas do operador → contrato, RPC/views propostas, matriz de autorização, auditoria/privacidade, exportação, divisão v1/futuro e decisões PO pendentes. Sem código nessa branch histórica.
