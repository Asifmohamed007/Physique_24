-- =====================================================================
-- 002_security_and_functions.sql
-- Row Level Security: every private row is readable and writable ONLY by
-- the signed-in owner (auth.uid()). The browser's anon key cannot bypass
-- this — the database enforces it on every query.
-- =====================================================================

-- ---------- Enable RLS on every table ----------
alter table public.profiles                enable row level security;
alter table public.user_settings           enable row level security;
alter table public.exercises               enable row level security;
alter table public.workout_templates       enable row level security;
alter table public.template_exercises      enable row level security;
alter table public.schedule_days           enable row level security;
alter table public.scheduled_workouts      enable row level security;
alter table public.workout_sessions        enable row level security;
alter table public.session_exercises       enable row level security;
alter table public.exercise_sets           enable row level security;
alter table public.personal_records        enable row level security;
alter table public.progression_suggestions enable row level security;
alter table public.foods                   enable row level security;
alter table public.nutrition_entries       enable row level security;
alter table public.water_intake            enable row level security;
alter table public.body_measurements       enable row level security;
alter table public.progress_photos         enable row level security;
alter table public.achievements            enable row level security;
alter table public.user_achievements       enable row level security;

-- ---------- Profiles (keyed by id) ----------
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile select" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- inserts happen through the handle_new_user trigger only

-- ---------- Generic owner-only tables (keyed by user_id) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','workout_templates','template_exercises','schedule_days',
    'scheduled_workouts','workout_sessions','session_exercises','exercise_sets',
    'personal_records','progression_suggestions','nutrition_entries','water_intake',
    'body_measurements','progress_photos','user_achievements'
  ] loop
    execute format('drop policy if exists "owner select" on public.%I', t);
    execute format('drop policy if exists "owner insert" on public.%I', t);
    execute format('drop policy if exists "owner update" on public.%I', t);
    execute format('drop policy if exists "owner delete" on public.%I', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Child rows also carry composite foreign keys (parent_id, user_id), so a
-- user cannot attach a set to someone else's exercise even with a forged id.

-- ---------- Shared library tables: everyone reads shared rows, owns their own ----------
do $$
declare t text;
begin
  foreach t in array array['exercises','foods'] loop
    execute format('drop policy if exists "library select" on public.%I', t);
    execute format('drop policy if exists "library insert" on public.%I', t);
    execute format('drop policy if exists "library update" on public.%I', t);
    execute format('drop policy if exists "library delete" on public.%I', t);
    execute format('create policy "library select" on public.%I for select to authenticated using (user_id is null or user_id = (select auth.uid()))', t);
    execute format('create policy "library insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "library update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "library delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "achievements readable" on public.achievements;
create policy "achievements readable" on public.achievements for select to authenticated using (true);

-- The anon role (signed-out visitors) gets nothing.
revoke all on all tables in schema public from anon;

-- =====================================================================
-- NEW USER BOOTSTRAP
-- Creates profile, settings, the five starter templates from the plan,
-- and the Sat–Wed schedule. Everything is editable afterwards.
-- =====================================================================
create or replace function public.bootstrap_program(uid uuid, start_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t_push uuid; t_pull uuid; t_legs uuid; t_upper uuid; t_lower uuid;
begin
  if exists (select 1 from workout_templates where user_id = uid) then
    return; -- already set up
  end if;

  insert into workout_templates(user_id, name, focus, muscle_tags) values
    (uid, 'Push Day', 'Chest, shoulders, triceps', '{chest,shoulders,triceps}') returning id into t_push;
  insert into workout_templates(user_id, name, focus, muscle_tags) values
    (uid, 'Pull Day + Abs', 'Back, rear delts, biceps, core', '{back,biceps,core}') returning id into t_pull;
  insert into workout_templates(user_id, name, focus, muscle_tags) values
    (uid, 'Legs', 'Quadriceps, hamstrings, glutes, calves', '{legs}') returning id into t_legs;
  insert into workout_templates(user_id, name, focus, muscle_tags) values
    (uid, 'Upper Body + Abs', 'Chest, back, shoulders, arms, core', '{chest,back,shoulders,biceps,triceps,core}') returning id into t_upper;
  insert into workout_templates(user_id, name, focus, muscle_tags) values
    (uid, 'Lower Body', 'Legs, glutes, calves', '{legs}') returning id into t_lower;

  -- helper: (template, slug, position, sets, rep_min, rep_max, rest)
  insert into template_exercises(user_id, template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds)
  select uid, v.tid, e.id, v.pos, v.sets, v.rmin, v.rmax, v.rest
  from (values
    (t_push,  'bench-press',             0, 3,  6, 10, 150),
    (t_push,  'incline-dumbbell-press',  1, 3,  8, 12, 120),
    (t_push,  'shoulder-press',          2, 2,  8, 12, 120),
    (t_push,  'lateral-raise',           3, 3, 12, 20,  75),
    (t_push,  'rope-triceps-pushdown',   4, 3, 10, 15,  75),

    (t_pull,  'lat-pulldown',            0, 3,  8, 12, 120),
    (t_pull,  'chest-supported-row',     1, 3,  8, 12, 120),
    (t_pull,  'seated-cable-row',        2, 2, 10, 12,  90),
    (t_pull,  'reverse-pec-deck',        3, 3, 12, 20,  75),
    (t_pull,  'dumbbell-curl',           4, 3, 10, 15,  75),
    (t_pull,  'cable-crunch',            5, 3, 10, 15,  60),
    (t_pull,  'dead-bug',                6, 2,  8, 12,  60),

    (t_legs,  'leg-press',               0, 3,  8, 12, 150),
    (t_legs,  'romanian-deadlift',       1, 3,  8, 10, 150),
    (t_legs,  'leg-curl',                2, 3, 10, 15,  90),
    (t_legs,  'leg-extension',           3, 2, 10, 15,  90),
    (t_legs,  'calf-raise',              4, 3, 12, 20,  60),

    (t_upper, 'incline-dumbbell-press',  0, 3,  8, 12, 120),
    (t_upper, 'lat-pulldown',            1, 3,  8, 12, 120),
    (t_upper, 'one-arm-cable-row',       2, 2, 10, 12,  90),
    (t_upper, 'lateral-raise',           3, 3, 12, 20,  75),
    (t_upper, 'cable-triceps-extension', 4, 2, 10, 15,  75),
    (t_upper, 'hammer-curl',             5, 2, 10, 15,  75),
    (t_upper, 'hanging-knee-raise',      6, 3,  8, 15,  60),

    (t_lower, 'squat',                   0, 3,  6, 10, 180),
    (t_lower, 'hip-thrust',              1, 3,  8, 12, 120),
    (t_lower, 'leg-curl',                2, 3, 10, 15,  90),
    (t_lower, 'split-squat',             3, 2,  8, 10,  90),
    (t_lower, 'seated-calf-raise',       4, 3, 12, 20,  60)
  ) as v(tid, slug, pos, sets, rmin, rmax, rest)
  join exercises e on e.slug = v.slug and e.user_id is null;

  -- 0=Sun … 6=Sat ; null = rest
  insert into schedule_days(user_id, weekday, template_id, effective_from) values
    (uid, 6, t_push,  start_on),
    (uid, 0, t_pull,  start_on),
    (uid, 1, t_legs,  start_on),
    (uid, 2, t_upper, start_on),
    (uid, 3, t_lower, start_on),
    (uid, 4, null,    start_on),
    (uid, 5, null,    start_on);
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Qatar')::date;
begin
  insert into profiles(id, full_name, timezone, start_date)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120),
    coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'Asia/Qatar'),
    today
  ) on conflict (id) do nothing;

  insert into user_settings(user_id) values (new.id) on conflict do nothing;

  -- Never block sign-up if the library has not been seeded yet.
  begin
    perform bootstrap_program(new.id, today - 7);
  exception when others then
    raise warning 'bootstrap_program failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users can (re)run the starter setup for themselves only, e.g. if they
-- signed up before seed.sql was run.
create or replace function public.ensure_my_program()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  insert into profiles(id) values (uid) on conflict do nothing;
  insert into user_settings(user_id) values (uid) on conflict do nothing;
  perform bootstrap_program(uid, (select start_date from profiles where id = uid) - 7);
end $$;
revoke all on function public.ensure_my_program() from public, anon;
grant execute on function public.ensure_my_program() to authenticated;
revoke all on function public.bootstrap_program(uuid, date) from public, anon, authenticated;

-- =====================================================================
-- ACCOUNT DELETION
-- The app first deletes the user's photo files through the Storage API,
-- then calls this. Deleting the auth user cascades to every table above.
-- =====================================================================
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
