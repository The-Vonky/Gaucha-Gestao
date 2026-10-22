# C30 STAGING — estado de backup, lacunas e prova de recuperação

**Fotografia em 22/10/2026.** Sem RPO/RTO/SLA assumidos. Backups atuais do host **não** autorizam produção. Ver [BACKUP_RECOVERY](../architecture/BACKUP_RECOVERY.md) e [ensaio sintético histórico](../planning/02_RESTORE_DRILL.md).

## O que existe

No diretório local de root `/var/backups/gaucha-gestao/staging`, foram relatados dumps lógicos PostgreSQL:

| Artefato | Evidência disponível |
| --- | --- |
| `pre-migracoes-20261021T141832Z.dump` | Dump antes das migrations de domínio |
| `pre-migracoes-plataforma-20261021T162901Z.dump` | Segundo checkpoint |
| `pos-migracoes-f9f041e-20261021T170055Z.dump` | Após aplicar as 18 migrations do baseline |
| `pos-admin-f9f041e-20261021T182043Z.dump` | Após bootstrap do administrador |
| `pos-admin-f9f041e-20261021T182043Z-globals.sql` | Roles globais complementares |

Arquivos com acesso root; os dumps contêm **dados sensíveis de Auth, inclusive hashes de senhas**. Não publicar, anexar, baixar para PCs sem cifragem ou usar como dados de teste comuns.

**Verificações feitas:** presença, hashes SHA-256 de artefatos selecionados e `pg_restore --list` do dump lógico; não houve restauração funcional do conjunto atual em ambiente independente. O ensaio histórico de 19/10 era sintético, em outra baseline (17 migrations), e **não valida** este novo backup da C30.

## O que não está comprovado

- Automatização de backup, agendamento, alertas de falha e política de retenção.
- Cópia remota cifrada, independente da C30 e dos seus discos; gestão/recuperação de chave.
- Backup consistente de **bytes de Storage** juntamente com metadados PostgreSQL; validação de anexos e XLSX restaurados.
- Backup físico + arquivamento WAL/PITR para recuperação a instante específico.
- Restore isolado do **conjunto atual** de DB/Auth/roles/objetos + tempo medido e checagem de RLS.
- Procedimento de substituição de servidor e reconstrução completa do runtime/segredos.
- Cópia temporária em pendrive de ~68 GB **prevista**, mas não executada; futuro HD externo ainda a adquirir. Pendrive não substitui backup automático/cloud.

## Plano de implementação (não executado)

1. Inventariar tamanho do DB, diretório de objetos, espaço livre e estado SMART do HDD (idade elevada); dimensionar janela de backup.
2. Definir com responsável retenção, RPO/RTO, credenciais por cofre, destino off-site, orçamento e acesso administrativo.
3. Automatizar dumps e backups dos objetos com integridade e retenção; proteger arquivos com permissões e **cifra autenticada** antes de sair do host.
4. Configurar réplica cifrada em armazenamento remoto independente e alerta diário de sucesso/falha. Decidir WAL/PITR antes de chamar a solução de produção.
5. Fazer restore para instância **isolada com volumes novos**, sem interromper ou sobrescrever STAGING, conciliando tabela/roles/Auth, hashes de objetos, downloads e RLS por usuário/unidade.
6. Medir e registrar duração, RPO/RTO observados, lacunas, recuperação das chaves e responsáveis.
7. Testar mídia offline sob custódia (pendrive provisório/HD externo) somente após verificar origem/destino; nunca formatar uma unidade por adivinhação.

**Proibição:** não executar restauração sobre `/armazenamento2/gaucha-gestao/staging`, não montar backup sem teste e não declarar “backup garantido” com base apenas em existência de dumps. A futura implantação pública para testes deve começar com **dados sintéticos e usuários autorizados**.
