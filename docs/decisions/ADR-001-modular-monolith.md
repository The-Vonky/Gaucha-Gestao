# ADR-001 — Monólito modular

**Status: Aceito**  
**Data: 24/09/2026**

## Contexto

A Gaúcha Gestão consolidará nove sistemas internos. Espera-se que a plataforma seja mantida por uma equipe de desenvolvimento pequena, e diferentes domínios compartilham conceitos corporativos, como usuários e unidades.

Microsserviços independentes adicionariam custos de implantação, rede, observabilidade, consistência e operação antes de haver justificativa para essa complexidade.

Por outro lado, um monólito único e sem estrutura tornaria os nove domínios progressivamente difíceis de manter e caros de compreender, tanto para pessoas quanto para agentes de desenvolvimento.

## Decisão

Adotar um **monólito modular**.

A aplicação é implantada e operada como uma arquitetura de plataforma única, enquanto os domínios de negócio permanecem em módulos explícitos, com dependências controladas.

O **Core** fornece capacidades corporativas compartilhadas e estáveis.

Módulos podem depender de Core/Shared, mas não podem acessar detalhes internos da implementação de outros módulos.

## Consequências

**Benefícios:**
- implantação e operação mais simples;
- transações e infraestrutura compartilhadas mais diretas;
- menos modos de falha próprios de sistemas distribuídos;
- desenvolvimento mais rápido;
- menos contexto necessário para trabalhar em um domínio;
- possibilidade de extrair um serviço futuramente caso um domínio realmente exija escala independente ou propriedade por outra equipe.

**Trade-offs:**
- as fronteiras dependem de disciplina de engenharia;
- imports imprudentes ou acesso direto entre tabelas podem criar acoplamento oculto;
- uma indisponibilidade da plataforma pode afetar vários módulos.

## Quando reconsiderar

Avaliar a extração de serviços somente diante de evidências como:
- necessidades de escalabilidade significativamente diferentes;
- ritmo de deploy independente e responsabilidade organizacional real;
- requisito de isolamento ou compliance;
- benefício operacional claramente maior que o custo de manter um sistema distribuído.
