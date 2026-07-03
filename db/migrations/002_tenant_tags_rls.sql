-- =====================================================================
-- Phase B — Row-Level Security (tenant isolation enforced in the DB)
-- =====================================================================
-- ⚠️  REVIEW AND TEST BEFORE RUNNING ON PRODUCTION.
--
--  * Requires Phase A (001) applied first (keyword_tenants + auth helpers).
--  * Ingest scripts and /api/delete-mentions use the SERVICE ROLE key,
--    which BYPASSES RLS — they are unaffected.
--  * The frontend uses the ANON key + the user's JWT, so it IS subject to RLS.
--
--  This migration REPLACES the legacy group-based policies (keyword_group IN
--  user_group_ids()) with keyword-level tenant policies (keyword_tenants
--  overlap). It drops the old policies first so the two models don't coexist
--  (RLS ORs permissive policies together — leaving both widens visibility).
--
--  CRITICAL PRE-CHECK — these policies key off the user's email claim via
--  auth.email(). The legacy user_group_ids() already reads auth.jwt()->>'email'
--  successfully, so the claim is present; auth.email() reads the same claim.
--  Still, confirm once while authenticated in the app context:
--     select auth.email();      -- must be non-null for real users
--
--  Write model: admins + super admins manage keywords/groups/tenant tags —
--  admins confined to their OWN department, super admins any department.
--  USER management (app_users) stays super-admin only. Active users may do
--  analyst review (mentions UPDATE); mentions INSERT/DELETE happen via the
--  service role only (no authenticated policy). New keywords are created via
--  the add_keyword() RPC (SECURITY DEFINER), so direct INSERT on keywords is
--  not required for the UI.
-- =====================================================================
begin;

-- ---- DROP legacy policies (from the old group-based RLS scheme) ------
drop policy if exists "mentions read scoped"   on mentions;
drop policy if exists "mentions insert scoped" on mentions;
drop policy if exists "mentions update scoped" on mentions;
drop policy if exists "mentions delete scoped" on mentions;

drop policy if exists "keywords read scoped" on keywords;
drop policy if exists "keywords insert"      on keywords;
drop policy if exists "keywords update"      on keywords;
drop policy if exists "keywords delete"      on keywords;

drop policy if exists "groups read scoped" on keyword_groups;
drop policy if exists "groups insert"      on keyword_groups;
drop policy if exists "groups update"      on keyword_groups;
drop policy if exists "groups delete"      on keyword_groups;

drop policy if exists "read dept access"          on department_group_access;
drop policy if exists "super admin manage dept access" on department_group_access;

drop policy if exists "read own app_user"        on app_users;
drop policy if exists "super admin manage app_users" on app_users;

-- ---- mentions -------------------------------------------------------
alter table mentions enable row level security;

drop policy if exists mentions_select on mentions;
create policy mentions_select on mentions for select using (
  auth_is_super_admin()
  or exists (
    select 1 from keyword_tenants kt
    where kt.department = auth_user_department()
      and kt.keyword_id = any (mentions.keyword_matched)
  )
);

-- analyst review edits on rows the user can already see
drop policy if exists mentions_update on mentions;
create policy mentions_update on mentions for update using (
  auth_is_super_admin()
  or exists (
    select 1 from keyword_tenants kt
    where kt.department = auth_user_department()
      and kt.keyword_id = any (mentions.keyword_matched)
  )
) with check (true);
-- (No INSERT/DELETE policy => authenticated users cannot insert/delete mentions.
--  Ingest and the delete API use the service role and bypass RLS.)

-- ---- keywords -------------------------------------------------------
alter table keywords enable row level security;
drop policy if exists keywords_select on keywords;
create policy keywords_select on keywords for select using (
  auth_is_super_admin()
  or exists (select 1 from keyword_tenants kt
             where kt.keyword_id = keywords.id and kt.department = auth_user_department())
);
-- Admins may edit a keyword only while their department still tags it.
-- (Creation goes through add_keyword() RPC, which bypasses this as definer.)
drop policy if exists keywords_write on keywords;
create policy keywords_write on keywords for all
  using (
    auth_is_super_admin()
    or (auth_is_admin_or_super() and exists (
      select 1 from keyword_tenants kt
      where kt.keyword_id = keywords.id and kt.department = auth_user_department()))
  )
  with check (
    auth_is_super_admin()
    or (auth_is_admin_or_super() and exists (
      select 1 from keyword_tenants kt
      where kt.keyword_id = keywords.id and kt.department = auth_user_department()))
  );

-- ---- keyword_tenants ------------------------------------------------
alter table keyword_tenants enable row level security;
drop policy if exists keyword_tenants_select on keyword_tenants;
create policy keyword_tenants_select on keyword_tenants for select
  using (auth_is_super_admin() or department = auth_user_department());
-- Admins tag/untag/move keywords within their own department only.
drop policy if exists keyword_tenants_write on keyword_tenants;
create policy keyword_tenants_write on keyword_tenants for all
  using (auth_is_admin_or_super() and (auth_is_super_admin() or department = auth_user_department()))
  with check (auth_is_admin_or_super() and (auth_is_super_admin() or department = auth_user_department()));

-- ---- keyword_groups -------------------------------------------------
alter table keyword_groups enable row level security;
drop policy if exists keyword_groups_select on keyword_groups;
create policy keyword_groups_select on keyword_groups for select using (
  auth_is_super_admin()
  or exists (select 1 from keyword_tenants kt
             where kt.group_id = keyword_groups.id and kt.department = auth_user_department())
);
-- Admins may edit/delete a folder their department is mapped to; and create
-- new folders (visibility is gated by the dept-scoped department_group_access
-- insert below, so a new folder is only ever exposed to the admin's own dept).
drop policy if exists keyword_groups_write on keyword_groups;
create policy keyword_groups_write on keyword_groups for all
  using (
    auth_is_super_admin()
    or (auth_is_admin_or_super() and exists (
      select 1 from department_group_access dga
      where dga.group_id = keyword_groups.id and dga.department = auth_user_department()))
  )
  with check (auth_is_admin_or_super());

-- ---- department_group_access (legacy; still read by AuthContext) ----
alter table department_group_access enable row level security;
drop policy if exists dga_select on department_group_access;
create policy dga_select on department_group_access for select
  using (auth_is_super_admin() or department = auth_user_department());
-- Admins map/unmap folders within their own department only.
drop policy if exists dga_write on department_group_access;
create policy dga_write on department_group_access for all
  using (auth_is_admin_or_super() and (auth_is_super_admin() or department = auth_user_department()))
  with check (auth_is_admin_or_super() and (auth_is_super_admin() or department = auth_user_department()));

-- ---- app_users ------------------------------------------------------
alter table app_users enable row level security;
drop policy if exists app_users_self on app_users;
create policy app_users_self on app_users for select
  using (email = auth.email() or auth_is_super_admin());
drop policy if exists app_users_admin_write on app_users;
create policy app_users_admin_write on app_users for all
  using (auth_is_super_admin()) with check (auth_is_super_admin());

commit;

-- ---------------------------------------------------------------------
-- ROLLBACK (re-disable RLS on everything; policies remain defined but inert):
--   alter table mentions                disable row level security;
--   alter table keywords                disable row level security;
--   alter table keyword_tenants         disable row level security;
--   alter table keyword_groups          disable row level security;
--   alter table department_group_access disable row level security;
--   alter table app_users               disable row level security;
-- NOTE: rolling back does NOT restore the legacy group policies — re-run the
-- old scheme separately if you need them back.
-- ---------------------------------------------------------------------
