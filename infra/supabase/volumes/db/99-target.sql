-- Only initialized on a NEW Compose volume. No application schema changes.
\getenv infra_environment INFRA_ENVIRONMENT
\getenv infra_instance_id INFRA_INSTANCE_ID
create schema infra_control;
revoke all on schema infra_control from public, anon, authenticated;
create table infra_control.target (
 environment text not null check (environment in ('ci','staging')),
 instance_id text not null,
 singleton boolean primary key default true check (singleton)
);
insert into infra_control.target(environment,instance_id) values (:'infra_environment',:'infra_instance_id');
revoke all on all tables in schema infra_control from public, anon, authenticated;
