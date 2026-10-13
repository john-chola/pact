-- Behaviour tests for supabase/schema.sql. Run with `npm run test:db`.
-- Each check raises an exception on failure, so psql exits non-zero.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create schema if not exists test;

-- Runs `sql` and asserts it fails with a message containing `expected`.
create or replace function test.expect_error(sql text, expected text) returns void
language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error "%" but statement succeeded: %', expected, sql;
exception
  when others then
    if sqlerrm like 'expected error%' then raise; end if;
    if position(expected in sqlerrm) = 0 then
      raise exception 'expected error "%" but got "%"', expected, sqlerrm;
    end if;
end;
$$;

create or replace function test.eq(actual anyelement, expected anyelement, label text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
end;
$$;

grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;

create or replace function test.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000' || n, false);
$$;

-- Seven users; the first signs up with a name in their metadata.
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || n)::uuid,
       case when n = 1 then '{"name":"Ada"}'::jsonb else '{}'::jsonb end
from generate_series(1, 7) n;

select test.eq((select count(*) from public.profiles)::int, 7, 'signup trigger creates profiles');
select test.eq((select name from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
               'Ada', 'profile name comes from signup metadata');

set role authenticated;

-- Creating a group --------------------------------------------------------
select test.as_user(1);
select test.expect_error($$ select public.create_group('   ', 'coding') $$, 'Give your group a name');
select public.create_group('Build Season', 'coding');
select test.eq((select count(*) from public.group_members)::int, 1, 'creator joins their own group');
select test.eq((select length(join_code) from public.groups), 6, 'join code is 6 characters');
select test.expect_error($$ insert into public.groups (name) values ('sneaky') $$, 'permission denied');

-- Profiles: own fields editable, streaks not -------------------------------
update public.profiles set name = 'Ada L', goal = 'ship' where id = auth.uid();
select test.eq((select name from public.profiles where id = auth.uid()), 'Ada L', 'can edit own name');
select test.expect_error($$ update public.profiles set streak_count = 99 $$, 'permission denied');

-- Joining -----------------------------------------------------------------
select join_code as code from public.groups \gset
select id as gid from public.groups \gset

select test.as_user(2);
select test.eq((select count(*) from public.groups)::int, 0, 'non-members cannot see a group');
select test.eq((select count(*) from public.profiles)::int, 1, 'non-members only see their own profile');
select public.join_group_by_code(lower(:'code'));
select public.join_group_by_code(:'code');
select test.eq((select count(*) from public.group_members where user_id = auth.uid())::int, 1,
               'joining twice is idempotent and codes are case-insensitive');
select test.expect_error($$ select public.join_group_by_code('NOPE00') $$, 'Group not found');

select test.as_user(3); select public.join_group_by_code(:'code');
select test.as_user(4); select public.join_group_by_code(:'code');
select test.as_user(5); select public.join_group_by_code(:'code');
select test.as_user(6);
select test.expect_error(format($$ select public.join_group_by_code(%L) $$, :'code'), 'This pact is full');
select test.eq((select count(*) from public.checkins)::int, 0, 'outsiders cannot read check-ins');

-- Check-ins and streaks ---------------------------------------------------
select test.as_user(1);
insert into public.checkins (user_id, group_id, worked_on, duration_minutes, checkin_date)
  values (auth.uid(), :'gid', 'auth', 60, current_date - 1);
insert into public.checkins (user_id, group_id, worked_on, duration_minutes, checkin_date)
  values (auth.uid(), :'gid', 'feed', 45, current_date);

select test.expect_error(format($$
  insert into public.checkins (user_id, group_id, worked_on, checkin_date)
  values (auth.uid(), %L, 'again', current_date) $$, :'gid'), 'already checked in today');
select test.expect_error(format($$
  insert into public.checkins (user_id, group_id, worked_on, checkin_date)
  values (auth.uid(), %L, 'old', current_date - 5) $$, :'gid'), 'Invalid check-in date');
select test.expect_error(format($$
  insert into public.checkins (user_id, group_id, worked_on)
  values (auth.uid(), %L, '  ') $$, :'gid'), 'what you worked on');
select test.expect_error(format($$
  insert into public.checkins (user_id, group_id, worked_on)
  values ('00000000-0000-0000-0000-000000000002', %L, 'spoof') $$, :'gid'), 'row-level security');

select test.eq((select streak_count from public.group_members where user_id = auth.uid()), 2,
               'consecutive days build the group streak');
select test.eq((select streak_count from public.profiles where id = auth.uid()), 2,
               'consecutive days build the overall streak');
select test.eq((select sprint_number from public.checkins limit 1), 1, 'check-ins record the sprint');

-- A gap resets the streak
select test.as_user(2);
insert into public.checkins (user_id, group_id, worked_on, checkin_date)
  values (auth.uid(), :'gid', 'day one', current_date - 1);
select test.eq((select streak_count from public.group_members where user_id = auth.uid()), 1,
               'first check-in starts a streak of 1');

-- Reactions ---------------------------------------------------------------
select id as cid from public.checkins where user_id = '00000000-0000-0000-0000-000000000001' limit 1 \gset
insert into public.reactions (checkin_id, user_id, emoji) values (:'cid', auth.uid(), '🔥');
select test.expect_error(format($$
  insert into public.reactions (checkin_id, user_id, emoji) values (%L, auth.uid(), '🔥') $$, :'cid'),
  'duplicate key');
select test.expect_error(format($$
  insert into public.reactions (checkin_id, user_id, emoji) values (%L, auth.uid(), '💩') $$, :'cid'),
  'check constraint');
select test.as_user(6);
select test.expect_error(format($$
  insert into public.reactions (checkin_id, user_id, emoji) values (%L, auth.uid(), '👏') $$, :'cid'),
  'row-level security');

-- Sprints -----------------------------------------------------------------
select test.as_user(1);
select test.eq((public.start_new_sprint(:'gid', current_date)).sprint_number, 1,
               'cannot restart a sprint that is still running');
select test.eq((public.start_new_sprint(:'gid', current_date + 7)).sprint_number, 2,
               'restarting after the sprint ends bumps the sprint number');

-- Push tokens are private -------------------------------------------------
insert into public.push_tokens (user_id, token) values (auth.uid(), 'ExponentPushToken[abc]');
select test.as_user(2);
select test.eq((select count(*) from public.push_tokens)::int, 0, 'push tokens are private');

-- Leaving -----------------------------------------------------------------
select public.leave_group(:'gid');
select test.eq((select count(*) from public.groups)::int, 0, 'leaving hides the group');

reset role;
\o
\echo 'All database tests passed ✅'
