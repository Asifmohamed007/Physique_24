-- =====================================================================
-- 004_variety_and_time.sql
-- Adds: exercise variation groups (for rotating exercises between
-- sessions), exercise priority (for fitting workouts into your time),
-- ~35 new exercises, session-length and rotation settings, and a few
-- optional extra slots per workout.
-- Safe to run more than once. Run AFTER 001–003 and seed.sql.
-- =====================================================================

alter table public.exercises
  add column if not exists variation_group text,
  add column if not exists priority smallint not null default 2;
do $$ begin
  alter table public.exercises add constraint ex_priority check (priority between 1 and 3);
exception when duplicate_object then null; end $$;
create index if not exists ix_exercises_vgroup on public.exercises(variation_group);

alter table public.user_settings
  add column if not exists session_minutes smallint,
  add column if not exists rotation_mode text not null default 'all';
do $$ begin
  alter table public.user_settings add constraint us_session_minutes check (session_minutes is null or session_minutes between 20 and 240);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_settings add constraint us_rotation_mode check (rotation_mode in ('all','accessories','off'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- New exercises
-- ---------------------------------------------------------------------
insert into public.exercises
  (slug, name, muscle_group, primary_muscles, secondary_muscles, equipment,
   instructions, safety_tips, default_sets, rep_min, rep_max, load_increment_kg, per_side, alternatives)
values
('dumbbell-bench-press','Dumbbell Bench Press','chest','{chest}','{front delts,triceps}','dumbbell',
 'Lie flat with dumbbells over the chest. Lower them to the sides of the chest with elbows about 45° from the body, then press up.',
 'Kick the dumbbells up from your thighs to start; lower them back to the thighs to finish.',3,8,12,2,false,'{bench-press,machine-chest-press}'),
('incline-barbell-press','Incline Barbell Press','chest','{upper chest}','{front delts,triceps}','barbell',
 'Bench at 30–45°. Lower the bar to the upper chest under control, then press up.',
 'Use safety pins or a spotter. Keep shoulder blades pulled back.',3,6,10,2.5,false,'{incline-dumbbell-press}'),
('incline-machine-press','Incline Machine Press','chest','{upper chest}','{front delts,triceps}','machine',
 'Set the seat so handles start around upper-chest height. Press up and forward, return slowly.',
 'Keep your back against the pad.',3,8,12,2.5,false,'{incline-dumbbell-press}'),
('pec-deck','Pec Deck Fly','chest','{chest}','{front delts}','machine',
 'Sit tall, arms on the pads or handles at chest height. Bring them together in front, squeeze, return slowly.',
 'Stop the stretch at a comfortable range for your shoulders.',3,10,15,2.5,false,'{cable-fly,dumbbell-fly}'),
('dumbbell-fly','Dumbbell Fly','chest','{chest}','{front delts}','dumbbell',
 'Lie flat, dumbbells above the chest, slight elbow bend. Open the arms wide in an arc, then bring them back together.',
 'Use light weights; the stretch at the bottom is where shoulders are most at risk.',3,10,15,1,false,'{cable-fly,pec-deck}'),
('assisted-dip','Assisted Dip','arms','{triceps,chest}','{front delts}','machine',
 'On the assisted dip machine, lower until upper arms are about parallel to the floor, then press back up.',
 'Skip if dips bother your shoulders. More assistance = easier.',3,6,12,2.5,false,'{rope-triceps-pushdown}'),
('machine-shoulder-press','Machine Shoulder Press','shoulders','{front delts,side delts}','{triceps}','machine',
 'Seat height so handles start at shoulder level. Press overhead without locking hard, lower under control.',
 'Keep your back against the pad.',2,8,12,2.5,false,'{shoulder-press}'),
('arnold-press','Arnold Press','shoulders','{front delts,side delts}','{triceps}','dumbbell',
 'Start with dumbbells at chin height, palms facing you. Rotate palms forward as you press overhead, reverse on the way down.',
 'Go lighter than a normal shoulder press.',2,8,12,1,false,'{shoulder-press}'),
('cable-lateral-raise','Cable Lateral Raise','shoulders','{side delts}','{traps}','cable',
 'Stand side-on to a low pulley, handle in the far hand. Raise the arm out to shoulder height, lower slowly.',
 'Light weight, no swinging.',3,12,20,1.25,true,'{lateral-raise}'),
('machine-lateral-raise','Machine Lateral Raise','shoulders','{side delts}','{}','machine',
 'Pads against the outside of the arms. Raise to shoulder height, pause, lower slowly.',
 'Keep shoulders down; do not shrug.',3,12,20,2.5,false,'{lateral-raise}'),
('straight-bar-pushdown','Straight-Bar Pushdown','arms','{triceps}','{}','cable',
 'High pulley with a straight or V bar. Elbows pinned to your sides, push down to full extension.',
 'Only the forearms move.',3,10,15,2.5,false,'{rope-triceps-pushdown}'),
('overhead-dumbbell-extension','Overhead Dumbbell Extension','arms','{triceps}','{}','dumbbell',
 'Seated, hold one dumbbell overhead with both hands. Lower it behind your head by bending the elbows, then extend.',
 'Keep elbows pointing up and the core braced.',2,10,15,1,false,'{cable-triceps-extension}'),
('skull-crusher','EZ-Bar Skull Crusher','arms','{triceps}','{}','barbell',
 'Lie flat holding an EZ bar over the chest. Bend the elbows to lower the bar toward the forehead, then extend.',
 'Use a light load and control the bottom position.',2,10,15,1.25,false,'{cable-triceps-extension}'),
('close-grip-pulldown','Close-Grip Pulldown','back','{lats}','{biceps,mid back}','cable',
 'Use a V-handle. Lean back slightly and pull the handle to the upper chest, elbows down and back.',
 'Avoid swinging the torso.',3,8,12,2.5,false,'{lat-pulldown}'),
('t-bar-row','Chest-Supported T-Bar Row','back','{mid back,lats}','{rear delts,biceps}','machine',
 'Chest on the pad, grip the handles. Row toward the chest, squeeze the shoulder blades, lower fully.',
 'Keep the chest on the pad.',3,8,12,2.5,false,'{chest-supported-row}'),
('machine-row','Machine Row','back','{mid back,lats}','{rear delts,biceps}','machine',
 'Chest against the pad. Pull the handles back, squeeze, return slowly.',
 'Adjust the seat so handles are at mid-chest.',3,8,12,2.5,false,'{chest-supported-row}'),
('one-arm-dumbbell-row','One-Arm Dumbbell Row','back','{lats}','{mid back,biceps}','dumbbell',
 'One knee and hand on a bench, back flat. Row the dumbbell toward your hip, lower fully. Repeat on the other side.',
 'Keep the back flat and hips square.',2,10,12,2,true,'{one-arm-cable-row}'),
('rear-delt-fly','Dumbbell Rear-Delt Fly','shoulders','{rear delts}','{mid back}','dumbbell',
 'Lie chest-down on an incline bench. Raise light dumbbells out to the sides, lead with the elbows, lower slowly.',
 'Very light weights; feel the back of the shoulders.',3,12,20,1,false,'{reverse-pec-deck}'),
('ez-bar-curl','EZ-Bar Curl','arms','{biceps}','{forearms}','barbell',
 'Stand tall holding an EZ bar. Curl it up without moving the elbows forward, lower fully.',
 'No hip swing.',3,10,15,1.25,false,'{dumbbell-curl}'),
('cable-curl','Cable Curl','arms','{biceps}','{forearms}','cable',
 'Low pulley with a bar or rope. Curl up keeping elbows at your sides, lower slowly.',
 'Stand far enough back that the weight stack does not touch down between reps.',3,10,15,2.5,false,'{dumbbell-curl}'),
('incline-dumbbell-curl','Incline Dumbbell Curl','arms','{biceps}','{forearms}','dumbbell',
 'Sit back on a bench set to about 60°, arms hanging. Curl up without bringing the elbows forward.',
 'Lighter than standing curls.',3,10,15,1,false,'{dumbbell-curl}'),
('rope-hammer-curl','Rope Hammer Curl','arms','{biceps,brachialis}','{forearms}','cable',
 'Low pulley with a rope, palms facing each other. Curl up, lower slowly.',
 'Keep elbows close to your body.',2,10,15,2.5,false,'{hammer-curl}'),
('preacher-curl','Preacher Curl','arms','{biceps}','{}','machine',
 'Upper arms on the preacher pad. Curl up, lower almost to full extension under control.',
 'Do not drop into the bottom position.',2,10,15,2.5,false,'{hammer-curl}'),
('machine-crunch','Machine Crunch','core','{abs}','{}','machine',
 'Sit in the ab crunch machine. Curl the ribs toward the hips, return slowly.',
 'Move from the spine, not the arms.',3,10,15,2.5,false,'{cable-crunch}'),
('plank','Plank','core','{abs}','{shoulders,glutes}','bodyweight',
 'Forearms under shoulders, body in a straight line. Hold. Log seconds as reps.',
 'Drop to the knees if the lower back sags.',2,20,45,0,false,'{dead-bug}'),
('pallof-press','Pallof Press','core','{obliques,abs}','{}','cable',
 'Stand side-on to a chest-height pulley. Press the handle straight out and resist the twist, return.',
 'Light weight; the challenge is staying still.',2,10,12,1.25,true,'{dead-bug}'),
('ab-wheel-rollout','Ab Wheel Rollout','core','{abs}','{lats}','other',
 'Kneel holding the wheel. Roll forward as far as you can keep the back flat, then pull back.',
 'Start with a short range.',2,6,12,0,false,'{plank}'),
('lying-leg-raise','Lying Leg Raise','core','{abs}','{hip flexors}','bodyweight',
 'Lie on your back, hands under hips. Raise straight legs to vertical, lower slowly without arching.',
 'Bend the knees to make it easier.',3,8,15,0,false,'{hanging-knee-raise}'),
('hack-squat','Hack Squat','legs','{quadriceps,glutes}','{}','machine',
 'Shoulders under the pads, feet shoulder-width. Release the safety, lower to a comfortable depth, drive up.',
 'Keep your back on the pad; re-engage the safeties at the end.',3,8,12,5,false,'{leg-press,squat}'),
('goblet-squat','Goblet Squat','legs','{quadriceps,glutes}','{core}','dumbbell',
 'Hold a dumbbell at your chest. Sit down between your hips keeping the chest up, then stand.',
 'Great for learning squat technique.',3,8,12,2,false,'{squat,leg-press}'),
('dumbbell-rdl','Dumbbell Romanian Deadlift','legs','{hamstrings,glutes}','{lower back}','dumbbell',
 'Hold dumbbells in front of the thighs. Push the hips back with soft knees until you feel a hamstring stretch, then stand.',
 'Flat back; stop if the lower back aches.',3,8,12,2,false,'{romanian-deadlift}'),
('back-extension','45° Back Extension','legs','{glutes,hamstrings}','{lower back}','bodyweight',
 'Hips on the pad. Lower the torso, then rise by squeezing the glutes until the body is straight.',
 'Do not hyperextend at the top.',3,10,15,2.5,false,'{romanian-deadlift}'),
('seated-leg-curl','Seated Leg Curl','legs','{hamstrings}','{}','machine',
 'Thigh pad snug, roller just above the heels. Curl down and back, pause, return slowly.',
 'Keep hips against the seat.',3,10,15,2.5,false,'{leg-curl}'),
('leg-press-calf-raise','Leg Press Calf Raise','legs','{calves}','{}','machine',
 'On the leg press, balls of feet on the bottom edge of the platform. Push through the toes, lower for a stretch.',
 'Keep the knees straight but not locked; never remove the safety.',3,12,20,5,false,'{calf-raise}'),
('glute-bridge','Glute Bridge','legs','{glutes}','{hamstrings}','bodyweight',
 'Lie on your back, feet flat. Drive the hips up, squeeze, lower. Add a weight on the hips when easy.',
 'Ribs down; do not arch the back.',3,10,15,2.5,false,'{hip-thrust}'),
('cable-kickback','Cable Glute Kickback','legs','{glutes}','{}','cable',
 'Ankle strap on a low pulley. Kick the leg straight back, squeeze, return slowly.',
 'Keep the torso still.',2,12,15,1.25,true,'{hip-thrust}'),
('bulgarian-split-squat','Bulgarian Split Squat','legs','{quadriceps,glutes}','{hamstrings}','dumbbell',
 'Rear foot on a bench. Lower the back knee toward the floor, drive up through the front foot.',
 'Hold support for balance; start with bodyweight.',2,8,10,2,true,'{split-squat}'),
('walking-lunge','Walking Lunge','legs','{quadriceps,glutes}','{hamstrings}','dumbbell',
 'Step forward into a lunge, lower the back knee, push up and step through. Count each leg.',
 'Take long steps; keep the front knee over the foot.',2,8,12,2,true,'{split-squat}'),
('step-up','Dumbbell Step-Up','legs','{quadriceps,glutes}','{}','dumbbell',
 'Step onto a knee-height box, drive up through that foot, step down with control.',
 'Use a stable box; start light.',2,8,10,2,true,'{split-squat}')
on conflict (slug) where user_id is null do update set
  name = excluded.name, muscle_group = excluded.muscle_group, primary_muscles = excluded.primary_muscles,
  secondary_muscles = excluded.secondary_muscles, equipment = excluded.equipment, instructions = excluded.instructions,
  safety_tips = excluded.safety_tips, default_sets = excluded.default_sets, rep_min = excluded.rep_min,
  rep_max = excluded.rep_max, load_increment_kg = excluded.load_increment_kg, per_side = excluded.per_side,
  alternatives = excluded.alternatives;

-- ---------------------------------------------------------------------
-- Variation groups (exercises that can replace each other) and priority
-- 1 = main lift, 2 = secondary, 3 = accessory (trimmed first when short on time)
-- ---------------------------------------------------------------------
update public.exercises e set variation_group = v.g, priority = v.p
from (values
  ('bench-press','flat-press',1), ('dumbbell-bench-press','flat-press',1), ('machine-chest-press','flat-press',1),
  ('incline-dumbbell-press','incline-press',1), ('incline-barbell-press','incline-press',1), ('incline-machine-press','incline-press',1),
  ('cable-fly','chest-fly',3), ('pec-deck','chest-fly',3), ('dumbbell-fly','chest-fly',3),
  ('shoulder-press','overhead-press',2), ('machine-shoulder-press','overhead-press',2), ('arnold-press','overhead-press',2),
  ('lateral-raise','lateral-raise',3), ('cable-lateral-raise','lateral-raise',3), ('machine-lateral-raise','lateral-raise',3),
  ('rope-triceps-pushdown','triceps-pushdown',3), ('straight-bar-pushdown','triceps-pushdown',3), ('assisted-dip','triceps-pushdown',3),
  ('cable-triceps-extension','triceps-overhead',3), ('overhead-dumbbell-extension','triceps-overhead',3), ('skull-crusher','triceps-overhead',3),
  ('lat-pulldown','vertical-pull',1), ('assisted-pull-up','vertical-pull',1), ('close-grip-pulldown','vertical-pull',1),
  ('chest-supported-row','supported-row',1), ('t-bar-row','supported-row',1), ('machine-row','supported-row',1),
  ('seated-cable-row','cable-row',2), ('one-arm-cable-row','cable-row',2), ('one-arm-dumbbell-row','cable-row',2),
  ('reverse-pec-deck','rear-delt',3), ('face-pull','rear-delt',3), ('rear-delt-fly','rear-delt',3),
  ('dumbbell-curl','biceps-curl',3), ('ez-bar-curl','biceps-curl',3), ('cable-curl','biceps-curl',3), ('incline-dumbbell-curl','biceps-curl',3),
  ('hammer-curl','biceps-hammer',3), ('rope-hammer-curl','biceps-hammer',3), ('preacher-curl','biceps-hammer',3),
  ('cable-crunch','abs-flexion',3), ('machine-crunch','abs-flexion',3), ('reverse-crunch','abs-flexion',3),
  ('dead-bug','abs-stability',3), ('side-plank','abs-stability',3), ('plank','abs-stability',3), ('pallof-press','abs-stability',3), ('ab-wheel-rollout','abs-stability',3),
  ('hanging-knee-raise','abs-hip',3), ('lying-leg-raise','abs-hip',3),
  ('squat','squat-pattern',1), ('leg-press','squat-pattern',1), ('hack-squat','squat-pattern',1), ('goblet-squat','squat-pattern',1),
  ('romanian-deadlift','hinge',1), ('dumbbell-rdl','hinge',1), ('back-extension','hinge',2),
  ('leg-curl','knee-flexion',2), ('seated-leg-curl','knee-flexion',2),
  ('leg-extension','knee-extension',3),
  ('calf-raise','calf',3), ('seated-calf-raise','calf',3), ('leg-press-calf-raise','calf',3),
  ('hip-thrust','glute',2), ('glute-bridge','glute',2), ('cable-kickback','glute',2),
  ('split-squat','lunge',2), ('bulgarian-split-squat','lunge',2), ('walking-lunge','lunge',2), ('step-up','lunge',2)
) as v(slug, g, p)
where e.slug = v.slug and e.user_id is null;

-- ---------------------------------------------------------------------
-- Optional extra slots (shown as "if you have time" when they don't fit)
-- Added once per user, only to the starter templates, only if missing.
-- ---------------------------------------------------------------------
create or replace function public.add_variety_slots(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into template_exercises(user_id, template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds)
  select uid, t.id, e.id, 20 + v.ord, v.sets, v.rmin, v.rmax, v.rest
  from (values
    ('Push Day',        'cable-fly',                   1, 2, 12, 15, 60),
    ('Push Day',        'overhead-dumbbell-extension', 2, 2, 10, 15, 60),
    ('Pull Day + Abs',  'hammer-curl',                 1, 2, 10, 15, 60),
    ('Legs',            'walking-lunge',               1, 2,  8, 12, 90),
    ('Lower Body',      'leg-extension',               1, 2, 12, 15, 60),
    ('Lower Body',      'plank',                       2, 2, 20, 45, 60)
  ) as v(tname, slug, ord, sets, rmin, rmax, rest)
  join workout_templates t on t.user_id = uid and t.name = v.tname and not t.archived
  join exercises e on e.slug = v.slug and e.user_id is null
  where not exists (
    select 1 from template_exercises x join exercises xe on xe.id = x.exercise_id
    where x.template_id = t.id and xe.variation_group = e.variation_group);
end $$;
revoke all on function public.add_variety_slots(uuid) from public, anon, authenticated;

-- existing users
do $$ declare u uuid; begin
  for u in select distinct user_id from public.workout_templates loop
    perform public.add_variety_slots(u);
  end loop;
end $$;

-- new users: same starter program plus the extra slots
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Qatar')::date;
begin
  insert into profiles(id, full_name, timezone, start_date)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120),
          coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'Asia/Qatar'), today)
  on conflict (id) do nothing;
  insert into user_settings(user_id) values (new.id) on conflict do nothing;
  begin
    perform bootstrap_program(new.id, today - 7);
    perform add_variety_slots(new.id);
  exception when others then
    raise warning 'starter program failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

create or replace function public.ensure_my_program()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  insert into profiles(id) values (uid) on conflict do nothing;
  insert into user_settings(user_id) values (uid) on conflict do nothing;
  perform bootstrap_program(uid, (select start_date from profiles where id = uid) - 7);
  perform add_variety_slots(uid);
end $$;
revoke all on function public.ensure_my_program() from public, anon;
grant execute on function public.ensure_my_program() to authenticated;
