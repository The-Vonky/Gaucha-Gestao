# VEN-01 — Fundação de dados e segurança de Vendas / Maquininhas

**Estado:** INTEGRADA À `main` pela [PR #90](https://github.com/The-Vonky/Gaucha-Gestao/pull/90), merge `cbdbed99e5593eaf6b79392d559b0bd84e25267d` em 28/10/2026. O merge de código não comprova aplicação da migration no notebook ou no STAGING; não homologada.
**Data:** 28/10/2026.
**Decisão de origem:** [VEN-00 documentalmente aprovada](../../briefs/VEN-00_consolidada_vendas_maquininhas_2026-10-28.md), VEN-D01 a VEN-D12. A VEN-01 foi autorizada expressamente em conversa pelo responsável em 28/10/2026, **para código, migration, testes e PR; sem execução em bancos persistentes**.
**Arquitetura:** ADR-001/002/004/005, Core como fonte canônica de unidades, identidade, RBAC e logs.
**Migration nova:** `supabase/migrations/20261028101700_sales_foundation.sql` (append-only).

## Contexto de ambientes confirmado pelo responsável

- **Notebook:** desenvolvimento e banco local para testes; nenhum acesso ou alteração nele por este PR. Mesmo sendo de testes, pode guardar estado a preservar: não fazer reset, seed destrutivo, db push ou migrations sem nova autorização explícita.
- **Servidor de homologação:** hospeda aplicação e **STAGING com banco utilizado por funcionários para testes**. É persistente na prática (conserva registros entre sessões) e **não é descartável**. Não aplicar esta migration, não conectar, não atualizar, não reiniciar e não afetar o serviço.
- **Produção:** nenhum GO; sem deploy ou manipulação de dados.
- **PGlite:** a suíte automatizada usa exclusivamente instância **efêmera em memória**, sem conexão com os ambientes acima.

O termo «banco persistente» neste contrato inclui qualquer banco do notebook que conserve dados e o STAGING do servidor. Se o responsável optar por aplicar migrations futuramente no banco local do notebook, isso será um **ato separado**, após inspeção de estado, backups e avaliação de risco. STAGING exige gate próprio posterior.

## Esquema e garantias propostas

| Entidade privada | Papel | Regras |
|---|---|---|
| `sales.entries` | Um total diário por unidade Core e forma Stone/PIX | UUID, data civil, `unit_id` Core, montante positivo em centavos, versão, autoria, exclusão lógica; índice único **parcial de ativos** em `(sale_date, unit_id, payment_method)`. Excluídos são históricos imutáveis e não impedem nova entrada ativa. |
| `sales.legacy_monthly_adjustments` | Ajuste monetário **mensal sem dia** | Mês 1º dia, unidade Core, Stone/PIX, justificativa, proveniência, único por mês/unidade/forma; imutável nesta fase. |
| `sales.month_statuses` | Estado parcial/fechado herdado por competência | **Global por mês como no legado**, sem coluna unidade; `is_closed`, último dia com dados, origem; nenhum fechamento manual. Apenas metadados históricos. |
| `sales.import_batches` | Manifesto técnico para eventual migração autorizada | ID e hash de origem, sem linhas reais nesta etapa; mutações proibidas após inserção até contrato futuro. |

**Valores:** optou-se por `numeric` não tipado com `CHECK` de escala (0–2 casas) e limite correspondente ao `numeric(14,2)` do legado. Isso **rejeita** `1.001` em vez de arredondar automaticamente para `1.00`, mantendo a decisão VEN-D12. A futura VEN-02 deve validar texto decimal antes de qualquer conversão. A tabela de ajustes aceita somente valores positivos como o legado; eventual ajuste negativo/residual depende de aprovação explícita antes de importação real.

**Unidade inativa:** criação manual só em `core.units.active=true`; correção de registro que já pertence à unidade inativa permanece possível com ator autenticado, mas a transferência para uma unidade inativa é rejeitada. A autorização por unidade **origem e destino** ainda terá de ser garantida nas RPCs da VEN-02.

**Auditoria:** triggers nas inserções/alterações gravam `core.system_audit_log` com `module='sales'`, `before_data`, `after_data`, autoria da sessão quando conhecida e `unit_id`. Um registro migrado sem autor original não recebe identidade fictícia. Transferência entre unidades usa `unit_id=NULL` no evento, reservando seu acesso a uma permissão global de log para não expor unidade de origem a auditor limitado ao destino. Toda tentativa de exclusão física é recusada em nível de tabela.

## Segurança: fotografia da entrega VEN-01

- Schemas `sales` e `sales_private` não estão publicados na lista de schemas do PostgREST em `supabase/config.toml`, que **não é alterado nesta PR**.
- Nenhum `USAGE`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` ou `EXECUTE` nas tabelas/funções `sales` é concedido a `anon` ou `authenticated`.
- Todas as tabelas têm **RLS ativa**, com políticas restritivas que negam operações aos clientes, mesmo diante de `GRANT SELECT` acidental.
- O catálogo Core recebe **sete capacidades candidatas** de Vendas, sem criar papéis nem conceder automaticamente quaisquer delas ao administrador ou funcionário. O responsável aprovará a matriz papel × capacidade × unidade **antes de habilitar operações**.
- **Sem RPCs de negócio, frontend, dashboard, exportação ou dados de verdade** na entrega VEN-01. A [VEN-02](VEN02_OPERATIONS.md), autorizada separadamente em 28/10, acrescenta cinco RPCs públicas e adaptadores para revisão, mantendo as tabelas privadas.

## Evidências e verificações

Arquivo de testes: `tests/sales-foundation-database.test.ts`.
Fixture sintética: `tests/fixtures/sales-foundation.sql`.

A fixture cobre RLS negativa, grants inexistentes, permissões não atribuídas, unidade ativa/inativa, unicidade de lançamentos ativos, valores com mais de duas casas, Stone/PIX, status de fevereiro, histórico sem autor, soft-delete e reinserção, trilha de auditoria e imutabilidade. O ensaio sequencial dessa fixture não comprova concorrência com sessões independentes.

Para verificar no checkout **local da branch**, usando apenas PGlite em memória:

```bash
npm test -- tests/sales-foundation-database.test.ts
npm run typecheck
npm run lint
npm run build
npm run verify:build
```

**Registro histórico da VEN-01:** este documento originalmente não declarava esses comandos como executados. Resultados posteriores devem ser associados ao SHA/CI da respectiva PR. A VEN-02 acrescenta teste de corrida com sessões independentes em PostgreSQL **descartável do CI**; nenhum teste no banco do notebook está autorizado nesta tarefa. O índice único parcial permanece a proteção de unicidade; as RPCs tratam conflitos e versão.

## Próximo gate — VEN-02 e aplicação em ambientes

1. VEN-01 integrada pela PR #90; revisão e merge da VEN-02 são decisão posterior do mantenedor.
2. **Somente após autorização explícita e inspeção do notebook**, decidir se aplicar esta migration ao banco local de testes, sem reset e com procedimento de retorno.
3. Definir e aprovar papéis efetivos e catálogo de concessões, sem privilégio implícito.
4. VEN-02 expressamente autorizada para implementação e PR separada: [contrato](VEN02_OPERATIONS.md), consultas e mutações auditadas, escopo e conflitos de versão; sem autorização de aplicação persistente.
5. **STAGING e PROD permanecem fora de escopo**; não há autorização de migração de dados financeiros, homologação operacional ou cutover.

Um merge do código-fonte **não executa** migração do banco local nem do STAGING. Isso também precisa ser confirmado no pipeline antes de aprovar qualquer CI que execute comandos remotos.
