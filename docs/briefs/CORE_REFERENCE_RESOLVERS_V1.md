> **Brief histórico do Core v2.** As branches de integração, proprietários de arquivos e estados de execução aqui citados valem **somente para a rodada original**. Não iniciar tarefa nova nem recriar essas branches sem uma issue atual aprovada; usar `origin/main` conforme [AGENTS.md](../../AGENTS.md).

# Brief de implementação — Resolutores de referências Core v1

**Estado histórico: PRONTO PARA IMPLEMENTAÇÃO.**  
**Base/alvo original:** `integration/core-foundation-v2-wave2`.

## Objetivo

Contratos confiáveis e estáveis de leitura do Core por IDs **conhecidos** para usuários, unidades e setores, sem criar diretório administrativo irrestrito para módulos. **Tarefa de banco/backend; sem UI.**

## Leituras

`AGENTS.md`, `CORE_FOUNDATION_V2.md`, `AUTHORIZATION.md`, `DATA_MODEL.md`, `SECURITY.md`, migrations/testes Core.

## Decisões fixadas

UUID de perfil Auth/Core é identidade canônica; responsabilidade de negócio pode referenciar usuário registrado; inativar preserva referência histórica; ser responsável **não dá permissão**; UUID identifica e nomes/códigos exibem; não autoriza diretório global de funcionários ou enumeração de ativos.

## Escopo

RPCs/projeções restritas para resolver:
- usuário/perfil por UUID conhecido(s): `id`, `display_name`, `active`;
- unidade: `id`, `code`, `name`, `active`;
- setor: `id`, `code`, `name`, `active`, validade unidade/setor quando pertinente;
- lote de IDs limitado, ordem determinística, comportamento explícito para ausente/invisível/inativo.

**Não expor** email, último login, metadata Auth, papéis/composição de permissões. Preferir projeção pequena por conceito ou família RPC tipada; não liberar tabelas brutas para facilitar seletores.

## Autorização e banco

Chamador deve estar autenticado e ativo. Resolver ID conhecido só pode devolver referência **autorizada pelo contrato atual**, sem enumeração. Se RLS existente for insuficiente, função `SECURITY DEFINER` estreita com `search_path` vazio/fixo, objetos qualificados e `EXECUTE` mínimo; **nunca `service_role` no browser** nem seed de permissões futuras.

Se não for possível autorizar seletor genérico de pessoas, **não inventá-lo**; registrar fora do escopo. Migration aditiva; nunca editar anteriores; arrays/linhas limitados, resultados estáveis, Core sem dependência de módulo.

## Testes

Anônimo/inativo negado; referência conhecida autorizada; UUID adivinhado/ausente não amplia acesso; inativo referenciado aparece apenas em leitura histórica autorizada; limite de lote; sem email/Auth metadata; sem escalada cross-scope; suíte completa.

## Fora do escopo

Criar/resetar contas/senhas, diretório de funcionários, atribuir responsáveis em Auditoria/Planos, seletores UI, relatórios de governança, logs, permissões novas e mudanças de Qualidade.

**Encerramento original:** commits focalizados e PR para branch histórica, sem merge autônomo. Usar branch atual de `main` para novas tarefas.
