-- =====================================================================
-- seed_asif_profile.sql — OPTIONAL
-- Run AFTER Asif has registered in the app. Replace the email below with
-- the one he signed up with. Every value stays editable in Settings.
-- =====================================================================
update public.profiles p set
  full_name     = 'Asif Mohamed',
  location      = 'Qatar',
  profession    = 'Data Analyst',
  timezone      = 'Asia/Qatar',
  program_weeks = 24,
  gym_start     = '16:30',
  gym_end       = '18:00',
  goal          = 'Athletic, muscular, well-defined physique with improved strength and muscle definition.',
  current_build = 'Skinny-fit / athletic. Mild visible results after about two months of training.',
  height_cm     = 180,
  age_years     = 23,
  protein_min_g = 140, protein_max_g = 160,
  kcal_min      = 2500, kcal_max = 2650,
  carbs_g       = 320,  fat_g = 72,
  water_ml      = 3000
from auth.users u
where u.id = p.id and lower(u.email) = lower('REPLACE_WITH_ASIF_EMAIL@example.com');

-- Starting weight from the plan (73.4 kg). Remove if you'd rather log it yourself.
insert into public.body_measurements (user_id, measured_on, weight_kg, notes)
select u.id, (now() at time zone 'Asia/Qatar')::date, 73.4, 'Starting weight from plan'
from auth.users u
where lower(u.email) = lower('REPLACE_WITH_ASIF_EMAIL@example.com')
on conflict (user_id, measured_on) do nothing;
