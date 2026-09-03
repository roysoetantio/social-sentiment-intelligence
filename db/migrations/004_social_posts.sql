-- =====================================================================
-- Social Feed — owned social media posts (Instagram first)
-- =====================================================================
-- This table holds OUR OWN published posts, not external mentions.
--
-- Why a separate table instead of rows in `mentions`:
--   * `mentions` counts are the headline number on the Overview page. Owned
--     content in there would inflate them, which is exactly what the ingest
--     BLACKLIST exists to prevent.
--   * Owned posts have a different shape — media/thumbnail, reach, saves,
--     engagement rate — and no keyword match or sentiment of their own.
--     (The caption is our own marketing copy; scoring it tells us nothing.)
--
-- `platform` is generic from day one so Facebook Page posts and LinkedIn
-- can land in the same table and the same Social Feed page later.
--
-- NOTE: comment TEXT is deliberately absent. Instagram's API returns
-- `comments_count` but withholds the comments themselves while the Meta app
-- has Standard Access only (development mode). See memory:
-- project_instagram_api. When Advanced Access lands, add a `social_comments`
-- child table — do not stuff comments into this one.
--
-- Run in the Supabase SQL editor. Wrapped in a single transaction.
-- =====================================================================
begin;

create table if not exists social_posts (
  id                text primary key,            -- "<platform>:<native id>"
  platform          text not null,               -- instagram | facebook | linkedin
  account_handle    text not null,               -- e.g. uemedgenta
  native_id         text not null,               -- id as returned by the platform
  post_type         text,                        -- IMAGE | VIDEO | CAROUSEL_ALBUM | REEL ...
  caption           text,
  permalink         text,
  media_url         text,
  thumbnail_url     text,
  published_at      timestamptz not null,

  -- Engagement. `comments_count` is the aggregate the API gives us even when
  -- the comment bodies are withheld — it is a real signal on its own.
  likes             integer default 0,
  comments_count    integer default 0,
  shares            integer default 0,
  saves             integer default 0,
  reach             integer default 0,
  impressions       integer default 0,
  video_views       integer default 0,

  raw               jsonb,                       -- untouched API payload
  ingested_at       timestamptz default now(),
  created_at        timestamptz default now(),

  constraint social_posts_platform_chk
    check (platform in ('instagram', 'facebook', 'linkedin'))
);

create unique index if not exists social_posts_platform_native_idx
  on social_posts (platform, native_id);
create index if not exists social_posts_published_idx
  on social_posts (published_at desc);
create index if not exists social_posts_platform_published_idx
  on social_posts (platform, published_at desc);

-- ---------------------------------------------------------------------
-- RLS — owned posts are not tenant-scoped data. Every active user may read
-- them; the Social Feed menu item is gated to CCD in the frontend, which is a
-- UI concern, not a security boundary. Writes are ingest-only (service role
-- bypasses RLS), with super admins allowed for manual fixes.
-- ---------------------------------------------------------------------
alter table social_posts enable row level security;

drop policy if exists social_posts_select on social_posts;
create policy social_posts_select on social_posts for select
  using (auth_is_active_user());

drop policy if exists social_posts_write on social_posts;
create policy social_posts_write on social_posts for all
  using (auth_is_super_admin()) with check (auth_is_super_admin());

commit;
