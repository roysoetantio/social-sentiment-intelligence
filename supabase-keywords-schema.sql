-- Keyword groups table
create table if not exists keyword_groups (
  id text primary key,
  name text not null,
  color text not null,
  created_at timestamptz default now()
);

-- Keywords table
create table if not exists keywords (
  id text primary key,
  group_id text references keyword_groups(id) on delete cascade,
  term text not null,
  aliases text[] default '{}',
  match_type text default 'exact',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- RLS
alter table keyword_groups enable row level security;
alter table keywords enable row level security;

create policy "Public read groups" on keyword_groups for select using (true);
create policy "Public write groups" on keyword_groups for all using (true);
create policy "Public read keywords" on keywords for select using (true);
create policy "Public write keywords" on keywords for all using (true);

-- Seed default keyword groups
insert into keyword_groups (id, name, color) values
  ('corporate',   'Corporate Brand',      '#2940BE'),
  ('products',    'Products & Services',  '#1490EA'),
  ('executives',  'Executives',           '#732BCC'),
  ('competitors', 'Competitors',          '#E97132'),
  ('campaigns',   'Campaigns',            '#19C9A5')
on conflict (id) do nothing;

-- Seed default keywords
insert into keywords (id, group_id, term, aliases, match_type) values
  ('uem-edgenta',     'corporate',   'UEM Edgenta',      '{"UEM Edgenta Berhad","Edgenta"}', 'fuzzy'),
  ('edgenta-brand',   'corporate',   'Edgenta',          '{}',                               'exact'),
  ('edgenta-nxt',     'products',    'Edgenta NXT',      '{"NXT platform"}',                 'exact'),
  ('quickmed',        'products',    'QuickMed',         '{"Quick Med"}',                    'fuzzy'),
  ('exec-ceo',        'executives',  'Ahmad Pardas',     '{}',                               'exact'),
  ('comp-serba',      'competitors', 'Serba Dinamik',    '{}',                               'fuzzy'),
  ('comp-gamuda',     'competitors', 'Gamuda',           '{}',                               'fuzzy'),
  ('comp-iss',        'competitors', 'ISS Malaysia',     '{}',                               'exact'),
  ('camp-jobs',       'campaigns',   '#EdgentaCareers',  '{"Edgenta jobs","Edgenta hiring"}', 'hashtag'),
  ('camp-innovation', 'campaigns',   '#EdgentaInnovates','{}',                               'hashtag')
on conflict (id) do nothing;
