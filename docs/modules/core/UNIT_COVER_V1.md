# Capa de unidade v1 — contrato de implementação e operação

**Estado histórico:** implementado na branch `feat/unit-cover-v1` (baseline `74daf5de241c512210a4145c49083d420fff4779`). **Não homologado para produção:** requisitos operacionais abaixo continuam abertos.

## Propriedade

A capa de unidade é capacidade **Core/Unidade**. O Core detém dados, bucket privado, RPCs, processamento da imagem e gestão em Administração. Módulos de negócio (Auditoria) só consomem `core.unit_covers` pelo `apps/web/src/core/unitCovers.ts`/`useUnitCovers`; nunca enviam, assinam ou decidem a propriedade. Sem capa atual pronta/autorizada, UI usa monograma/cor existentes.

## Modelo de dados — migration `20261007120000_core_unit_cover_v1.sql`

- `core.units` (aditivo): `cover_asset_id uuid null`, `cover_position_x numeric(5,2) default 50`, `cover_position_y numeric(5,2) default 50`; valores de posição entre **0–100**.
- `core.unit_cover_assets`: `id`, `unit_id`, `object_key = units/<unit>/covers/<asset>.jpg` gerada, `status` (`pending → ready → retired → purged`, ou `pending → retired`); apenas `image/jpeg`; `byte_size` 1 B–1 MiB; `width/height` 1–2560; `created_by/created_at/ready_at/retired_by/retired_at/purged_at`. CHECK relaciona datas/estado; trigger imutabiliza identidade/metadados e só aceita transições indicadas.
- FK composta `core.units(id, cover_asset_id) → core.unit_cover_assets(unit_id, id)` impede referência a asset de outra unidade.
- Triggers de constraint **deferred no commit** exigem capa referenciada `ready` e que todo `ready` seja capa atual de sua unidade (no máximo uma). Substituição aposenta capa anterior, confirma nova e muda ponteiro em **uma transação**.
- `core.unit_cover_assets` sem grants da Data API (RLS ativo). Clientes não escrevem novas colunas de `core.units`.

## Autorização

| Operação | Requisito |
| --- | --- |
| `begin/confirm/cancel/remove/set position` | `admin.unit.manage` sobre a unidade (global ou unit), revogação conferida **depois** de travar linha |
| `confirm/cancel` | Também ser o próprio uploader (`created_by`) do asset pendente |
| leitura em lote / Storage SELECT / assinatura | `core.unit_cover.read` **ou** `admin.unit.manage` na unidade; apenas capa atual `ready` |

A migration inclui `core.unit_cover.read` nos papéis de sistema `platform_administrator`, `quality`, `quality_viewer`. Papéis customizados **não** mudam automaticamente. Grant somente setorial não dá leitura de capa da unidade inteira. IDs ausentes e não autorizados recebem o mesmo `42501`.

## Contrato RPC — schema `core`

| RPC | Invariante |
| --- | --- |
| `begin_unit_cover_upload(p_unit, p_mime_type, p_byte_size, p_width, p_height)` | Retorna `asset_id, object_key`; valida limites; no máximo **5 uploads pendentes válidos (<1h)** por unidade |
| `confirm_unit_cover_upload(p_unit, p_asset, p_position_x, p_position_y)` | Asset pendente/válido do uploader naquela unidade; Storage deve existir com owner=chamador, tamanho e MIME JPEG iguais; aposenta anterior, define enquadramento; repetição após sucesso é no-op |
| `cancel_unit_cover_upload(p_asset)` | `pending → retired`, idempotente; capa confirmada não é cancelável |
| `remove_unit_cover(p_unit, p_expected_asset)` | Aposenta atual e redefine posição 50/50; outra capa atual retorna `40001`; já removida é no-op |
| `set_unit_cover_position(p_unit, p_expected_asset, p_x, p_y)` | x/y 0–100; asset antigo/ausente retorna `40001` |
| `unit_covers(p_units uuid[])` | 0–100 IDs por lote (`22023` fora do limite); devolve somente autorizado `ready`: `unit_id, asset_id, object_key, position_x, position_y, width, height, ready_at`; **nunca URL** |

Diferenças em relação ao brief histórico: `confirm` inclui `p_unit` para ownership explícito e posições para a capa nascer enquadrada atomicamente; `remove/set_position` incluem `p_expected_asset` por concorrência otimista. `confirm` usa **last-writer-wins**: upload novo autorizado substitui capa atual.

Eventos de lifecycle ficam em `core.system_audit_log`, sem object key: `module=core`, `entity_type=unit_cover_assets`, ações `cover_upload_begin`, `cover_ready`, `cover_cancel`, `cover_retire`, `cover_purge`. Ponteiro/enquadramento são auditados pelo trigger existente de `core.units`.

## Storage e URLs assinadas

Bucket privado `unit-covers`: `public=false`, `file_size_limit=1048576`, `allowed_mime_types={image/jpeg}`.

INSERT apenas na chave pendente vigente do uploader autorizado, usando operação de upload. SELECT/assinatura somente da capa atual pronta e legível. **Sem UPDATE/DELETE cliente:** proibidos overwrite, upsert, move, copy ou exclusão cliente.

Aposentar/remover impede **novas** assinaturas, mas URL assinada já entregue é **bearer token válido até TTL** (aproximadamente 300 s). Clientes invalidam cache imediatamente ao descobrir a mudança. Arquivo original do usuário não é armazenado.

## Cliente e interface

- `core/unitCoverImage.ts` / `prepareCoverImage`: aceita JPEG/PNG/WebP pelos **magic bytes** (ignora extensão/MIME declarado), até **8 MiB de entrada**; lê dimensões pré-decode e recusa lados >16.384 px ou >40 MP. Aplica orientação EXIF, achata transparência em branco, gera JPEG ≤2560 px no lado maior, alvo ≤512 KiB e máximo absoluto 1 MiB. Reconversão remove EXIF/GPS. Erros mostram mensagem clara em pt-BR e não enviam arquivo.
- `core/unitCovers.ts`: `begin → upload Storage (upsert:false) → confirm`; falha depois de `begin` cancela asset pendente. Leitura `resolveUnitCovers` faz **uma RPC + uma chamada `createSignedUrls`** para até 100 unidades, TTL 300 s, cache **somente memória**, renovado 60 s antes da expiração e após invalidação; requisições simultâneas são compartilhadas.
- Cache ligado ao contexto de acesso do `AuthProvider` (usuário, `active`, grants). Entrar/sair/trocar usuário/mudar grants limpa cache, oculta capas e invalida respostas em voo. Invalidação por unidade impede resposta antiga de restaurar capa substituída/removida.
- `useUnitCovers` montado renova apenas URLs vencendo, em lote. Falha de imagem tenta nova assinatura em lote; se a nova URL falhar em 30 s, usa fallback até próxima renovação, evitando loop de erro.
- Administração (`Unidades → Capa`): prévia do cartão e página (`object-fit:cover`, `object-position:x% y%`), descrição, sliders 0–100 acessíveis por teclado, adicionar/substituir/salvar/cancelar/remover com confirmação, estados preparando/enviando/confirmando e proteção de save único. Input sem atributo `capture`, mantendo câmera/galeria/arquivos do dispositivo.
- Auditoria: `UnitCover` mostra foto no slot com scrim/sombra para legibilidade e fallback da marca; lista resolve todas as unidades em lote, página da unidade apenas a atual.

## Operação, reconciliação e retenção

Apenas operador (sem grant cliente) pode consultar `select * from private.unit_cover_reconciliation();`, que informa `expired_pending`, `retired_object_retained`, `ready_missing_object`, `orphan_object`.

**Expurgo físico desabilitado.** Nenhum apagamento automático/cliente. Objetos retired/órfãos ficam guardados até definir retenção efetiva ≥ `max(7 dias, janela de recuperação operacional)`. Como a janela ainda não foi definida, exclusão física exige decisão posterior e runbook auditado via **Storage API com credenciais protegidas**, seguido de estado `purged` e `purged_at`; isso **não foi implementado nesta versão**.

## Gates operacionais pendentes

1. Servir capa com `X-Content-Type-Options: nosniff` em ambiente real. Storage Supabase local **não** retorna o header (teste de integração). Configurar/comprovar gateway/proxy de implantação real.
2. Servidor **não decodifica pixels**; confere metadata/type/size/owner, limites de dimensão declarados e chave canônica. Dimensão declarada pelo cliente não é atestado do conteúdo. Tratar arquivo como não confiável; servir `image/jpeg` privado por URL curta.
3. Backup deve incluir bucket `unit-covers` e `core.unit_cover_assets`; restaurar metadados/bytes consistentemente.
4. Homologação manual Android Chrome/iOS Safari câmera/galeria e comportamento HEIC **não coberta pela automação**.

## Validação versionada

- `tests/unit-cover-database.test.ts`: schema, FKs/CHECKs, grants (incluindo papel customizado pré-migration), negações, lifecycle, limites, isolamento, predicados Storage, reconciliação e log.
- `tests/unit-cover-image.test.ts`, `unit-cover-client.test.ts`, `unit-cover-admin.test.tsx`, `unit-cover-audit.test.tsx`: preparação, cache/lotes, UI e consumo sem N+1.
- `tests/integration/unit-cover.mjs`: Supabase local real Auth/PostgREST/Storage, upload, limites, upsert negado, assinatura com TTL 300, bytes idênticos, acesso cross-unit negado, aposentadoria/remoção.

Esses testes são evidência de repositório/laboratório; **não liberam PROD**.
