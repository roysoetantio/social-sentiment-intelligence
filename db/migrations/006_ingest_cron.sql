-- =====================================================================
-- Server-side ingest scheduling (pg_cron → Edge Functions)
-- =====================================================================
-- WHY THIS EXISTS
-- The daily Claude Routine is the only thing that runs, and it has no shell,
-- so scripts/ingest*.js never executed. Every API source went from May/June
-- 2026 to September without saving a row — none were broken, nothing ran them.
-- Ingest therefore moved into Supabase itself: Edge Functions do the work and
-- pg_cron triggers them, independently of whether the routine runs that day.
--
-- Companion objects live in 004_social_posts.sql and 005_ingest_state.sql.
-- Edge Function source is in supabase/functions/.
--
-- NOTE: this was originally run by hand in the Supabase SQL editor (the
-- service-role key must not pass through source control or a chat transcript).
-- It is recorded here so the schedule is reproducible. Substitute the key
-- before running on a fresh project; on this project it is already applied.
--
-- Schedules are UTC. Malaysia is UTC+8, so 00:30 UTC = 08:30 MYT.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stored once, read by every job below, so the key never appears in a job
-- definition (cron.job is readable by anyone who can query the catalog).
-- select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

-- Instagram — daily. Cheap, unmetered, and the token refresh only stays valid
-- while something calls it, so this must not be less frequent than ~60 days.
select cron.schedule(
  'ingest-instagram-daily',
  '30 0 * * *',                      -- 08:30 MYT
  $$
  select net.http_post(
    url := 'https://tkjfkrjuoghraersurof.supabase.co/functions/v1/ingest-instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $$
);

-- API sources — weekly. Serper is metered (2,500 prepaid credits, then paid),
-- and this run costs ~14 credits. Weekly keeps it inside the free pool for
-- roughly three years; daily would burn it in about six months. The other
-- sources in this function are news APIs that Claude Search largely duplicates
-- anyway, so daily adds little.
select cron.schedule(
  'ingest-apis-weekly',
  '0 1 * * 1',                       -- Mondays 09:00 MYT
  $$
  select net.http_post(
    url := 'https://tkjfkrjuoghraersurof.supabase.co/functions/v1/ingest-apis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $$
);

-- Useful checks:
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select source, max(finished_at), bool_and(ok) from ingest_runs group by source;
--   select cron.unschedule('ingest-apis-weekly');   -- to stop one
