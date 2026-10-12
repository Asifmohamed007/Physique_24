-- Two-user isolation test. Every check must print PASS.
\set ON_ERROR_STOP 1
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','asif@test.local','{"full_name":"Asif Mohamed"}'),
 ('22222222-2222-2222-2222-222222222222','other@test.local','{"full_name":"Other User"}');

select case when count(*)=10 then 'PASS bootstrap: 5 templates per user' else 'FAIL templates '||count(*) end from workout_templates;
select case when count(*)=70 then 'PASS bootstrap: template exercises (incl. optional extra slots) linked to seeded library' else 'FAIL te '||count(*) end from template_exercises;

-- Asif writes data
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into workout_sessions(id,user_id,name,session_date,planned_date) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Push Day','2026-10-10','2026-10-10');
insert into session_exercises(id,user_id,session_id,exercise_name) values ('aaaaaaaa-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Bench Press');
insert into exercise_sets(id,user_id,session_exercise_id,set_number,weight_kg,reps,completed) values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000e1',1,40,10,true);
insert into body_measurements(user_id,measured_on,weight_kg) values ('11111111-1111-1111-1111-111111111111','2026-10-10',73.4);
insert into storage.objects(bucket_id,name) values ('progress-photos','11111111-1111-1111-1111-111111111111/p1.jpg');
select case when count(*)=1 then 'PASS owner sees own session' else 'FAIL' end from workout_sessions;
select case when count(*)=5 then 'PASS owner sees only own 5 templates' else 'FAIL '||count(*) end from workout_templates;

-- Switch to the other user
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select case when count(*)=0 then 'PASS other user cannot read sessions' else 'FAIL' end from workout_sessions;
select case when count(*)=0 then 'PASS other user cannot read sets' else 'FAIL' end from exercise_sets;
select case when count(*)=0 then 'PASS other user cannot read measurements' else 'FAIL' end from body_measurements;
select case when count(*)=0 then 'PASS other user cannot list photo files' else 'FAIL' end from storage.objects;
select case when count(*)=0 then 'PASS other user cannot read profile' else 'FAIL' end from profiles where id='11111111-1111-1111-1111-111111111111';
select case when count(*)>20 then 'PASS shared exercise library readable' else 'FAIL' end from exercises;
with u as (update body_measurements set weight_kg=1 returning 1) select case when count(*)=0 then 'PASS cannot update other user rows' else 'FAIL' end from u;
with d as (delete from workout_sessions returning 1) select case when count(*)=0 then 'PASS cannot delete other user rows' else 'FAIL' end from d;
with d as (delete from storage.objects returning 1) select case when count(*)=0 then 'PASS cannot delete other user photos' else 'FAIL' end from d;
with u as (update exercises set name='hacked' returning 1) select case when count(*)=0 then 'PASS cannot edit shared library' else 'FAIL' end from u;

-- Forged inserts must be rejected
do $$ begin
  begin insert into body_measurements(user_id,measured_on,weight_kg) values ('11111111-1111-1111-1111-111111111111','2026-10-11',50);
        raise notice 'FAIL forged user_id insert allowed';
  exception when insufficient_privilege then raise notice 'PASS forged user_id insert rejected'; end;
  begin insert into session_exercises(id,user_id,session_id,exercise_name) values (gen_random_uuid(),'22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','X');
        raise notice 'FAIL attached row to another users session';
  exception when foreign_key_violation then raise notice 'PASS cannot attach rows to another users session'; end;
  begin insert into storage.objects(bucket_id,name) values ('progress-photos','11111111-1111-1111-1111-111111111111/evil.jpg');
        raise notice 'FAIL uploaded into another users folder';
  exception when insufficient_privilege then raise notice 'PASS cannot upload into another users photo folder'; end;
end $$;

-- Duplicate completion prevention (as owner)
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update workout_sessions set status='completed', ended_at=now() where id='aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  begin insert into workout_sessions(id,user_id,name,session_date,planned_date,status,ended_at) values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','Push Day','2026-10-10','2026-10-10','completed',now());
        raise notice 'FAIL duplicate completion allowed';
  exception when unique_violation then raise notice 'PASS duplicate completion for same planned day rejected'; end;
end $$;

-- Anonymous visitor
reset role; set role anon; set request.jwt.claim.sub = '';
do $$ begin
  begin perform 1 from public.workout_sessions; raise notice 'FAIL anon can query';
  exception when insufficient_privilege then raise notice 'PASS signed-out visitors have no table access'; end;
end $$;

-- Account deletion cascades
reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
reset role;  -- function is security definer; call as authenticated with grants
set role authenticated;
select public.delete_my_account();
reset role;
select case when not exists(select 1 from profiles where id='22222222-2222-2222-2222-222222222222')
             and not exists(select 1 from workout_templates where user_id='22222222-2222-2222-2222-222222222222')
            then 'PASS account deletion removes all user rows' else 'FAIL deletion' end;
select case when exists(select 1 from workout_sessions) then 'PASS other account untouched by deletion' else 'FAIL' end;
select case when (select count(*) from exercises where user_id is null) = 70 then 'PASS library has 70 exercises' else 'FAIL library '||(select count(*) from exercises where user_id is null) end;
select case when not exists (select 1 from exercises where user_id is null and variation_group is null) then 'PASS every exercise has a variation group' else 'FAIL missing groups: '||(select string_agg(slug, ',') from exercises where user_id is null and variation_group is null) end;
select case when (select min(c) from (select count(*) c from exercises where user_id is null group by variation_group having variation_group <> 'knee-extension') g) >= 2 then 'PASS every variation group (except leg extension) has at least 2 options' else 'FAIL thin group' end;
-- 004 is safe to run twice
\i database/migrations/004_variety_and_time.sql
select case when count(*)=35 then 'PASS re-running 004 adds no duplicates' else 'FAIL dup '||count(*) end from template_exercises where user_id='11111111-1111-1111-1111-111111111111';
