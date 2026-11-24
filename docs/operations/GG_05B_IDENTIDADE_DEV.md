# GG-05B · Cadastro de funcionários no DEV

Incremento na [PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127), branch `codex/gg-05a-provisionamento`, para o Compose `gaucha-gestao-local` e Vite em `http://127.0.0.1:5173`. A autorização de 23/11/2026 abrange implementação e validação com identidades sintéticas no notebook. Piloto, recuperação administrativa de emergência e outros ambientes seguem com decisão própria.

## Fluxo

1. Em **Administração → Usuários → Novo usuário**, informe nome, e-mail individual e papel institucional. Para atribuição operacional, selecione a unidade e, se necessário, o setor. O cadastro sem papel operacional permite acesso aos Comunicados publicados depois da admissão.
2. Confirme a identidade e o e-mail por um canal já conhecido. Entregue ao titular, por canal privado, a senha temporária exibida uma vez. O cadastro e a redefinição geram uma senha aleatória de 22 caracteres legíveis, válida até troca, substituição ou bloqueio. O GoTrue armazena o verificador da senha e o Core guarda estado, geração, operação e admissão.
3. O funcionário entra com a temporária e informa a senha atual. Escolha e confirme uma senha definitiva diferente da temporária, com pelo menos 8 caracteres e até 72 bytes em UTF-8. O perfil Compose de identidade fixa `GOTRUE_PASSWORD_MIN_LENGTH=8`. A tela de troca é a única tela autenticada disponível durante a pendência. Ao concluir, entre com a definitiva em uma sessão nova.
4. Para **Redefinir senha**, localize a ficha, confirme a identidade e confirme a ação. Para o reset, o login do operador por senha deve ter ocorrido nos últimos 15 minutos. O reset mantém as atribuições, encerra a admissão anterior e exige a troca novamente. Contas administrativas e a própria conta do operador ficam protegidas contra reset ordinário.
5. **Desativar** revoga atribuições e invalida as admissões. Depois de **Ativar**, atribua explicitamente as permissões necessárias. O login usa a credencial vigente e cria uma admissão na geração atual. O JWT anterior permanece recusado. Se a conta foi bloqueada enquanto a senha estava pendente, gere outra temporária depois de reativá-la.

## Controles locais

- As migrations `20261123114457` e `20261123120627` instalam o fluxo com a configuração desabilitada e `gg_identity` sem login. O componente usa um login SQL exclusivo, com execução dos contratos privados e sem acesso direto às tabelas. A chave Admin do GoTrue vem do ambiente Docker e fica no componente.
- `infra/local/compose.identity.yaml` integra Auth, Kong, PostgREST e o componente interno sem publicar porta do componente. No perfil opt-in, o frontend usa `VITE_GG_IDENTITY_ENABLED=true` e o Vite encaminha os comandos para o Kong na mesma origem. Há um único autenticador, o GoTrue.
- O ingresso permite password grant, refresh da sessão admitida, logout e os comandos fechados de identidade. PostgREST usa `public.identity_pre_request()`. O Storage recebe apenas JWTs de sessões admitidas nas operações permitidas e reavalia a autorização de domínio. O modo estrito desabilita URLs assinadas, inclusive as emitidas anteriormente, e o frontend busca as leituras privadas com o JWT.
- O operador precisa de `admin.user.manage` global, da capacidade específica em `private.identity_operators` e de uma sessão admitida. Para adoção de um administrador existente, preserve a conta e a credencial atuais, registre sua capacidade explícita e valide em uma sessão nova. Antes de habilitar, confira a presença de um administrador ativo e confirmado, a readiness do componente e os endpoints efetivos.
- Use os arquivos privados do projeto local ao recriar os serviços relacionados. A ordem de adoção é migration desabilitada, runtime interno, pre-request e Auth configurados, novo ingresso Kong, adoção de identidades legadas confirmadas, habilitação da configuração e login novo. Depois da primeira operação gerenciada, mantenha o ingresso restrito durante contenção. Desabilitar o modo nega também o acesso às contas gerenciadas. A restauração do ingresso legado só é reversão adequada antes de existir conta gerenciada.

### Retomada do notebook já adotado

Com o backend adotado e saudável, mantenha em `apps/web/.env.local` a URL loopback e a chave de cliente do projeto, com as flags públicas:

```dotenv
VITE_GG_IDENTITY_ENABLED=true
VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS=true
```

O provisionador base gera a flag de transformação na primeira escrita do arquivo. Acrescente a flag de Identity na configuração local do ambiente adotado. Execute `npm run dev` se o Vite estiver parado. O alias `npm run dev:identity` injeta as flags no processo para ensaios específicos. Após o corte, entre novamente para criar uma sessão no ingresso atual.

Se o backend estiver parado, siga o [diagnóstico compartilhado](DOCKER_LOCAL_STANDARDIZATION.md#diagnóstico) usando o base e `compose.identity.yaml` com os arquivos privados `backend.env` e `identity.env` em `${XDG_CONFIG_HOME:-$HOME/.config}/gaucha-gestao`. Preserve a composição em operações de partida e atualização. O [backup do Compose base](DOCKER_LOCAL_STANDARDIZATION.md#limite-do-backup-com-identity) tem escopo próprio e a recuperação completa de Identity ainda precisa de procedimento comprovado.

A disponibilidade do Vite e a configuração das flags foram observadas na auditoria de 24/11/2026. **O login completo com Identity pelo comando `npm run dev` ainda requer evidência de homologação.**

## Reconciliação

Ao receber um protocolo pendente, confira o estágio em `private.identity_operations` e a trilha `core.system_audit_log`, sempre pelo UUID do protocolo ou do alvo. Em cadastro, confira se o UUID reservado existe no Auth e corresponde ao perfil Core. Confirme se a chamada ao GoTrue terminou antes de decidir a recuperação. Quarentena impede despacho concorrente e impede a admissão até o resultado ser confirmado. Senhas temporárias de respostas perdidas não podem ser recuperadas. Após operação concluída e conta elegível, o reset emite uma nova. Operações de resultado incerto permanecem em quarentena para reconciliação supervisionada. Este fluxo não disponibiliza um comando de recuperação emergencial.

## Verificação

`tests/integration/gg05b-identity.mjs` verifica GoTrue, Kong, PostgREST, GraphQL, Storage, sessão restrita, reset, negação do mesmo JWT após reativação com grants restaurados e Comunicados sem papel. `identity-integration` exercita a fronteira no Compose descartável da CI. O ensaio pode usar o DEV local existente, com contas e objetos sintéticos próprios. A homologação do mantenedor verifica também a interface usando duas sessões de navegador.
