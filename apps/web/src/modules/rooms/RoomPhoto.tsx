import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../core/client";
import { useAuth } from "../../core/auth/AuthProvider";
import {
  COVER_ACCEPT,
  COVER_FORMATS_HINT,
  CoverImageError,
  prepareCoverImage,
  type PreparedCover,
} from "../../core/unitCoverImage";
import { Modal, Notice } from "../../shared/ui";
import { rpc, roomMessage } from "./api";
export type RoomCover = {
  version: number;
  asset_id: string | null;
  object_key: string | null;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  url?: string;
};
const BUCKET = "room-covers";
export async function readRoomCover(): Promise<RoomCover> {
  const cover = await rpc<RoomCover>("cover");
  if (!cover) throw new Error("Sala indisponível.");
  if (cover.object_key && client) {
    const signed = await client.storage
      .from(BUCKET)
      .createSignedUrl(cover.object_key, 300);
    // A foto é decorativa; falha de assinatura mantém metadata para remoção/substituição.
    if (!signed.error && signed.data?.signedUrl)
      cover.url = signed.data.signedUrl;
  }
  return cover;
}
export async function uploadRoomCover(
  image: PreparedCover,
  version: number,
  x: number,
  y: number,
) {
  if (!client) throw new Error("Ambiente indisponível.");
  const asset = await rpc<{ asset_id: string; object_key: string }>(
    "begin_cover_upload",
    {
      p_byte_size: image.blob.size,
      p_width: image.width,
      p_height: image.height,
      p_mime_type: "image/jpeg",
    },
  );
  try {
    const result = await client.storage
      .from(BUCKET)
      .upload(asset.object_key, image.blob, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "300",
      });
    if (result.error)
      throw new Error("Não foi possível enviar a foto. Tente novamente.");
    await rpc("save_cover", {
      p_action: "confirm",
      p_asset: asset.asset_id,
      p_version: version,
      p_x: x,
      p_y: y,
    });
  } catch (error) {
    // Não mascara a falha original. Um envio já confirmado nunca é removido por cancelamento.
    await rpc("save_cover", {
      p_action: "cancel",
      p_asset: asset.asset_id,
      p_version: version,
    }).catch(() => {});
    throw error;
  }
}
export function RoomPhoto({
  manager,
  read,
}: {
  manager: boolean;
  read: boolean;
}) {
  const auth = useAuth();
  // Estado somente em memória, vinculado ao principal e às permissões atuais.
  const access = JSON.stringify([
    auth.session?.user.id,
    auth.profile?.active,
    auth.grants,
  ]);
  return read ? <Photo key={access} manager={manager} /> : null;
}
function Photo({ manager }: { manager: boolean }) {
  const [cover, setCover] = useState<RoomCover>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await readRoomCover();
      if (current === sequence.current) {
        setCover(result);
        setError("");
        setFailedUrl(undefined);
      }
    } catch (e) {
      if (current === sequence.current) {
        setCover(undefined);
        setError(roomMessage(e));
      }
    }
  }, []);
  useEffect(() => {
    void reload();
    const visible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = window.setInterval(visible, 240000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      sequence.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);
  return (
    <>
      {cover?.url && failedUrl !== cover.url && (
        <img
          className="room-hero-photo"
          src={cover.url}
          alt=""
          style={{
            objectPosition: `${cover.position_x}% ${cover.position_y}%`,
          }}
          onError={() => setFailedUrl(cover.url)}
        />
      )}
      {manager && (
        <button className="room-photo-action" onClick={() => setEditing(true)}>
          Alterar foto da sala
        </button>
      )}
      {editing &&
        manager &&
        (cover ? (
          <RoomCoverEditor
            initial={cover}
            onClose={() => setEditing(false)}
            onChanged={() => {
              setEditing(false);
              void reload();
            }}
          />
        ) : (
          <Modal title="Foto da sala" onClose={() => setEditing(false)}>
            <Notice error={!!error}>{error || "Carregando foto…"}</Notice>
            <button onClick={() => void reload()}>Tentar novamente</button>
          </Modal>
        ))}
    </>
  );
}
export function RoomCoverEditor({
  initial,
  onClose,
  onChanged,
}: {
  initial: RoomCover;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<{ image: PreparedCover; url: string }>();
  const [x, setX] = useState(initial.position_x);
  const [y, setY] = useState(initial.position_y);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  useEffect(
    () => () => {
      if (draft) URL.revokeObjectURL(draft.url);
    },
    [draft],
  );
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof CoverImageError ? e.message : roomMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const shown = draft?.url ?? initial.url;
  return (
    <Modal title="Foto da sala" onClose={onClose} busy={busy}>
      <div className="cover-editor room-cover-editor">
        <div className="cover-frame cover-frame-hero">
          {shown ? (
            <img
              src={shown}
              alt="Prévia da foto da sala"
              style={{ objectPosition: `${x}% ${y}%` }}
            />
          ) : (
            <p>O banner usa o fundo institucional.</p>
          )}
        </div>
        <label>
          Arquivo da foto da sala
          <input
            type="file"
            accept={COVER_ACCEPT}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void run(async () => {
                  const image = await prepareCoverImage(file);
                  setDraft({ image, url: URL.createObjectURL(image.blob) });
                  setX(50);
                  setY(50);
                });
            }}
          />
        </label>
        <p>
          {COVER_FORMATS_HINT} Conversão JPEG e remoção de metadados antes do
          envio. O original não é armazenado.
        </p>
        {shown && (
          <fieldset className="cover-framing" disabled={busy}>
            <legend>Enquadramento</legend>
            <label>
              Posição horizontal
              <input
                type="range"
                min="0"
                max="100"
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
              />
            </label>
            <label>
              Posição vertical
              <input
                type="range"
                min="0"
                max="100"
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
              />
            </label>
            <button
              onClick={() => {
                setX(50);
                setY(50);
              }}
            >
              Centralizar
            </button>
          </fieldset>
        )}
        {error && <Notice error>{error}</Notice>}
        {busy && <p role="status">Processando foto…</p>}
        <div className="actions">
          <button disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          {initial.asset_id && !draft && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Remover a foto da sala? O fundo institucional será exibido.",
                  )
                )
                  void run(async () => {
                    await rpc("save_cover", {
                      p_action: "remove",
                      p_asset: initial.asset_id,
                      p_version: initial.version,
                    });
                    onChanged();
                  });
              }}
            >
              Remover foto
            </button>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              (!draft &&
                (!initial.asset_id ||
                  (x === initial.position_x && y === initial.position_y)))
            }
            onClick={() =>
              void run(async () => {
                if (draft)
                  await uploadRoomCover(draft.image, initial.version, x, y);
                else
                  await rpc("save_cover", {
                    p_action: "position",
                    p_asset: initial.asset_id,
                    p_version: initial.version,
                    p_x: x,
                    p_y: y,
                  });
                onChanged();
              })
            }
          >
            {draft ? "Salvar foto" : "Salvar enquadramento"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
