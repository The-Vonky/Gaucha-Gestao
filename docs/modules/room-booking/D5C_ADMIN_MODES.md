# AG-D5-C — Administrador global e modos de atuação no Agendamento

**Decisão do mantenedor: 23/11/2026.** Correção avulsa, fora da numeração GG-01–GG-15. Substitui **somente** a proibição administrativa de AG-D5-B, aprovada em 26/10. D5-A e D5-B permanecem no histórico; não editar migrations ou testes antigos para simular que a regra sempre foi esta.

## Motivo

A GG-05B ([PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127)) introduziu o cadastro de funcionários, mas a tela de criação excluía todos os papéis `global_only` e o serviço de identidade exigia `unitId` para qualquer `roleId`. Os papéis `room_booking_manager` e `room_booking_requester` são globais. Paralelamente, AG-D5-B havia retirado `room_booking.manage` do administrador e bloqueado a composição com gestor no Core. Consequentemente, o administrador não conseguia criar a secretária como gestora nem gerir aprovações.

## Regra de produto atual

| Identidade efetiva | Solicitar/consultar próprios | Gestão, fila, decisões, reservas diretas, contato, foto, histórico privado | Seletor de modo |
| --- | --- | --- | --- |
| `platform_administrator` global ativo | Sim | Sim | **Sim**, inicia em **Room Booking Requester** e alterna para **Room Booking Manager** |
| `room_booking_manager` global ativo | Capacidade no catálogo, vista operacional de gestão | Sim | Não; interface fixa de gestora |
| `room_booking_requester` global ativo | Sim | Não | Não; interface fixa de solicitante |
| Usuário sem concessão ou inativo | Não | Não | Não |

**Seletor é modo de apresentação, não troca de credencial ou elevação por botão.** Na API/banco, o administrador global já possui as duas capacidades. Mesmo enquanto visualiza a tela como Requester, uma chamada direta devidamente autenticada ainda pode operar `room_booking.manage` — a opção de tela não é um mecanismo de negação de privilégios. Toda mutação continua exigindo `private.is_active_user`, grants atuais, RPCs e auditoria com autoria real. Essa característica é deliberada para não criar uma identidade impersonada ou sessão paralela. Caso o negócio exija bloqueio técnico da gestão enquanto o administrador estiver em modo Requester, isso necessita de contrato **servidor/sessão** separado, não apenas esconder botões.

A seleção aparece **somente** se `public.room_booking_admin_context()` comprovar atribuição `platform_administrator` global, ativa, com papel ativo. Outros papéis com permissões administrativas parciais não ganham o seletor. O modo começa como Requester ao entrar e não é salvo no banco, localStorage ou JWT. Trocar de modo limpa formulários/decisões em andamento e recarrega a visão. Não há atribuição automática de `room_booking_manager` ao administrador, nem concessões a outros usuários.

## Cadastro de funcionários (GG-05B)

A tela **Novo usuário** passa a exibir `room_booking_manager` e `room_booking_requester` junto aos papéis comuns, apesar de `global_only`. Para esses dois papéis, não solicita unidade nem setor. Serviço de identidade admite `roleId` sem `unitId`; `private.identity_can_assign` no banco revalida o ator, `private.can_delegate`, o papel ativo, a ausência de permissões `admin.%`, a lista fechada dos **dois** papéis globais e `unitId/sectorId = null`. `platform_administrator` e quaisquer outros papéis globais permanecem proibidos no cadastro. A criação ainda é mediada pelo serviço interno GG-05B e pelos operadores autorizados; não abre signup público nem expõe credenciais.

A secretária recebe somente o papel `room_booking_manager` **explicitamente** ao cadastrá-la; conta sem papel continua sem direitos de sala. Atribuir ou revogar outros papéis a usuários existentes segue Core, delegação e auditoria. A substituta de D6 continua exigindo concessão/revogação auditadas, agora também viáveis pelo administrador autorizado na interface Core.

## Implementação e preservação

- Migration **append-only**: `supabase/migrations/20261123143000_room_booking_admin_modes.sql`. Insere apenas a relação `platform_administrator → room_booking.manage`; adapta a restrição de gestão de D5-B para aceitar **gestor ou administrador global ativo**; adapta `identity_can_assign` e cria uma RPC booleana, sem divulgar histórico da sala.
- Não altera as migrations históricas AG-01/02, D5-B e GG-05B; não reescreve papéis, IDs, atribuições, dados de pedidos, reservas nem contas.
- Migrations e backend do GG-05B devem ser distribuídos em conjunto com o frontend. **Não publicar o seletor em um ambiente que ainda não possui `room_booking_admin_context` e a migration.**
- Uma migration de política é alteração sensível: revalidar grants, RLS/RPC/Storage, revogação, conta inativa e sessões após o commit. Não executar na C30/STAGING/PROD sem inventário, backup/restauração e GO específicos.
- O servidor da identidade continua precisando de ingresso e credenciais protegidos. Nenhuma chave privilegiada é entregue ao navegador.

## Aceitação exigida

1. Administrador logado vê os dois botões; inicia em Requester, consegue criar pedido; ao selecionar Manager, vê fila/históricos e consegue aprovar, recusar, criar reserva direta e editar contato/foto. Voltar a Requester esconde todos os controles de gestão.
2. Usuário Manager sem ser administrador não vê o seletor; opera gestão normalmente. Requester não vê seletor, nem tem `room_booking.manage` ou acesso aos dados privados; conta inativa é negada.
3. Administrador com GG-05B ativa cria secretária com papel Manager global e solicitante com Requester global **sem unidade**, com credencial temporária e primeira troca obrigatória. Atribuição resultante é global, rastreável e única; cadastro privilegiado inválido é negado no servidor.
4. Acesso por RPC direta: gestor administra; solicitante, usuário sem papel, inativo ou revogado recebe `42501`, inclusive fila, histórico, foto e mutações. O administrador global autorizado exerce gestão; um usuário que só tem parte de `admin.%` não herda permissão nem seletor.
5. Conferir em PostgreSQL + GoTrue reais no DEV autorizado, UI desktop/celular, erro de rede, refresh, histórico e auditoria. Usar fixtures sintéticas e limpeza comprovada; registrar SHA, ambiente, comandos e evidências.
6. Verificar compatibilidade com a última implementação GG-05B e a CI completa. **PR não é homologação; merge é decisão do mantenedor.**

## Estado desta correção

Implementação proposta em branch/PR própria para avaliação no GitHub. **Não aplicada, não testada no notebook, não homologada, não mergeada nem implantada pela mera criação dos arquivos.** D5-B continua sendo o comportamento dos ambientes que não receberam esta migration.

Referências: [D5-B histórica](D5B_ACCESS.md) · [EXPERIENCE_V1](EXPERIENCE_V1.md) · [Autorização Core](../../architecture/AUTHORIZATION.md) · [GG-05B](../../architecture/GG05B_IDENTITY_DESIGN.md) · [Registro de decisões](../../planning/DECISION_REGISTER.md).
