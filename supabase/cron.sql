-- =====================================================================
-- Pact — schedule the daily re-engagement nudge.
--
-- 1. Deploy the function:   supabase functions deploy nudge --no-verify-jwt
-- 2. Set its secret:        supabase secrets set NUDGE_CRON_SECRET=<random string>
-- 3. Enable the `pg_cron` and `pg_net` extensions (Dashboard → Database → Extensions).
-- 4. Replace <PROJECT_REF> and <NUDGE_CRON_SECRET> below, then run this file
--    in the SQL editor.
--
-- Runs every day at 16:00 UTC (18:00 in Lusaka). Change the cron expression
-- to suit your users.
-- =====================================================================

select cron.unschedule('pact-daily-nudge')
where exists (select 1 from cron.job where jobname = 'pact-daily-nudge');

select cron.schedule(
  'pact-daily-nudge',
  '0 16 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/nudge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<NUDGE_CRON_SECRET>'
    ),
    body := '{"mode":"daily"}'::jsonb
  );
  $$
);
