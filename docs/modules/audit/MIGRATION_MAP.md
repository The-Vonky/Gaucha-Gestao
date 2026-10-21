# Auditoria de Qualidade — mapa de migração

**Estado histórico:** planejamento originalmente revisado em 24/09/2026.  
**Atualização de contexto, 21/10/2026:** o módulo Auditoria e seu hardening v1 já estão integrados à `main`, com Planos de Ação, evidências de checklist e de plano, exportações e reabertura. Este documento preserva a comparação com o legado e o raciocínio de migração: **não usar as fases abaixo como tarefas pendentes sem consultar o estado atual.** Produção ainda **NO-GO**.

## Relação entre a fotografia histórica e o código atual

A comparação com o legado usa `Controle_Auditoria` no commit `b916ba8`; não descreve automaticamente o estado atual da Gaúcha Gestão. No snapshot de plataforma `3f158d3`, reabertura, Planos de Ação e suas evidências já existiam, mas Checklist Evidence e exportações ainda não. Esse estado foi superado: o commit `fdae41a51af284358aa9dc7804ba03f75f241ac6` já incluía exportação/relatórios (PR #9), Checklist Evidence (PR #11) e paginação de histórico da unidade que evita truncamento silencioso acima de 1.000 linhas (PR #13). Posteriormente a Qualidade v1 foi consolidada. Veja [matriz de conclusão](QUALITY_COMPLETION_V1.md).

Reabertura e modelo de permissão/escopo estão definidos em [Audit Domain v1](../../briefs/AUDIT_DOMAIN_V1.md) e [ADR-005](../../decisions/ADR-005-core-authorization.md). O produto aprovou **Excel da inspeção, Excel do histórico da unidade e impressão/PDF**, implementados conforme [Reporting](../../briefs/AUDIT_EXPORT_REPORTING_V1.md). Anexos por critério estão implementados conforme [brief](../../briefs/AUDIT_CHECKLIST_EVIDENCE_V1.md) e [contrato](CHECKLIST_EVIDENCE_V1.md). Arquivos portáteis e Realtime não fazem parte do escopo de fechamento v1; retenção ainda é decisão operacional.

**Não reabrir decisões aceitas** com base em dúvidas antigas listadas ao fim deste mapa.

## Objetivo original

Migrar o domínio de Auditoria comprovado para a Gaúcha Gestão, sem carregar restrições técnicas do standalone nem acoplar conceitos de toda a plataforma ao módulo.

## Sistemas de origem

1. Auditoria standalone **v2.9.1**, baseline funcional/UX demonstrada antes de novas solicitações.
2. `The-Vonky/Controle_Auditoria` online **v3**, evolução técnica multiusuário da época.
3. `IMPLEMENTATION_BRIEF_ACTION_PLANS_V3.md`, evolução de Planos de Ação aprovada após a demonstração, hoje incorporada ao projeto.

## Reaproveitar diretamente quando compatível

**Regras/dados de domínio:**
- checklist canônico, IDs estáveis e 9 seções/158 itens;
- semântica das respostas;
- fórmula de conformidade e limites de classificação;
- regra de completude antes de finalizar;
- gatilho de criação de Plano de Ação para respostas AP/NAT.

**Testes/fixtures a reproduzir:**
- resultados conhecidos de pontuação da v2.9.1;
- contagem/IDs do template;
- comportamento de finalização;
- unicidade de Plano de Ação originado no checklist.

A plataforma deve automatizar esses testes, não depender apenas da comparação manual com o HTML legado.

## Reaproveitar com adaptação

### Interface React do sistema online original

Padrões aproveitáveis: cartões de unidade e hero, abas de inspeção, navegação por seções, perguntas responsivas, modais, cartões de Planos de Ação, listas de evidências e exportação Excel.

**Adaptações:** App Shell da plataforma substitui shell próprio da Auditoria; Core fornece unidades/usuários canônicos; permissões substituem verificações fixas de papéis; rotas dentro da navegação da plataforma; componentes Shared reaproveitados em vez de copiados.

### Modelo PostgreSQL online original

Conceitos aproveitáveis: UUIDs, inspeções/respostas/planos/anexos normalizados, concorrência otimista por versão, autorização no banco e Realtime quando gerar valor real.

**Adaptações:** referências a entidades Core, Planos de Ação generalizados, permissão/escopo da plataforma, auditoria sistêmica global e migrations incrementais. O schema original é **referência**, não script para reaplicar cegamente.

### Gateway de mídia original

Conceitos úteis: acesso autenticado a arquivo, bytes fora do PostgreSQL, linhas de metadados e limites de upload. Adaptar ao contrato Supabase/Storage/Auth escolhido pela plataforma.

## Não transportar do legado

- arquitetura HTML em arquivo único;
- LocalStorage como fonte autoritativa de negócios;
- IndexedDB como banco-fonte;
- recuperação no browser como backup de infraestrutura;
- App Shell global exclusivo da Auditoria;
- condições fixas como `role === 'qualidade'`;
- duplicação de usuários/unidades no módulo;
- exclusão de unidade Core pela Auditoria com cascata dos dados;
- dependências de fornecedor de infraestrutura contrárias aos ADRs.

## Dependências da plataforma para Auditoria v1

**Core:** identidade e perfil autenticados, autorização por permissão, unidade, setor opcional em Planos, escopo organizacional e log sistêmico.

**Shared/plataforma:** App Shell/navegação, modais/formulários, contrato de arquivos/anexos, estados erro/carregando/vazio, formatação de data/hora e convenções de deploy/configuração.

**Negócio transversal:** Planos de Ação conforme [ADR-003](../../decisions/ADR-003-action-plans-transversal-module.md).

## Posicionamento da navegação (decisão de produto)

~~~text
Qualidade
├── Auditorias
├── Planos de Ação
├── Registros ISO
└── Pesquisa de Satisfação
~~~

A forma exata das rotas não foi fixada no planejamento inicial; Auditoria precisava manter **fronteira de módulo própria**, independentemente do agrupamento visual.

## Fases históricas da migração

**A — Congelar baseline funcional.** Feito para planejamento: artefato v2.9.1 por SHA-256, `main` do online v3 e brief posterior identificados.

**B — Contratos da fundação.** Selecionar stack web/backend/Auth/Storage, entidades Core, permissões iniciais, fronteira do módulo e estratégia de migração/testes.

**C — Esqueleto de Auditoria.** Entrada em Qualidade, interface pública do módulo, páginas/rotas, permissões e consultas com escopo por unidade. Não migrar tudo de uma vez.

**D — Domínio.** Template, inspeções, respostas, cálculo, concorrência, finalização e testes de regressão.

**E — Planos de Ação.** Origem `checklist` e manual, planejamento/verificação de eficácia, evidências, setor opcional, prevenção de plano duplicado por item.

**F — Arquivos e relatórios.** Evidências por critério, evidências de plano e comportamentos de exportação/relatório.

**G — Reconciliação.** Comparar com casos legados/online: pontuação, respostas, ciclo da inspeção, criação de plano, anexos, exportações, permissões, unidade e comportamento móvel.

Essas fases são **marcos históricos**; os itens implementados na plataforma não devem ser recriados.

## Questões abertas na época

1. Preservar reabertura explícita de inspeção finalizada?
2. Manter Excel de histórico de unidade?
3. Além de backup infra, precisar arquivo portátil por usuário?
4. Que partes da interface online seriam reaproveitadas ou recriadas?
5. Realtime em todas as telas ou apenas colaboração/status?
6. Catálogo de permissões e escopo unidade/setor?
7. Retenção de inspeções/evidências finalizadas?

**Resolução atual:** reabertura, exportações, contratos de permissão e evidências foram aprovados e implementados; Realtime e arquivo portátil não entraram na v1; retenção continua pendente. Não converter dúvidas históricas em blockers novos sem issue/brief aceito.
