-- =====================================================================
-- seed.sql — shared exercise library, food library, achievements.
-- Safe to run more than once (upserts).
--
-- MEDIA: image_url / video_url are intentionally left empty. No links are
-- invented. The app shows an illustrated fallback and a "find a demo
-- video" search. To add licensed media, see docs/MEDIA.md.
-- =====================================================================

insert into public.exercises
  (slug, name, muscle_group, primary_muscles, secondary_muscles, equipment,
   instructions, safety_tips, default_sets, rep_min, rep_max, load_increment_kg, per_side, alternatives)
values
-- CHEST
('bench-press','Bench Press','chest','{chest}','{front delts,triceps}','barbell',
 'Lie with eyes under the bar, feet flat. Squeeze shoulder blades together. Lower the bar to mid-chest under control, then press up and slightly back.',
 'Use a spotter or safety pins. Keep wrists stacked over elbows. Stop if you feel shoulder pain.',3,6,10,2.5,false,'{machine-chest-press,incline-dumbbell-press}'),
('machine-chest-press','Machine Chest Press','chest','{chest}','{front delts,triceps}','machine',
 'Set the seat so handles line up with mid-chest. Press forward without locking elbows hard, return slowly until you feel a stretch.',
 'Keep your back against the pad. Adjust the seat before loading heavy.',3,8,12,2.5,false,'{bench-press,incline-dumbbell-press}'),
('incline-dumbbell-press','Incline Dumbbell Press','chest','{upper chest}','{front delts,triceps}','dumbbell',
 'Set the bench to 30–45°. Start with dumbbells over the chest, lower them to the sides of the upper chest, then press up and slightly in.',
 'Choose a weight you can get into position safely. Lower dumbbells to your thighs before sitting up.',3,8,12,2,false,'{machine-chest-press,bench-press}'),
('cable-fly','Cable Fly','chest','{chest}','{front delts}','cable',
 'Set pulleys around shoulder height. With a soft bend in the elbows, bring the handles together in front of the chest, then open slowly.',
 'Keep the elbow angle fixed. Do not let the cables pull your shoulders behind your body.',3,10,15,2.5,false,'{machine-chest-press}'),
-- BACK
('lat-pulldown','Lat Pulldown','back','{lats}','{biceps,rear delts}','cable',
 'Grip just outside shoulder width. Lean back slightly and pull the bar to the upper chest, leading with the elbows. Return under control.',
 'Do not pull behind the neck. Avoid swinging the torso to move the weight.',3,8,12,2.5,false,'{assisted-pull-up,seated-cable-row}'),
('assisted-pull-up','Assisted Pull-Up','back','{lats}','{biceps,core}','machine',
 'Kneel or stand on the assist platform. Pull your chin over the bar with chest up, then lower fully.',
 'More assistance = easier. Step off the platform carefully.',3,6,10,2.5,false,'{lat-pulldown}'),
('chest-supported-row','Chest-Supported Row','back','{mid back,lats}','{rear delts,biceps}','dumbbell',
 'Lie chest-down on an incline bench. Row dumbbells toward the hips, squeeze the shoulder blades, then lower fully.',
 'Keep your chest on the pad so the lower back stays relaxed.',3,8,12,2,false,'{seated-cable-row,one-arm-cable-row}'),
('seated-cable-row','Seated Cable Row','back','{mid back,lats}','{biceps,rear delts}','cable',
 'Sit tall with a slight knee bend. Pull the handle to the lower ribs, squeeze the back, then let the arms extend without rounding.',
 'Keep the torso mostly still; avoid rocking.',2,10,12,2.5,false,'{chest-supported-row,one-arm-cable-row}'),
('one-arm-cable-row','One-Arm Cable Row','back','{lats}','{mid back,biceps}','cable',
 'Stand or kneel side-on to a low pulley. Row the handle to your hip, then reach forward to stretch. Repeat on the other side.',
 'Brace the core so you do not twist through the lower back.',2,10,12,2.5,true,'{seated-cable-row,chest-supported-row}'),
('face-pull','Face Pull','shoulders','{rear delts}','{mid back,rotator cuff}','cable',
 'Set a rope at upper-chest height. Pull toward your face, splitting the rope and turning thumbs back.',
 'Light to moderate weight; this is a control exercise.',3,12,15,2.5,false,'{reverse-pec-deck}'),
-- SHOULDERS
('shoulder-press','Seated Shoulder Press','shoulders','{front delts,side delts}','{triceps}','dumbbell',
 'Sit with back supported. Press dumbbells from shoulder height to overhead, then lower to ear level.',
 'Do not arch the lower back. Use a machine if overhead pressing feels uncomfortable.',2,8,12,2,false,'{lateral-raise}'),
('lateral-raise','Lateral Raise','shoulders','{side delts}','{traps}','dumbbell',
 'Raise dumbbells (or a cable) out to the side to shoulder height with slightly bent elbows. Lower slowly.',
 'Light weights work best. Stop at shoulder height; do not shrug.',3,12,20,1,false,'{shoulder-press}'),
('reverse-pec-deck','Reverse Pec Deck','shoulders','{rear delts}','{mid back}','machine',
 'Face the pad, grip the handles, and sweep the arms back in an arc until in line with the body. Return slowly.',
 'Keep the chest on the pad and the motion smooth.',3,12,20,2.5,false,'{face-pull}'),
-- ARMS
('dumbbell-curl','Dumbbell Curl','arms','{biceps}','{forearms}','dumbbell',
 'Stand tall, elbows at your sides. Curl the dumbbells up, turning palms toward you, then lower fully.',
 'Do not swing the hips. Lower under control.',3,10,15,1,false,'{hammer-curl}'),
('hammer-curl','Hammer Curl','arms','{biceps,brachialis}','{forearms}','dumbbell',
 'Hold dumbbells with palms facing each other. Curl up keeping that grip, then lower slowly.',
 'Keep elbows close to the body.',2,10,15,1,false,'{dumbbell-curl}'),
('rope-triceps-pushdown','Rope Triceps Pushdown','arms','{triceps}','{}','cable',
 'Stand at a high pulley holding a rope. Keep elbows pinned at your sides and push down, spreading the rope at the bottom.',
 'Only the forearms should move.',3,10,15,2.5,false,'{cable-triceps-extension}'),
('cable-triceps-extension','Cable Triceps Extension','arms','{triceps}','{}','cable',
 'Face away from a pulley, rope behind your head. Extend the arms forward and up, then return slowly.',
 'Keep the core braced and elbows pointing forward.',2,10,15,2.5,false,'{rope-triceps-pushdown}'),
-- LEGS
('squat','Squat','legs','{quadriceps,glutes}','{hamstrings,core}','barbell',
 'Bar on the upper back, feet shoulder width. Brace, sit down between your hips to a comfortable depth, then drive up.',
 'Use safety pins in a rack. Keep knees tracking over toes. Start light while learning; goblet squat or leg press are good alternatives.',3,6,10,2.5,false,'{leg-press,split-squat}'),
('leg-press','Leg Press','legs','{quadriceps,glutes}','{hamstrings}','machine',
 'Feet shoulder-width on the platform. Release the safety, lower until knees are around 90°, then press without locking the knees.',
 'Keep your lower back on the pad. Re-engage the safety handles when finished.',3,8,12,5,false,'{squat,split-squat}'),
('romanian-deadlift','Romanian Deadlift','legs','{hamstrings,glutes}','{lower back}','barbell',
 'Stand tall holding the bar. Push hips back with soft knees, sliding the bar down the thighs until you feel a hamstring stretch, then stand up.',
 'Keep the back flat and bar close. Stop if you feel lower-back pain. Controlled reps only.',3,8,10,2.5,false,'{hip-thrust,leg-curl}'),
('leg-curl','Leg Curl','legs','{hamstrings}','{calves}','machine',
 'Set the pad just above the heels. Curl the pad toward you, pause, and return slowly.',
 'Keep hips down on the bench or seat.',3,10,15,2.5,false,'{romanian-deadlift}'),
('leg-extension','Leg Extension','legs','{quadriceps}','{}','machine',
 'Align the knee with the machine pivot. Extend the legs, pause briefly, then lower slowly.',
 'Avoid kicking the weight up. Reduce load if the knee feels irritated.',2,10,15,2.5,false,'{leg-press}'),
('hip-thrust','Hip Thrust','legs','{glutes}','{hamstrings}','barbell',
 'Upper back on a bench, bar padded across the hips. Drive through the heels to lift the hips until the body is flat, squeeze, lower.',
 'Use a bar pad. Keep the chin tucked and ribs down. Glute bridge on the floor is an easier alternative.',3,8,12,5,false,'{romanian-deadlift}'),
('calf-raise','Standing Calf Raise','legs','{calves}','{}','machine',
 'Balls of feet on the edge of a step. Lower the heels for a stretch, then rise as high as possible and pause.',
 'Hold onto support. Full range beats heavy bouncing.',3,12,20,5,false,'{seated-calf-raise}'),
('seated-calf-raise','Seated Calf Raise','legs','{calves}','{}','machine',
 'Sit with the pad on your lower thighs and the balls of your feet on the platform. Lower the heels, then press up and pause.',
 'Move slowly through the full range.',3,12,20,5,false,'{calf-raise}'),
('split-squat','Split Squat','legs','{quadriceps,glutes}','{hamstrings}','bodyweight',
 'Take a long stance, one foot forward. Lower the back knee toward the floor, then push up through the front foot. Start with bodyweight.',
 'Hold onto support for balance. Keep the front knee over the foot.',2,8,10,2,true,'{leg-press,squat}'),
-- CORE
('cable-crunch','Cable Crunch','core','{abs}','{}','cable',
 'Kneel facing a high pulley with the rope by your head. Curl the ribs toward the hips, then return slowly.',
 'Move from the spine, not by pulling with the arms.',3,10,15,2.5,false,'{reverse-crunch}'),
('dead-bug','Dead Bug','core','{abs}','{hip flexors}','bodyweight',
 'Lie on your back, arms up, knees at 90°. Lower opposite arm and leg while keeping the lower back pressed down, return, switch.',
 'If the lower back lifts, shorten the range.',2,8,12,0,true,'{side-plank}'),
('hanging-knee-raise','Hanging Knee Raise','core','{abs}','{hip flexors,grip}','bodyweight',
 'Hang from a bar or use a captain''s chair. Bring the knees toward the chest by curling the pelvis, then lower slowly.',
 'Avoid swinging. Use the reverse crunch if grip or shoulders limit you.',3,8,15,0,false,'{reverse-crunch}'),
('reverse-crunch','Reverse Crunch','core','{abs}','{}','bodyweight',
 'Lie on your back, knees bent. Curl the hips up off the floor toward the chest, then lower under control.',
 'Keep the movement slow; do not use momentum.',3,10,15,0,false,'{hanging-knee-raise}'),
('side-plank','Side Plank','core','{obliques}','{glutes,shoulders}','bodyweight',
 'Lie on your side, elbow under shoulder. Lift the hips to form a straight line and hold. Log seconds as reps.',
 'Drop to the knees to make it easier.',2,20,45,0,true,'{dead-bug}')
on conflict (slug) where user_id is null do update set
  name = excluded.name, muscle_group = excluded.muscle_group,
  primary_muscles = excluded.primary_muscles, secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment, instructions = excluded.instructions, safety_tips = excluded.safety_tips,
  default_sets = excluded.default_sets, rep_min = excluded.rep_min, rep_max = excluded.rep_max,
  load_increment_kg = excluded.load_increment_kg, per_side = excluded.per_side, alternatives = excluded.alternatives;

-- ---------------------------------------------------------------------
-- FOODS — approximate typical values per serving. Always labelled as
-- estimates in the app. Check package labels for exact numbers.
-- ---------------------------------------------------------------------
insert into public.foods (name, serving_desc, serving_g, kcal, protein_g, carbs_g, fat_g, quick_add) values
('Egg, whole (large)',            '1 egg',            50,   72,  6.3,  0.4,  4.8, true),
('Chicken breast, cooked',        '100 g',           100,  165, 31.0,  0.0,  3.6, true),
('Fish (white), cooked',          '100 g',           100,  128, 26.0,  0.0,  2.7, true),
('Tuna, canned in water',         '1 can drained',   120,  130, 29.0,  0.0,  1.0, true),
('Milk, full-fat',                '250 ml',          250,  150,  8.0, 12.0,  8.0, true),
('Greek yogurt / strained curd',  '200 g',           200,  146, 18.0,  8.0,  4.0, true),
('Plain curd (dahi)',             '200 g',           200,  120,  7.0,  9.0,  6.0, false),
('Paneer',                        '100 g',           100,  290, 18.0,  3.0, 22.0, true),
('Tofu, firm',                    '100 g',           100,  144, 17.0,  3.0,  9.0, true),
('Lentils / dal, cooked',         '1 cup',           200,  230, 18.0, 40.0,  1.0, true),
('Chickpeas, roasted (chana)',    '30 g',             30,  110,  6.0, 17.0,  2.0, false),
('Rice, white, cooked',           '1 cup',           158,  205,  4.3, 45.0,  0.4, true),
('Oats, dry',                     '40 g',             40,  150,  5.0, 27.0,  2.5, true),
('Bread, whole wheat',            '1 slice',          30,   80,  4.0, 14.0,  1.0, true),
('Chapati',                       '1 medium',         40,  120,  3.5, 18.0,  3.5, false),
('Idli',                          '1 piece',          40,   39,  2.0,  8.0,  0.2, false),
('Potato, boiled',                '150 g',           150,  130,  3.0, 30.0,  0.2, false),
('Banana',                        '1 medium',        118,  105,  1.3, 27.0,  0.4, true),
('Apple',                         '1 medium',        180,   95,  0.5, 25.0,  0.3, false),
('Dates',                         '3 dates',          24,   70,  0.6, 18.0,  0.1, false),
('Peanut butter',                 '1 tbsp',           16,   95,  3.5,  3.0,  8.0, false),
('Mixed nuts',                    '30 g',             30,  180,  5.0,  6.0, 16.0, false),
('Olive oil',                     '1 tbsp',           14,  120,  0.0,  0.0, 14.0, false),
('Whey protein (optional)',       '1 scoop',          30,  120, 24.0,  3.0,  1.5, false)
on conflict (lower(name)) where user_id is null do update set
  serving_desc = excluded.serving_desc, serving_g = excluded.serving_g, kcal = excluded.kcal,
  protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, quick_add = excluded.quick_add;

-- ---------------------------------------------------------------------
-- ACHIEVEMENTS
-- ---------------------------------------------------------------------
insert into public.achievements (code, name, description, sort) values
('first_workout',   'First Workout',          'Complete and save your first workout.', 1),
('first_week',      'First Week Completed',   'Hit your weekly workout target in one program week.', 2),
('workouts_10',     '10 Workouts',            'Complete 10 workouts.', 3),
('workouts_25',     '25 Workouts',            'Complete 25 workouts.', 4),
('workouts_50',     '50 Workouts',            'Complete 50 workouts.', 5),
('workouts_100',    '100 Workouts',           'Complete 100 workouts.', 6),
('consistent_4',    'Four Consistent Weeks',  'Hit your weekly target four program weeks in a row.', 7),
('first_pr',        'First Personal Record',  'Beat your previous best on any exercise.', 8)
on conflict (code) do update set name = excluded.name, description = excluded.description, sort = excluded.sort;
