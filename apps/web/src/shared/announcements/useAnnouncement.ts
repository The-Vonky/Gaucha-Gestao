import { useEffect, useState } from "react";
import { loadAnnouncementConfig, selectAnnouncement, type AnnouncementConfig } from "./config";

export function useAnnouncement() {
  const [config, setConfig] = useState<AnnouncementConfig | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let disposed = false;
    let request: AbortController | null = null;
    let lastRequest = -Infinity;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || request || Date.now() - lastRequest < 5000) return;
      lastRequest = Date.now();
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 10000);
      let next: AnnouncementConfig | null = null;
      try { next = await loadAnnouncementConfig(request.signal); } catch { /* Ausência, falha ou JSON inválido ocultam a barra. */ }
      finally { window.clearTimeout(timeout); request = null; }
      if (!disposed) {
        setConfig(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        setNow(Date.now());
      }
    };
    const resume = () => { setNow(Date.now()); void refresh(); };
    void refresh();
    const interval = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 60000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  useEffect(() => {
    const boundary = config?.enabled ? config.announcements.filter(item => item.enabled)
      .flatMap(item => [item.startsAt, item.endsAt])
      .filter((value): value is string => value !== null)
      .map(Date.parse).filter(time => time > now).sort((a, b) => a - b)[0] : undefined;
    if (boundary === undefined) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.min(boundary - Date.now(), 2147483647));
    return () => window.clearTimeout(timeout);
  }, [config, now]);
  return selectAnnouncement(config, now);
}
