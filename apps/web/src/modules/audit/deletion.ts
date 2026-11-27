import { client } from "../../core/client";
import { privateImages } from "../../shared/privateImageCache";
import { db } from "./api";
import { imagePrefix } from "./evidenceImages";

export type DeleteImpact = {
  id: string;
  unit: string;
  date: string;
  responsible: string;
  status: "draft" | "finalized";
  snapshot: string;
  counts: {
    criteria: number; answered: number; observations: number;
    plans: number; pending: number; in_progress: number; completed: number; verified: number; inactive_sources: number;
    checklist_evidence: number; checklist_reservations: number; derivatives: number;
    execution_evidence: number; verification_evidence: number; plan_reservations: number; objects: number;
  };
};
export type DeleteState = {
  objects: { bucket: string; name: string }[];
  completed: boolean;
  reconcile: boolean;
};
export async function deletionImpact(id: string) {
  const { data, error } = await db().rpc("inspection_delete_impact", { p_inspection: id });
  if (error || !data) throw error ?? new Error();
  return data;
}
export async function pendingDeletions(unit: string) {
  const { data, error } = await db().rpc("pending_inspection_deletions", { p_unit: unit });
  if (error) throw error;
  return data ?? [];
}
export async function beginDeletion(id: string, snapshot: string, confirmation: string) {
  const { error } = await db().rpc("begin_inspection_delete", {
    p_inspection: id, p_snapshot: snapshot, p_confirmation: confirmation,
  });
  if (error) throw error;
}
export async function resumeDeletion(id: string): Promise<"completed" | "reconciliation"> {
  if (!client) throw new Error();
  privateImages.invalidateMatching(key => key.startsWith(imagePrefix(id)));
  let previous = "";
  for (;;) {
    const { data, error } = await db().rpc("inspection_delete_state", { p_inspection: id });
    if (error || !data) throw error ?? new Error();
    if (data.completed) return "completed";
    if (!data.objects.length) {
      if (data.reconcile) return "reconciliation";
      const result = await db().rpc("finish_inspection_delete", { p_inspection: id });
      if (result.error) throw result.error;
      return "completed";
    }
    const bucket = data.objects[0].bucket;
    const names = data.objects.filter(o => o.bucket === bucket).map(o => o.name);
    // Um 200 com lista vazia pode indicar revogação. O próximo estado vem do banco.
    const first = bucket + "/" + names[0];
    if (previous === first) throw new Error();
    previous = first;
    const removed = await client.storage.from(bucket).remove(names);
    if (removed.error) throw removed.error;
  }
}
