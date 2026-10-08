import type { AccessGrant } from "./auth/permissions";
export type Versioned = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export type Profile = Versioned & { display_name: string; active: boolean };
/** Profile plus the Auth e-mail and last sign-in (core.user_directory, user admins only). */
export type DirectoryUser = Profile & {
  email: string | null;
  last_sign_in_at: string | null;
};
export type Organization = Versioned & {
  code: string;
  name: string;
  active: boolean;
};
export type Unit = Organization & {
  created_by: string | null;
  updated_by: string | null;
  cover_asset_id?: string | null;
  // PostgREST may serialize numeric as string.
  cover_position_x?: number | string;
  cover_position_y?: number | string;
};
/** Row of core.unit_covers: an authorized, ready cover (never a URL). */
export type UnitCoverRow = {
  unit_id: string;
  asset_id: string;
  object_key: string;
  position_x: number | string;
  position_y: number | string;
  width: number;
  height: number;
  ready_at: string;
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
/** Where a log reference label comes from: the current authorized row, or none readable. */
export type LabelSource = "current" | "unavailable";
/** core.audit_log_page row: an event plus the labels the reader's own RLS resolves. */
export type AuditLogEntry = AuditLog & {
  actor_display_name: string | null;
  actor_active: boolean | null;
  actor_label_source: LabelSource | null;
  unit_code: string | null;
  unit_name: string | null;
  unit_active: boolean | null;
  unit_label_source: LabelSource | null;
  sector_code: string | null;
  sector_name: string | null;
  sector_active: boolean | null;
  sector_label_source: LabelSource | null;
  total_count: number;
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
      user_directory: {
        Args: { p_search?: string; p_inactive?: boolean };
        Returns: DirectoryUser[];
      };
      audit_log_page: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_from?: string | null;
          p_to?: string | null;
          p_actor?: string | null;
          p_actor_search?: string | null;
          p_module?: string | null;
          p_action?: string | null;
          p_entity_type?: string | null;
          p_entity_id?: string | null;
        };
        Returns: AuditLogEntry[];
      };
      unit_covers: { Args: { p_units: string[] }; Returns: UnitCoverRow[] };
      begin_unit_cover_upload: {
        Args: {
          p_unit: string;
          p_mime_type: string;
          p_byte_size: number;
          p_width: number;
          p_height: number;
        };
        Returns: { asset_id: string; object_key: string }[];
      };
      confirm_unit_cover_upload: {
        Args: {
          p_unit: string;
          p_asset: string;
          p_position_x: number;
          p_position_y: number;
        };
        Returns: undefined;
      };
      cancel_unit_cover_upload: { Args: { p_asset: string }; Returns: undefined };
      remove_unit_cover: {
        Args: { p_unit: string; p_expected_asset: string };
        Returns: undefined;
      };
      set_unit_cover_position: {
        Args: {
          p_unit: string;
          p_expected_asset: string;
          p_position_x: number;
          p_position_y: number;
        };
        Returns: undefined;
      };
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
