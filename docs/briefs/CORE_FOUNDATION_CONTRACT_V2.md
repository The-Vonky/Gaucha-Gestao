> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Brief de desenho — Contratos da Fundação Core v2

**Estado histórico: SOMENTE DESENHO**  
**Base:** `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`  
**Branch planejada:** `integration/core-foundation-v2`

## Objetivo

Definir os contratos Core estáveis consumidos por módulos existentes e futuros. Esta frente original **não autorizava código**.

## Leituras

`AGENTS.md`, ADR-001/002/005, `AUTHORIZATION.md`, `DATA_MODEL.md`, `PRODUCT_STRUCTURE.md`, código Core/Admin e migrations na base histórica.

## Questões do desenho

- identidade Auth versus perfil Core;
- usuário/pessoa elegível como responsável de domínio;
- ativo/inativo e vínculos históricos;
- identidade/código/nome/ciclo da unidade;
- identidade setorial e validade unidade–setor;
- papéis, permissões e atribuições por escopo;
- seletores e referências de usuários/unidades/setores pelos módulos;
- comportamento quando entidade referenciada se torna inativa;
- leitura para seletores/diretórios sem bypass de RLS;
- fronteira Core × módulo e auditoria sistêmica.

## Entregável original

`docs/architecture/CORE_FOUNDATION_V2.md`, com tabela de propriedade, diagrama de relações, estados/ciclos, regras de consumo, invariantes RLS, referências históricas, exclusões e decisões ainda dependentes do responsável.

## Proteções

Core guarda **somente** conceitos corporativos estáveis; nunca depende de Auditoria ou outro módulo; não semear permissões de domínios inexistentes; não criar modelo universal polimórfico de negócio; sem alteração de código/migration.

**Não decidir silenciosamente comportamento de produto incerto.** Identificar pendências para aprovação do PO.
