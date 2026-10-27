-- Execução técnica direta, dentro da transação descrita no runbook D5B_ACCESS.md.
-- Não é RPC; nenhuma concessão a clientes. Sem desabilitar triggers ou RLS.
do $$
declare
 v_operator uuid := nullif(current_setting('room_booking.operator_id',true),'')::uuid;
 v_target uuid := nullif(current_setting('room_booking.target_id',true),'')::uuid;
 v_action text := current_setting('room_booking.provision_action',true);
 v_reference text := nullif(btrim(current_setting('room_booking.authorization_ref',true)),'');
 v_role uuid;
 v_before jsonb;
 v_after jsonb;
 v_assignment core.user_role_assignments;
begin
 if session_user <> 'postgres' or current_user <> 'postgres' or auth.uid() is not null then
   raise exception 'Somente conexão técnica direta autorizada, sem identidade JWT.' using errcode='42501';
 end if;
 if v_operator is null or v_target is null or v_reference is null
    or length(v_reference)>200 or v_action is null or v_action not in ('grant','revoke') then
   raise exception 'Informe operador, destinatário, ação e referência da autorização.' using errcode='23514';
 end if;
 if not exists(select 1 from core.profiles where id=v_operator and active) then
   raise exception 'Operador identificado deve ter perfil ativo.' using errcode='23514';
 end if;
 perform 1 from core.profiles where id=v_target for update;
 if not found then raise exception 'Destinatário inexistente.' using errcode='23514'; end if;
 select id into strict v_role from core.roles where key='room_booking_manager' and active for share;
 if v_action='grant' and exists(
   select 1 from core.user_role_assignments a join core.roles r on r.id=a.role_id
   where a.user_id=v_target and a.active and r.active and r.key='platform_administrator'
 ) then raise exception 'Atribuição administrativa conflitante: concessão negada.' using errcode='42501'; end if;
 select * into v_assignment from core.user_role_assignments
 where user_id=v_target and role_id=v_role and scope_type='global' for update;
 v_before:=case when found then to_jsonb(v_assignment) end;
 if v_action='grant' then
   if v_assignment.id is null then
     insert into core.user_role_assignments(user_id,role_id,scope_type,granted_by)
     values(v_target,v_role,'global',v_operator) returning * into v_assignment;
   elsif not v_assignment.active then
     update core.user_role_assignments set active=true,granted_by=v_operator
     where id=v_assignment.id returning * into v_assignment;
   else raise exception 'Atribuição já ativa.' using errcode='23514'; end if;
 else
   if v_assignment.id is null or not v_assignment.active then
     raise exception 'Não há atribuição ativa para revogar.' using errcode='23514';
   end if;
   update core.user_role_assignments set active=false where id=v_assignment.id returning * into v_assignment;
 end if;
 v_after:=to_jsonb(v_assignment);
 -- O trigger Core preserva o evento técnico sem JWT. Este evento correlaciona
 -- a responsabilidade humana declarada e a autorização com a mesma atribuição.
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,before_data,after_data,metadata)
 values(v_operator,'core','technical_'||v_action,'user_role_assignments',v_assignment.id::text,v_before,v_after,
   jsonb_build_object('authorization_ref',v_reference,'database_operator',session_user,'procedure','room_booking_manager_d5b'));
end $$;
