import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../icons";
import { Modal } from "../ui";
import type { Announcement, AnnouncementType } from "./config";
import "./announcements.css";
const icons: Record<AnnouncementType, IconName> = {
  testing: "info", maintenance: "calendar", information: "info", critical: "warning", success: "success", general: "info",
};
export const announcementCategories: Record<AnnouncementType, string> = {
  testing: "Ambiente de testes", maintenance: "Manutenção / atenção", information: "Informação", critical: "Crítico / urgente", success: "Positivo", general: "Geral",
};
export function InstitutionalAnnouncementBar({ announcement }: { announcement: Announcement }) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const open = openedId === announcement.id;
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  return <>
    <section className={`institutional-announcement announcement-${announcement.type}${announcement.tone ? ` announcement-tone-${announcement.tone}` : ""}`} aria-label="Aviso institucional">
      {announcement.showIcon && <Icon name={icons[announcement.type]} />}
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">Comunicado: {announcement.title}. {announcement.message}</span>
      <button type="button" ref={trigger} className="announcement-read" aria-label={`Ler comunicado: ${announcement.title}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpenedId(announcement.id)}>
        <strong>{announcement.title}</strong>
        <span className="announcement-summary">{announcement.message}</span>
        <Icon name="chevronDown" />
      </button>
    </section>
    {open && <Modal title={announcement.title} onClose={() => setOpenedId(null)} closeOnBackdrop>
      <div className="announcement-detail">
        <p><strong>Categoria:</strong> {announcementCategories[announcement.type]}</p>
        <p className="announcement-message">{announcement.message}</p>
        {announcement.startsAt && <p>Início: <time dateTime={announcement.startsAt}>{new Date(announcement.startsAt).toLocaleString("pt-BR")}</time></p>}
        {announcement.endsAt && <p>Término: <time dateTime={announcement.endsAt}>{new Date(announcement.endsAt).toLocaleString("pt-BR")}</time></p>}
      </div>
    </Modal>}
  </>;
}
