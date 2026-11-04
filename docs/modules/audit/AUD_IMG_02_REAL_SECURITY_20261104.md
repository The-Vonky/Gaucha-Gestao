# AUD-IMG-02 — Integração real de segurança no CI descartável

Continuação autorizada pelo mantenedor em 04/11/2026, PR #101 **draft**, mesma branch. Nenhum GO C persistente, backfill, ativação, merge ou deploy concedido. A feature flag permanece desligada.

## Correção do smoke e ambiente

O HEAD `6e84a22` tinha seis checks aprovados e `infra-validate` reprovado porque o smoke ainda exigia cinco buckets. `scripts/ops/smoke.mjs` mantém comparação **exata** de IDs e as verificações anteriores de privacidade, limites, MIME, acesso anônimo e limites PDF de 10 MiB. Acrescenta `audit-evidence-thumbnails`: privado, **1.048.576 bytes** e MIME **exatamente image/jpeg + image/png**.

O ensaio real é `scripts/ops/audit-derivatives.mjs`, executado pelo próprio `infra-validate` depois do smoke, no **mesmo Compose e volumes descartáveis** já criados pelo workflow. Não cria stack, banco, porta ou volume adicional. Recusa execução fora de `GITHUB_ACTIONS=true`, `--environment ci`, projeto correspondente ao run/attempt atual e marker `infra_control.target` validado pelo guard existente. Credenciais permanecem no arquivo externo efêmero já usado pelo CI; não são impressas nem versionadas. O teardown existente descarta o stack ao final.

Versões sob ensaio: PostgreSQL 17 da imagem versionada do Compose, Storage API **v1.74.0**, PostgREST **v14.17**, Auth e Kong do mesmo Compose. Não é o Supabase CLI local persistente nem C30/STAGING/PROD.

## Evidência observada e verificações obrigatórias

O run [41887407588](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/41887407588), código `e2d488a537a959c5ff4cb4598e427f4ed36ea9ff`, já registrou **PASS reais** de Auth, JWT customizado restrito, ciclo completo do worker e matriz Storage abaixo. Esse run não é declarado verde: encontrou uma expectativa HTTP incorreta no teste de domínio ao tentar remover evidência de auditoria finalizada. O PostgREST retorna HTTP **500** com SQLSTATE **55000**, e o contrato foi ajustado para exigir **ambos exatamente**. O helper de negação Storage continua recusando 5xx genérico. Também foram corrigidos no harness a autoridade de membership protegido e a serialização PostgreSQL `t/f` para JSON, sem ampliar privilégios do processador.

Para o **HEAD final**, os sete resultados e links de runs são registrados na [PR #101](https://github.com/The-Vonky/Gaucha-Gestao/pull/101). O pipeline precisa completar todas as verificações abaixo; a presença do código de teste não substitui seu PASS nos logs:

| Família | Verificação real |
| --- | --- |
| Bootstrap Auth | Sete contas sintéticas criadas pelo Auth e login por senha; perfil ativo/inativo, grant ausente, unidade A/B, setor e revogação |
| Positivo | Usuário autorizado consulta RPC, assina e lê derivado pronto; bytes conferem com SHA-256; original preservado |
| Anônimo | Sem Authorization e com anon JWT: GET privado/público negado, nova assinatura negada, listagem vazia ou negada |
| Permissões | Sem grant, outra unidade, setor, inativo e revogado não consultam RPC nem obtêm nova assinatura/GET do objeto |
| Lifecycle físico | Bytes realmente presentes mas negados para original pending/removed, derivado pending/failed, objeto órfão e chave forjada |
| Escrita comum | POST novo, upsert, PUT, copy, move, signed-upload e DELETE; nenhuma cópia no destino, bytes de origem intactos; PATCH do manifesto e EXECUTE de processamento também negados |
| Identidade técnica | Token só lê original da lease viva, insere chave reservada, lê de volta; não assina, atualiza, sobrescreve, copia, move ou remove nem lê outro original; token adulterado e lease incorreta negados |
| Conclusão de lease | Token técnico perde leitura após ready; token de lease expirada/antiga não lê o original após reclamação |
| Histórico | Finalizada continua legível e edição retorna `55000`; reabertura preserva originais/derivados; remoção posterior revoga nova assinatura e preserva arquivos |
| Concorrência | Duas sessões psql reais: A mantém transação e lock de claim enquanto B tenta; B recebe null. Após commit, lease ativa continua bloqueando B. Expiração permite nova lease; CAS antigo falha e retry respeita backoff |

A concorrência usa duas conexões PostgreSQL distintas via `docker compose exec` no DB já existente, com barreira explícita `CLAIM_HELD`, statement timeout e encerramento das sessões; não usa PGlite nem atraso arbitrário como prova de lock.

Os objetos adversos pending/removed/não prontos são fixtures controladas: somente metadados Audit são preparados por SQL. Seus bytes são enviados pela **Storage API** com uma policy de INSERT temporária limitada às chaves exatas da fixture, retirada antes das verificações de leitura. Nenhuma escrita/exclusão de arquivo por manipulação de `storage.objects` em SQL.

## Identidade técnica: compatibilidade observada, operação ainda bloqueada

**Foi observado que o Storage v1.74.0 aceita JWT customizado** com papel `audit_derivative_ci` NOLOGIN/NOINHERIT/NOBYPASSRLS, sem herdar `authenticated`, sem superuser e sem perfil Auth humano. O token sintético dura cinco minutos e carrega uma lease; políticas de laboratório relacionam claim, lease viva, original available e chave completa reservada. SELECT permite somente `storage.object.get_authenticated`; INSERT permite somente `storage.object.upload` no bucket derivado. Não há grants de UPDATE/DELETE, herança de anon/authenticated ou liberação por prefixo.

A role recebe somente USAGE pertinente, SELECT de buckets/objetos sob RLS, INSERT de objetos sob RLS e EXECUTE dos quatro contratos internos de processamento. O teste verifica os atributos e a ausência de herança, nega leitura SQL direta do manifesto e roda o ciclo completo de `runOneShot`, com encoder real isolado e read-back real. Na fase anterior a ready, assinatura e operações proibidas são tentadas **com o objeto já existente e lease ainda válida**, evitando negativas explicadas apenas por arquivo ausente.

O provisionamento dessa fixture requer membership protegido em `supabase_storage_admin`. O usuário `postgres` da aplicação recebeu `42501` ao tentar concedê-lo; o harness usa a conta de bootstrap **supabase_admin já existente no CI** somente para esse membership e ACL/policies de plataforma. Funções de aplicação/escopo continuam pertencendo a postgres. As operações do worker usam `SET ROLE audit_derivative_ci`; não usam a autoridade de bootstrap para processar arquivos.

A chave `service_role` efêmera preexistente aparece apenas na criação administrativa das contas Auth sintéticas. **Não foi usada no processador nem nas operações de arquivos, inclusive fixtures adversas.** Não houve fallback diante das falhas do harness. As únicas roles/policies novas estão no script de teste, não nas migrations da aplicação.

Essa prova tem limites concretos:

- O harness assina tokens com o segredo **efêmero do CI** e consegue executar `SET ROLE` a partir de uma sessão administrativa. **Não é prova de login SQL com uma credencial operacional mínima**, nem autorização para entregar `JWT_SECRET`/conexão administrativa ao worker.
- A emissão restrita/rotação/revogação de tokens e a conexão SQL operacional precisam de desenho e autorização específicos. A correção mínima futura é provisionar somente o papel/grants/policies por lease aprovados e uma forma de autenticação restrita; não ampliar privilégios do `postgres` da aplicação nem usar service_role como atalho.
- Nenhum role técnico, login, token, policy técnica ou grant de processamento foi provisionado em ambiente persistente. O backend de produção continua sem esse acesso e a migration permanece sem aplicação persistente.

Referências primárias: [Supabase Custom Roles](https://supabase.com/docs/guides/storage/schema/custom-roles), [operações Storage v1.74.0](https://github.com/supabase/storage/blob/v1.74.0/src/http/routes/operations.ts) e [GET autenticado v1.74.0](https://github.com/supabase/storage/blob/v1.74.0/src/http/routes/object/getObject.ts). A prova deste repositório usa permissões explícitas com NOINHERIT em vez de presumir que a herança sugerida em um exemplo genérico é necessária ou adequada.

## Bloqueios restantes para GO C e ativação

1. Nomear destino persistente e responsável; inventário, backup e restauração independente comprovados; autorização explícita de migration e fixtures sintéticas naquele destino. CI descartável não concede GO C.
2. Aprovar e revisar a identidade operacional: SQL efetivamente mínimo, emissão/rotação/revogação de token limitado, separação do segredo de assinatura e do worker; transformar as policies/grants de laboratório em proposta incremental apropriada antes de aplicá-las. Não reutilizar o harness administrativo como configuração de servidor.
3. Manter flag false; primeiro teste persistente autorizado deve usar uma imagem sintética e repetir matriz negativa, hash original/read-back, disputa de lease e negação pós-removal. Backfill/instalação/timer/ativação exigem GOs posteriores.
4. Homologação física Android/iOS, textos/códigos de barras, capacidade e limites do host, restore/reconciliação e MED-01 10/30/100 continuam sem prova. Economia de 80% não medida. RSS é observado, sem hard cgroup instalado.

URLs já emitidas conservam sua janela residual até expirar: no ensaio, revogar grant bloqueou nova assinatura/GET autenticado, mas o link anterior permaneceu válido. Não há promessa de revogação instantânea. A validação real reduz incerteza sobre Auth/RLS/Storage; **não é aprovação geral de segurança ou autorização de operação**.

Reversão desta continuação: revert dos ajustes do workflow/testes/docs. Nenhum dado persistente foi criado ou migrado. O código funcional continua desativado por padrão; não houve merge ou deploy. PROD NO-GO.
