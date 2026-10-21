# Governança de acessos — contratos de leitura v1

**Status histórico:** implementado na branch `feat/core-access-governance-read-v1`, PR #26, integração original `integration/core-foundation-v2-wave2`. Contratos **somente de leitura**, sem UI, exportação, mutação ou produção autorizada. Não recriar branch antiga.

Fontes: [brief](../../briefs/CORE_ACCESS_GOVERNANCE_READ_V1.md), [desenho](../../architecture/ACCESS_GOVERNANCE_V1.md), [revisão original](../../briefs/CORE_FOUNDATION_V2_INTEGRATION_REVIEW.md).

## Contratos — migration `20261008130000_core_access_governance_read_v1.sql`

Todas as funções são `SECURITY INVOKER`, `STABLE`, com `search_path=''`, `EXECUTE` somente para `authenticated`. Joins mantêm a RLS existente de perfis, atribuições, papéis, permissões, unidades, setores e log; **nenhuma policy é ampliada**.

Paginação: `p_limit` de **1–100** (fora: `22023`), `p_offset >= 0`, ordem determinística e contagens `total_count`/`people_count` do conjunto filtrado.

| RPC | Pergunta respondida | Gate |
| --- | --- | --- |
| `user_access_summary(user)` | Atribuições, efetividade e cobertura de composição | U |
| `user_access_assignments(user, include_revoked, limit, offset)` | Histórico com papel, escopo, unidade/setor, quem concedeu e datas/revogação | U |
| `unit_access_summary(unit, sector?)` | Pessoas/atribuições que cobrem unidade | T; pessoas/contagens apenas com U |
| `unit_access_assignments(unit, sector?, include_revoked, limit, offset)` | Grants globais, da unidade e setor correspondente | U + T |
| `role_impact_summary(role)` | Impacto **potencial** de alterar papel | U ou R; titulares apenas com U+R |
| `role_holders(role, include_revoked, limit, offset)` | Titulares de papel | U + R |

**U:** `admin.user.read/manage` global. **R:** `admin.role.read/manage` global. **T:** unidade legível em `units_read`. `admin.unit.read/manage` isoladamente **não** libera nomes/contagens. Filtro setorial requer vínculo setor–unidade legível. ID ausente e invisível retornam sem linhas, sem diferença enumerável.

## Regras de interpretação

- **Atribuição ativa não é acesso de negócio efetivo.** `effective` só é verdadeiro se atribuição, usuário e papel estiverem ativos e o papel tiver ao menos uma permissão ativa. Isso vale **somente** às chaves/escopo daquela atribuição; não cobre automaticamente outros domínios, unidades ou registros. Atividade da unidade/setor é informada separadamente.
- **Restrito não é zero.** Sem audiência, contagem é `null` e visibilidade `restricted` (`composition_visibility`, `holders_visibility`, `people_visibility`) ou cobertura `partial/restricted`. `effective_people_count` é `null` sem R ou `admin.user.manage`.
- **Permissões mantêm escopo por atribuição.** Não fazer união plana de chaves do usuário.
- **Histórico:** revogações aparecem com `include_revoked`. Concessão vem de `granted_by`/`created_at`; autor/tempo da revogação só quando existir evento de log autorizado (`revocation_evidence='audit_event'`), senão `unavailable`. Não inferir por `updated_at`, nem reconstruir nomes históricos que não foram salvos. Rótulos são atuais (`*_label_source='current'`) ou restritos.

## Impacto de papel: potencial, não exato

`role_impact_summary` retorna `impact_kind='potential'` e `overlap_evaluated=false`: snapshot de quem detém papel, **não** simulação do delta de permissões, grants sobrepostos, confirmação da mutação ou direitos futuros. Prévia exata requer outro contrato de escrita aprovado.

| Campo | Significado |
| --- | --- |
| `role_grants_capabilities` | Papel ativo e com pelo menos uma permissão ativa; `false` se inativo; `null` se composição invisível |
| `holder_count` | Pessoas distintas com atribuição ativa (sem dupla contagem por grants sobrepostos) |
| `inactive_user_holder_count` | Titulares inativos, sem acesso concedido |
| `potentially_affected_user_count` | Usuários ativos com atribuição ativa, que podem ser afetados |
| `currently_effective_user_count` | Entre os acima, quem recebe pelo menos uma capacidade desse papel; 0 se papel inativo/sem permissão |
| `holders_with_other_roles_count` | Titulares potencialmente afetados com outro papel ativo; **não** prova equivalência das permissões |
| `active_assignment_count` / `revoked_assignment_count` | Contagens de atribuições, **não pessoas** |

Papel inativo pode manter atribuições ativas: `currently_effective_user_count=0`, mas titulares potencialmente afetados mostram risco de reativação. Inativar usuário revoga grants por trigger existente.

## Testes

`tests/access-governance-database.test.ts` (PGlite, RLS/grants reais) cobre administradores globais/somente leitura, somente papel/unidade/usuário, anônimo/sem grant/inativo; escopos global/unidade/setor; revogações com/sem logs, inativos, papel sem permissões; sobreposição, composição restrita; ausência de vazamento/enumeration por ID adivinhado; paginação e índice de revogação.

**Este contrato é histórico de implementação do Core. Para status corrente, consultar código, CI e [mapa](../../architecture/IMPLEMENTATION_MAP.md).**
