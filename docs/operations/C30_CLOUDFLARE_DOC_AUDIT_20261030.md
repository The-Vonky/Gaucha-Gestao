# Auditoria documental — migração de ngrok para Cloudflare (30/10/2026)

**Escopo do levantamento:** árvore `main` de `The-Vonky/Gaucha-Gestao` no commit-base `7ddcd3155da91561ba94f088ff277ee4fc659f90`, antes desta PR. Foram **inventariados e lidos 102 arquivos textuais de documentação** (`.md`, `.mdx`, `.txt`, `.rst` encontrados; neste snapshot os arquivos encontrados eram Markdown), com busca por ngrok, Cloudflare, Tunnel, STAGING, acesso público e estado antigo da C30. O code search do GitHub não retornou achados confiáveis; a leitura foi feita diretamente pelo conteúdo de cada arquivo.

## Distribuição examinada

| Conjunto | Arquivos documentais revisados |
| --- | ---: |
| Raiz e `.github` | 4 |
| `docs/README.md` | 1 |
| `docs/architecture/` | 18 |
| `docs/briefs/` | 29 |
| `docs/decisions/` | 7 |
| `docs/development/` | 6 |
| `docs/migration/` | 1 |
| `docs/modules/` | 22 |
| `docs/operations/` | 6 |
| `docs/planning/` | 6 |
| `infra/` | 2 |
| **Total da base** | **102** |

## Critérios aplicados

1. **Estado operacional vigente:** atualizar README e índices, runbooks e matriz operacional para o acesso Cloudflare já testado, sem deixá-los alegar que o STAGING ainda não possui acesso externo.
2. **Memória histórica:** preservar as datas e os dados da fotografia de 22/10 e da proposta ngrok como registros **do período**, adicionando indicação inequívoca de que não são mais a fonte do estado atual.
3. **Arquitetura:** distinguir **Cloudflare DNS/Tunnel + Caddy + Storage local em STAGING** da proposta **Workers Static Assets/R2 em PROD**. As decisões ADR-004/ADR-008 não são substituídas.
4. **Não alterar documentos de negócio sem impacto:** briefs e manuais de módulos que não mencionavam/dependeram da migração permanecem íntegros; referências gerais a R2/Cloudflare como planejamento de PROD não foram convertidas em implantação realizada.
5. **Proveniência:** as verificações de navegador (PC/celular, login, auditoria anterior, nova auditoria, fotos, upload/download) são relato do operador, não laudo de pentest/homologação. **PROD NO-GO**.
6. **Segredos e dados:** nenhum token do Tunnel, JWT, `ANON_KEY`, segredo de serviço, conteúdo de env, dados de funcionários ou URLs assinadas deve entrar no Git; apenas caminhos e chaves de configuração.

## Fonte da verdade atual e pendências

- **Implementação e testes:** [AS-BUILT Cloudflare 30/10](C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md).
- **Operação e recuperação de configuração:** [Runbook Cloudflare](C30_STAGING_CLOUDFLARE_RUNBOOK.md).
- **Fotografia anterior e plano substituído:** [AS-BUILT 22/10](C30_STAGING_AS_BUILT_20261022.md), [plano histórico ngrok](STAGING_PUBLIC_ACCESS_PLAN.md).
- **Recuperação pendente:** [lacunas de backup](C30_BACKUP_GAPS.md).
- **Mudança de código/schema:** [guia de release](C30_STAGING_RELEASE_GUIDE.md).

**Debito operacional mantido:** acesso externo de teste em funcionamento **não** encerra revisão de RLS por identidade/unidade, controle de acesso ao STAGING, backup independente/restore, hardening, capacidade, alertas, critérios P1–P9/O1–O8 ou autorização para PROD. Os dados já persistidos exigem cuidado; não mascarar a falta de recuperação por sucesso de upload/download.

**Decisão de versionamento:** documentar em branch/PR, sem alterar a instalação da C30 nem efetuar merge automático na `main`. O mantenedor decide a integração.
