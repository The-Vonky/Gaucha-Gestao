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

Kong é a fronteira de ingresso da aplicação nos perfis locais. GoTrue confirma a identidade. Core e cada domínio avaliam admissão, capacidade, escopo, autoria e invariantes. O operador de infraestrutura e o destino de backup possuem autoridade própria. [Segurança](SECURITY.md) · [Autorização](AUTHORIZATION.md).

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
| Perda de host, dados, objetos ou logs | Logs auditados e volumes com escopo de backup definido. | Backup/restore independente da C30, retenção, monitoramento, recuperação e RPO/RTO exigem provas próprias. |
| Revisão limitada e cadeia de dependências | Diff, CI, testes negativos e aceite do mantenedor único; lockfiles e validações de dependências. | A ausência de segunda revisão é risco registrado. A revisão aplicável à identidade privilegiada é um gate específico. CI cobre somente os casos executados. |
| Exposição de serviços ou dados reais em ensaio | Separação DEV/CI/C30, dados sintéticos, ingresso e acesso por perfil. | Inventariar exposição, TLS, firewall, logging e segredos no ambiente operacional. Conferir o estado implantado com evidência do próprio ambiente. |

## 3. Cenários de autorização que não podem falhar

1. Perfil inativo, sessão não admitida ou revogada e credenciais temporárias não devem conseguir dados de módulos no perfil estrito.
2. Grants de uma unidade ou setor não devem liberar outra unidade ou registros não cobertos. Exportação e Storage aplicam a mesma fronteira do domínio.
3. A interface reflete a projeção do acesso. Cada chamada direta deve obedecer à autorização efetiva, inclusive quando o administrador de Salas estiver em Requester.
4. Concessão fora da autoridade, reset de conta protegida e autor informado pelo cliente devem ser recusados pelo contrato correspondente.
5. A evidência de concorrência deve conferir resultados após revogação, versão obsoleta e efeito remoto incerto no ambiente aplicável.
6. Relatórios, logs e erros devem excluir credenciais, identificadores desnecessários e URLs assinadas persistentes, preservando a autoria autorizada.

[GG-05B](../../tests/integration/gg05b-identity.mjs) · [Matriz Core](../../tests/integration/core-security-matrix.mjs) · [P1–P9 e O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md).

## 4. Recomendações TO-BE, não implementações

O candidato operacional requer revisão de segurança aplicável, recuperação emergencial do administrador, testes negativos por superfície e gates de backup, recuperação, retenção, monitoramento, ingresso e operação. Cada prova requer ambiente, escopo e GO próprios. [Gates de fundação](FOUNDATION_GATES.md).

## Foto da Sala de Reunião — 26/10/2026

**EVIDÊNCIA DATADA.** A versão de 26/10 usou D5-B e URLs assinadas de até 300 s. Na `main`, AG-D5-C autoriza gestão a administrador global e gestor efetivos. Leitura da foto exige leitura da agenda; Identity usa a rota autenticada. O SQL verifica metadata e o browser reconverte a imagem, com os limites de validação física do [contrato de experiência](../modules/room-booking/EXPERIENCE_V1.md#foto-e-storage-privado).
