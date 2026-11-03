# VEN-04A — Interface operacional de Vendas / Maquininhas

**Estado atual:** integrada pela [PR #93](https://github.com/The-Vonky/Gaucha-Gestao/pull/93),
merge `7ddcd3155da91561ba94f088ff277ee4fc659f90`; homologação global pendente.
Adendo VEN-04B: [dashboard independente](VEN04B_DASHBOARD_UI.md) em `/sales/dashboard`,
com navegação entre áreas conforme suas capacidades. MEL-03–06: Lançamentos usa
`/sales/entries`, `/sales` é entrada condicional e `/sales?…` mantém os filtros
operacionais por redirecionamento. **Novo lançamento** permanece visível com
explicação de bloqueios; [contrato atual e evidências](VEN04B_MEL03_06_VALIDATION.md). O restante registra a entrega VEN-04A.
**Autorização:** pedido expresso de 29/10/2026 para VEN-04A, PR e testes sintéticos
no notebook `gaucha-gestao-local`. Baseline `95589f7abdc120f4dddda00084a581b52214fd62`,
merge da [PR #92](https://github.com/The-Vonky/Gaucha-Gestao/pull/92).
VEN-01/02/03 integradas nas PRs #90/#91/#92. Nenhum GO de STAGING/PROD.

## Operação

Acesse **Comercial → Vendas / Maquininhas → Lançamentos**, rota `/sales/entries`. O menu e o Guard
aceitam qualquer capacidade `sales.entry.read/create/edit/delete` efetiva global
ou unitária. Atribuição exclusivamente setorial e perfil inativo não habilitam a área.
A UI adapta ações; as RPCs continuam sendo a autoridade de autorização.

**Catálogo vazio (MEL-01):** capacidades globais válidas permitem consultar listas
vazias e dashboard com total zero. A criação financeira continua exigindo uma unidade
existente, ativa e autorizada. Nenhuma unidade é criada automaticamente; o cadastro
organizacional permanece em Administração → Unidades. [Correção e validação](VEN04B_MEL01_LOCAL_CLEANUP.md).

- **Consultar:** informe datas inclusivas (opcionais), unidade ou todas as autorizadas,
  Stone/PIX/ambos e selecione **Aplicar filtros**. O histórico inclui unidades inativas.
  Filtros e página ficam na URL, preservados ao navegar/voltar/recarregar.
- **Paginar:** 25 linhas por página; a chamada solicita 26 para descobrir se há próxima.
  Não há total presumido. Ordem do banco: data decrescente, UUID decrescente.
  Mutação volta à primeira página preservando filtros. Página esvaziada por concorrência
  também retorna à primeira. Offset não oferece snapshot entre páginas.
- **Cadastrar:** data civil válida, unidade ativa autorizada, Stone/PIX e valor positivo
  em formato brasileiro, por exemplo `1.250,30`. Menor valor `0,01`; máximo
  `999.999.999.999,99`; até duas casas, sem arredondar. Uma chave ativa por dia/unidade/método.
- **Editar:** a abertura consulta `entryDetail`; salva os quatro campos e `expectedVersion`.
  Autoria original não restringe ação de colega autorizado. Unidade inativa original
  permanece opção para correção; transferência só para destino ativo com edição autorizada.
- **Conflito de edição:** campos digitados são preservados. **Consultar versão atual**
  mostra a nova versão e os campos atuais. **Usar versão atual e manter campos** é uma
  escolha explícita antes de nova submissão. Não há sobrescrita/retry automático.
- **Excluir:** confirmação simples com data/unidade/método/valor, sem motivo/senha/supervisor.
  Usa versão esperada e soft-delete; conflito bloqueia a confirmação até cancelar,
  atualizar a lista e conferir o registro. Histórico/auditoria ficam preservados.

Cada ação exige sua própria capacidade na unidade. Criador sem leitura pode cadastrar,
mas não chama `listEntries`, `entryDetail` nem dashboard. Edição/exclusão **pela lista**
exigem leitura da linha e a capacidade correspondente, sem conceder leitura a quem só
escreve. Sem leitura não há descoberta de lançamentos alheios pela interface.
Não se atribuem permissões automaticamente a papéis/funcionários.

Carregamento, vazio, sucesso, acesso negado, sessão expirada, indisponibilidade,
duplicidade, validação e falha de conexão têm feedback acessível em pt-BR. Valores
continuam strings no formulário, no adaptador e na apresentação; nenhuma transformação
financeira usa `Number`, `parseFloat` ou `toFixed`. `Number` somente lê o índice da página.
Não existe retry de criação. Depois de falha de rede, confira a combinação diária com
um leitor autorizado antes de repetir: a resposta pode ter se perdido após o commit.

## Novo contrato mínimo de referências

A lacuna comprovada: `core.unit_references(p_ids uuid[])` resolve somente UUIDs conhecidos,
sem descoberta para escopo global; catálogo administrativo exige outras capacidades;
`sales_dashboard` exige capacidade analítica que não deve ser concedida implicitamente.

Migration append-only `20261029122326_sales_operation_units.sql`:

```sql
public.sales_operation_units(p_limit integer default 100, p_offset integer default 0)
returns jsonb;
```

Array ordenado por `code, id`, limite 1–100 e offset não negativo. Campos explícitos:
`id`, `code`, `name`, `active`, `can_read`, `can_create`, `can_edit`, `can_delete`.
Só retorna unidades cobertas por ao menos uma das quatro capacidades operacionais via
`private.has_unit_permission`; nenhuma permissão administrativa/analítica amplia esse
conjunto. Perfil inativo, ausência de capacidade e setor recebem `42501` mesmo no vazio.
Paginação inválida: `23514`. Não retorna contagem, setores ou dados financeiros.

As flags indicam **capacidade**, independentemente da atividade da unidade. `active`
restringe criação/transferência; histórico e correção na origem não são eliminados.
O adaptador pagina todas as referências para montar seletores por ação. Mudança de
filtro não refaz catálogo; atualização explícita, mutação e mudança do acesso o reavaliam.
Respostas obsoletas são descartadas, inclusive após troca de identidade/permissões.

`SECURITY DEFINER`, `search_path=''`, objetos qualificados, sem SQL dinâmico;
EXECUTE apenas `authenticated`, revogado de PUBLIC/anon. Leitura por snapshot com
predicado de autorização por linha, sem conceder SELECT no Core ou schemas privados.
Nenhuma tabela, política RLS, papel real ou RPC VEN-02/03 é alterada.
Em defeito, conter revogando EXECUTE desta assinatura e corrigir em nova migration;
não reverter histórico nem apagar dados. Sem execução dessa contenção nesta entrega.

## Componentes, acessibilidade e cobertura

`SalesPage`, `EntryEditor`, `format.ts` e CSS do módulo reutilizam `PageTitle`, `Notice`,
`LoadingState`, `EmptyState`, `Table`, `Modal`, `Confirm` e `Form`. O Shared recebe flags
opcionais para bloquear salvar/confirmar em conflito e trava síncrona de submissão,
preservando o comportamento dos consumidores existentes.

Labels, alert/status, dialog nativo com foco confinado e Escape bloqueado durante
submissão, foco visível institucional e rolagem horizontal de tabela mantêm ações
alcançáveis em telas pequenas. Sem animação nova; preferência de movimento reduzido
herdada do sistema. Validação automatizada não substitui leitor de tela/dispositivos físicos.

Cobertura: VEN-F01–F06; EQ-23–28 e parte operacional de EQ-37. Unidades continuam de
propriedade do Core. **Sem dashboard UI, gráficos, ranking, drill-down, exportação,
print, ajuste mensal, fechamento, migração real, Modo Apresentar ou deploy.**
VEN-04B/VEN-05 e demais fases dependem de autorização separada; V1 completa não está
homologada. [Evidências e limitações locais](VEN04A_LOCAL_VALIDATION.md).
