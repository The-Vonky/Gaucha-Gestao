> **Brief histórico do Core v2.** As branches de integração, proprietários de arquivos e estados de execução aqui citados valem **somente para a rodada original**. Não iniciar tarefa nova nem recriar essas branches sem uma issue atual aprovada; usar `origin/main` conforme [AGENTS.md](../../AGENTS.md).

# Core v2 — Vincular revisão de acessos de unidade à Administração

**Estado histórico: implementação solicitada, sem autorização de merge/deploy.**  
**Base original:** `integration/core-foundation-v2-wave2` no commit `8ff39631a93ad21ab8f259e31327c15433022cb4`.

## Escopo

`UnitAccessReview({unitId})` existia e era testado, mas não montado. Tornar revisão **somente de leitura** acessível nas linhas visíveis de unidade em `OrganizationPage` (`kind='units'` apenas). Reusar Elo e padrão `Modal`; não criar rota nova sem justificativa. Abrir/fechar não muda dados, filtros ou paginação.

## Critérios

- Ação visível, acessível por teclado, «Acessos de <nome da unidade>» para linhas elegíveis; independe de `admin.unit.manage` porque leitura e gestão diferem. Acesso ao catálogo de unidades **não** dá automaticamente direito à lista de pessoas: RPC/RLS decidem e UI mostra restrito/não encontrado.
- Ao clicar, abrir `UnitAccessReview unitId={row.id}` com contexto; ao fechar, restaurar foco ao gatilho e lista filtrada/paginada.
- `kind='sectors'`, edição/inativação e capas não mudam.
- Alternar unidade ou fechar não vaza dados da unidade anterior; nenhuma RPC de mutação ou mudança Auth/RLS.
- Testes: autorizado, restrito, sem permissão de gestão, teclado/fechar, regressão setor; atualizar E2E se seletores acessíveis mudarem.
- Rever se `total_count` lido da primeira linha e página vazia convertida para total zero causa erro; corrigir **somente no adaptador próprio** com teste se comprovado.
- Sem reset de banco compartilhado, force-push ou operações de produção.

**Entrega original:** PR para integração histórica com HEAD, arquivos, checks e riscos, sem merge até revisão. Não recriar esse alvo.
