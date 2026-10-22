# Backup e recuperação

## Princípio

**Backup não é considerado confiável até ser restaurado e verificado.** A proteção envolve banco, objetos enviados, configurações, referências de segredos, artefatos de deploy e histórico de migrations — não apenas PostgreSQL.

## Propriedades exigidas

A implantação de produção precisa definir: escopo, frequência, retenção, destino independente, criptografia e controle de acesso, monitoramento de falhas, procedimento de restauração, responsável, **RPO** (ponto de recuperação) e **RTO** (tempo de recuperação).

RPO técnico, RTO dentro/fora da janela operacional e retenção **ainda dependem de definição e medição**.

## Decisões operacionais de 01/10/2026

| Responsabilidade | Registro |
| --- | --- |
| Operação | Responsável atual pelo projeto |
| Backup e restore | Mesmo responsável pelo projeto |
| Alertas | Responsável pelo projeto + supervisor |
| Janela provisória | Segunda a sexta, 07:00–18:00 (America/Sao_Paulo), com exceções |
| Infra ligada | Expectativa 24x7, **sem SLA ou suporte comprovado** |

**Requisito de negócio:** não perder dados confirmados como salvos. Isso não é garantia técnica provada: **não registrar RPO=0**. Retenções de backup, logs sistêmicos e objetos excluídos também estão pendentes. O1 permanece **PARCIAL**, não concluído.

## Cenários mínimos

1. Exclusão ou corrupção acidental de registros.
2. Deploy incorreto.
3. Migration defeituosa.
4. Perda de disco/servidor.
5. Perda ou corrupção de bytes de arquivos.
6. Perda de configuração/credenciais.
7. Reconstrução completa em hardware substituto.

## Banco, objetos e código

Backups produtivos devem ser **automatizados e independentes** o suficiente para sobreviver à perda do host. Antes de alterações destrutivas: conferir ponto recuperável, ensaiar a migration fora da produção e preparar rollback/forward-fix.

Evidências, contratos, imagens e XLSX exigem **bytes e metadados** correspondentes. Restaurar só o DB pode deixar referências órfãs. Cloudflare R2 fora do host **não é, sozinho, backup**.

Git versiona aplicativo e migrations, **não os dados produtivos**. Deploy deve poder ser reproduzido a partir de versões e definições de configuração.

## Evidência adicional: dumps locais da C30 STAGING (21–22/10/2026)

Com a implantação persistente do baseline `f9f041e` (18 migrations), foram produzidos **quatro dumps manuais locais** e um arquivo de roles/globals em `/var/backups/gaucha-gestao/staging` no SSD da C30, com acesso root. O dump mais recente sucede o bootstrap da conta administrativa. Foram verificadas existência, checksums e lista interna do dump (`pg_restore --list`), **não** o restore funcional dele. Objetos de Storage e segredos/configurações de host **não** estão abrangidos por evidência de recuperação consistente. Não há automação/off-site/cifragem atestadas, retenção, alertas nem PITR. O HDD de dados tem histórico SMART de uso elevado. Portanto os gates O1/O3/O4 seguem **abertos**, mesmo para avanço de STAGING com dados relevantes.

Para lista de artefatos e plano de provas, ver [C30_BACKUP_GAPS](../operations/C30_BACKUP_GAPS.md). O ensaio sintético anterior abaixo é **outra baseline** e não pode ser extrapolado.

## Ensaio sintético registrado em 19/10/2026

O [relatório da Issue #51](../planning/02_RESTORE_DRILL.md) descreve cópia física **a frio** de três volumes e restore em projeto isolado: **8 DR PASS / DR-08 PARCIAL**, pois os tempos não foram cronometrados adequadamente.

A evidência histórica cobriu **17 migrations**, antes da Curva ABC. O bucket `abc-source-files` e a 18ª migration **não foram ensaiados**. Esse teste não comprova PITR/WAL, backup on-line, cópia off-site, perda real de host nem RPO/RTO de PROD.

Ver [diagrama LAB x PROD](../planning/02_RESTORE_DRILL.md#visão-visual--backup-executado-vs-recuperação-requerida) e passos para repetir com ABC e tempos mensurados. **Não reescrever provas históricas como se valessem para a nova baseline.**

## Exercícios de restauração

Ensaiar periodicamente em ambiente isolado, verificando: banco sobe, migrations/schema coerentes, registros legíveis, arquivos e referências íntegros, Auth/configuração recuperáveis e app consegue iniciar.

Registrar **data, backup, versão, resultado, falhas e ações corretivas**. Não incluir segredos e dados reais em PRs.

## Migração de sistemas legados

Antes do corte: guardar ponto restaurável final do legado, registrar versão da origem, reconciliar contagens/totais, definir janela de rollback e **não destruir o legado logo após o cutover**.

O **ERP de Contratos** requer auditoria do backup/restore atual antes de considerar sua migração de baixo risco.

**PROD NO-GO** até evidências operacionais e autorização humana.
