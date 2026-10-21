# Estrutura do produto e navegação

**Estado: baseline de produto aceita em 24/09/2026.** A árvore representa **áreas previstas**, não prova que todas foram implementadas. Curva ABC v1 já entrou no código; Agendamento de Salas possui [AG-00 proposto](../briefs/ROOM_BOOKING_V1.md).

## Arquitetura da informação para a pessoa usuária

~~~text
Gaúcha Gestão
├── Qualidade
│   ├── Auditorias
│   ├── Planos de Ação
│   ├── Registros ISO
│   └── Pesquisa de Satisfação
├── Custos
│   ├── Curva ABC
│   └── Planejado × Realizado
├── Administrativo
│   ├── Contratos
│   └── Agendamento de Salas
├── Comercial
│   └── Vendas / Maquininhas
├── Transporte
│   └── Frota
└── Administração
    ├── Usuários / Perfis / Permissões
    ├── Unidades / Setores
    └── Logs
~~~

A navegação **não** representa a estrutura de diretórios do repositório.

## Propriedade técnica por área

| Área visível | Módulo proprietário |
| --- | --- |
| Qualidade → Auditorias | Módulo Audit |
| Qualidade → Planos de Ação | Módulo transversal Action Plans |
| Qualidade → Registros ISO | Módulo futuro ISO |
| Qualidade → Satisfação | Módulo futuro Satisfação |
| Custos → Curva ABC | Módulo ABC |
| Custos → Planejado × Realizado | Módulo futuro Planejado × Realizado |
| Administrativo → Contratos | Módulo futuro Contratos |
| Administrativo → Agendamento de Salas | Módulo futuro Meetings/Room Booking |
| Comercial → Vendas/Maquininhas | Módulo futuro Vendas |
| Transporte → Frota | Módulo futuro Frota |
| Administração → Usuários | Core identidade/perfil |
| Administração → Perfis/Permissões | Core autorização |
| Administração → Unidades/Setores | Core organização |
| Administração → Logs | Core trilha sistêmica |

## Navegação por permissões

O menu é derivado das **permissões efetivas**, não de condicionais por cargo. Grupo sem destino permitido fica oculto.

**Exemplos do desenho de produto** (não promessa de telas implementadas):

~~~text
Pessoa de Transporte:
Início > Transporte > Frota
       > Administrativo > Agendamento de Salas

Pessoa de Qualidade:
Início > Qualidade > Auditorias / Planos de Ação
                   > Registros ISO / Pesquisa de Satisfação
~~~

Pessoa executiva pode ler múltiplos domínios sem obter administração da plataforma.

## Página inicial e contexto de unidade

Início/Visão Geral é superfície da plataforma, **não** décimo módulo de negócio. Reúne somente dados que a pessoa tem permissão para ler. Começar por cartões de navegação/estado e só criar indicadores executivos entre módulos quando as fontes forem confiáveis.

Uma unidade canônica Core poderá servir como contexto comum a Auditoria/Planos, Satisfação, ABC, Planejado × Realizado, Frota e Contratos, sempre mediante **contratos públicos de leitura dos módulos e autorização**. Core não importa internos dos domínios.

## Mobile e limites de arquitetura

A mesma arquitetura de informação vale no celular. Sidebar pode virar drawer/sheet, mantendo grupos, propriedade técnica e filtragem por permissão.

**Mover item de menu não move lógica de negócio**: agrupamento visual é decisão de produto, propriedade de domínio é decisão arquitetural.
