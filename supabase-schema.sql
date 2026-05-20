-- Mentions table
create table if not exists mentions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  full_text text,
  platform text,
  url text unique,
  author_name text,
  author_handle text,
  author_followers integer default 0,
  author_verified boolean default false,
  published_at timestamptz,
  keyword_matched text[] default '{}',
  keyword_group text,
  sentiment_label text,
  sentiment_score float,
  sentiment_confidence float,
  emotions text[] default '{}',
  engagement_likes integer default 0,
  engagement_shares integer default 0,
  engagement_comments integer default 0,
  engagement_reach integer default 0,
  geography_country text,
  geography_region text,
  language text default 'en',
  mention_type text default 'news',
  risk_flag boolean default false,
  risk_level text,
  topics text[] default '{}',
  is_competitor boolean default false,
  source text,
  status text default 'new',
  created_at timestamptz default now()
);

-- Index for fast date-range queries
create index if not exists mentions_published_at_idx on mentions(published_at desc);
create index if not exists mentions_sentiment_label_idx on mentions(sentiment_label);
create index if not exists mentions_platform_idx on mentions(platform);
create index if not exists mentions_keyword_group_idx on mentions(keyword_group);

-- Enable Row Level Security (allow public read, restrict writes to service role)
alter table mentions enable row level security;

create policy "Public read" on mentions
  for select using (true);

create policy "Service insert" on mentions
  for insert with check (true);

create policy "Service update" on mentions
  for update using (true);
