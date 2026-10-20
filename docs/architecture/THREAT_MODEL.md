# Modelo de ameaças e requisitos verificáveis — Gaúcha Gestão

**Escopo de revisão:** main após PR #69 (`fed0e0f`, 20/10/2026), stacks decididas e TO-BE de produção. **Não é pentest, auditoria de infraestrutura, nem atestado de segurança ou liberação PROD.** Guias canônicos: [SECURITY](SECURITY.md), [AUTHORIZATION](AUTHORIZATION.md), [ADR-005](../decisions/ADR-005-core-authorization.md).

## 1. Ativos e limites de confiança

~~~mermaid
flowchart LR
  B["Browser não confiável"] --> EDGE["Cloudflare/WAF/Tunnel previsto"]
  EDGE -. "ingress TO-BE" .-> G["Kong — gateway"]
  B --> API["supabase-js / PostgREST / Storage"]
  G --> API
  API --> RLS["PostgreSQL grants + RLS + RPCs"]
  API --> AUTH["GoTrue/Auth"]
  API --> ST["Storage API e buckets privados"]
  RLS --> LOG["Core system audit log"]
  ST -. "R2 planejado" .-> R2["R2"]
  OPS["Operador com credenciais privilegiadas"] -. "fronteira administrativa distinta" .-> RLS
~~~

A parte browser/URL assinada/JWT é controlada pelo cliente e **não confiável**. GoTrue autentica; RLS/contratos confiáveis autorizam. A borda Cloudflare é defesa perimetral futura e não substitui controle aplicativo. O operador humano e backup/cofre têm privilégio maior que a aplicação e devem ser isolados. O fluxograma representa fronteiras, não configurações já ativadas em produção.

## 2. Registro de ameaças e controles

| Ameaça / superfície | Modo de falha | Controle existente / previsto | Evidência faltante |
| --- | --- | --- | --- |
| Escalada por manipulação de role/escopo | Usuário forja pedido para unidade diferente ou autoeleva privilégio | Permissão por operação, escopo em atribuição, grants/RLS/RPC; checagens de versão | Reexecutar matriz JWT real no commit candidato e testar novos contratos |
| Credenciais privilegiadas no browser | service_role, segredo DB ou token administrativo acaba em bundle/log | client.ts aceita chave publishable/anon; verify-build; políticas do repositório | Revisar configuração e telemetria do ambiente final |
| Conta inativa ou sessão revogada | Token ainda válido recebe dados em negócio | Core profile ativo + avaliação de permissão/RLS | Evidência real após inativação e interleavings contra Auth |
| Provisionamento/reset privilegiado | Contas indevidas, último admin removido, corrida de sessões/Auth | **Bloqueado**: ADR-007 não aprovado; nenhum serviço privilegiado de contas autorizado | [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49): GoTrue real, locks, AMR, orphan sessions, parecer independente |
| Acesso indevido a arquivos | URL assinada compartilhada, ID adivinhado ou bucket aberto | Buckets privados, emissão autorizada e chaves geradas no servidor | Headers, TTL/cache, expiração, R2 real e teste cross-unit em staging |
| Upload malicioso | Conteúdo inesperado / spoof de MIME, XLSX/PDF hostil | Limites por domínio, extensões/MIME e contratos de Storage; tratamento de XLSX | Evidência de validação confiável de bytes; limitar expectativa sobre checagem client-side |
| ABC: payload falso ou XLSX trocado | Publicador autorizado pode enviar linhas coerentes não extraídas do original; servidor revalida payload, mas não reprocessa nem re-hasheia bytes do XLSX | Conferir com o arquivo posteriormente; homologação das amostras e avaliar necessidade de validação confiável server-side |
| ABC: validações não simétricas | Parser do navegador impõe competência fechada e limites numéricos não espelhados integralmente pela RPC | UI restringe fluxo normal, mas chamada API direta por publicador autorizado contorna parte das checagens de prévia | Harmonizar invariantes no SQL mediante migration incremental e teste negativo |
| Corrida entre metadata/Storage | Byte órfão ou metadata confirmada sem objeto | Reserva → upload → confirmação; reconciliação planejada | O5 agenda/alertas, processo de purge auditado e prova operacional |
| Dado malicioso em exportação | Formula injection no XLSX ou HTML/print injection | Escrita segura de células e testes de exportação | Revalidar casos maliciosos no SHA de liberação |
| Ingresso indevido / superfícies administrativas | Banco, Studio ou painel expostos externamente | Banco sem porta publicada em Compose; Tunnel/WAF/controle de portas previstos | Configuração real, firewall, TLS e exposições verificadas |
| CI/supply chain | Dependência comprometida ou workflow inseguro | npm audit em dev+prod, scripts de validação, imagens pinadas em infra | Proveniência de deploy, controle de credenciais CI, revisão de upgrade |
| Comprometimento do host único | Perda de serviço, dados ou chaves por falha física/ransomware | C30 dedicada prevista; backup off-site/PITR/Ansible no desenho | Backup PROD independente/imutabilidade, restore ensaiado, RPO/RTO/capacidade |
| Perda/alteração dos logs | Privilegiado apaga evidência ou baixa visibilidade | core.system_audit_log, writes confiáveis | Retenção, exportação/monitoramento, acesso e recuperação operacional |
| Vazamento via teste / migração | Dados reais copiados para DEV/CI ou logs de agentes | Dados sintéticos, exclusão de secrets, política de PROD limpa | Processo futuro de classificação/mascaramento e validação do corte |

**Prioridades:** P0 (Identity Boundary, preservação C30, backups/restore e controle PROD); P1 (Storage headers/reconciliação, testes RLS e capacidade); demais riscos exigem avaliação antes de release. Não interpretar enumeração de controle existente como prova de eficácia em produção.

## 3. Cenários de autorização que não podem falhar

1. Usuário sem sessão ou com profile inativo: nenhuma leitura/mutação de negócio.
2. Usuário com permissão em unidade A: não consultar/editar/unificar evidências de unidade B.
3. Navegação oculta **não** impede chamada manual: API deve negar.
4. Revogação/desativação: próximo acesso e mutações devem refletir política de revogação do contrato Core, mesmo com UI obsoleta.
5. Administrador com capacidade limitada: não conceder papel com poder que não controla, nem se autoelevar.
6. Tentativa de upload inválido, nome arbitrário, bucket alheio, atualização de versão obsoleta ou URL expirada: falha sem dar privilégio.
7. Para ABC, a conferência posterior não equivale à prova criptográfica de origem antes de publicar; usuários e clientes autorizados também são entradas não confiáveis.
8. Auditoria e metadados históricos permanecem acessíveis apenas nos escopos autorizados; sem exclusão em cascata por desativação ordinária.
9. API e logs nunca retornam senha, service_role, segredos, JWTs completos ou URLs assinadas persistentes.

Mapear cada cenário a testes unitários, RLS e integrações com **JWT real**; acompanhar [core-security-matrix](../../tests/integration/core-security-matrix.mjs), [Quality Acceptance](../modules/audit/QUALITY_ACCEPTANCE_V1.md) e novos cenários para cada módulo.

## 4. Recomendações TO-BE, não implementações

- Separar identidade privilegiada em serviço confiável **somente após** decisão arquitetural e provas (#49), sem expor admin key no frontend.
- Aplicar gestão de secrets, rotação, TLS/origins, CSP/cabeçalhos e proteção dos domínios de Storage em STAGING antes de PROD.
- Definir política de logging sem dados pessoais excedentes, retenção, acesso e monitoramento de alterações sensíveis.
- Definir backup independente de DB e objetos com criptografia, proteção contra exclusão e testes de restauração consistentes.
- Formalizar política de mudanças de RLS/RPC, revisão independente e testes negativos por papel/unidade/ciclo de vida.

Esses itens exigem brief/ADR/issue, dono, testes e aceite. Não habilitar tecnologia ou superfície privilegiada apenas porque constou da análise.
