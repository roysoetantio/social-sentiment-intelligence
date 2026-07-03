-- =====================================================================
-- Phase A — Keyword-level tenancy: schema, backfill, functions
-- =====================================================================
-- SAFE / ADDITIVE. This does not change how the current app behaves:
--   * nothing here is wired into the app yet
--   * it only adds a table, indexes, a backfill, and helper functions
-- Run in the Supabase SQL editor. Wrapped in a single transaction.
-- =====================================================================
begin;

-- 1. Dedupe guard — one keyword row per term.
--    (6 keywords today, all unique terms, so this is safe.)
create unique index if not exists uq_keywords_term on keywords (term);

-- 2. Tenant tags — keyword <-> tenant, many-to-many.
--    group_id is the *per-tenant folder* this keyword shows in (just organization).
--    PK (keyword_id, department) => a keyword sits in exactly one folder per tenant.
--    NOTE: keywords.id is TEXT in this DB (slugs + uuids), so keyword_id is text.
create table if not exists keyword_tenants (
  keyword_id text        not null references keywords(id)       on delete cascade,
  department text        not null,
  group_id   text        not null references keyword_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (keyword_id, department)
);
create index if not exists idx_keyword_tenants_department on keyword_tenants (department);
create index if not exists idx_keyword_tenants_keyword    on keyword_tenants (keyword_id);

-- 3. GIN index so the visibility overlap (keyword_matched && tenant keywords) is fast.
create index if not exists idx_mentions_keyword_matched on mentions using gin (keyword_matched);

-- 4. Backfill tags from today's model: keyword -> its group -> that group's department.
--    Reproduces current visibility exactly (PLUS -> Infra, the rest -> CCD).
insert into keyword_tenants (keyword_id, department, group_id)
select k.id, dga.department, k.group_id
from keywords k
join department_group_access dga on dga.group_id = k.group_id
on conflict (keyword_id, department) do nothing;

-- 5. Auth helpers (SECURITY DEFINER so they can read app_users regardless of RLS).
create or replace function auth_user_department() returns text
  language sql stable security definer set search_path = public as $$
  select department from app_users where email = auth.email() and is_active limit 1;
$$;

create or replace function auth_is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users
                 where email = auth.email() and role = 'super_admin' and is_active);
$$;

create or replace function auth_is_active_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where email = auth.email() and is_active);
$$;

-- admin OR super_admin — the set of roles allowed to manage keywords.
create or replace function auth_is_admin_or_super() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users
                 where email = auth.email() and role in ('admin','super_admin') and is_active);
$$;

-- 6. add_keyword() — find-or-create by term, then tag for the tenant.
--    If the term already exists, it ONLY adds the tag => the tenant instantly
--    sees all existing mentions for that keyword. No crawl, no duplication.
--    Authorization: admins + super admins. Admins are confined to their OWN
--    department; super admins may tag any department. The service role (ingest,
--    dev service key) bypasses the guard entirely.
create or replace function add_keyword(
  p_term       text,
  p_aliases    text[],
  p_department text,
  p_group_id   text
) returns text
language plpgsql security definer set search_path = public
as $$
declare v_id text;
begin
  if not (auth_is_admin_or_super() or auth.role() = 'service_role') then
    raise exception 'not authorized: only admins can manage keywords';
  end if;
  if auth.role() <> 'service_role' and not auth_is_super_admin()
     and p_department is distinct from auth_user_department() then
    raise exception 'not authorized: admins can only manage their own department';
  end if;

  select id into v_id from keywords where term = p_term;
  if v_id is null then
    -- keywords.id is TEXT with no default => generate one here.
    v_id := gen_random_uuid()::text;
    insert into keywords (id, term, aliases, group_id, match_type, is_active)
    values (v_id, p_term, coalesce(p_aliases, '{}'), p_group_id, 'exact', true);
  else
    -- keep active and merge any new aliases into the shared keyword
    update keywords
       set is_active = true,
           aliases = (select array(select distinct unnest(coalesce(aliases, '{}') || coalesce(p_aliases, '{}'))))
     where id = v_id;
  end if;

  insert into keyword_tenants (keyword_id, department, group_id)
  values (v_id, p_department, p_group_id)
  on conflict (keyword_id, department) do update set group_id = excluded.group_id;

  return v_id;
end;
$$;

-- 7. remove_keyword_tenant() — untag for one tenant.
--    Only deactivates the keyword when NO tenant references it anymore.
--    Never hard-deletes shared mentions.
create or replace function remove_keyword_tenant(
  p_keyword_id text,
  p_department text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (auth_is_admin_or_super() or auth.role() = 'service_role') then
    raise exception 'not authorized: only admins can manage keywords';
  end if;
  if auth.role() <> 'service_role' and not auth_is_super_admin()
     and p_department is distinct from auth_user_department() then
    raise exception 'not authorized: admins can only manage their own department';
  end if;

  delete from keyword_tenants where keyword_id = p_keyword_id and department = p_department;

  if not exists (select 1 from keyword_tenants where keyword_id = p_keyword_id) then
    update keywords set is_active = false where id = p_keyword_id;
  end if;
end;
$$;

-- Let logged-in users call the RPCs (the guards above enforce admin/super only).
grant execute on function add_keyword(text, text[], text, text) to authenticated;
grant execute on function remove_keyword_tenant(text, text)       to authenticated;

commit;

-- ---------------------------------------------------------------------
-- Sanity checks (run after committing):
--   select department, count(*) from keyword_tenants group by 1;   -- CCD 5, Infra 1
--   select k.term, kt.department, kt.group_id
--     from keyword_tenants kt join keywords k on k.id = kt.keyword_id order by 1;
-- ---------------------------------------------------------------------
