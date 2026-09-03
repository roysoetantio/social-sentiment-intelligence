-- =====================================================================
-- Phase C — Tenants as data (Admin → Departments tab)
-- =====================================================================
-- Before this migration a "tenant" was a hardcoded string in the frontend
-- (`DEPARTMENTS = ['CCD','Infra']` in AuthContext.jsx) that happened to match
-- the text in app_users.department / department_group_access.department /
-- keyword_tenants.department. Adding a tenant meant a code change + deploy.
--
-- This makes the tenant list a real table so super admins can create, rename
-- and delete tenants from the Admin page. Keyword/folder management stays in
-- Keyword Manager (switch the sidebar department switcher to the new tenant).
--
-- SAFE / ADDITIVE for reads: tenants is seeded from every department string
-- already referenced anywhere, so nothing changes visibility.
-- The new FKs DO add integrity constraints on existing columns — they will
-- fail loudly (not silently) if a department string is unaccounted for, which
-- is why the seed runs first in the same transaction.
--
-- Run in the Supabase SQL editor. Wrapped in a single transaction.
-- =====================================================================
begin;

-- 1. The tenant registry. `name` IS the identity — every existing table stores
--    the tenant as this text value, so keeping the PK as the name (rather than
--    introducing a surrogate id) means no data migration and no app rewiring.
create table if not exists tenants (
  name       text        primary key,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

-- 2. Seed from every department string in use today (CCD, Infra).
insert into tenants (name)
select department from (
  select distinct department from department_group_access where department is not null
  union
  select distinct department from keyword_tenants        where department is not null
  union
  select distinct department from app_users              where department is not null
  union
  select distinct department from ai_digest              where department is not null
) s
on conflict (name) do nothing;

-- 3. Referential integrity + free renames.
--    ON UPDATE CASCADE => rename_tenant() only has to touch tenants.name.
--    department_group_access / keyword_tenants / ai_digest cascade on delete
--    (tenant-owned rows). app_users RESTRICTs — you must move or remove the
--    tenant's users before deleting it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dga_department_fkey') then
    alter table department_group_access
      add constraint dga_department_fkey foreign key (department)
      references tenants(name) on update cascade on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'keyword_tenants_department_fkey') then
    alter table keyword_tenants
      add constraint keyword_tenants_department_fkey foreign key (department)
      references tenants(name) on update cascade on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_digest_department_fkey') then
    alter table ai_digest
      add constraint ai_digest_department_fkey foreign key (department)
      references tenants(name) on update cascade on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'app_users_department_fkey') then
    alter table app_users
      add constraint app_users_department_fkey foreign key (department)
      references tenants(name) on update cascade on delete restrict;
  end if;
end $$;

-- 3b. Drop the OTHER two copies of the hardcoded department list.
--     app_users and department_group_access each carried
--     CHECK (department IN ('CCD','Infra')). The FK above enforces the same
--     thing dynamically, so these are now redundant — and they would reject
--     every newly created tenant.
alter table app_users               drop constraint if exists app_users_department_check;
alter table department_group_access drop constraint if exists department_group_access_department_check;

-- 4. RLS — every active user may READ the tenant list (it is just names, and
--    the frontend needs it to resolve the department switcher). Only super
--    admins may write.
alter table tenants enable row level security;

drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants for select using (auth_is_active_user());

drop policy if exists tenants_write on tenants;
create policy tenants_write on tenants for all
  using (auth_is_super_admin()) with check (auth_is_super_admin());

-- 5. create_tenant() — super admin only, case-insensitive uniqueness.
create or replace function create_tenant(p_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not (auth_is_super_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized: only super admins can manage tenants';
  end if;
  if v_name = '' then
    raise exception 'tenant name is required';
  end if;
  if length(v_name) > 40 then
    raise exception 'tenant name must be 40 characters or fewer';
  end if;
  if exists (select 1 from tenants where lower(name) = lower(v_name)) then
    raise exception 'tenant "%" already exists', v_name;
  end if;

  insert into tenants (name) values (v_name);
  return v_name;
end;
$$;

-- 6. rename_tenant() — the FK ON UPDATE CASCADE rewrites every referencing row.
create or replace function rename_tenant(p_old text, p_new text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_new text := btrim(coalesce(p_new, ''));
begin
  if not (auth_is_super_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized: only super admins can manage tenants';
  end if;
  if v_new = '' then
    raise exception 'tenant name is required';
  end if;
  if length(v_new) > 40 then
    raise exception 'tenant name must be 40 characters or fewer';
  end if;
  if not exists (select 1 from tenants where name = p_old) then
    raise exception 'tenant "%" not found', p_old;
  end if;
  if v_new <> p_old and exists (select 1 from tenants where lower(name) = lower(v_new)) then
    raise exception 'tenant "%" already exists', v_new;
  end if;

  update tenants set name = v_new where name = p_old;
  return v_new;
end;
$$;

-- 7. set_tenant_active() — soft disable. Inactive tenants stay in the DB (their
--    keywords and mentions are untouched) but disappear from the department
--    switcher and the Add User form.
create or replace function set_tenant_active(p_name text, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (auth_is_super_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized: only super admins can manage tenants';
  end if;
  update tenants set is_active = coalesce(p_active, true) where name = p_name;
  if not found then
    raise exception 'tenant "%" not found', p_name;
  end if;
end;
$$;

-- 8. delete_tenant() — hard delete, with the guards the FKs can't express.
--    Refuses while users are still assigned. Cascades away the tenant's folder
--    mappings / keyword tags / digests, then cleans up what those cascades
--    orphaned: keywords no tenant references any more are deactivated (same
--    rule as remove_keyword_tenant), and folders no tenant maps to are dropped.
--    Mentions are NEVER deleted — they are shared across tenants.
create or replace function delete_tenant(p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_users int;
begin
  if not (auth_is_super_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized: only super admins can manage tenants';
  end if;
  if not exists (select 1 from tenants where name = p_name) then
    raise exception 'tenant "%" not found', p_name;
  end if;

  select count(*) into v_users from app_users where department = p_name;
  if v_users > 0 then
    raise exception 'cannot delete "%": % user(s) still assigned. Reassign or remove them first', p_name, v_users;
  end if;

  -- FK cascades handle department_group_access, keyword_tenants and ai_digest.
  delete from tenants where name = p_name;

  -- Keywords left with no tenant at all: deactivate (don't destroy shared data).
  update keywords set is_active = false
   where is_active
     and not exists (select 1 from keyword_tenants kt where kt.keyword_id = keywords.id);

  -- Folders left mapped to no tenant: remove.
  delete from keyword_groups g
   where not exists (select 1 from department_group_access d where d.group_id = g.id);
end;
$$;

grant execute on function create_tenant(text)               to authenticated;
grant execute on function rename_tenant(text, text)         to authenticated;
grant execute on function set_tenant_active(text, boolean)  to authenticated;
grant execute on function delete_tenant(text)               to authenticated;

commit;

-- ---------------------------------------------------------------------
-- Sanity checks (run after committing):
--   select * from tenants order by name;              -- CCD, Infra
--   select department, count(*) from keyword_tenants group by 1;
--
-- ROLLBACK:
--   alter table department_group_access drop constraint dga_department_fkey;
--   alter table keyword_tenants  drop constraint keyword_tenants_department_fkey;
--   alter table ai_digest        drop constraint ai_digest_department_fkey;
--   alter table app_users        drop constraint app_users_department_fkey;
--   drop function if exists create_tenant(text), rename_tenant(text, text),
--                           set_tenant_active(text, boolean), delete_tenant(text);
--   drop table if exists tenants;
-- (The dropped CHECK constraints are intentionally NOT restored — re-adding a
--  hardcoded department list would break tenant creation again.)
-- ---------------------------------------------------------------------
