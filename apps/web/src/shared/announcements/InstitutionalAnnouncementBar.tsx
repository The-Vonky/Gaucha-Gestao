import { useId } from "react";
import { Icon, type IconName } from "../icons";
import type { Announcement, AnnouncementType } from "./config";
import "./announcements.css";
const icons: Record<AnnouncementType, IconName> = {
  testing: "info", maintenance: "calendar", information: "info", critical: "warning",
};
/** GG-11 fornecerá o callback oficial; configuração pública sozinha não ativa ações. */
export type AnnouncementFeedback = (announcement: Announcement) => void;
export function InstitutionalAnnouncementBar({ announcement, onFeedback }: {
  announcement: Announcement;
  onFeedback?: AnnouncementFeedback;
}) {
  const id = useId();
  const unavailable = !announcement.action?.enabled || !onFeedback;
  return (
    <section className={`institutional-announcement announcement-${announcement.type}`} aria-label="Aviso institucional" tabIndex={0}>
      {announcement.showIcon && <Icon name={icons[announcement.type]} />}
      <div className="announcement-copy" role="status" aria-live="polite" aria-atomic="true">
        <strong>{announcement.title}</strong>{" "}
        <span>{announcement.message}</span>
      </div>
      {announcement.action && <div className="announcement-action">
        <button type="button" disabled={unavailable} aria-describedby={unavailable ? id : undefined}
          onClick={() => onFeedback?.(announcement)}>{announcement.action.label}</button>
        {unavailable && <span id={id} className="announcement-unavailable">Canal de feedback em breve — indisponível nesta versão.</span>}
      </div>}
    </section>
  );
}
