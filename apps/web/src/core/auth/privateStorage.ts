import { client } from "../client";
import { privateImages } from "../../shared/privateImageCache";

type Transform = {
  width: number;
  height: number;
  resize: "contain";
  quality: number;
  format: "origin";
};

export async function fetchPrivateObject(bucket: string, key: string, signal?: AbortSignal, transform?: Transform) {
  const token = (await client?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Sessão indisponível. Entre novamente.");
  const path = key.split("/").map(encodeURIComponent).join("/");
  const route = transform ? "render/image/authenticated" : "object/authenticated";
  const url = new URL(`/storage/v1/${route}/${bucket}/${path}`, import.meta.env.VITE_SUPABASE_URL);
  if (transform) {
    for (const [name, value] of Object.entries(transform)) url.searchParams.set(name, String(value));
  }
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal,
  });
}

export async function downloadPrivateObject(bucket: string, key: string, name: string) {
  const epoch = privateImages.getAccessVersion();
  const response = await fetchPrivateObject(bucket, key);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Arquivo indisponível.");
  }
  const blob = await response.blob();
  if (epoch !== privateImages.getAccessVersion()) throw new Error("A sessão mudou. Tente novamente.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function privateCoverUrl(bucket: string, key: string, ttlMs: number) {
  const cacheKey = `${bucket}:${key}`;
  await privateImages.load(cacheKey, async (signal) => {
    const expiresAt = Date.now() + ttlMs;
    const response = await fetchPrivateObject(bucket, key, signal);
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/jpeg") {
      await response.body?.cancel();
      throw new Error("Foto indisponível.");
    }
    return { blob: await response.blob(), expiresAt };
  });
  return privateImages.peek(cacheKey);
}
