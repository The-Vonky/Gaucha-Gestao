# C30 STAGING — mudança de versão e migrations com controle

**Estado:** roteiro de mudança **a validar**, não script pronto para produção ou permissão para atualizar automaticamente. Baseline implantada `f9f041e`; GitHub main estava 33 commits à frente em 22/10/2026. O STAGING tem 18 migrations aplicadas; a main naquele dia tinha 19. Não assumir compatibilidade de novo código sem prova.

## Pré-condições

1. Issue/PR aprovada, commit candidato congelado, diffs e dependências de banco/Auth/Storage conhecidos; verificar a main e a branch do próprio servidor, incluindo arquivos locais **não rastreados**.
2. Backup consistente recuperável de PostgreSQL + roles + bytes Storage + configs; restauração validada em sandbox isolada. A prova atual da C30 ainda é insuficiente para upgrade arriscado.
3. CI do SHA candidato, testes de TypeScript, lint, Vitest, RLS/integração, `npm run build`, `npm run verify:build` e testes de usuário/escopos negativos. Registrar os que não foram executados.
4. Janela autorizada, pessoa responsável, comunicação aos testadores, plano de rollback de frontend e **forward-fix** explícito para migrations não reversíveis.
5. Verificar montagens, cinco contêineres, espaço livre, saúde SMART e acesso SSH de recuperação. Não depender de iniciar Docker sobre HDD desmontado.

## Sequência proposta (não executar indiscriminadamente)

1. Preparar **checkout/release separados**, sem `git reset --hard`, `git clean`, `git pull` direto sobre alterações locais ou exclusão da release antiga.
2. Aplicar migrations **append-only** por mecanismo validado para instância existente, verificando ledger e SHA do alvo; o script de laboratório `scripts/ops/apply-migrations.sh` foi desenhado para banco inicialmente vazio e **não** deve ser executado diretamente no STAGING persistente.
3. Para frontend, compilar com URL da **origem HTTPS correta do ambiente** e chave **anon/publishable**, não `service_role`; rodar `verify:build` e examinar ausência de segredos.
4. Publicar release em novo diretório root-owned `/opt/gaucha-gestao/staging/web/releases/<SHA>-<ambiente>`; preservar anteriores, verificar diffs/hashes e permissões de leitura do Caddy.
5. Validar nova configuração do Caddy; criar cópia anterior; recarregar serviço controladamente; smoke Auth/REST/Storage, login, RLS, Storage e funções afetadas. Nunca sobrescrever o único bundle conhecido como bom.
6. Observar logs/erros e autorizações reais; em falha de **frontend/configuração**, apontar de volta para release anterior e recarregar após validação. **Não** reverter migration aplicada por apagar arquivos/volumes.
7. Registrar commit, migrations novas/hashes, operador, logs saneados, horário, testes, resultado e plano de correção. Retomar testes com os funcionários somente após checagem.

## Estado não autorizado

Sem backup restaurável da versão atual, não fazer upgrade persistente/migrations por conveniência. Não instalar ngrok ou expor STAGING como PROD; publicação temporária exige checklist separado de [acesso público](STAGING_PUBLIC_ACCESS_PLAN.md). Não alterar ADRs aceitos como efeito colateral de atualização.
