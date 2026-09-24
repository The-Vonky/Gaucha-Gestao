# Fundação v1 — desenvolvimento e validação

Requisitos: Node 22.12+ e npm. Na raiz:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

Copie `apps/web/.env.example` para `apps/web/.env.local`. Preencha apenas URL
local/de teste e chave **publishable** (ou JWT legado com papel **anon**).
Nunca use `service_role`, chave secreta ou credenciais do PostgreSQL no frontend.
Sem configuração, a aplicação apresenta um estado explícito de ambiente indisponível.

## Supabase local (opcional; requer CLI e Docker)

```sh
supabase start
supabase db reset
```

`db reset` apaga somente o banco local; não use `--linked` nem uma URL remota.
O arquivo `supabase/config.toml` expõe `core`, mantém `private` fora da Data API
e desabilita cadastro público. Não provisiona produção.

1. No Auth do Studio **local**, crie/confirme uma identidade administrativa
   com `display_name` no metadata (ou use o Admin API em processo confiável).
2. Como operador do banco local, execute **uma vez**, substituindo o UUID:

```sql
select private.bootstrap_administrator('UUID_DO_USUARIO_CONFIRMADO'::uuid);
```

O bootstrap exige conta confirmada e ativa, é serializado, rejeita repetição e
não é executável por `anon`/`authenticated`. Não escolhe automaticamente o primeiro
cadastro nem confia em metadata para atribuir privilégios. Nenhum segredo é gerado
ou armazenado no repositório. Usuários adicionais são criados/convidados pelo
operador autorizado no Auth; recebem perfil sem atribuições. O administrador
concede acesso na tela Usuários. Recuperação de senha também usa o fluxo do Auth.

## Regras operacionais da fundação

- Perfis, papéis, catálogo de setores e atribuições são administração global.
  Unidades e logs aceitam permissões no escopo correspondente.
- Consultar setores permite ler nomes das unidades para inspecionar os vínculos.
- Um papel só pode ser concedido quando o administrador tem todas as permissões
  dele no escopo solicitado. Editar sua composição exige essas permissões globais.
- Papéis de sistema são protegidos; crie um papel personalizado para outras composições.
- Não é possível desativar a própria conta nem revogar a própria atribuição pela UI/API.
- Desativar um usuário revoga suas atribuições; reativar não as restaura.
- Unidades/setores inativos preservam leitura histórica; não aceitam novos vínculos.
- Atualizações usam `version`; a composição de papéis é substituída atomicamente.
- Desvincular setor referenciado por atribuição é bloqueado, inclusive para preservar histórico.
- Audit é apenas uma entrada protegida; inspeções e planos de ação não foram migrados.

## Testes de banco

`npm run test:rls` cria um PostgreSQL efêmero via PGlite e aplica as migrations,
com papéis `anon`/`authenticated`, contrato mínimo `auth.users`/`auth.uid()`, grants,
RLS e triggers reais. Cobre negação, escopos, delegação, auditoria e concorrência
otimista. Não simula políticas em JavaScript.

Isso não substitui o teste de integração com GoTrue/PostgREST. Antes de integrar
um ambiente real, valide login, convite, restauração de sessão e chamadas Data API
com a configuração local acima. A CI executa somente validações, sem deploy.
