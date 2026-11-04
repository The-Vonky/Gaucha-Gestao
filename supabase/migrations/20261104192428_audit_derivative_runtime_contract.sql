begin;
-- Contratos apenas: não cria LOGIN, senha, grants técnicos ou configuração operacional.
alter table audit.checklist_evidence_derivatives add column runtime_login name;

create function audit_private.runtime_derivative_claim(p_expected uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job jsonb;
begin
 job=audit_private.claim_evidence_derivative();
 if job is null then return null; end if;
 if p_expected is not null and ((job->'evidence'->>'id')::uuid is distinct from p_expected) then
  -- A exceção desfaz a claim inteira: nenhum job alheio é confirmado/tocado pelo ensaio.
  raise exception 'Unexpected queue target' using errcode='42501';
 end if;
 update audit.checklist_evidence_derivatives set runtime_login=session_user
 where lease_id=(job->>'lease')::uuid;
 return job;
end $$;
create function audit_private.runtime_derivative_owned(p_lease uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from audit.checklist_evidence_derivatives
 where lease_id=p_lease and runtime_login=session_user and state='processing' and lease_until>clock_timestamp())
$$;
create function audit_private.runtime_derivative_prepare(p_lease uuid,p_manifest jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not audit_private.runtime_derivative_owned(p_lease) then return false; end if;
 return audit_private.prepare_evidence_derivative(p_lease,p_manifest);
end $$;
create function audit_private.runtime_derivative_complete(p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not audit_private.runtime_derivative_owned(p_lease) then return false; end if;
 return audit_private.complete_evidence_derivative(p_lease);
end $$;
create function audit_private.runtime_derivative_fail(p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not audit_private.runtime_derivative_owned(p_lease) then return false; end if;
 return audit_private.fail_evidence_derivative(p_lease);
end $$;
-- Sem chave/role/TTL livres. A autoridade da emissão deriva da lease e do login autenticado.
create function audit_private.runtime_derivative_scope(p_lease uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d audit.checklist_evidence_derivatives; e audit.checklist_evidence; key text; bucket text;
begin
 if p_kind is null or p_kind not in ('source','derived') then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into e from audit.checklist_evidence where id=(select evidence_id from audit.checklist_evidence_derivatives where lease_id=p_lease) for share;
 if not found or e.status<>'available' then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into d from audit.checklist_evidence_derivatives where lease_id=p_lease and runtime_login=session_user
 and state='processing' and lease_until>clock_timestamp()+interval '2 seconds' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 key=case p_kind when 'source' then e.object_key else d.derived_object_key end;
 bucket=case p_kind when 'source' then 'audit-checklist-evidence' else 'audit-evidence-thumbnails' end;
 if key is null then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('lease',p_lease,'login',session_user,'bucket',bucket,'key',key,
 'server_now',floor(extract(epoch from clock_timestamp())),'lease_expires',floor(extract(epoch from d.lease_until)));
end $$;
-- Storage também exige a chave/bucket exatos do JWT, além da lease ainda viva.
create function audit_private.runtime_derivative_object(p_bucket text,p_key text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from audit.checklist_evidence_derivatives d join audit.checklist_evidence e on e.id=d.evidence_id
 where d.state='processing' and d.lease_until>clock_timestamp() and e.status='available'
 and d.lease_id::text=coalesce(nullif(current_setting('request.jwt.claims',true),''),nullif(current_setting('request.jwt.claim',true),''),'{}')::jsonb->>'audit_derivative_lease'
 and d.runtime_login::text=coalesce(nullif(current_setting('request.jwt.claims',true),''),nullif(current_setting('request.jwt.claim',true),''),'{}')::jsonb->>'audit_derivative_login'
 and p_bucket=coalesce(nullif(current_setting('request.jwt.claims',true),''),nullif(current_setting('request.jwt.claim',true),''),'{}')::jsonb->>'audit_derivative_bucket' and p_key=coalesce(nullif(current_setting('request.jwt.claims',true),''),nullif(current_setting('request.jwt.claim',true),''),'{}')::jsonb->>'audit_derivative_key'
 and ((p_bucket='audit-checklist-evidence' and p_key=e.object_key)
 or(p_bucket='audit-evidence-thumbnails' and p_key=d.derived_object_key)))
$$;
revoke all on function audit_private.runtime_derivative_claim(uuid) from public,anon,authenticated;
revoke all on function audit_private.runtime_derivative_owned(uuid) from public,anon,authenticated;
revoke all on function audit_private.runtime_derivative_prepare(uuid,jsonb) from public,anon,authenticated;
revoke all on function audit_private.runtime_derivative_complete(uuid) from public,anon,authenticated;
revoke all on function audit_private.runtime_derivative_fail(uuid) from public,anon,authenticated;
revoke all on function audit_private.runtime_derivative_scope(uuid,text) from public,anon,authenticated;
revoke all on function audit_private.runtime_derivative_object(text,text) from public,anon,authenticated;
commit;
