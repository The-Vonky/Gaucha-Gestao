> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Brief de desenho — Mapa de consumidores do Core v1

**Estado histórico: SOMENTE DESENHO**  
**Base:** `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`  
**Branch planejada:** `integration/core-foundation-v2`

## Objetivo

Identificar os conceitos estáveis do Core que os módulos restantes demandarão **antes de congelar os contratos da Fundação v2**. Não implementar módulos de negócio nesta frente.

## Módulos considerados no desenho original

Registros ISO / Propostas ISO, Vendas/Maquininhas, Satisfação, Agendamento de Salas, Frota, Planejado × Realizado, Curva ABC e ERP de Contratos. Auditoria e Planos de Ação já eram consumidores e deveriam servir de evidência, **não ser reimplementados**.

**Atualização de leitura:** Curva ABC v1 já foi integrada depois pela PR #69; o rol acima é o inventário histórico do brief.

## Método

Derivar apenas necessidades sustentadas por documentação do repo ou evidência do legado: usuário autenticado, responsável/participante, unidade, setor, papel/escopo, autor histórico, anexos, dados de data/valor e referências entre módulos. Requisito desconhecido: marcar **DESCONHECIDO**; não adivinhar vínculos.

## Entregável original

`docs/architecture/CORE_CONSUMER_CONTRACT_MAP_V1.md`, com matriz módulo × primitiva Core, evidência de dependência não óbvia, contratos realmente compartilhados, propriedade por módulo, contradições e gates mínimos para concluir Core.

**Sem código, migration ou seed de permissões futuras.**
