import { useEffect, useRef, useState } from "react";
import { loadAnnouncementConfig, selectAnnouncement, type AnnouncementConfig } from "./config";

export type AnnouncementLoader = (signal: AbortSignal) => Promise<AnnouncementConfig | null>;
export function useAnnouncement(loadConfig: AnnouncementLoader = loadAnnouncementConfig) {
  const offset = useRef(0);
  const [config, setConfig] = useState<AnnouncementConfig | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let disposed = false;
    setConfig(null);
    let request: AbortController | null = null;
    let lastRequest = -Infinity;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || request || Date.now() - lastRequest < 5000) return;
      lastRequest = Date.now();
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 10000);
      let next: AnnouncementConfig | null = null;
      try { next = await loadConfig(request.signal); } catch { /* Ausência, falha ou JSON inválido ocultam a barra. */ }
      finally { window.clearTimeout(timeout); request = null; }
      if (!disposed) {
        offset.current = next?.serverNow !== undefined ? next.serverNow - Date.now() : 0;
        setConfig(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        setNow(Date.now() + offset.current);
      }
    };
    const resume = () => { setNow(Date.now() + offset.current); void refresh(); };
    void refresh();
    const interval = window.setInterval(() => { setNow(Date.now() + offset.current); void refresh(); }, 60000);
    const invalidate = () => { lastRequest = -Infinity; resume(); };
    window.addEventListener("focus", resume);
    window.addEventListener("announcements:refresh", invalidate);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", resume);
      window.removeEventListener("announcements:refresh", invalidate);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [loadConfig]);
  useEffect(() => {
    const boundaries = config?.enabled ? config.announcements.filter(item => item.enabled)
      .flatMap(item => [item.startsAt, item.endsAt])
      .filter((value): value is string => value !== null)
      .map(Date.parse).filter(time => time > now).sort((a, b) => a - b) : [];
    if (config?.nextRefreshAt && config.nextRefreshAt > now) boundaries.push(config.nextRefreshAt);
    const boundary = boundaries.sort((a, b) => a - b)[0];
    if (boundary === undefined) return;
    const timeout = window.setTimeout(() => {
      setNow(Date.now() + offset.current);
      if (config?.serverNow !== undefined) window.dispatchEvent(new Event("announcements:refresh"));
    }, Math.min(Math.max(0, boundary - Date.now() - offset.current), 2147483647));
    return () => window.clearTimeout(timeout);
  }, [config, now]);
  return selectAnnouncement(config, now);
}
