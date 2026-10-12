-- =====================================================================
-- 001_schema.sql — Asif's 6-Month Physique Tracker
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Run the files in order: 001, 002, 003, then seed.sql.
-- =====================================================================

create extension if not exists pgcrypto;

-- Keeps updated_at current on every UPDATE.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- PROFILES (one row per auth user)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null default '' check (char_length(full_name) <= 120),
  location         text not null default '' check (char_length(location) <= 120),
  profession       text not null default '' check (char_length(profession) <= 120),
  timezone         text not null default 'Asia/Qatar' check (char_length(timezone) between 3 and 64),
  start_date       date not null default (now() at time zone 'Asia/Qatar')::date,
  program_weeks    smallint not null default 24 check (program_weeks between 4 and 104),
  gym_start        time not null default '16:30',
  gym_end          time not null default '18:00',
  goal             text not null default '' check (char_length(goal) <= 500),
  current_build    text not null default '' check (char_length(current_build) <= 200),
  height_cm        numeric(5,1) check (height_cm is null or height_cm between 100 and 250),
  age_years        smallint check (age_years is null or age_years between 13 and 100),
  protein_min_g    smallint not null default 140 check (protein_min_g between 0 and 500),
  protein_max_g    smallint not null default 160 check (protein_max_g between 0 and 500),
  kcal_min         smallint not null default 2500 check (kcal_min between 0 and 8000),
  kcal_max         smallint not null default 2650 check (kcal_max between 0 and 8000),
  carbs_g          smallint not null default 320 check (carbs_g between 0 and 1000),
  fat_g            smallint not null default 72 check (fat_g between 0 and 400),
  water_ml         integer  not null default 3000 check (water_ml between 0 and 10000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint protein_range check (protein_min_g <= protein_max_g),
  constraint kcal_range    check (kcal_min <= kcal_max),
  constraint gym_window    check (gym_start < gym_end)
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- USER SETTINGS (app preferences)
-- ---------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  weight_unit           text not null default 'kg' check (weight_unit in ('kg','lb')),
  default_rest_seconds  smallint not null default 90 check (default_rest_seconds between 15 and 600),
  weekly_target         smallint not null default 5 check (weekly_target between 1 and 7),
  reduced_motion        boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- EXERCISE LIBRARY  (user_id null = shared library seeded by admin)
-- ---------------------------------------------------------------------
create table if not exists public.exercises (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade,
  slug               text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  name               text not null check (char_length(name) between 2 and 120),
  muscle_group       text not null check (muscle_group in ('chest','back','shoulders','arms','legs','core','other')),
  primary_muscles    text[] not null default '{}',
  secondary_muscles  text[] not null default '{}',
  equipment          text not null default 'other'
                     check (equipment in ('barbell','dumbbell','machine','cable','bodyweight','band','other')),
  instructions       text not null default '',
  safety_tips        text not null default '',
  default_sets       smallint not null default 3 check (default_sets between 1 and 10),
  rep_min            smallint not null default 8 check (rep_min between 1 and 100),
  rep_max            smallint not null default 12 check (rep_max between 1 and 100),
  load_increment_kg  numeric(4,2) not null default 2.5 check (load_increment_kg between 0 and 20),
  per_side           boolean not null default false,
  image_url          text check (image_url is null or image_url ~ '^https://'),
  image_attribution  text,
  video_url          text check (video_url is null or video_url ~ '^https://'),
  media_source_url   text check (media_source_url is null or media_source_url ~ '^https://'),
  alternatives       text[] not null default '{}',   -- slugs
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint ex_rep_range check (rep_min <= rep_max)
);
create unique index if not exists ux_exercises_global_slug on public.exercises(slug) where user_id is null;
create unique index if not exists ux_exercises_user_slug   on public.exercises(user_id, slug) where user_id is not null;
create index if not exists ix_exercises_group on public.exercises(muscle_group);
create trigger trg_exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- WORKOUT TEMPLATES + TEMPLATE EXERCISES
-- ---------------------------------------------------------------------
create table if not exists public.workout_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 80),
  focus        text not null default '' check (char_length(focus) <= 200),
  muscle_tags  text[] not null default '{}',   -- used to warn about back-to-back sessions
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists ix_templates_user on public.workout_templates(user_id);
create trigger trg_templates_touch before update on public.workout_templates
  for each row execute function public.touch_updated_at();

create table if not exists public.template_exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  template_id   uuid not null,
  exercise_id   uuid not null references public.exercises(id) on delete restrict,
  position      smallint not null default 0 check (position between 0 and 100),
  target_sets   smallint not null default 3 check (target_sets between 1 and 10),
  rep_min       smallint not null default 8 check (rep_min between 1 and 100),
  rep_max       smallint not null default 12 check (rep_max between 1 and 100),
  rest_seconds  smallint check (rest_seconds is null or rest_seconds between 15 and 600),
  notes         text not null default '' check (char_length(notes) <= 500),
  created_at    timestamptz not null default now(),
  constraint te_rep_range check (rep_min <= rep_max),
  -- composite FK guarantees the template belongs to the same user
  foreign key (template_id, user_id) references public.workout_templates(id, user_id) on delete cascade
);
create index if not exists ix_te_template on public.template_exercises(template_id, position);

-- ---------------------------------------------------------------------
-- WEEKLY SCHEDULE (versioned by effective_from so history is preserved)
-- template_id null = rest day
-- weekday follows JavaScript: 0=Sunday … 6=Saturday
-- ---------------------------------------------------------------------
create table if not exists public.schedule_days (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6),
  template_id     uuid,
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  unique (user_id, weekday, effective_from),
  foreign key (template_id, user_id) references public.workout_templates(id, user_id) on delete set null (template_id)
);
create index if not exists ix_schedule_user on public.schedule_days(user_id, effective_from);

-- ---------------------------------------------------------------------
-- SCHEDULED WORKOUTS (overrides: skipped / rescheduled / completed)
-- Planned and missed days are derived from schedule_days; a row exists
-- only when the user acts on a day.
-- ---------------------------------------------------------------------
create table if not exists public.scheduled_workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  scheduled_date   date not null,
  template_id      uuid,
  template_name    text not null default '',
  status           text not null check (status in ('planned','completed','skipped','rescheduled','missed')),
  rescheduled_to   date,
  session_id       uuid,
  note             text not null default '' check (char_length(note) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, scheduled_date, template_name),
  constraint resched_has_date check (status <> 'rescheduled' or rescheduled_to is not null),
  constraint resched_not_same check (rescheduled_to is null or rescheduled_to <> scheduled_date)
);
create index if not exists ix_sw_user_date on public.scheduled_workouts(user_id, scheduled_date);
create index if not exists ix_sw_resched  on public.scheduled_workouts(user_id, rescheduled_to);
create trigger trg_sw_touch before update on public.scheduled_workouts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- WORKOUT SESSIONS → SESSION EXERCISES → EXERCISE SETS
-- Names, muscles and targets are SNAPSHOTS so template edits never
-- rewrite completed history.
-- ---------------------------------------------------------------------
create table if not exists public.workout_sessions (
  id              uuid primary key,            -- generated on the client for idempotent retries
  user_id         uuid not null references auth.users(id) on delete cascade,
  template_id     uuid,
  name            text not null check (char_length(name) between 1 and 80),
  focus           text not null default '',
  session_date    date not null,
  planned_date    date,                        -- the scheduled day this session fulfils
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  status          text not null default 'in_progress' check (status in ('in_progress','completed','discarded')),
  notes           text not null default '' check (char_length(notes) <= 2000),
  difficulty      smallint check (difficulty is null or difficulty between 1 and 10),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  constraint ended_after_start check (ended_at is null or ended_at >= started_at),
  constraint completed_has_end check (status <> 'completed' or ended_at is not null)
);
-- only one unfinished workout at a time
create unique index if not exists ux_one_active_session on public.workout_sessions(user_id) where status = 'in_progress';
-- a planned day can only be completed once (prevents duplicate streak credit)
create unique index if not exists ux_one_completion_per_plan
  on public.workout_sessions(user_id, planned_date, name) where status = 'completed' and planned_date is not null;
create index if not exists ix_sessions_user_date on public.workout_sessions(user_id, session_date desc);
create trigger trg_sessions_touch before update on public.workout_sessions
  for each row execute function public.touch_updated_at();

create table if not exists public.session_exercises (
  id               uuid primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  session_id       uuid not null,
  exercise_id      uuid references public.exercises(id) on delete set null,
  exercise_name    text not null check (char_length(exercise_name) between 1 and 120),
  muscle_group     text not null default 'other',
  equipment        text not null default 'other',
  position         smallint not null default 0,
  target_sets      smallint not null default 3 check (target_sets between 1 and 10),
  rep_min          smallint not null default 8,
  rep_max          smallint not null default 12,
  rest_seconds     smallint not null default 90 check (rest_seconds between 15 and 600),
  notes            text not null default '' check (char_length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.workout_sessions(id, user_id) on delete cascade
);
create index if not exists ix_se_session  on public.session_exercises(session_id, position);
create index if not exists ix_se_exercise on public.session_exercises(user_id, exercise_id);

create table if not exists public.exercise_sets (
  id                    uuid primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  session_exercise_id   uuid not null,
  set_number            smallint not null check (set_number between 1 and 20),
  weight_kg             numeric(6,2) check (weight_kg is null or weight_kg between 0 and 1000),
  reps                  smallint check (reps is null or reps between 0 and 200),
  completed             boolean not null default false,
  completed_at          timestamptz,
  updated_at            timestamptz not null default now(),
  unique (session_exercise_id, set_number),
  foreign key (session_exercise_id, user_id) references public.session_exercises(id, user_id) on delete cascade
);
create trigger trg_sets_touch before update on public.exercise_sets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- PERSONAL RECORDS + PROGRESSION SUGGESTIONS
-- ---------------------------------------------------------------------
create table if not exists public.personal_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  exercise_id    uuid references public.exercises(id) on delete set null,
  exercise_name  text not null,
  record_type    text not null check (record_type in ('max_weight','est_1rm','max_reps')),
  value          numeric(7,2) not null check (value >= 0),
  weight_kg      numeric(6,2),
  reps           smallint,
  session_id     uuid,
  achieved_on    date not null,
  created_at     timestamptz not null default now(),
  unique (user_id, exercise_name, record_type, session_id)
);
create index if not exists ix_pr_user on public.personal_records(user_id, achieved_on desc);

create table if not exists public.progression_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  exercise_id          uuid references public.exercises(id) on delete set null,
  exercise_name        text not null,
  based_on_session_id  uuid,
  kind                 text not null check (kind in ('increase','hold','recovery_check')),
  message              text not null default '',
  current_weight_kg    numeric(6,2),
  suggested_weight_kg  numeric(6,2),
  status               text not null default 'pending' check (status in ('pending','accepted','rejected','edited','superseded')),
  final_weight_kg      numeric(6,2),
  result_session_id    uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, exercise_name, based_on_session_id)
);
create index if not exists ix_ps_user_pending on public.progression_suggestions(user_id, status);
create trigger trg_ps_touch before update on public.progression_suggestions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- NUTRITION
-- ---------------------------------------------------------------------
create table if not exists public.foods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,  -- null = shared
  name          text not null check (char_length(name) between 1 and 120),
  serving_desc  text not null default '1 serving',
  serving_g     numeric(7,1),
  kcal          numeric(7,1) not null check (kcal >= 0),
  protein_g     numeric(6,1) not null check (protein_g >= 0),
  carbs_g       numeric(6,1) not null check (carbs_g >= 0),
  fat_g         numeric(6,1) not null check (fat_g >= 0),
  is_estimate   boolean not null default true,
  source        text not null default 'Typical values — check package labels',
  quick_add     boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists ux_foods_global_name on public.foods(lower(name)) where user_id is null;
create unique index if not exists ux_foods_user_name   on public.foods(user_id, lower(name)) where user_id is not null;

create table if not exists public.nutrition_entries (
  id           uuid primary key,          -- client generated
  user_id      uuid not null references auth.users(id) on delete cascade,
  entry_date   date not null,
  meal         text not null check (meal in ('morning','mid_morning','lunch','pre_workout','post_workout','evening','other')),
  eaten_at     time,
  food_id      uuid references public.foods(id) on delete set null,
  food_name    text not null check (char_length(food_name) between 1 and 120),
  servings     numeric(5,2) not null check (servings > 0 and servings <= 50),
  kcal         numeric(7,1) not null check (kcal >= 0),
  protein_g    numeric(6,1) not null check (protein_g >= 0),
  carbs_g      numeric(6,1) not null check (carbs_g >= 0),
  fat_g        numeric(6,1) not null check (fat_g >= 0),
  is_estimate  boolean not null default true,
  notes        text not null default '' check (char_length(notes) <= 300),
  created_at   timestamptz not null default now()
);
create index if not exists ix_ne_user_date on public.nutrition_entries(user_id, entry_date);

create table if not exists public.water_intake (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  entry_date  date not null,
  amount_ml   integer not null check (amount_ml between 1 and 5000),
  logged_at   timestamptz not null default now()
);
create index if not exists ix_water_user_date on public.water_intake(user_id, entry_date);

-- ---------------------------------------------------------------------
-- BODY MEASUREMENTS + PROGRESS PHOTOS
-- ---------------------------------------------------------------------
create table if not exists public.body_measurements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  measured_on   date not null,
  weight_kg     numeric(5,2) check (weight_kg is null or weight_kg between 25 and 350),
  waist_cm      numeric(5,1) check (waist_cm is null or waist_cm between 30 and 250),
  chest_cm      numeric(5,1) check (chest_cm is null or chest_cm between 40 and 250),
  shoulders_cm  numeric(5,1) check (shoulders_cm is null or shoulders_cm between 40 and 250),
  arms_cm       numeric(5,1) check (arms_cm is null or arms_cm between 10 and 80),
  thighs_cm     numeric(5,1) check (thighs_cm is null or thighs_cm between 20 and 120),
  hips_cm       numeric(5,1) check (hips_cm is null or hips_cm between 40 and 250),
  sleep_hours   numeric(3,1) check (sleep_hours is null or sleep_hours between 0 and 24),
  energy        smallint check (energy is null or energy between 1 and 5),
  notes         text not null default '' check (char_length(notes) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, measured_on)
);
create trigger trg_bm_touch before update on public.body_measurements
  for each row execute function public.touch_updated_at();

create table if not exists public.progress_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  storage_path  text not null unique,
  pose          text not null default 'front' check (pose in ('front','side','back','other')),
  taken_on      date not null,
  notes         text not null default '' check (char_length(notes) <= 300),
  created_at    timestamptz not null default now(),
  -- path must start with the owner's id folder
  constraint photo_path_owner check (split_part(storage_path, '/', 1) = user_id::text)
);
create index if not exists ix_photos_user on public.progress_photos(user_id, taken_on);

-- ---------------------------------------------------------------------
-- ACHIEVEMENTS
-- ---------------------------------------------------------------------
create table if not exists public.achievements (
  code         text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name         text not null,
  description  text not null,
  sort         smallint not null default 0
);

create table if not exists public.user_achievements (
  user_id    uuid not null references auth.users(id) on delete cascade,
  code       text not null references public.achievements(code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, code)
);
