# ADR-008 — Host de produção escolhido: Lenovo ThinkStation C30

**Status: Aceito (decisão de arquitetura, não aceite operacional)**  
**Data: 15/10/2026**  
**Substitui:** somente a escolha de host físico do [ADR-004](ADR-004-platform-stack.md) (HP ProLiant ML350 e VM Linux). As demais decisões do ADR-004 permanecem válidas.  
**Relacionado:** [ADR-006](ADR-006-infra-v1-reused-hardware.md) (perfil mínimo Compose) e [Plano Diretor 2026](../planning/PLANO_DIRETOR_2026.md).

## Contexto

O ADR-004 havia aceitado a HP ProLiant ML350 como primeiro host físico único, executando uma VM Linux. O ADR-006 posteriormente adiou a decisão do hardware e registrou que a ML350 nunca havia sido inventariada ou validada.

Em 15/10/2026, o responsável pelo projeto comunicou a troca do servidor previsto por uma **Lenovo ThinkStation C30** como host da plataforma.

**Inventário informado pelo responsável (detalhes no Plano Diretor, §3):**

| Item | Valor |
| --- | --- |
| Modelo | ThinkStation C30, tipo 1097A58; BIOS A1KT46AUS (2013), UEFI |
| Processador | 1 × Intel Xeon E5-2620 (primeira geração), 6 núcleos / 12 threads, 2,0 GHz |
| Memória | 8 GiB DDR3 ECC, 4 × 2 GiB Hynix HMT325U7CFR8C (código sugere ECC UDIMM; conferir etiqueta) |
| Disco | 1 × SSD SATA MARKVISION 256 GB; cerca de 19,5% livres na primeira coleta |
| Rede | Intel 82579LM 1 Gbps (ativa) + Intel Gigabit CT2 (desconectada) |
| SO no inventário histórico | Windows 11 Pro 23H2, Docker Desktop + WSL2, 13 contêineres (não era o perfil ADR-006) |

As medições foram coletadas em Windows/Docker Desktop/aplicativos de desktop e Supabase completo. **Não comprovam a capacidade operacional da plataforma em Ubuntu.** O estado atual do host requer inspeção nova.

## Decisão

1. A **ThinkStation C30 é o host físico escolhido** da plataforma. O ponto único de falha (SPOF) de host único aceito no ADR-004 aplica-se a essa máquina.
2. O host **deverá executar Ubuntu Server LTS diretamente no hardware** (bare metal), substituindo Windows 11. Sem hipervisor: com 8 GiB de RAM e um SSD, uma VM geraria overhead sem outra carga a isolar. Isso resolve a decisão VM versus bare metal adiada no ADR-006.
3. Runtime escolhido: **Docker Engine + Docker Compose**, no perfil mínimo do ADR-006 (PostgreSQL 17, Kong, GoTrue, PostgREST, Storage API). Docker Desktop e os serviços omitidos pelo ADR-006 não compõem esse perfil.
4. O host será **dedicado**, sem aplicativos de desktop ou cargas alheias à plataforma.
5. O ADR-004 permanece válido quanto a Cloudflare Workers Static Assets, DNS/WAF/Tunnel sem portas públicas de entrada, R2 para objetos, backup off-site, Ansible e GitHub Actions.

## Critérios de aceite do host

A C30 foi escolhida, mas **não é considerada aceita para produção** até existir evidência de todos os itens:

1. Tudo que estiver em execução na C30 deve ser preservado em backup e restauração verificada **antes** de remover Windows ou alterar discos.
2. Medir novamente em Ubuntu com perfil ADR-006: RAM disponível, swap, ocupação de disco abaixo de 70%, relatório SMART completo e temperatura da CPU sob carga.
3. Teste de carga contra metas definidas pelo responsável (RPO técnico, RTO, p95, usuários e unidades esperados). **Essas metas ainda precisam ser definidas.**
4. UPS com desligamento automático seguro testado.
5. Backup off-site e ensaio de restauração demonstrados (gates O3/O4 de [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md)).

## Riscos conhecidos

- Um SSD sem RAID: falha de disco exige restauração completa a partir de backup off-site.
- Plataforma de 2012–2013: peças de reposição e DDR3 ECC UDIMM têm disponibilidade limitada.
- 8 GiB de RAM: gatilhos de upgrade da memória/SSD do Plano Diretor §7 já eram atingidos **no snapshot de Windows** e precisam ser reavaliados em Ubuntu.
- Não há host de contingência definido. O RTO depende da reconstrução em hardware substituto.

## Decisões abertas

- Destino do servidor legado: desligar ou manter como STAGING / laboratório de restore.
- Onde executar STAGING: máquina separada ou C30 com isolamento/limites explicitamente registrados.
- Ferramenta de WAL/PITR (WAL-G ou pgBackRest) e destino off-site; não definidos no ADR-006.

## Consequências

- Requisitos específicos da ML350 no ADR-004 (cache de escrita BBWC/FBWC e inventário de controladora RAID) **não** se aplicam à C30; são substituídos por SMART, UPS e critérios acima.
- Documentos que apontavam a ML350 como alvo foram atualizados para referenciar este ADR; briefs históricos que a mencionam somente como exclusão foram preservados.

## Revisão ou reversão

Se a C30 reprovar no aceite, alternativas são upgrade de RAM/SSD conforme Plano Diretor §7, hardware substituto moderno ou solução gerenciada. Qualquer alternativa exige **novo ADR**. Não presumir retorno à ML350: ela nunca foi inventariada.
