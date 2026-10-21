# Evidências por item de checklist — Auditoria v1

**Estado histórico:** integrado à `main` na PR #11, commit de merge `c3f135f6026899362e1edacda3e97e922528ac8e`; migration `supabase/migrations/20260930114000_audit_checklist_evidence_v1.sql`. Este contrato registra **o que foi implementado e validado no repositório**, não homologação completa da Qualidade nem prontidão de produção.

Consulte [matriz de conclusão](QUALITY_COMPLETION_V1.md) e [gates](../../architecture/FOUNDATION_GATES.md) para pendências operacionais.

## Contrato

A Auditoria é proprietária de `audit.checklist_evidence` e do bucket privado `audit-checklist-evidence`. FK composta **imutável** vincula arquivo a uma resposta real `(inspection_id, item_key)`. Servidor gera chaves `<inspection_uuid>/<evidence_uuid>`, sem nome do usuário nem extensão. Auditoria **não depende** de Planos de Ação; ambos reutilizam validador neutro de arquivos em Shared.

| RPC | Contrato |
| --- | --- |
| `begin_checklist_evidence_upload(p_inspection,p_item_key,p_original_name,p_content_type,p_size)` | Autoriza rascunho/edição, valida metadados, reserva slot pendente; retorna ID/chave criados pelo servidor |
| `confirm_checklist_evidence_upload(p_evidence)` | Apenas uploader, pendência válida, **mesma versão de lifecycle**, em rascunho/edição; compara owner, size e MIME do Storage |
| `checklist_evidence(p_inspection,p_item_key default null)` | Apenas registros disponíveis, com leitura do pai; item nulo devolve inspeção inteira |
| `remove_checklist_evidence(p_evidence)` | Remoção lógica em rascunho/edição; bytes permanecem; repetição não duplica evento |
| `checklist_evidence_pending_count(p_inspection)` | Alerta agregado ao leitor autorizado; não expõe IDs/chaves/nomes pendentes |
| `finalize_inspection(p_id,p_version,p_expected_evidence_ids)` | IDs obrigatórios para inspeção inteira, normalizados/únicos e comparados com bloqueio do pai; divergência retorna `40001`; overload antigo de dois parâmetros removido |

Array esperado **vazio é válido**. Pontuação e completude não mudam. Finalização bem-sucedida registra IDs disponíveis aceitos; nova finalização após reabertura adiciona evento, mantendo os anteriores. `begin`, erro e tentativa novamente **não** geram evento de evidência de negócio; confirmação e remoção bem-sucedidas geram eventos `module=audit`, `entity=checklist_evidence`, com metadados seguros, **sem bytes, object keys, URLs assinadas ou credenciais**.

## Acesso, versão e ciclo de vida

| Chamador | Listar/assinar/download | Iniciar/enviar/confirmar/remover |
| --- | --- | --- |
| Grant global ativo | Permissão de leitura; rascunho/finalizada | Permissão de edição; somente rascunho |
| Grant ativo da unidade correta | Igual | Igual |
| Unidade errada ou grant somente setorial | Negado | Negado |
| Anônimo, perfil inativo ou sem grant | Negado | Negado |

Confirmação exige também ser **o uploader original**. Qualquer editor autorizado pode remover evidência disponível. ID inexistente e inacessível não dão direito nem revelam existência.

**Ordem de locks para mutação:** inspeção `FOR UPDATE` → locks determinísticos de autorização Core → linha de evidência. Evidência não trava nem atualiza explicitamente uma resposta; FK composta aplica somente seu lock `KEY SHARE` implícito e compatível.

Reabertura preserva evidências disponíveis/removidas e não concede novas capacidades. Editores podem mudar o conjunto atual. Upload pendente iniciado antes de finalizar/reabrir **perde validade**: iniciar nova tentativa. Pendência expira em uma hora.

**Cotas:** até 10 ativos por critério e 100 por inspeção; disponíveis + pendentes válidos contam; removidos/expirados não. Tamanho entre 1 e **10.485.760 bytes**. Tipos JPG/JPEG, PNG, PDF, XLSX, DOCX; MIME canônico e basename em Unicode NFC impostos pelo SQL.

## Storage e cliente

Browser usa JWT da pessoa com `upsert:false` e `cacheControl:'0'`. INSERT exige reserva pendente válida do próprio uploader, rascunho, lifecycle atual, permissão de edição e operação Storage correta. Copiar para chave pendente alheia é negado. Cliente não tem UPDATE/DELETE, upsert, move ou copy. SELECT requer evidência disponível e leitura autorizada.

Download cria URL assinada por **60 segundos**, confere endpoint real de bytes e usa âncora `download`, sem popup ou persistir URL. Objeto ausente produz feedback explícito. Links já emitidos podem continuar utilizáveis até expirar o TTL.

Na UI de Auditoria, cada critério mostra nome original/tipo/tamanho/uploader/hora, envio unitário, estado enviando/confirmando/erro/tentativa novamente, diálogo de remoção e modo somente leitura quando finalizada. **Os bytes originais são preservados, sem preview inline.** Nomes longos quebram linha.

Ao finalizar, a UI carrega snapshot congelado da inspeção completa, avisa uploads pendentes, vincula revisão ao pai/versão e exige recarregar/conferir em caso de conflito de evidências.

## Risco residual E3 — exatamente como aprovado

Verificação de *magic bytes* no cliente é contornável. Assinatura ZIP não distingue XLSX, DOCX, macros ou arquivos ZIP arbitrários. SQL/bucket/confirmação validam **metadados**, mas **não** existe parser confiável dos bytes no servidor, antivírus ou sanitização. Tratar anexos como não confiáveis.

EXIF/GPS original é preservado (não extraído); UI alerta para isso. Não foi adicionada conversão HEIC, quarentena nem infraestrutura antimalware.

O aceite aprovado exige uploader autenticado, escopo e auditoria, download por anexo, origem API isolada, MIME canônico não ativo, ausência de preview, cabeçalhos `nosniff`/`no-cache` produtivos e proteção no endpoint. **Testes de repo não provam cabeçalhos/cache em produção.**

## Reconciliação e recuperação

Somente operador (sem permissão concedida a papéis app) acessa `audit_private.checklist_evidence_reconciliation()`, que aponta pendências expiradas com/sem objeto, linhas disponíveis sem metadados Storage e objetos órfãos. Operador também deve verificar **bytes físicos** via Storage API: linhas SQL correspondentes não provam arquivo existente.

Backup exige linhas de evidência, log Core, metadados Storage e **cópias independentes dos objetos**. Restaurar DB ao instante T e objetos de cópia em T ou **posterior**, reconciliar em isolamento e testar downloads autorizados reais e negação cross-unit. A cópia dos objetos precisa preservar arquivos fisicamente removidos depois de T durante a janela de recuperação do banco.

A fixture de integração testa perda/restauração de arquivo, **não** backup produtivo completo.

**Sem expurgo automático, prazo de retenção ou agendamento de reconciliação.** Remoção física futura depende de autorização humana registrada, exclusão via Storage API e evento seguro de operação. **Nunca** excluir linhas de `storage.objects` diretamente por SQL. Responsável deve definir separação de acesso ao backup, retenção, RPO/RTO medidos, monitoramento, restore e expurgo antes do release.

## Evidências de validação e aceite pendente

`tests/audit-evidence-database.test.ts` (SQL/PGlite); testes cliente/UI (regras de arquivo, transporte e revisão integral do conjunto); `tests/integration/audit-evidence.mjs` (Supabase/Chromium descartável com JWT real, bytes Storage, bypass, concorrência de duas sessões, reconciliação/restauração, desktop e 375px, upload/download/retry/teclado/overflow).

Desenvolvimento inicial usou somente conector autenticado do GitHub. Revisão independente posterior rodou typecheck, lint, testes unitários, build, verify:build, `npm audit --omit=dev` e seis suítes de integração em Supabase descartável com Chromium; sem projeto remoto vinculado ou produção.

**CI histórica:** PR #11 HEAD `132771d54b0eae3781d72fb11746b12f28a84f0e` aprovado no run `36720376966`, tentativa 2. Após merge, run `36728754202` aprovado em `c3f135f6026899362e1edacda3e97e922528ac8e`: typecheck, lint, **18 arquivos / 215 testes**, build, verify:build, audit sem vulnerabilidades e seis integrações, inclusive Checklist Evidence Storage/Chromium.

Essa contagem é **histórica**, não a suíte atual. Nenhum teste em projeto remoto/produção foi executado. Homologação em aparelhos físicos **iOS Safari e Android Chrome**, incluindo câmera/galeria/arquivos/download, ainda não foi registrada. **Qualidade não é declarada 100%; PROD permanece NO-GO**.
