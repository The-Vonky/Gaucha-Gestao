import type { AccessGrant } from "./auth/permissions";
export type Versioned = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export type Profile = Versioned & { display_name: string; active: boolean };
export type Organization = Versioned & {
  code: string;
  name: string;
  active: boolean;
};
export type Unit = Organization & {
  created_by: string | null;
  updated_by: string | null;
};
export type Role = Versioned & {
  key: string;
  name: string;
  description: string;
  system: boolean;
  active: boolean;
  global_only: boolean;
};
export type Permission = {
  key: string;
  domain: string;
  resource: string;
  action: string;
  description: string;
  active: boolean;
};
export type Assignment = Versioned &
  Omit<AccessGrant, "permission"> & {
    user_id: string;
    role_id: string;
    active: boolean;
    granted_by: string | null;
  };
export type AuditLog = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  module: string;
  action: string;
  entity_type: string;
  entity_id: string;
  unit_id: string | null;
  sector_id: string | null;
  before_data: Json;
  after_data: Json;
  metadata: Json;
  correlation_id: string | null;
};
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type RowMap = {
  profiles: Profile;
  units: Unit;
  sectors: Organization;
  roles: Role;
  permissions: Permission;
  user_role_assignments: Assignment;
  role_permissions: { role_id: string; permission_key: string };
  unit_sectors: { unit_id: string; sector_id: string };
  system_audit_log: AuditLog;
};
type Table<R> = {
  Row: R;
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};
export type Database = {
  core: {
    Tables: { [K in keyof RowMap]: Table<RowMap[K]> };
    Views: Record<string, never>;
    Functions: {
      role_detail: {
        Args: { p_id: string };
        Returns: { role: Json; permission_keys: string[] }[];
      };
      my_access: { Args: Record<string, never>; Returns: AccessGrant[] };
      save_role: {
        Args: {
          p_id: string | null;
          p_version: number | null;
          p_key: string;
          p_name: string;
          p_description: string;
          p_permissions: string[];
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
