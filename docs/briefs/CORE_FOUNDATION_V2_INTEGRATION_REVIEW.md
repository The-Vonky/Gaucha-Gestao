> **Brief histórico do Core v2.** As branches de integração, proprietários de arquivos e estados de execução aqui citados valem **somente para a rodada original**. Não iniciar tarefa nova nem recriar essas branches sem uma issue atual aprovada; usar `origin/main` conforme [AGENTS.md](../../AGENTS.md).

# Fundação Core v2 — revisão de integração (08/10/2026)

**Estado histórico: AÇÕES DE REVISÃO NECESSÁRIAS; merge em main/deploy não autorizados naquela etapa.**  
**Base histórica:** `integration/core-foundation-v2-wave2`.

## Decisões registradas para leitura

1. **Visibilidade de referência conhecida (PR #25).** Resolver unidade/setor por UUID conhecido podia revelar somente UUID, código, nome e ativo a usuário ativo com grant **efetivo atual** para a organização. Não permitia enumerar catálogos arbitrários nem acessar registro de negócio. Operações do módulo continuam exigindo permissão, escopo e regras de domínio próprias. Testes negativos devem cobrir outras permissões no mesmo escopo, grants revogados/inativos e a indistinguibilidade entre ausente e invisível. Perfil de pessoa continua restrito pela RLS atual: nenhum diretório amplo de funcionários foi aprovado.
2. **Impacto potencial versus exato (PR #26).** `role_impact_summary` fornece snapshot **atual** de contagem de titulares/atribuições, ou seja, impacto **potencial**. **Não** simula nova composição de permissões, grants sobrepostos ou transação futura de salvamento; não apresentar como prévia exata nem confirmação da mutação. Prévia exata com versão esperada exige outro contrato aprovado.
3. **Fronteiras mantidas.** Não ampliar RLS de perfis, papéis, permissões ou logs; nomes/contagens de usuários exigem audiência administrativa global quando aplicável. Falta de visibilidade é **restrito/desconhecido**, não zero.

## Ordem histórica e bloqueios

- **PR #25:** decisão de metadados mínimos, testes negativos, `SECURITY DEFINER` com nomes qualificados, `search_path` vazio, `EXECUTE` limitado e sem leitura direta ampla de tabelas.
- **PR #26:** rotular impacto potencial; testar inativos, grants sobrepostos e atribuição ativa sem permissão efetiva; não converter atribuições em direitos de todos os módulos.
- **PR #27:** dependia de #26; migration/teste de governança repetiam bytes de #26 naquela fase. Integrar #26 primeiro, atualizar #27 e verificar que só sobraram alterações específicas de logs. Busca de texto de ator só considera nomes visíveis; nada de preencher nomes históricos inexistentes.
- **PR #24:** ADR-007 permaneceu proposta; runtime privilegiado exigia brief, revisão e GO próprios. **Permanece NO-GO na [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49).**

## Verificações exigidas na integração original

Conferir HEAD exato e `expected_head_sha` antes de merge; testar ordem/colisão de migrations, RLS, exposição PostgREST e grants **na branch combinada**; rodar CI completa de fundação, infra e resolvers; repetir negações (anônimo, inativo, leitor só de papel/unidade/usuário, cross-scope, UUID adivinhado, grants revogados); não editar migrations já aplicadas; sem deploy/force-push/merge direto nesta revisão.

**Entregável original:** cada agente informa HEAD, arquivos, testes, riscos e branch de destino para o coordenador. **Estado atual deve ser consultado na main; esta é uma ata histórica, não uma fila de tarefas vigente.**
