> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Brief de implementação — Leitura de governança de acesso do Core v1

**Estado histórico: PRONTO PARA IMPLEMENTAÇÃO**  
**Base histórica:** `integration/core-foundation-v2-wave2`  
**Branch de integração prevista à época:** `integration/core-foundation-v2-wave2`

## Objetivo

Criar contratos **somente de leitura** para Administração identificar: quem tem acesso, a quê, por qual papel/escopo, quem concedeu e quais pessoas seriam afetadas por alterações em papel ou unidade. **Sem redesenhar mutações e sem frontend nesta frente.**

## Leituras necessárias

`AGENTS.md`, `docs/architecture/ACCESS_GOVERNANCE_V1.md`, `CORE_FOUNDATION_V2.md`, `AUTHORIZATION.md`, `SECURITY.md`, migrations Core e testes de integração administrativos vigentes.

## Escopo

RPCs/projeções tipadas e restritas para:
- resumo de acessos do usuário;
- histórico de atribuições com papel, escopo, unidade/setor, ativo/revogado, `granted_by` e datas;
- resumo de acesso da unidade com usuários/atribuições efetivos e contagens/detalhes seguros;
- impacto de mudança de papel: quantidade e identidades quando autorizadas;
- visão de membros por papel («usuários com este perfil»);
- ordenação e paginação determinísticas, totais explícitos quando necessários.

Usar as tabelas canônicas; **não criar ledger duplicado**.

## Autorização

Preservar permissões administrativas. `admin.unit.read/manage` isoladamente **não dá acesso nominativo a pessoas**; exigir `admin.user.read/manage` quando esse detalhe for necessário. Um operador com apenas permissão de papéis só vê dados permitidos pelas regras existentes. Não ampliar RLS para facilitar relatórios.

## Histórico

Atribuições revogadas continuam visíveis a operadores autorizados; pessoas/papéis/unidades/setores inativos permanecem representáveis. Sem limpeza em cascata. Usar nomes atuais salvo snapshots históricos previamente registrados. **Não inventar nomes anteriores.**

## Banco e testes

Migration apenas aditiva; funções/views restritas, `search_path` fixo para `SECURITY DEFINER`, grants explícitos, paginação limitada, sem N+1, índices conforme caminho de consulta comprovado.

Testar: admin global/leitor, admin só de papéis, admin só de unidade, anônimo/inativo/não autorizado; atribuição ativa/revogada, escopo global/unit/sector, papel/pessoa inativa, impacto com atribuições sobrepostas, nomes protegidos, IDs adivinhados sem enumeração. Rodar validação completa do repo.

## Fora do escopo

Alterar `save_role`, composição de papel, confirmação de mutação, redesenho de desvinculação, telas UI, exportação CSV/XLSX, leitura de logs, ciclo de contas, Qualidade.

## Conclusão prevista à época

Commits focalizados; sem merge autônomo; PR dirigida à branch histórica acima. **Hoje, seguir o fluxo atual de PR com base em `main`.**
