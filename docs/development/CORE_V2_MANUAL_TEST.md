# Teste manual da Fundação Core v2 (PC e Android via USB)

Status: **disponível para teste de desenvolvimento; NÃO homologado e NÃO implantado em produção**.
Base técnica verificada: `integration/core-foundation-v2-wave2`, commit `9d5a68661bce9cee667ff2b7a88259a58cb7446e`. CI integrada: [run 37933225921](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/37933225921), jobs `validate` e `action-plans-integration` aprovados na primeira tentativa.
A CI no runner descartável não garante que o Supabase de quem testa esteja atualizado nem substitui validação em dispositivo real.

## Pré-requisitos

- Node 22.12+ e npm; Git; Android com USB debugging autorizado e Android platform-tools/ADB, caso seja teste pelo cabo.
- Conta de **teste** já existente e autorizada no Supabase local (não disponibilizar senha em ticket ou PR).
- `apps/web/.env.local` com `VITE_SUPABASE_URL` apontando para **instância local/de teste** e `VITE_SUPABASE_PUBLISHABLE_KEY` pública. Nunca use `service_role` nem base de produção.
- Banco local de teste compatível com as migrations presentes na branch, em especial as quatro novas migrations do Core v2:
  `20261008120000_core_user_directory.sql`,
  `20261008130000_core_access_governance_read_v1.sql`,
  `20261008150000_core_reference_resolvers_v1.sql`,
  `20261008160000_core_audit_log_read_model_v1.sql`.

## Checkout de teste sem interferir no trabalho dos agentes (PowerShell)

Na pasta existente `C:\Users\Gaucha\Gaucha-Gestao`:

```powershell
git fetch origin
git worktree add ..\Gaucha-Gestao-Teste origin/integration/core-foundation-v2-wave2
if (Test-Path .\apps\web\.env.local) {
  Copy-Item .\apps\web\.env.local ..\Gaucha-Gestao-Teste\apps\web\.env.local
}
Set-Location ..\Gaucha-Gestao-Teste
npm ci
npm run dev -w apps/web -- --host 0.0.0.0 --port 5174 --strictPort
```

O worktree começa em HEAD destacado (*detached*) da ref remota e é intencionalmente apenas para teste. Se já existir `Gaucha-Gestao-Teste`, **não** sobrescreva, resete ou recrie: verifique o estado antes de atualizar.

Use a porta `5174` para não confundir a versão sob teste com o Vite existente na `5173`. Abra `http://127.0.0.1:5174` no computador.

Em outro PowerShell, com celular Android conectado por USB e depuração autorizada:

```powershell
& "$env:USERPROFILE\android-tools\platform-tools\adb.exe" devices
& "$env:USERPROFILE\android-tools\platform-tools\adb.exe" reverse tcp:5174 tcp:5174
```

Se o `VITE_SUPABASE_URL` apontar para `http://127.0.0.1:54321` ou `http://localhost:54321` no computador, encaminhe **também** a porta do Supabase:

```powershell
& "$env:USERPROFILE\android-tools\platform-tools\adb.exe" reverse tcp:54321 tcp:54321
```

Então abra `http://127.0.0.1:5174` no Chrome do Android. Para outras portas/hosts, confirme o URL efetivo do Supabase e o roteamento antes de tentar o login.

## Conferir o banco sem apagar dados

Em outro terminal, na raiz do checkout da versão sob teste, use `npx supabase status` e `npx supabase migration list --local` caso a CLI esteja instalada/configurada. Confira a presença das quatro migrations acima. **Se faltarem migrations ou se o projeto Supabase for compartilhado entre agentes, interrompa o teste do Core v2 e prepare uma instância descartável isolada** com identificador e portas exclusivos. Não rode `supabase db reset`, `db push`, `--linked` nem scripts de seed em banco compartilhado, remoto ou de produção. O procedimento de criação da instância descartável será definido pelo responsável pelo ambiente.

Acesso à interface pode funcionar com banco antigo enquanto RPCs do Core v2 falham; isso **não** comprova regressão na interface.

## Roteiro de aceite manual (somente ambiente local/de teste)

1. **Login e sessão:** login de conta de teste; atualizar página e voltar ao app; sair. Repetir no desktop e no Android.
2. **Usuário:** Administração → Usuários → revisão de acessos de uma pessoa autorizada. Verificar perfis, escopos, concessões, revogações e mensagens de dados restritos.
3. **Unidades:** Administração → Unidades → ação `Acessos de <nome>`. Abrir/fechar o painel; verificar leitura sem permissão de gerenciar unidade, filtro por setor e histórico. Ação não deve alterar unidade nem perder filtros da lista.
4. **Logs:** Administração → Logs; filtrar e paginar; abrir detalhes técnicos; conferir campos de antes/depois, evento sem `Antes`, texto longo e nomes indisponíveis.
5. **Autorização negativa:** com usuário de teste de leitura e outro sem as permissões pertinentes, conferir que restrições não viram `0 pessoas` nem expõem informações; não tentar modificar políticas RLS para facilitar o teste.
6. **Responsividade:** 375px Android e desktop, sem corte horizontal e com ações acessíveis.

Anote resultado e screenshot **sem senhas, tokens ou dados de pessoas reais**, sempre com commit/URL/porta do Supabase e perfil de teste (sem credenciais).

## Limitações conhecidas

- Criação e recuperação administrativas de contas pela nova camada Identity Boundary ainda **não** implementadas; ADR-007 está no PR #24 proposto.
- Produção não homologada: aceites físicos e operacionais da Qualidade ainda permanecem abertos.
- Este documento descreve a branch de integração. **Não** afirmar que as telas do Core v2 já estão na `main`.
