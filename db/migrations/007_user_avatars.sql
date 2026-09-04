-- 007_user_avatars.sql
--
-- Identity for the notification avatar cluster: a face (or initials) next to a
-- mention showing who on the tenant has already looked at it.
--
-- `app_users` held only email/department/role, so there was nothing to render.
-- Azure gives us `user_metadata.full_name` for the *signed-in* user only, which
-- is no help for showing a colleague — so each person's name and photo is
-- harvested into this table at their own login and read back by everyone else.

alter table public.app_users
  add column if not exists full_name        text,
  add column if not exists avatar_color     text,   -- override; null = derived from email
  add column if not exists avatar_url       text,   -- data: URI harvested from Microsoft Graph
  add column if not exists avatar_synced_at timestamptz;

comment on column public.app_users.avatar_color is
  'Manual override for the initials-avatar background. Null means derive it from the email hash, so every user has a stable colour without an admin assigning one.';
comment on column public.app_users.avatar_url is
  'Small data: URI of the Microsoft Graph profile photo, captured at login. Null is normal — many Entra accounts have no photo, and initials are the fallback, not a placeholder.';

-- The admin list is a fixed-column SECURITY DEFINER function, so new columns are
-- invisible to the Admin page until they are named here too. Postgres will not
-- widen an existing function's return type in place, hence the drop.
drop function if exists public.admin_list_app_users();
create function public.admin_list_app_users()
returns table (
  email text, department text, role text, is_active boolean,
  created_at timestamptz, last_sign_in_at timestamptz,
  full_name text, avatar_color text, avatar_url text
)
language sql stable security definer set search_path to 'public'
as $$
  select a.email, a.department, a.role, a.is_active, a.created_at,
         u.last_sign_in_at,
         a.full_name, a.avatar_color, a.avatar_url
  from public.app_users a
  left join auth.users u on lower(u.email) = lower(a.email)
  where public.is_super_admin() or auth.role() = 'service_role';
$$;

-- Writing your own avatar.
--
-- RLS on app_users allows UPDATE to super admins only, and that stays true:
-- letting people write their own row directly would let them write their own
-- `role`. This function is the narrow hole — it touches three columns of one
-- row, the caller's own, and cannot be aimed at anyone else.
create or replace function public.sync_my_profile(p_full_name text, p_avatar_url text)
returns void
language sql volatile security definer set search_path to 'public'
as $$
  update public.app_users
  set full_name        = coalesce(nullif(p_full_name, ''), full_name),
      avatar_url       = coalesce(p_avatar_url, avatar_url),
      avatar_synced_at = now()
  where email = auth.email();
$$;

-- Reading colleagues' avatars.
--
-- The SELECT policy on app_users is "your own row, or everything if you are a
-- super admin", which is right for role and is_active but leaves an ordinary
-- user unable to render a teammate's face. This exposes the presentational
-- columns only, scoped to the caller's own department.
create or replace function public.list_directory_avatars()
returns table (email text, full_name text, avatar_color text, avatar_url text, department text)
language sql stable security definer set search_path to 'public'
as $$
  select a.email, a.full_name, a.avatar_color, a.avatar_url, a.department
  from public.app_users a
  where a.is_active
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or a.department is not distinct from (
           select b.department from public.app_users b where b.email = auth.email()
         )
      -- super admins view every tenant, so they can appear in any cluster
      or a.role = 'super_admin'
    );
$$;

grant execute on function public.admin_list_app_users() to authenticated;
revoke all on function public.sync_my_profile(text, text) from public;
revoke all on function public.list_directory_avatars() from public;
grant execute on function public.sync_my_profile(text, text) to authenticated;
grant execute on function public.list_directory_avatars() to authenticated;
