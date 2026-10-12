-- Realistic history for user 1: 3 weeks of workouts, measurements, food.
\set ON_ERROR_STOP 1
update profiles set full_name='Asif Mohamed', location='Qatar', profession='Data Analyst', start_date=(now() at time zone 'Asia/Qatar')::date - 20 where id='11111111-1111-1111-1111-111111111111';
delete from workout_sessions where user_id='11111111-1111-1111-1111-111111111111';
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111'; d date; t record; sid uuid; seid uuid; te record; k int; n int := 0; today date := (now() at time zone 'Asia/Qatar')::date;
begin
  for d in select generate_series(today - 20, today - 1, interval '1 day')::date loop
    select wt.* into t from schedule_days sd join workout_templates wt on wt.id = sd.template_id
      where sd.user_id = uid and sd.weekday = extract(dow from d) order by sd.effective_from desc limit 1;
    continue when t.id is null;
    n := n + 1;
    continue when n = 4; -- one missed session
    sid := gen_random_uuid();
    insert into workout_sessions(id,user_id,template_id,name,focus,session_date,planned_date,started_at,ended_at,status,difficulty)
      values (sid,uid,t.id,t.name,t.focus,d,d,(d + time '16:35') at time zone 'Asia/Qatar',(d + time '17:50') at time zone 'Asia/Qatar','completed',7);
    for te in select x.*, e.name, e.muscle_group, e.equipment from template_exercises x join exercises e on e.id=x.exercise_id where x.template_id=t.id loop
      seid := gen_random_uuid();
      insert into session_exercises(id,user_id,session_id,exercise_id,exercise_name,muscle_group,equipment,position,target_sets,rep_min,rep_max,rest_seconds)
        values (seid,uid,sid,te.exercise_id,te.name,te.muscle_group,te.equipment,te.position,te.target_sets,te.rep_min,te.rep_max,coalesce(te.rest_seconds,90));
      for k in 1..te.target_sets loop
        insert into exercise_sets(id,user_id,session_exercise_id,set_number,weight_kg,reps,completed,completed_at)
          values (gen_random_uuid(),uid,seid,k, case when te.equipment='bodyweight' then null else 20 + (today - d < 8)::int * 2.5 end, te.rep_max - k + 1, true, now());
      end loop;
    end loop;
  end loop;
  insert into body_measurements(user_id,measured_on,weight_kg,waist_cm,chest_cm,arms_cm,sleep_hours,energy)
    values (uid,today-20,73.4,79,96,33,7,4),(uid,today-13,73.8,79,96.5,33.2,7.5,4),(uid,today-6,74.1,78.8,97,33.5,7,3);
  insert into nutrition_entries(id,user_id,entry_date,meal,food_name,servings,kcal,protein_g,carbs_g,fat_g)
    values (gen_random_uuid(),uid,today,'morning','Egg, whole (large)',4,288,25.2,1.6,19.2),(gen_random_uuid(),uid,today-1,'lunch','Chicken breast, cooked',1.5,247.5,46.5,0,5.4);
  insert into water_intake(id,user_id,entry_date,amount_ml) values (gen_random_uuid(),uid,today,500);
  insert into personal_records(user_id,exercise_name,record_type,value,weight_kg,reps,achieved_on) values (uid,'Bench Press','max_weight',22.5,22.5,10,today-3);
  insert into user_achievements(user_id,code) values (uid,'first_workout') on conflict do nothing;
  insert into progression_suggestions(user_id,exercise_name,kind,message,current_weight_kg,suggested_weight_kg)
    values (uid,'Incline Dumbbell Press','increase','All 3 sets reached 12 reps at 22.5 kg. Try 24.5 kg.',22.5,24.5);
end $$;
