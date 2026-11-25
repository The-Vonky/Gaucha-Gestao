# Modelo de ameaças e requisitos verificáveis — Gaúcha Gestão

**VIGENTE para a baseline de código da `main`.** As evidências referem-se aos ambientes, datas e revisões dos respectivos ensaios. O [AS-BUILT de 30/10/2026](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) registra HTTPS público de testes na C30 via Caddy e Cloudflare Tunnel. A instalação e os controles daquele ambiente exigem evidência própria. **PROD NO-GO.**

## 1. Ativos e limites de confiança

~~~mermaid
flowchart LR
  B["Browser · entrada não confiável"] --> K["Kong"]
  K --> R["PostgREST"]
  K -->|"perfil base"| A["GoTrue · autenticador"]
  K -->|"perfil base"| S["Storage · buckets privados"]
  K -->|"perfil estrito DEV · Auth e Storage"| I["Identity · serviço interno Core"]
  I --> A
  I --> S
  I -->|"contratos SQL privados"| P["PostgreSQL · grants, RLS e RPCs"]
  R -->|"pre-request em Identity"| P
  S --> P
  S --> M["imgproxy · leitura de objetos"]
  P --> L["Core system audit log"]
~~~

Kong é a fronteira de ingresso da aplicação nos perfis locais. GoTrue confirma a identidade. Core e cada domínio avaliam admissão, capacidade, escopo, autoria e invariantes. A operação privilegiada de infraestrutura e backup tem fronteira de confiança própria e deve ser isolada da aplicação. [Segurança](SECURITY.md) · [Autorização](AUTHORIZATION.md).

## 2. Registro de ameaças e controles

| Ameaça | Controle implementado | Evidência e risco residual |
| --- | --- | --- |
| Autoelevação ou delegação excessiva | Grants, RLS e RPCs. Core confere composição e escopo. Identity exige capacidade privada por verbo, operador ativo, permissão global e regra fechada de cadastro. | [Matriz Core](../../tests/integration/core-security-matrix.mjs) e [GG-05B](../../tests/integration/gg05b-identity.mjs). GG-06 requer verificação integradora. |
| Usar a vista Requester como barreira | O backend usa autorização atual. O seletor de Salas só muda a UI. | Na [AG-D5-C](../modules/room-booking/D5C_ADMIN_MODES.md), o administrador continua apto a gerir por RPC em Requester. Redução de privilégio por sessão exigiria nova decisão. |
| Perfil inativo, JWT anterior ou corrida de credenciais | Perfil ativo é condição de domínio. Em Identity, admissão por sessão viva, finalidade e geração. O bloqueio avança a geração e invalida admissões. Pre-request e RLS de Storage verificam novas requisições. | A [PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127) registra negativa do mesmo JWT após reativação. No perfil base, o token mantém validade criptográfica e os controles dependem do estado do Core. |
| Acesso cruzado entre unidades, setores ou autores | Escopo na atribuição, filtros e políticas por recurso. Vendas exige global/unidade e revalida interseções na exportação. Salas vincula pedidos próprios ao titular da sessão. | [Testes de Vendas](../../tests/sales-institutional-database.test.ts) e [aceite de Salas](../modules/room-booking/ACCEPTANCE_V1.md). Revalidar no candidato operacional. |
| Objeto privado ou URL repassada | Buckets privados, chave reservada, autorização do objeto. Identity fecha assinatura e exige sessão admitida no ingresso e em Storage. | No perfil base, URL emitida pode ser usada até o TTL. Em qualquer perfil, revogação não recolhe bytes já recebidos. O bucket GG-11 fica fora da lista de ingresso estrito atual. [Perfis e lacuna](SECURITY.md#storage-privado-e-miniaturas). |
| Alteração de credencial com resultado incerto | Operação exclusiva e auditada, quarentena até confirmação por UUID e geração, sem repetição automática do efeito remoto. | [GG-05B](GG05B_IDENTITY_DESIGN.md#contrato-vigente-no-dev). Recuperação e liberação de quarentena exigem procedimento autorizado. |
| Conta administrativa indisponível | Reset ordinário recusa a própria conta e alvos protegidos. Adoção DEV exige conferir administrador ativo e login novo. | Recuperação emergencial, custódia e ensaio integral de recuperação com Identity permanecem pendentes. [Gates](FOUNDATION_GATES.md). |
| Credenciais privilegiadas em bundle, respostas ou logs | Chave pública no cliente, chave Admin no serviço, login SQL dedicado e trilha saneada. Somente a resposta autorizada de criação/reset inclui a temporária. | A [PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127) registra inspeção de logs sintéticos. Segredo GoTrue Admin tem autoridade ampla. Revisar exposição, custódia e rotação para o ambiente-alvo. |
| Upload hostil ou estado divergente de metadados e bytes | Tipos/tamanhos por domínio, reserva e confirmação, políticas de origem e transformação de imagens com limites. | Validar original privado, bytes e cabeçalhos no perfil-alvo. Arquivos órfãos, reconciliação e retenção física permanecem operacionais. |
| Curva ABC: payload coerente alheio ao XLSX ou arquivo trocado | SQL revalida payload e metadata; parser e conferência posterior operam no cliente. | O servidor não reprocessa nem re-hasheia os bytes do original. Algumas restrições de competência e limites da prévia não são simétricas no SQL. Validação física confiável ou mudança de invariantes exige decisão própria. [Contrato ABC](../briefs/ABC_DOMAIN_V1.md). |
| Fórmulas em planilhas ou conteúdo injetado em relatório | Exportações usam contratos de projeção, escopo atual e escrita segura das células. | Revalidar no SHA candidato. Arquivos exportados passam à custódia de quem os recebeu. |
| Perda de host, dados ou objetos | Volumes com escopo de backup definido. | Criptografia, proteção contra exclusão e backup/restore independente da C30 exigem prova, além de RPO/RTO. [Backup e recuperação](BACKUP_RECOVERY.md). |
| Perda ou adulteração de trilha | Gravações confiáveis e leitura restrita de `core.system_audit_log`. | Um operador privilegiado do banco pode alterar registros. Acesso operacional, retenção, exportação, proteção e monitoramento da trilha exigem política e validação. [Auditoria sistêmica](SECURITY.md#auditoria-sistêmica). |
| Revisão limitada e cadeia de dependências | Diff, CI, testes negativos e aceite do mantenedor único; lockfiles e validações de dependências. | A ausência de segunda revisão é risco registrado. A revisão aplicável à identidade privilegiada é um gate específico. CI cobre somente os casos executados. |
| Exposição de serviços ou dados reais em ensaio | Separação DEV/CI/C30, dados sintéticos, ingresso e acesso por perfil. | Inventariar exposição, TLS, firewall, logging e segredos no ambiente operacional. Conferir o estado implantado com evidência do próprio ambiente. |

## 3. Cenários de autorização que não podem falhar

1. Sem sessão ou com perfil inativo, negar acesso aos dados de negócio. No perfil estrito, negar também sessão não admitida, revogada ou restrita à troca de credencial.
2. Grants de uma unidade ou setor não devem liberar outra unidade ou registros não cobertos. Exportação e Storage aplicam a mesma fronteira do domínio.
3. A interface reflete a projeção do acesso. Cada chamada direta deve obedecer à autorização efetiva, inclusive quando o administrador de Salas estiver em Requester.
4. Negar concessão fora da autoridade e reset de conta protegida. A autoria deve vir do contexto confiável da sessão ou do mecanismo produtor. Um valor arbitrário informado pelo cliente não atribui autoria.
5. Testar a próxima operação após revogação ou desativação, inclusive com estado de UI obsoleto. Conferir rejeição de versão obsoleta e contenção de resultado remoto incerto.
6. Negar uploads incompatíveis com tipos, tamanhos ou chaves autorizados, objetos de outra unidade, bucket indevido e acesso por ID ou chave adivinhados. No perfil base, rejeitar URL expirada. Em Identity, testar também a negativa de emissão e resgate por assinatura. A validação física de bytes segue os limites de cada contrato.
7. Restringir acesso à trilha e a metadados históricos aos escopos autorizados. A desativação ordinária preserva o histórico.
8. Relatórios, logs e erros devem excluir credenciais, identificadores desnecessários e URLs assinadas persistentes, preservando a autoria autorizada.

Vincular os cenários aos testes de regressão e às integrações com JWT real nas superfícies aplicáveis. [GG-05B](../../tests/integration/gg05b-identity.mjs) · [Matriz Core](../../tests/integration/core-security-matrix.mjs) · [P1–P9 e O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md).

## 4. Recomendações TO-BE, não implementações

- **Ingresso e exposição.** Verificar firewall, portas e superfícies administrativas, TLS e origens, WAF, CSP, cabeçalhos e cache antes de PROD. Validar a exposição e as negativas em login, Auth, REST e Storage, inclusive os domínios de objetos, TTL e resgate por assinatura nas versões que o permitem. O HTTPS de testes na C30 tem evidência datada e a proteção adicional via Cloudflare Access exige evidência própria. Respostas privadas ficam fora do cache compartilhado. Se R2 for adotado, a validação de autorização e recuperação de objetos deve abranger esse destino. [Runbook da C30](../operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md#segurança-dados-e-validações-pendentes).
- **Logs e recuperação.** Verificar os requisitos de proteção da trilha, retenção, monitoramento e recuperação definidos em Segurança e Backup. O ensaio deve abranger banco e objetos e seguir as condições do ambiente-alvo. [Segurança](SECURITY.md#auditoria-sistêmica) · [Backup e recuperação](BACKUP_RECOVERY.md).
- **Mudanças de segurança.** Conferir gestão e rotação de segredos, revisão aplicável, recuperação emergencial do administrador e testes negativos de RLS/RPC por papel, unidade e ciclo de vida no SHA candidato. Cada prova requer ambiente, escopo e GO próprios. [Gates de fundação](FOUNDATION_GATES.md).

## Foto da Sala de Reunião — 26/10/2026

**EVIDÊNCIA DATADA.** A versão de 26/10 usou D5-B e URLs assinadas de até 300 s. Na `main`, AG-D5-C autoriza gestão a administrador global e gestor efetivos. Leitura da foto exige leitura da agenda; Identity usa a rota autenticada. O SQL verifica metadata e o browser reconverte a imagem, com os limites de validação física do [contrato de experiência](../modules/room-booking/EXPERIENCE_V1.md#foto-e-storage-privado).
