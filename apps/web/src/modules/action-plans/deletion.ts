import { client } from "../../core/client";
import { removeDeletionObjects } from "../../shared/storageDeletion";
import { db } from "./api";
import type { PendingPlanDeletion } from "./types";

export async function planDeleteImpact(id: string) {
  const { data, error } = await db().rpc("plan_delete_impact", { p_plan: id });
  if (error || !data) throw error ?? new Error();
  return data;
}

export async function beginPlanDeletion(id: string, snapshot: string, confirmation: string) {
  const { error } = await db().rpc("begin_plan_delete", {
    p_plan: id, p_snapshot: snapshot, p_confirmation: confirmation,
  });
  if (error) throw error;
}

export function resumePlanDeletion(id: string) {
  return removeDeletionObjects(client?.storage, async () => {
    const { data, error } = await db().rpc("plan_delete_state", { p_plan: id });
    if (error || !data) throw error ?? new Error();
    return data;
  }, async () => {
    const { error } = await db().rpc("finish_plan_delete", { p_plan: id });
    if (error) throw error;
  });
}

export async function pendingPlanDeletions(filter: { p_plan?: string; p_inspection?: string } = {}) {
  const rows: PendingPlanDeletion[] = [];
  const pageSize = 500;
  for (;;) {
    const { data, error } = await db().rpc("pending_plan_deletions", {
      ...filter, p_after_id: rows.at(-1)?.id,
    }).limit(pageSize);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
