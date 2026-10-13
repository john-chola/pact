-- =====================================================================
-- Pact — database schema
--
-- Run this whole file in the Supabase SQL editor (Dashboard → SQL → New
-- query). It is safe to re-run: tables are created only if missing,
-- missing columns are added, and functions/policies/triggers are replaced.
--
-- NOTE: re-running drops every existing RLS policy on the Pact tables and
-- recreates the ones below, so hand-written policies will be replaced.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists what_im_building text;
alter table public.profiles add column if not exists goal text;
alter table public.profiles add column if not exists streak_count int not null default 0;
alter table public.profiles add column if not exists longest_streak int not null default 0;
alter table public.profiles add column if not exists last_checkin_date date;
alter table public.profiles add column if not exists reminders_enabled boolean not null default false;
alter table public.profiles add column if not exists reminder_hour int not null default 20;
alter table public.profiles add column if not exists reminder_minute int not null default 0;
alter table public.profiles add column if not exists last_nudged_at timestamptz;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.groups add column if not exists goal_category text not null default 'coding';
alter table public.groups add column if not exists sprint_duration_days int not null default 7;
alter table public.groups add column if not exists max_members int not null default 5;
alter table public.groups add column if not exists join_code text;
alter table public.groups add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.groups add column if not exists sprint_number int not null default 1;
alter table public.groups add column if not exists sprint_start_date date not null default current_date;
create unique index if not exists groups_join_code_key on public.groups (join_code);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now()
);
alter table public.group_members add column if not exists streak_count int not null default 0;
alter table public.group_members add column if not exists longest_streak int not null default 0;
alter table public.group_members add column if not exists last_checkin_date date;

-- Earlier versions of the app could insert the same membership twice.
delete from public.group_members a
  using public.group_members b
  where a.group_id = b.group_id
    and a.user_id = b.user_id
    and (a.joined_at, a.id::text) > (b.joined_at, b.id::text);
create unique index if not exists group_members_group_user_key
  on public.group_members (group_id, user_id);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  worked_on text not null,
  duration_minutes int not null default 0,
  honest_feeling text,
  tomorrow_plan text,
  created_at timestamptz not null default now()
);
alter table public.checkins add column if not exists checkin_date date;
alter table public.checkins add column if not exists sprint_number int;
update public.checkins set checkin_date = created_at::date where checkin_date is null;
update public.checkins c set sprint_number = 1 where sprint_number is null;
create index if not exists checkins_group_created_idx on public.checkins (group_id, created_at desc);
create index if not exists checkins_user_group_date_idx on public.checkins (user_id, group_id, checkin_date);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '💪', '👏', '❤️')),
  created_at timestamptz not null default now(),
  unique (checkin_id, user_id, emoji)
);
create index if not exists reactions_checkin_idx on public.reactions (checkin_id);

-- Push tokens are kept out of `profiles` so group mates can't read them.
create table if not exists public.push_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Helpers (security definer so RLS policies can call them without
-- recursing into group_members' own policy)
-- ---------------------------------------------------------------------

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

create or replace function public.generate_join_code()
returns text
language plpgsql volatile
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where join_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------
-- New user → profile row
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, what_im_building)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'what_im_building', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before the trigger existed.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Groups: create / join / restart sprint
-- ---------------------------------------------------------------------

create or replace function public.create_group(
  p_name text,
  p_goal_category text,
  p_start_date date default current_date
)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Give your group a name';
  end if;

  insert into public.groups (name, goal_category, created_by, join_code, sprint_start_date)
  values (trim(p_name), coalesce(nullif(p_goal_category, ''), 'coding'), auth.uid(),
          public.generate_join_code(), coalesce(p_start_date, current_date))
  returning * into g;

  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end;
$$;

create or replace function public.join_group_by_code(p_code text)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  g public.groups;
  member_count int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into g from public.groups
  where join_code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Group not found. Check the code and try again.';
  end if;

  if exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then
    return g;
  end if;

  select count(*) into member_count from public.group_members where group_id = g.id;
  if member_count >= g.max_members then
    raise exception 'This pact is full (% of % spots taken).', member_count, g.max_members;
  end if;

  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end;
$$;

create or replace function public.start_new_sprint(p_group_id uuid, p_start_date date default current_date)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  g public.groups;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not in this group';
  end if;

  select * into g from public.groups where id = p_group_id for update;

  -- Only restart once the current sprint has actually finished.
  if coalesce(p_start_date, current_date) < g.sprint_start_date + g.sprint_duration_days then
    return g;
  end if;

  update public.groups
  set sprint_number = sprint_number + 1,
      sprint_start_date = coalesce(p_start_date, current_date)
  where id = p_group_id
  returning * into g;
  return g;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.group_members where group_id = p_group_id and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Check-ins: one per user per group per day, streaks maintained by trigger
-- ---------------------------------------------------------------------

create or replace function public.next_streak(p_current int, p_last date, p_today date)
returns int
language sql immutable
as $$
  select case
    when p_last = p_today then greatest(p_current, 1)
    when p_last = p_today - 1 then p_current + 1
    else 1
  end;
$$;

create or replace function public.before_checkin_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Clients send their local calendar date; allow ±1 day around the server's
  -- UTC date to cover every timezone.
  new.checkin_date := coalesce(new.checkin_date, current_date);
  if new.checkin_date not between current_date - 1 and current_date + 1 then
    raise exception 'Invalid check-in date';
  end if;

  if coalesce(trim(new.worked_on), '') = '' then
    raise exception 'Tell your group what you worked on';
  end if;
  new.duration_minutes := greatest(coalesce(new.duration_minutes, 0), 0);

  if exists (
    select 1 from public.checkins
    where user_id = new.user_id and group_id = new.group_id and checkin_date = new.checkin_date
  ) then
    raise exception 'You already checked in today 🔥';
  end if;

  select sprint_number into new.sprint_number from public.groups where id = new.group_id;
  return new;
end;
$$;

drop trigger if exists checkins_before_insert on public.checkins;
create trigger checkins_before_insert
  before insert on public.checkins
  for each row execute function public.before_checkin_insert();

create or replace function public.after_checkin_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.group_members
  set streak_count = public.next_streak(streak_count, last_checkin_date, new.checkin_date),
      longest_streak = greatest(longest_streak,
        public.next_streak(streak_count, last_checkin_date, new.checkin_date)),
      last_checkin_date = greatest(last_checkin_date, new.checkin_date)
  where group_id = new.group_id and user_id = new.user_id
    and (last_checkin_date is null or last_checkin_date < new.checkin_date);

  update public.profiles
  set streak_count = public.next_streak(streak_count, last_checkin_date, new.checkin_date),
      longest_streak = greatest(longest_streak,
        public.next_streak(streak_count, last_checkin_date, new.checkin_date)),
      last_checkin_date = greatest(last_checkin_date, new.checkin_date)
  where id = new.user_id
    and (last_checkin_date is null or last_checkin_date < new.checkin_date);

  return new;
end;
$$;

drop trigger if exists checkins_after_insert on public.checkins;
create trigger checkins_after_insert
  after insert on public.checkins
  for each row execute function public.after_checkin_insert();

-- Older app versions called this RPC after inserting a check-in. Streaks are
-- now kept by the trigger above, so it is a no-op kept for compatibility.
drop function if exists public.update_streak(uuid);
create or replace function public.update_streak(user_id uuid)
returns void
language plpgsql
as $$ begin end; $$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'groups', 'group_members', 'checkins', 'reactions', 'push_tokens')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.checkins enable row level security;
alter table public.reactions enable row level security;
alter table public.push_tokens enable row level security;

create policy "profiles: read self and group mates" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));
create policy "profiles: insert self" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Groups are created/joined/restarted through the RPCs above.
create policy "groups: members read" on public.groups
  for select to authenticated using (public.is_group_member(id));

create policy "group_members: members read" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "group_members: leave" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

create policy "checkins: members read" on public.checkins
  for select to authenticated using (public.is_group_member(group_id));
create policy "checkins: members post own" on public.checkins
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "checkins: delete own" on public.checkins
  for delete to authenticated using (user_id = auth.uid());

create policy "reactions: members read" on public.reactions
  for select to authenticated
  using (exists (
    select 1 from public.checkins c
    where c.id = checkin_id and public.is_group_member(c.group_id)
  ));
create policy "reactions: members react" on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.checkins c
    where c.id = checkin_id and public.is_group_member(c.group_id)
  ));
create policy "reactions: remove own" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

create policy "push_tokens: own" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Clients must go through the RPCs for these.
revoke insert, update, delete on public.groups from anon, authenticated;
revoke insert, update on public.group_members from anon, authenticated;
revoke update on public.checkins from anon, authenticated;
-- Streak columns are maintained by triggers only.
revoke update on public.profiles from anon, authenticated;
grant update (name, what_im_building, goal, reminders_enabled, reminder_hour, reminder_minute)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['checkins', 'reactions', 'group_members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then raise notice 'supabase_realtime publication not found';
    end;
  end loop;
end;
$$;
