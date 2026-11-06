# GG-02C — evidência executada em 06/11/2026

**Fase A local: PASS com limites abaixo. Fase B Google Drive: BLOCKED por aprovação humana anterior a OAuth.** Este resultado não comprova backup de dados empresariais, da C30 ou recuperação física em outro PC.

## Baseline e rastreabilidade

- Branch criada de `origin/main` **`1c704f84efa0650e6fbed3354fc7ab77e75fe73f`**; scripts ensaiados identificados por SHA-256, sem atribuir um SHA Git futuro à execução. O commit da entrega consta na PR. Não depende do merge de #106/#108.
- Python **3.14.4**, Linux x86_64, usuário sem root; `/tmp` tmpfs de ~5,9 GiB, ~5 GiB livres no pré-voo. Nenhum serviço global ou container criado/alterado. Docker somente leitura não acessível por permissão, sem necessidade para a POC.
- Restic **0.19.1**, bundle portátil GG-02B reutilizado e revalidado. Archive SHA-256 `f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c`.
- Rclone **1.76.0**, archive oficial GitHub SHA-256 `b00f00b3266c3764413afe599d3ec316f6f43b3e0ea8a0bc1d186d2133e46df7`, igual ao SHA256SUMS oficial e valor fixado no script. Sem validação GPG alegada.
- `lab.py`: SHA-256 `e12f4a8edcae2caa133cb45aaa5a347f2be322017f5f4c78e50e63482d4f35b1`.
- `fetch_tools.py`: SHA-256 `42f0f2f3d209bd04bb57adac07ef4ee5c2ae95baa1de1b4367c7e2fe8b660573`.

[Evidência JSON completa saneada](../../tests/labs/gg02c/results/20261106-execution.json): versões, procedência, argv/saídas/retornos de **20 comandos Restic**, logs Rclone, snapshots, medidas e seis manifestos restaurados. `<LAB>` e `<TOOLS>` substituem caminhos temporários privados, sem alterar métricas ou resultados. Senhas/configuração/binários/repos não foram publicados.

Comandos executados no código identificado pelos hashes acima:

```text
python3 tests/labs/gg02c/fetch_tools.py --restic-bundle /tmp/gg-02b-tools-<uuid-conferido>
python3 tests/labs/gg02c/test_safety.py
python3 tests/labs/gg02c/lab.py --tools /tmp/gg-02c-tools-<uuid-impresso>
```

## Matriz de resultados reais e bloqueios

| ID | Prova / critério | Resultado | Evidência ou limite |
| --- | --- | --- | --- |
| INT-01 | Procedência, checksum e execução das duas ferramentas portáteis | PASS | Versões reais e hashes no JSON; sem GPG |
| INT-02 | Restic v2 → Rclone stdio → filesystem local | PASS | init/backup/check/restore reais; sem TCP/conta Google |
| INT-03 | Dados + estrutura + manifesto + instruções na mesma captura | PASS | 7 arquivos v1 e 8 v2, exclusivamente fictícios |
| INT-04 | Senha incorreta recusada nos dois repos | PASS | `wrong-credential` e `wrong-secondary-credential`, exit **12** |
| INT-05 | Repetição inalterada sem novos blobs/trees | PASS | `data_blobs=0`, `tree_blobs=0`, `data_added_packed=0`; só snapshot novo |
| INT-06 | Delta pequeno e histórico preservado | PASS | Bloco de 4 KiB alterado em objeto de 16 MiB + 1 MiB novo, registro/manifesto atualizados |
| INT-07 | Restauração das três capturas do primário | PASS | 7+7+8 arquivos com lista, tamanho e SHA-256; versões antigas sem arquivo novo |
| INT-08 | Integridade integral primária | PASS | `check-primary --read-data`, exit 0 |
| INT-09 | Cópia completa cifrada com chave própria | PASS | init com chunker + `copy-secondary`, três snapshots |
| INT-10 | Restore secundário sem origem/primário/senha primária/cache | PASS lógico | Recursos selados 000; HOME/TMPDIR novos; só repo local secundário; 7+7+8 hashes |
| INT-11 | Integridade integral secundária offline | PASS lógico | `check-secondary-offline --read-data`, exit 0; mesmo host físico |
| INT-12 | Remote não configurado recusado | PASS | `missing-remote`, exit 1; **não** testa OAuth expirado |
| INT-13 | Destino indisponível, interrupção limitada e recuperação | PASS | Arquivo sintético impede backend; timeout 10,002724 s, código **124 do runner**; check e backups posteriores exit 0 |
| INT-14 | Senhas sintéticas ausentes dos logs; canário ausente nos repos | PASS | Varredura antes/depois do selamento, config local sem tokens; nenhuma auditoria criptográfica formal |
| INT-15 | Tempo, payload persistido e tamanho dos repos medidos | PASS local | Tabela abaixo; exclui overhead, locks transitórios e tráfego WAN |
| SAFE-01 | Testes negativos de guardas/ambiente/timeout | PASS | **20 testes** em `test_safety.py`, execução final registrada |
| DRV-01 | OAuth, quota real, envio e restore Google Drive | BLOCKED | Exigem próxima autorização antes de qualquer operação na conta |
| DRV-02 | Bytes WAN, retries API e falhas OAuth/quota reais | BLOCKED | Backend local não reproduz Google; amostras de stats não são total de upload |
| DR-01 | Cópia física em notebook/PC e senha recuperada fora do host | BLOCKED | Plano preparado; execução ficou no mesmo tmpfs |
| OPS-01 | PostgreSQL/Auth/roles/Storage consistentes, runtime e C30 | BLOCKED | Não autorizados nesta entrega; sem GO operacional |

**Total real de arquivos restaurados: 44** (22 em cada repo). Matriz não fecha GG-02/GG-03/O3/O4 nem homologação de produção. No ensaio final não houve FAIL inesperado; erros negativos são esperados e conferidos. A primeira execução falhou no limite geral, como registrado abaixo.

## Medidas do fixture, sem compressão

| Snapshot | Bytes lógicos restauráveis | Novos blobs cifrados (`data_added_packed`) | Novos objetos persistidos via Rclone | Repo acumulado | Tempo backup |
| --- | ---: | ---: | ---: | ---: | ---: |
| initial | 33.555.488 | 16.781.707 | 16.783.452 | 16.784.065 | 0,926705 s |
| unchanged | 33.555.488 | 0 | 455 | 16.784.520 | 0,604124 s |
| changed | 34.604.186 | 1.659.172 | 1.660.386 | 18.444.906 | 0,768175 s |

`new_persisted_object_bytes` soma tamanhos efetivos de novos objetos aceitos no destino, **não** soma dos arquivos de origem. Inclui pack/index/snapshot; a diferença entre `data_added_packed` e essa coluna é metadado persistido. Não inclui locks temporários, releituras, cabeçalhos ou retransmissões; nenhum objeto persistido anterior foi alterado. Repo inicial antes de backup: 613 bytes (config + chave cifrada).

As amostras Rclone da execução foram 8.664.770 / 799 / 1.665.403 bytes; **não representam total final nem upload WAN**. O encerramento do subprocesso pode ocorrer antes do próximo intervalo estatístico. Em particular, a amostra inicial é menor que os packs persistidos; interpretá-la como total enviado produziria conclusão incorreta. A medida exata disponível nesta fase é payload novo persistido no backend local. Total de tráfego do transporte/Google será medido separadamente na Fase B autorizada.

Secundário: **18.444.629 bytes**. Três conjuntos integrais lógicos somam **101.715.162 bytes**; repo primário final usa **81,87% menos** neste fixture determinístico com duplicata deliberada, sem compressão. Cada init gera chunker aleatório; o tamanho do delta pode variar em novas execuções. **Não extrapolar esse percentual nem o resultado GG-02B aos dumps/fotos/dados reais, retenção ou quota.**

Soma dos 20 comandos Restic: **25,893052 s**, incluindo os 10 s da falha simulada. Não é tempo total do programa/download/testes nem RTO. Tempos individuais de init/copy/check/restore estão no JSON; tempos em tmpfs não estimam WAN, HDD da C30 ou desempenho de notebook.

## Problemas encontrados e correções

1. Download sem rede: DNS indisponível no sandbox. Host `downloads.rclone.org`: HTTP 403 na tentativa com rede. Mirror **oficial** GitHub funcionou; SHA256SUMS conferido antes da execução. Sem contornar checksum ou instalar serviço global.
2. Destino indisponível induziu retries do backend até o limite de 120 s. [Registro da primeira falha](../../tests/labs/gg02c/results/20261106-first-failure.json), com hashes do código anterior; artefatos preservados. O cenário esperado agora tem limite de 10 s, encerra grupo de processos, registra timeout e exige recuperação subsequente. Os demais timeouts continuam falha de execução, sem manutenção automática de locks.
3. Stats Rclone periódicos não asseguram contagem final. Relatório distingue amostra, novos objetos efetivamente persistidos e tráfego WAN não medido; não declara zero envio por ausência de amostra.
4. Checkout compartilhado foi mudado pela frente AUD-IMG. Não houve edição de Auditoria/migrations nem troca de volta da branch. Commit GG-02C foi montado com índice separado e referência própria, preservando o trabalho concorrente.

## Verificações complementares e limites

Testes de segurança: destinos arbitrário/remoto/relativo/UUID inválido, symlinks na raiz/árvore/marcador, hardlink, FIFO, permissões abertas, marcador inválido, ambiente sem segredos herdados, evidência exclusiva, fixture adulterado, timeout e proibição de repo primário no modo secundário/comando proibido/repo arbitrário. Não criam infraestrutura nem apagam laboratórios.

AST Python, hashes dos scripts vs evidência, validação dos JSON/manifestos, links locais e `git diff --check` são registrados junto ao commit/PR. Não foram executados testes npm localmente (Node/npm ausentes no PATH), RLS, integração de banco, build, auditoria de dependências, dispositivos físicos, Google ou C30. A PR acompanha CI disponível, sem reutilizar o status da #108 como prova desta branch nem alterar Auditoria para obter verde.

Próxima decisão humana e procedimentos apenas preparados: [GG02C_RCLONE_DRIVE](GG02C_RCLONE_DRIVE_20261106.md). Não houve review formal `APPROVED`, segunda revisão humana, merge ou deploy atribuídos por inferência.
