import { client } from "../../core/client";
import { removeDeletionObjects } from "../../shared/storageDeletion";
import { privateImages } from "../../shared/privateImageCache";
import { db } from "./api";

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
  privateImages.clear();
}
export function resumeDeletion(id: string) {
  privateImages.clear();
  return removeDeletionObjects(client?.storage, async () => {
    const { data, error } = await db().rpc("inspection_delete_state", { p_inspection: id });
    if (error || !data) throw error ?? new Error();
    return data;
  }, async () => {
    const { error } = await db().rpc("finish_inspection_delete", { p_inspection: id });
    if (error) throw error;
  });
}
