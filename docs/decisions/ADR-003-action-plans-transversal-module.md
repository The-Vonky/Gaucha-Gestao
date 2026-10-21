# ADR-003 — Planos de Ação como módulo transversal de negócio

**Status: Aceito**  
**Data: 24/09/2026**

## Contexto

Planos de Ação surgiram na Auditoria de Qualidade. Os requisitos posteriores à demonstração ampliam explicitamente o domínio além de um item de checklist e introduzem:
- planos manuais;
- setor opcional;
- tipo e ID de origem;
- critérios de eficácia;
- período de acompanhamento;
- evidências esperadas e anexadas.

Os requisitos já identificam ocorrências, não conformidades e reuniões como possíveis origens futuras.

Manter Planos de Ação como tabela/componente interno da Auditoria faria novos domínios dependerem dos detalhes de Auditoria ou duplicarem essa capacidade.

Movê-los para o Core também seria incorreto: um Plano de Ação corretivo é capacidade de negócio, não um conceito estável de plataforma como identidade ou unidade.

## Decisão

Planos de Ação será um **módulo/capacidade transversal de negócio**.

~~~text
Core
  unidades / setores / identidade / permissões
          |
          v
Planos de Ação
          ^
          |
Auditoria +
Manual ---+
futuras origens aprovadas
~~~

A posição inicial para o usuário permanece:

~~~text
Qualidade > Planos de Ação
~~~

A **propriedade técnica** é independente da posição no menu.

## Escopo inicial

Implementar somente as origens requeridas pela evolução aprovada da Auditoria:
- `checklist`;
- `manual`.

A existência de valores de tipo de origem destinados a domínios futuros **não autoriza** implementar esses domínios.

## Regra de integração

Outros módulos não devem manipular diretamente a persistência interna de Planos de Ação.

Devem usar um **contrato público de aplicação/domínio** explícito, com operações conceitualmente equivalentes a:
- garantir plano para uma origem;
- criar plano manual;
- consultar planos permitidos pelo escopo do usuário;
- atualizar campos de execução;
- verificar eficácia;
- anexar/remover evidência.

A forma exata de API/função depende da stack adotada.

## Propriedade dos dados

**Planos de Ação** detém:
- ciclo de vida da ação corretiva;
- metadados de referência à origem;
- ponto de melhoria/descrição do problema;
- ação, como fazer, responsável e prazo;
- status da ação;
- planejamento de eficácia;
- resultado da verificação de eficácia;
- vínculos aos metadados das evidências.

**Core** detém: usuários/identidade, unidades e setores canônicos, permissões/escopo e auditoria sistêmica.

**Módulos de origem** detêm os registros de negócio que geraram o plano.

## Invariante de unicidade do checklist

Para plano originado de checklist, a plataforma precisa impedir registros duplicados de plano ativo/origem para o mesmo item inspecionado, conforme a restrição final do schema.

Alterar uma resposta para AT/NAP não elimina silenciosamente dados históricos do Plano de Ação. O comportamento exato de encerramento/cancelamento deve ser definido no brief de implementação, preservando o histórico.

## Consequências

**Benefícios:** Auditoria não vira dependência de fluxos futuros de Qualidade/Administração; planos manuais são entidades de primeira classe; o mesmo modelo de eficácia/evidências pode ser reaproveitado; a Central de Planos pode agregar as origens autorizadas.

**Trade-offs:** exige contrato modular claro, navegação à origem sem acoplamento forte e avaliação cuidadosa de permissões/escopo.

## Regra de proteção

Não converter Planos de Ação em uma *engine* genérica de workflows. Permanece um domínio focalizado em correção e melhoria; abstrações novas somente para casos concretos aprovados.
