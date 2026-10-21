> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Brief de desenho — Ciclo de contas do Core v1

**Estado histórico: SOMENTE DESENHO**  
**Base:** `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`  
**Branch planejada:** `integration/core-foundation-v2`

## Objetivo

Projetar ciclo de contas operacionalmente autossuficiente na Gaúcha Gestão **sem expor chaves privilegiadas Supabase ao browser**. Sem implementação nesta etapa.

## Premissas a conferir na baseline original

Supabase Auth é identidade; cadastro público desativado; a aplicação possuía somente login naquele snapshot, sem fluxo administrativo de criação/reset e troca autônoma de senha; nenhuma configuração SMTP identificada; perfil Core ativo é distinto de sessão Auth válida. **Não tomar essas ausências históricas como diagnóstico atual sem verificar o código.**

## Escopo do desenho

Definir criação administrativa; estratégia de senha inicial/temporária; troca forçada no primeiro acesso se pertinente; reset administrativo; troca autenticada da própria senha; «esqueci a senha» com/sem SMTP; inativação/reativação e sessões; vínculo Auth↔Core; recuperação se uma criação falhar após outra; auditoria; rate limiting/abuso; fronteira de `service_role`; avaliação de Edge Function ou outro processo confiável; MFA opcional (decidir se pertence à v1, **não implementar sem GO**).

## Segurança

- Credenciais administrativas Auth/`service_role` nunca no browser.
- Operações administrativas exigem autorização explícita.
- Usuário comum não cria nem redefine conta alheia.
- Auditar sem registrar senhas/segredos.
- Credenciais temporárias não persistem em Core/logs.
- Compatibilidade com Supabase self-hosted aprovado.

## Entregável original

`docs/architecture/ACCOUNT_LIFECYCLE_V1.md` com diagramas de sequência para: criação administrativa, primeiro login, troca da própria senha, reset por admin, inativação/reativação; decisões pendentes do responsável.

**Sem código, migration ou Edge Functions autorizados por este brief.** ADR-007 continua NO-GO conforme [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49).
