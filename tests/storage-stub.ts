// Minimal stand-in for the Supabase-owned storage schema, created before migrations in
// PGlite/empty databases. Real Storage behavior is proven by tests/integration/evidence.mjs.
export const STORAGE_STUB = `create schema storage;
 create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;
 grant select,insert,update,delete on storage.objects to anon,authenticated;`;
