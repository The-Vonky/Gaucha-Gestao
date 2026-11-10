import { useLayoutEffect, useRef, type ReactNode } from "react";
import { InstitutionalAnnouncementBar } from "../shared/announcements/InstitutionalAnnouncementBar";
import { useAnnouncement, type AnnouncementLoader } from "../shared/announcements/useAnnouncement";

/** Montado na fronteira autenticada, fora das rotas de módulos e do Core Auth. */
export function AnnouncementLayout({ children, loadConfig }: { children: ReactNode; loadConfig?: AnnouncementLoader }) {
  const announcement = useAnnouncement(loadConfig);
  const root = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = root.current!;
    const header = element.querySelector<HTMLElement>(".topbar");
    const previous = document.documentElement.style.getPropertyValue("--app-sticky-height");
    const measure = () => {
      const height = slot.current?.getBoundingClientRect().height ?? 0;
      element.style.setProperty("--announcement-height", `${height}px`);
      document.documentElement.style.setProperty("--app-sticky-height", `${height + (header?.getBoundingClientRect().height ?? 0)}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
        if (previous) document.documentElement.style.setProperty("--app-sticky-height", previous);
        else document.documentElement.style.removeProperty("--app-sticky-height");
      };
    }
    const observer = new ResizeObserver(measure);
    if (slot.current) observer.observe(slot.current);
    if (header) observer.observe(header);
    return () => {
      observer.disconnect();
      if (previous) document.documentElement.style.setProperty("--app-sticky-height", previous);
      else document.documentElement.style.removeProperty("--app-sticky-height");
    };
  }, [announcement, children]);
  return <div ref={root} className="authenticated-application" data-announcement={!!announcement}>
    <div className="announcement-slot" ref={slot}>
      {announcement && <InstitutionalAnnouncementBar announcement={announcement} />}
    </div>
    {children}
  </div>;
}
