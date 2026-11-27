import type { SupabaseClient } from "@supabase/supabase-js";

export type DeletionResult = "completed" | "reconciliation";
export type DeleteState = {
  objects: { bucket: string; name: string }[];
  completed: boolean;
  reconcile: boolean;
};

export async function removeDeletionObjects(
  storage: SupabaseClient["storage"] | undefined,
  state: () => Promise<DeleteState>,
  finish: () => Promise<void>,
): Promise<DeletionResult> {
  if (!storage) throw new Error();
  let previous = "";
  for (;;) {
    const data = await state();
    if (data.completed) return "completed";
    if (!data.objects.length) {
      if (data.reconcile) return "reconciliation";
      await finish();
      return "completed";
    }
    const bucket = data.objects[0].bucket;
    const names = data.objects.filter(o => o.bucket === bucket).map(o => o.name);
    // Um 200 com lista vazia pode indicar revogação. O próximo estado vem do banco.
    const first = bucket + "/" + names[0];
    if (previous === first) throw new Error();
    previous = first;
    const removed = await storage.from(bucket).remove(names);
    if (removed.error) throw removed.error;
  }
}
