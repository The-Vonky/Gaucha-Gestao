import { useEffect, useRef, useState, type FormEvent } from "react";
import { Notice } from "../../shared/ui";
import { roomMessage, rpc } from "./api";

type Contact = {
  room_id: string;
  responsible_name: string | null;
  extension: string | null;
  version: number;
};

export function RoomContact({ manage }: { manage: boolean }) {
  const [contact, setContact] = useState<Contact | null>();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [extension, setExtension] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  const editButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const showForm = manage && editing && !!contact;

  useEffect(() => {
    let current = true;
    rpc<Contact | null>("contact")
      .then((data) => {
        if (current) setContact(data);
      })
      .catch((e) => {
        if (current) {
          setContact(null);
          setError(roomMessage(e));
        }
      });
    return () => {
      current = false;
    };
  }, [revision]);

  useEffect(() => {
    if (showForm) nameInput.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      (editButton.current ?? title.current)?.focus();
    }
  }, [showForm]);

  function open() {
    setName(contact?.responsible_name ?? "");
    setExtension(contact?.extension ?? "");
    setEditing(true);
    setError("");
    setSuccess("");
  }

  function close() {
    restoreFocus.current = editing;
    setEditing(false);
    setError("");
  }

  function reload() {
    close();
    setConflict(false);
    title.current?.focus();
    setContact(undefined);
    setRevision((v) => v + 1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact || saving || conflict) return;
    setError("");
    setSaving(true);
    try {
      const result = await rpc<Contact>("save_contact", {
        p_room_id: contact.room_id,
        p_responsible_name: name.trim(),
        p_extension: extension.trim(),
        p_version: contact.version,
      });
      setContact(result);
      close();
      setSuccess("Contato atualizado.");
    } catch (e) {
      if ((e as { code?: string })?.code === "40001") {
        setConflict(true);
        setError(
          "O contato mudou desde que você abriu o formulário. Consulte os dados atuais antes de editar novamente.",
        );
      } else {
        setError(roomMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="room-panel room-contact"
      aria-labelledby="room-contact-title"
    >
      <div className="room-section-head">
        <div>
          <h2 id="room-contact-title" ref={title} tabIndex={-1}>
            Contato da sala
          </h2>
          {contact === undefined ? (
            <p role="status">Consultando contato…</p>
          ) : contact?.responsible_name ? (
            <dl className="room-contact-values">
              <div>
                <dt>Responsável</dt>
                <dd>{contact.responsible_name}</dd>
              </div>
              <div>
                <dt>Ramal</dt>
                <dd>{contact.extension}</dd>
              </div>
            </dl>
          ) : (
            !error && <p className="muted">Contato ainda não informado.</p>
          )}
        </div>
        {manage && contact && (
          <button
            type="button"
            ref={editButton}
            aria-expanded={showForm}
            aria-controls={showForm ? "room-contact-form" : undefined}
            disabled={saving}
            onClick={() => {
              if (showForm) close();
              else if (conflict) reload();
              else open();
            }}
          >
            Editar contato
          </button>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {(conflict || (error && !contact)) && (
        <button type="button" onClick={reload}>
          Consultar contato atualizado
        </button>
      )}
      {showForm && (
        <form id="room-contact-form" className="room-form" onSubmit={save}>
          <fieldset disabled={saving}>
            <div className="room-contact-fields">
              <label>
                Nome da responsável
                <input
                  ref={nameInput}
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Ramal
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{1,8}"
                  maxLength={8}
                  value={extension}
                  onChange={(e) => setExtension(e.target.value)}
                  aria-describedby="room-contact-extension-hint"
                />
                <small id="room-contact-extension-hint" className="muted">
                  De 1 a 8 dígitos.
                </small>
              </label>
            </div>
            <div className="actions">
              <button type="submit" className="primary" disabled={conflict}>
                {saving ? "Salvando…" : "Salvar contato"}
              </button>
              <button type="button" onClick={close}>
                Cancelar edição
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
