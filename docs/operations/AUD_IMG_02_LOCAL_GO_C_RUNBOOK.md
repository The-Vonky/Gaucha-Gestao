# AUD-IMG-02 — Solicitação e execução limitada do GO C local

**Proposta, 04/11/2026. GO C não concedido.** Destino único: Supabase existente `gaucha-gestao-local`, pertencente ao mantenedor. PR #101 permanece draft. Não autoriza merge, deploy, C30/STAGING/PROD, timer, serviço, backfill ou processamento de acervo.

## Inventário conhecido e gates antes de qualquer escrita

Inspeção desta rodada: apenas `docker ps` e transação SQL **READ ONLY**, encerrada com ROLLBACK. PostgreSQL 17, **31 migrations**, última `20261104122256`; tabelas de derivados/runtime ausentes. Foi consultada somente a **presença booleana** de configuração global com JWT secret: **presente**, sem ler ou registrar seu valor.

| Serviço existente | Imagem observada |
| --- | --- |
| DB | `public.ecr.aws/supabase/postgres:17.6.1.167` |
| Auth | `public.ecr.aws/supabase/gotrue:v2.196.0` |
| Storage | `public.ecr.aws/supabase/storage-api:v1.72.1` |
| REST | `public.ecr.aws/supabase/postgrest:v16.2` |
| Kong | `public.ecr.aws/supabase/kong:2.8.1` |
| Studio / metadata | Studio `2026.08.24-sha-8ec45b2` / postgres-meta `v0.99.0` |

O CI self-hosted usa Storage v1.74.0/PostgREST v14.17; **não atualizar o local para coincidir por inferência**. GO C deve incluir o teste na versão local, com parada em qualquer incompatibilidade. Inventário é fotografia; reconfirmar no momento da autorização, incluindo status, portas já existentes, owner de schemas/funções, ledger e ausência de roles homônimos.

Antes de solicitar execução, o mantenedor registra: destino, SHA aprovado e checks, operador, janela, critérios de parada/reversão e aceite das mudanças de configuração/grants abaixo. Confirmar `git status` e uso exclusivo do checkout aprovado; não trocar a branch de outra tarefa. Conferir `supabase/config.toml` com `project_id = "gaucha-gestao-local"`. Nenhum projeto remoto vinculado é alvo permitido.

## Backup e recuperação — condição operacional pendente

**Não foi produzido nem provado backup/restore nesta rodada.** A existência de dumps, checksums ou CI sintético não basta. Usar [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md) e registrar, sem conteúdo/segredo no Git:

- Backup recuperável e independente de PostgreSQL (Auth/Core/Audit, manifesto, fila, log imutável, ledger, roles/grants necessários), **bytes de todos os buckets**, metadados Storage, configurações e referências protegidas de segredos; ponto consistente e identificação do artefato.
- Integridade, cifragem/permissões e localização fora do checkout/host único. Não exportar `.env`, JWT, dumps ou dados empresariais para PR/log.
- Evidência de recuperação correspondente: serviços iniciam, login funciona, inspeções e histórico são preservados, original autorizado tem o mesmo hash e unidade indevida é negada. Inventariar também configuração legada de GUC antes/depois, **sem registrar o valor**.
- Se a prova aplicável não existe, parar e pedir ao responsável uma etapa de recuperação autorizada em ambiente já designado. **Não criar outro Docker/banco/volume por rotina**, não restaurar sobre o local persistente e não resetar/semear o banco.

## Remover a exposição global antes de habilitar um LOGIN técnico

`app.settings.jwt_secret` em `ALTER DATABASE ... SET` fica disponível a logins SQL e no catálogo `pg_db_role_setting`; esconder a variável do ambiente do worker não resolve. A adaptação do Compose deixa de criar esse GUC em stacks novos. Isso **não remove** a configuração do Supabase local existente.

Após GO C específico e backup, o operador inventaria dependências locais desse GUC (funções, extensões e serviços), inclusive configurações por role/outros bancos. Se existir dependência não compreendida, **STOP**; não apagar configurações alheias. O código da aplicação consultado não usa esse GUC para assinar/verificar JWT. Auth/REST/Storage continuam com seus mecanismos próprios; nenhuma rotação do segredo global é proposta nesta rodada.

Mudança mínima a ser autorizada, no DB `postgres` correto:

```sql
ALTER DATABASE postgres RESET "app.settings.jwt_secret";
```

Não substituir o segredo por uma chave falsa, não dar BYPASSRLS ao worker e não copiar o segredo para outra configuração legível. Conferir valores **apenas por flags booleanas**, inclusive configurações por role e `pgrst.jwt_secret`. O cliente `restrictedConnection` recusa qualquer exposição global conhecida, memberships, atributos privilegiados, acesso a dados ou EXECUTE de domínio além dos cinco contratos.

Reabrir uma conexão mínima nova para verificar; RESET do banco afeta sessões futuras. Não reiniciar ou recriar serviços persistentes por rotina. Se for necessária correção de serviço/pool, parar e obter autorização específica. Um segredo que já tenha sido exposto a terceiros exige avaliação/rotação separadas pelo mantenedor; não inferir incidente nem executar rotação automaticamente.

## Aplicação incremental — somente após GO C

CLI fixada **2.117.0**, opções conferidas por `--help`; sem upgrade para v3 por inferência. Conferir migrations pendentes e que **somente estas duas** compõem o escopo aprovado:

1. `20261104171756_audit_evidence_derivatives.sql` — bucket privado/fila/manifesto/RLS.
2. `20261104192428_audit_derivative_runtime_contract.sql` — vínculo de lease ao `session_user` e cinco contratos mínimos, sem LOGIN ou senha.

No checkout aprovado e com inventário/backup/GO registrados:

```bash
npx --yes supabase@2.117.0 migration list --local
# STOP se houver outra migration pendente, divergência de histórico ou alvo incorreto.
npx --yes supabase@2.117.0 migration up --local
```

Não usar `db push`, `--linked`, reset, seed ou repair para mascarar divergência. Conferir ledger, owners, bucket privado 1 MiB JPEG/PNG, RLS e ausência de grants comuns de escrita/processamento; flag permanece false. Não modificar migrations históricas. Falha parcial: preservar estado/backup e decidir forward-fix; não repetir DDL cegamente nem apagar dados.

## Configuração mínima do primeiro ensaio

Não provisionada nesta rodada. Operador autorizado usa bootstrap apenas para configurar ACLs e cria **um** login técnico separado `audit_derivative_worker`, sem superuser/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION, NOINHERIT, sem memberships, limite de três conexões e validade curta (uma hora no primeiro teste). Criá-lo inicialmente **NOLOGIN**. Definir senha por `\password audit_derivative_worker` em psql interativo protegido; não colocar senha na linha de comando/PR/log.

Aplicar como bootstrap o arquivo revisado `scripts/ops/sql/audit-derivative-runtime-access.sql`. Ele não cria senha/login: concede CONNECT/USAGE e EXECUTE **apenas** de claim/prepare/complete/fail/scope ao login, e cria role Storage separada **NOLOGIN**, sem herdar anon/authenticated, com SELECT/INSERT somente sob policy de lease/chave/operação. Membership em `supabase_storage_admin` exige a autoridade de bootstrap; não ampliar privilégios do postgres da aplicação.

Habilitar LOGIN somente depois da conferência dos grants, da ausência de segredo global e do aceite do escopo. Nenhuma sessão do worker usa SET ROLE: `session_user = current_user = audit_derivative_worker`. A senha errada deve ser rejeitada por SCRAM; não aceitar uma conexão trust como prova. Usar endpoint TCP/porta **já existente** do banco local, sem publicar outra porta.

Em diretório privado **fora do checkout**, owner do operador e modo 0600, preparar:

- Arquivo do segredo de assinatura já aprovado para o emissor. Não é uma chave nova do worker; não é entregue a ele.
- Configuração do launcher, com formato abaixo (somente placeholders neste documento):

```json
{
  "signingSecretFile": "/diretorio-privado/jwt-signing-secret",
  "worker": {
    "apiUrl": "http://127.0.0.1:54321",
    "anonKey": "CHAVE_PUBLICA_LOCAL_APROVADA",
    "database": {
      "host": "127.0.0.1", "port": 54322, "database": "postgres",
      "user": "audit_derivative_worker", "password": "SENHA_TECNICA_LOCAL", "ssl": false
    },
    "expectedEvidence": "UUID_DA_UNICA_EVIDENCIA_SINTETICA"
  }
}
```

Conferir portas/origem antes de preencher; não copiar `.env`/status completo da CLI para o arquivo do worker. O launcher transmite somente os campos permitidos. Requer Linux não root, Node compatível, pg/Sharp do lockfile, Bubblewrap/prlimit e namespaces funcionais. Não instalar timer/serviço. Worker fica sem mounts de home/arquivos privados, sem ambiente herdado e com `/proc` isolado; usa a rede para os endpoints existentes. Decoder continua isolado **sem rede**. Esse isolamento não equivale a filtro de egress do host ou hard cgroup.

## Uma evidência sintética e validação negativa local

Criar pelo fluxo atual **uma** inspeção/evidência JPEG/PNG sintética autorizada. Inventariar a fila antes/depois e registrar ID/hash apenas técnicos. Não carregar fotos antigas. Usar `expectedEvidence` obrigatório neste primeiro ensaio: se a claim selecionar outro ID, o banco aborta a transação inteira, sem commit de tentativa nem leitura de outro arquivo.

Após GO C e todas as condições acima:

```bash
node scripts/audit-derivative-runtime-once.mjs --config /diretorio-privado/launcher.json
```

Esperado: `ready`, original byte a byte inalterado, manifesto vinculado ao login, derivado menor com hashes/read-back corretos, sem alterar versão/histórico da inspeção. O emissor one-shot possui o segredo e consulta escopo usando **o mesmo login mínimo**, sem conexão administrativa. Atende só uma lease, source/derived com chave calculada pelo banco, TTL 30 s limitado ao vencimento da lease; máximo 32 emissões por processo. Renovar exige revalidar lease ativa e não a prolonga. Não há refresh token, endpoint permanente ou daemon.

Repetir no destino local autorizado as negativas já aprovadas no CI, com fixtures explícitas e sem dados reais: anônimo, sem grant, outra unidade, setor, inativo/revogado, pending/removed/não ready, assinatura/GET e verbos proibidos; login errado/SET ROLE/SQL de dados/arquivos do servidor negados; token source não lê derived e vice-versa; token expirado nega, renovação mantém chave e limite da lease; lease encerrada nega renovação e token ainda não expirado. Não rodar `scripts/ops/audit-derivatives.mjs` no local: o guard deve recusá-lo; ele pressupõe teardown de CI.

A flag permanece false: verificar original pelo fluxo existente e miniatura por chamada autorizada de teste. Ativar preview em build persistente depende de GO E separado. Parar em 5xx inesperado, integridade divergente, acesso indevido ou versão incompatível. O código `55000` de auditoria finalizada é erro de domínio: considerar o mapeamento HTTP real da versão REST local, sem aceitar 5xx genérico como prova de negação Storage.

## Reversão não destrutiva e encerramento

- Parar a execução one-shot, manter flag false, `ALTER ROLE audit_derivative_worker NOLOGIN` e revogar os cinco EXECUTEs. Encerrar somente sessões técnicas desse login se autorizado; não parar Supabase/Docker.
- Invalidar apenas a lease técnica do ensaio pela função interna de fail autorizada ao operador, ou aguardar expiração. JWT emitido dura no máximo 30 s; a policy também nega lease encerrada. Não excluir originais, derivados, jobs ou histórico.
- Guardar diagnóstico/artefatos privados, remover arquivos de credenciais de teste conforme política do mantenedor e registrar o resultado. Role/schema/bucket podem permanecer inativos; correção por migration nova/forward-fix, nunca edição das anteriores.
- Se retirar o GUC legado romper uma dependência inventariada, suspender o LOGIN e usar a configuração protegida de recuperação sob decisão humana. Não reexpor o segredo a um login técnico ativo para fazê-lo funcionar.

**Pronto para solicitar GO C** significa contrato técnico e prova CI concluídos, runbook e escopo revisáveis. **Não significa** backup local provado, versão local homologada, GO C concedido ou autorização para ativação/backfill/produção. O mantenedor registra a decisão após conferir esses gates.
