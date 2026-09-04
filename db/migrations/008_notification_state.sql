-- 008_notification_state.sql
--
-- Notification state moves out of the browser.
--
-- `readIds` lived in localStorage, which is per-BROWSER: a colleague's first
-- login re-showed all 41 alerts, the same person on a phone saw them twice, and
-- clearing the cache reset everything. It also could not answer the question a
-- comms team actually has — "has anyone dealt with this?" — because a private
-- cache cannot hold a shared fact.
--
-- Three facts, three homes, because none can be inferred from another:
--   viewed  — per person, permanent. The audit trail, and what the avatars draw.
--   read    — per tenant. Set by whoever looks first; drives the badge.
--   handled — per tenant, explicit, high-risk only. "We responded to this."
--
-- Read un-badges an item for the whole department, but nothing is hidden: read
-- rows stay in the All tab carrying the viewer's face, so the second person to
-- log in can still find everything and see who got there first.

-- ── who saw what ───────────────────────────────────────────────────────────────
-- No FK on user_email: an audit trail that disappears when someone leaves the
-- company is not an audit trail.
create table if not exists public.mention_views (
  mention_id      uuid        not null references public.mentions(id) on delete cascade,
  user_email      text        not null,
  first_viewed_at timestamptz not null default now(),
  primary key (mention_id, user_email)
);

create index if not exists mention_views_mention_idx on public.mention_views (mention_id);
create index if not exists mention_views_user_idx    on public.mention_views (user_email);

comment on table public.mention_views is
  'Permanent per-person view trail. First view wins — re-opening a mention does not rewrite the timestamp, so the row answers "when did this person first see it".';

-- ── tenant-level state ────────────────────────────────────────────────────────
-- Keyed by (mention, department), not by mention: a single mention reaches
-- several tenants through keyword_matched, so a story CCD has read must still be
-- unread for Infra.
create table if not exists public.mention_alert_state (
  mention_id uuid not null references public.mentions(id) on delete cascade,
  department text not null references public.tenants(name) on delete cascade,
  read_at    timestamptz,
  read_by    text,
  handled_at timestamptz,
  handled_by text,
  primary key (mention_id, department)
);

create index if not exists mention_alert_state_dept_idx on public.mention_alert_state (department);

comment on column public.mention_alert_state.handled_at is
  'High-risk only, and deliberately not implied by read_at: an accident on a PLUS highway is read and forgotten, whereas a ransomware story needs someone to say out loud that it was dealt with.';

-- ── the human review queue ────────────────────────────────────────────────────
-- Written by the monitoring routine (its Step 6B), read by the Needs Review tab.
-- Keyed on (mention, department, reason) because one mention can need two
-- different things — the Johor illegal-race story was simultaneously high risk
-- and undated, which is exactly why this is not a boolean on `mentions`.
create table if not exists public.review_queue (
  id          uuid primary key default gen_random_uuid(),
  mention_id  uuid        not null references public.mentions(id) on delete cascade,
  department  text        not null references public.tenants(name) on delete cascade,
  reason      text        not null,
  needed      text,
  raised_at   timestamptz not null default now(),
  raised_by   text        not null default 'routine',
  resolved_at timestamptz,
  resolved_by text,
  resolution  text,
  unique (mention_id, department, reason)
);

create index if not exists review_queue_open_idx on public.review_queue (department, resolved_at);

comment on column public.review_queue.reason is
  'Machine key for the bucket: unreadable | ambiguous_sentiment | undated | risk_unhandled | out_of_scope.';
comment on column public.review_queue.needed is
  'The ask, in words. "Needs review" is not an instruction; "confirm this is UEM Edgenta and not UEM Sunrise" is.';

-- ── helpers ───────────────────────────────────────────────────────────────────
create or replace function public.my_department()
returns text language sql stable security definer set search_path to 'public'
as $$ select department from public.app_users where email = auth.email() and is_active $$;

-- True when the caller may act on this tenant's notifications: their own
-- department, or any department if they are a super admin (who browses tenants
-- through the switcher and should still leave a trail — the audit trail was
-- asked for explicitly, so super-admin views are recorded, not filtered out).
-- The monitoring routine raises review items as the service role, which has no
-- auth.email() and no app_users row, so it must be allowed through. This grants
-- nothing new: the service role already bypasses RLS outright, and this check
-- inside a SECURITY DEFINER function was the only thing in its way.
create or replace function public.can_touch_department(p_department text)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select auth.role() = 'service_role'
      or public.is_super_admin()
      or p_department = public.my_department()
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.mention_views       enable row level security;
alter table public.mention_alert_state enable row level security;
alter table public.review_queue        enable row level security;

-- Views are readable by any active user: the whole point is seeing a
-- colleague's face. Writes are your own row only, so nobody can claim someone
-- else looked at something.
drop policy if exists mention_views_read on public.mention_views;
create policy mention_views_read on public.mention_views
  for select using (auth.email() is not null);

drop policy if exists mention_views_write_self on public.mention_views;
create policy mention_views_write_self on public.mention_views
  for insert with check (user_email = auth.email());

drop policy if exists alert_state_rw on public.mention_alert_state;
create policy alert_state_rw on public.mention_alert_state
  for all using (public.can_touch_department(department))
  with check (public.can_touch_department(department));

drop policy if exists review_queue_read on public.review_queue;
create policy review_queue_read on public.review_queue
  for select using (public.can_touch_department(department));

-- Resolving is a user action; raising is the routine's job via the service role.
drop policy if exists review_queue_resolve on public.review_queue;
create policy review_queue_resolve on public.review_queue
  for update using (public.can_touch_department(department))
  with check (public.can_touch_department(department));

-- ── write paths ───────────────────────────────────────────────────────────────
-- One call per bell interaction: stamps the caller's face on every article in
-- the cluster and marks the event read for the tenant. `read_by` keeps the FIRST
-- reader, so it records who cleared it rather than who looked most recently.
create or replace function public.mark_mentions_viewed(p_ids uuid[], p_department text)
returns void language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  if not public.can_touch_department(p_department) then
    raise exception 'not permitted for department %', p_department;
  end if;

  insert into public.mention_views (mention_id, user_email)
  select id, auth.email() from unnest(p_ids) as id
  on conflict (mention_id, user_email) do nothing;

  insert into public.mention_alert_state (mention_id, department, read_at, read_by)
  select id, p_department, now(), auth.email() from unnest(p_ids) as id
  on conflict (mention_id, department) do update
    set read_at = coalesce(public.mention_alert_state.read_at, excluded.read_at),
        read_by = coalesce(public.mention_alert_state.read_by, excluded.read_by);
end;
$$;

-- Marking read in bulk ("Mark all read") deliberately does NOT stamp a face:
-- dismissing a list is not the same as looking at an item, and if it stamped
-- avatars the cluster would mean nothing.
create or replace function public.mark_mentions_read(p_ids uuid[], p_department text)
returns void language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  if not public.can_touch_department(p_department) then
    raise exception 'not permitted for department %', p_department;
  end if;

  insert into public.mention_alert_state (mention_id, department, read_at, read_by)
  select id, p_department, now(), auth.email() from unnest(p_ids) as id
  on conflict (mention_id, department) do update
    set read_at = coalesce(public.mention_alert_state.read_at, excluded.read_at),
        read_by = coalesce(public.mention_alert_state.read_by, excluded.read_by);
end;
$$;

create or replace function public.set_alert_handled(p_id uuid, p_department text, p_handled boolean)
returns void language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  if not public.can_touch_department(p_department) then
    raise exception 'not permitted for department %', p_department;
  end if;

  insert into public.mention_alert_state (mention_id, department, handled_at, handled_by)
  values (p_id, p_department, case when p_handled then now() end,
                             case when p_handled then auth.email() end)
  on conflict (mention_id, department) do update
    set handled_at = case when p_handled then coalesce(public.mention_alert_state.handled_at, now()) end,
        handled_by = case when p_handled then coalesce(public.mention_alert_state.handled_by, auth.email()) end;
end;
$$;

create or replace function public.resolve_review_item(p_id uuid, p_resolution text)
returns void language sql volatile security definer set search_path to 'public'
as $$
  update public.review_queue
  set resolved_at = now(), resolved_by = auth.email(), resolution = p_resolution
  where id = p_id and public.can_touch_department(department);
$$;

grant select                     on public.mention_views       to authenticated;
grant select, insert, update     on public.mention_alert_state to authenticated;
grant select, update             on public.review_queue        to authenticated;
grant execute on function public.my_department()                                    to authenticated;
grant execute on function public.can_touch_department(text)                         to authenticated;
grant execute on function public.mark_mentions_viewed(uuid[], text)                 to authenticated;
grant execute on function public.mark_mentions_read(uuid[], text)                   to authenticated;
grant execute on function public.set_alert_handled(uuid, text, boolean)             to authenticated;
grant execute on function public.resolve_review_item(uuid, text)                    to authenticated;

-- ── follow-ups applied after the first run of this feature ───────────────────

-- Handling something you have not read is not a state that exists. The two were
-- independent, so an alert could show "Handled" and an unread dot at once.
create or replace function public.set_alert_handled(p_id uuid, p_department text, p_handled boolean)
returns void language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  if not public.can_touch_department(p_department) then
    raise exception 'not permitted for department %', p_department;
  end if;

  insert into public.mention_alert_state (mention_id, department, read_at, read_by, handled_at, handled_by)
  values (p_id, p_department,
          case when p_handled then now() end,
          case when p_handled then auth.email() end,
          case when p_handled then now() end,
          case when p_handled then auth.email() end)
  on conflict (mention_id, department) do update
    set handled_at = case when p_handled then coalesce(public.mention_alert_state.handled_at, now()) end,
        handled_by = case when p_handled then coalesce(public.mention_alert_state.handled_by, auth.email()) end,
        -- Handling implies reading; un-handling takes both back, so the row
        -- returns to the outstanding list wearing the loud unread dot rather
        -- than a quiet "seen" tick. The permanent record of who looked lives in
        -- mention_views and is untouched — read_at is only badge and dot state.
        read_at    = case when p_handled then coalesce(public.mention_alert_state.read_at, now()) end,
        read_by    = case when p_handled then coalesce(public.mention_alert_state.read_by, auth.email()) end;
end;
$$;

-- One mention reaches several tenants, so it gets one queue row per tenant. But
-- the ANSWER is a change to the mention itself (analyst_sentiment,
-- analyst_excluded), which every tenant sees at once. Resolving only the row the
-- clicker could see left the other tenants asking a question already answered.
--
-- SECURITY DEFINER because the caller legitimately cannot see the other tenants'
-- rows; what authorises this is that they may act on their own row for this
-- mention, and the data write is global.
create or replace function public.resolve_review_for_mention(
  p_mention_id uuid, p_reason text, p_resolution text
) returns integer
language plpgsql volatile security definer set search_path to 'public'
as $$
declare
  n integer;
begin
  if not exists (
    select 1 from public.review_queue q
    where q.mention_id = p_mention_id and q.reason = p_reason
      and public.can_touch_department(q.department)
  ) then
    raise exception 'no review item you can act on for that mention';
  end if;

  update public.review_queue
  set resolved_at = now(), resolved_by = auth.email(), resolution = p_resolution
  where mention_id = p_mention_id and reason = p_reason and resolved_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.resolve_review_for_mention(uuid, text, text) to authenticated;

-- Closing the loop without crowding the bell.
--
-- Three answer buttons per row made the list unreadable, so the row keeps one
-- quiet action. But a plain "Resolve" that changes nothing was the reason those
-- buttons existed — so instead the ANSWER closes the row from wherever it is
-- actually given: the analyst panel in the Mentions Explorer, this trigger, or
-- the routine's nightly sweep. It also handles multi-tenant for free, since the
-- override lives on the mention and one write closes every tenant's row.
create or replace function public.close_review_on_analyst_decision()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.analyst_sentiment is not null and old.analyst_sentiment is distinct from new.analyst_sentiment then
    update public.review_queue
    set resolved_at = now(),
        resolved_by = coalesce(new.analyst_flagged_by, auth.email()),
        resolution  = 'Sentiment set to ' || new.analyst_sentiment
    where mention_id = new.id and reason = 'ambiguous_sentiment' and resolved_at is null;
  end if;

  if new.analyst_excluded is true and old.analyst_excluded is not true then
    update public.review_queue
    set resolved_at = now(),
        resolved_by = coalesce(new.analyst_flagged_by, auth.email()),
        resolution  = 'Excluded - not about us'
    where mention_id = new.id and resolved_at is null;
  end if;

  if new.analyst_reviewed is true and old.analyst_reviewed is not true then
    update public.review_queue
    set resolved_at = now(),
        resolved_by = coalesce(new.analyst_flagged_by, auth.email()),
        resolution  = 'Confirmed relevant'
    where mention_id = new.id and reason = 'unreadable' and resolved_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists close_review_on_analyst_decision on public.mentions;
create trigger close_review_on_analyst_decision
  after update on public.mentions
  for each row execute function public.close_review_on_analyst_decision();

-- Undo reopens ONE row and touches nothing else: the decision lives on the
-- mention, and reopening a queue row is not a mandate to erase an override
-- somebody set in the Mentions Explorer.
create or replace function public.unresolve_review_item(p_id uuid)
returns void language sql volatile security definer set search_path to 'public'
as $$
  update public.review_queue
  set resolved_at = null, resolved_by = null, resolution = null
  where id = p_id and public.can_touch_department(department);
$$;

grant execute on function public.unresolve_review_item(uuid) to authenticated;
