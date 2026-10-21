> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Brief de implementação — Modelo de leitura dos logs do Core v1

**Estado histórico: PRONTO PARA IMPLEMENTAÇÃO**  
**Base / alvo de integração original:** `integration/core-foundation-v2-wave2`

## Objetivo

Implementar projeção de leitura **segura por autorização** de `core.system_audit_log`, permitindo que Administração filtre/exiba eventos com nomes legíveis sem enfraquecer trilha imutável. Sem redesenho de frontend nesta etapa original.

## Leituras

`AGENTS.md`, `ACCESS_GOVERNANCE_V1.md`, `CORE_FOUNDATION_V2.md`, `AUTHORIZATION.md`, `SECURITY.md`, schema/logs/RLS e tela API vigentes.

## Incluído

Projeção server/SQL tipada e paginada contendo: `id`/ `occurred_at` imutáveis; `actor_user_id` e nome autorizado quando resolvível; módulo/ação/tipo/ID de entidade; rótulos de unidade/setor quando permitidos; `before_data`, `after_data`, `metadata` para detalhe técnico sob **a mesma autorização**; filtros por autor, módulo, ação, tipo/ID e período; busca por nome **apenas se não virar bypass do diretório**; total e paginação estável.

Sem snapshots históricos de nomes previamente gravados, **não inventar/regravar nomes antigos**; nome atual só conforme contrato de arquitetura.

## Segurança e privacidade

`admin.audit_log.read` + escopo continua sendo gate. Resolução de nomes não amplia leitura do diretório. E-mail e último login ficam fora. Entidade ausente/invisível não pode vazar existência pelo formato de erro. JSON/IDs brutos não criam novo privilégio. Sem escrita direta no log.

## Banco e testes

Migration aditiva; fonte de log imutável; não duplicar eventos para apresentar nomes; `SECURITY DEFINER` somente se necessário, com `search_path` fixo/grants; não fazer busca textual sem limites.

Cobrir: leitor global/setorizado, anônimo/inativo negado, evento fora de escopo, resolução de autor permitida, autor inativo/não encontrado, unidades/setores, filtro de nome sem enumeração, ID/tipo, limites temporais, paginação/contagem, preservação de before/after. Executar validação completa.

## Fora do escopo

Mudanças de `LogsPage`, exportação, retenção/limpeza, eventos login/Auth, ciclo de contas, módulo de Auditoria, erros/mutações.

## Encerramento histórico

Commits focados, sem merge autônomo; PR para a branch antiga. **No desenvolvimento atual, usar issue e branch de `main`.**
