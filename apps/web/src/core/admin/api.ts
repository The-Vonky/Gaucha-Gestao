import { database } from "../client";
import type { Assignment, Organization, Role, RowMap } from "../types";
export const PAGE_SIZE = 25;
export async function list<K extends keyof RowMap>(table: K, page = 0) {
  let query = database()
    .from(table)
    .select("*", { count: "exact" })
    .order(
      table === "permissions"
        ? "key"
        : table === "system_audit_log"
          ? "occurred_at"
          : table === "unit_sectors"
            ? "unit_id"
            : table === "role_permissions"
              ? "role_id"
              : "id",
      { ascending: table !== "system_audit_log" },
    );
  if (table === "role_permissions") query = query.order("permission_key");
  if (table === "unit_sectors") query = query.order("sector_id");
  if (table === "system_audit_log")
    query = query.order("id", { ascending: false });
  const { data, error, count } = await query.range(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE - 1,
  );
  if (error) throw error;
  return { rows: data as unknown as RowMap[K][], count: count ?? 0 };
}
export async function all<K extends keyof RowMap>(
  table: K,
): Promise<RowMap[K][]> {
  const rows: RowMap[K][] = [];
  for (let page = 0; ; page++) {
    const result = await list(table, page);
    rows.push(...result.rows);
    if (rows.length >= result.count || !result.rows.length) return rows;
  }
}
export async function saveOrganization(
  table: "units" | "sectors",
  row: Organization | null,
  values: { code: string; name: string; active: boolean },
) {
  const query = row
    ? database()
        .from(table)
        .update(values)
        .eq("id", row.id)
        .eq("version", row.version)
    : database().from(table).insert(values);
  const { error } = await query.select("id").single();
  if (error) throw error;
}
export async function users(
  page: number,
  filters: { search: string; inactive: boolean },
) {
  let query = database()
    .from("profiles")
    .select("*", { count: "exact" })
    .order("display_name")
    .order("id");
  // LIKE wildcards typed by the user are matched literally.
  const search = filters.search.replace(/[\\%_]/g, (c) => `\\${c}`);
  if (search) query = query.ilike("display_name", `%${search}%`);
  if (!filters.inactive) query = query.eq("active", true);
  const { data, error, count } = await query.range(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE - 1,
  );
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}
export async function setProfileActive(
  id: string,
  version: number,
  active: boolean,
) {
  const { error } = await database()
    .from("profiles")
    .update({ active })
    .eq("id", id)
    .eq("version", version)
    .select("id")
    .single();
  if (error) throw error;
}
export async function grantAssignment(
  values: Pick<
    Assignment,
    "user_id" | "role_id" | "scope_type" | "unit_id" | "sector_id"
  >,
) {
  const { error } = await database()
    .from("user_role_assignments")
    .insert(values);
  if (error) throw error;
}
export async function revokeAssignment(row: Assignment) {
  const { error } = await database()
    .from("user_role_assignments")
    .update({ active: false })
    .eq("id", row.id)
    .eq("version", row.version)
    .select("id")
    .single();
  if (error) throw error;
}
export async function saveRole(
  row: Role | null,
  values: {
    key: string;
    name: string;
    description: string;
    permissions: string[];
  },
) {
  const { error } = await database().rpc("save_role", {
    p_id: row?.id ?? null,
    p_version: row?.version ?? null,
    p_key: values.key,
    p_name: values.name,
    p_description: values.description,
    p_permissions: values.permissions,
  });
  if (error) throw error;
}
export async function setUnitSector(
  unit_id: string,
  sector_id: string,
  linked: boolean,
) {
  const query = linked
    ? database().from("unit_sectors").insert({ unit_id, sector_id })
    : database()
        .from("unit_sectors")
        .delete()
        .eq("unit_id", unit_id)
        .eq("sector_id", sector_id);
  const { error } = await query;
  if (error) throw error;
}
export type LogFilters = {
  from: string;
  to: string;
  actor: string;
  action: string;
  module: string;
};
export async function logs(page: number, filters: LogFilters) {
  let query = database()
    .from("system_audit_log")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
  if (filters.from)
    query = query.gte(
      "occurred_at",
      new Date(`${filters.from}T00:00:00`).toISOString(),
    );
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query = query.lt("occurred_at", end.toISOString());
  }
  if (filters.actor) query = query.eq("actor_user_id", filters.actor);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.module) query = query.eq("module", filters.module);
  const { data, error, count } = await query.range(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE - 1,
  );
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

export async function roleDetail(id: string) {
  const { data, error } = await database()
    .rpc("role_detail", { p_id: id })
    .single();
  if (error) throw error;
  return {
    role: data.role as unknown as Role,
    permission_keys: data.permission_keys,
  };
}
