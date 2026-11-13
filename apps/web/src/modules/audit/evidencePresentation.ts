import type { ChecklistEvidence } from "./types";

export function evidenceName(original: string, index: number) {
  const extension = original.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
  return `Evidência ${index + 1}${extension}`;
}

export function compareEvidence(a: ChecklistEvidence, b: ChecklistEvidence) {
  return Date.parse(a.uploaded_at) - Date.parse(b.uploaded_at) ||
    a.uploaded_at.localeCompare(b.uploaded_at) || a.id.localeCompare(b.id);
}
