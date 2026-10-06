-- DB の動作確認（migration を変えたら再実行する）
-- 実行（PowerShell）: Get-Content -Raw supabase/tests/db_smoke_test.sql | docker exec -i supabase_db_nile-sea psql -U postgres -q
--
-- - 全体を1つのトランザクションで実行し、最後に rollback するのでデータは残らない。
-- - エラーが出ても止まらない（ON_ERROR_STOP 0）。「--- EXPECT xxx」の直後に、そのエラー xxx が出ていれば正常。
--   「(expect n)」のついた行は、件数が n になっていれば正常。
-- - pgTAP 形式ではないため、supabase test db では実行しない。
\set ON_ERROR_STOP 0
\set VERBOSITY terse
begin;
-- users
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@x'),
 ('00000000-0000-0000-0000-00000000000b','free@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-00000000000a';
select count(*) as profiles, (select count(*) from public.subscriptions) subs, (select count(*) from public.user_settings) settings from public.profiles;
select path, depth from public.categories where depth > 1;

insert into public.knowledge_items (id, kind, label, normalized_label) values
 ('10000000-0000-0000-0000-000000000001','word','abandon','abandon'),
 ('10000000-0000-0000-0000-000000000002','word','ability','ability');
insert into public.question_sets (id, title, is_free, status) values
 ('20000000-0000-0000-0000-000000000001','free set', true, 'published'),
 ('20000000-0000-0000-0000-000000000002','paid set', false, 'published');
insert into public.questions (id, body, status, explanation) values
 ('30000000-0000-0000-0000-000000000001','Q1','published','exp1'),
 ('30000000-0000-0000-0000-000000000002','Q2','published','exp2'),
 ('30000000-0000-0000-0000-000000000003','Q3','draft',null),
 ('30000000-0000-0000-0000-000000000004','Q4 paid only','published',null);
insert into public.question_choices (id, question_id, position, body, is_correct) values
 ('40000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000001',1,'a',true),
 ('40000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000001',2,'b',false),
 ('40000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000001',3,'c',false),
 ('40000000-0000-0000-0000-000000000014','30000000-0000-0000-0000-000000000001',4,'d',false),
 ('40000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000002',1,'a',false),
 ('40000000-0000-0000-0000-000000000022','30000000-0000-0000-0000-000000000002',2,'b',true),
 ('40000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000002',3,'c',false),
 ('40000000-0000-0000-0000-000000000024','30000000-0000-0000-0000-000000000002',4,'d',false),
 ('40000000-0000-0000-0000-000000000041','30000000-0000-0000-0000-000000000004',1,'a',true),
 ('40000000-0000-0000-0000-000000000042','30000000-0000-0000-0000-000000000004',2,'b',false),
 ('40000000-0000-0000-0000-000000000043','30000000-0000-0000-0000-000000000004',3,'c',false),
 ('40000000-0000-0000-0000-000000000044','30000000-0000-0000-0000-000000000004',4,'d',false);
insert into public.question_knowledge_items values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
insert into public.question_set_items values
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1),
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',2),
 ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002',1),
 ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000004',2);
select title, question_count from public.question_sets order by title;
set constraints all immediate;
set constraints all deferred;

\echo '--- EXPECT invalid_question (draft with no choices -> published)'
savepoint s0;
update public.questions set status='published' where id='30000000-0000-0000-0000-000000000003';
set constraints all immediate;
rollback to s0;
\echo '--- EXPECT invalid_question (published 4-choice -> 3 choices)'
savepoint s1;
delete from public.question_choices where id='40000000-0000-0000-0000-000000000014';
set constraints all immediate;
rollback to s1;
set constraints all deferred;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true) \g /dev/null
select 'free sees questions (expect 2: Q1,Q2)' t, count(*) from public.questions;
select 'free sees sets (expect 2)' t, count(*) from public.question_sets;
\echo '--- EXPECT permission denied (is_correct)'
savepoint a; select is_correct from public.question_choices limit 1; rollback to a;
\echo '--- EXPECT permission denied (answer_keys)'
savepoint b; select * from public.question_answer_keys; rollback to b;
select 'choices visible (expect 8)' t, count(*) from (select id, body from public.question_choices) x;
\echo '--- EXPECT permission denied (role update)'
savepoint c; update public.profiles set role='admin' where id=auth.uid(); rollback to c;
update public.profiles set display_name='me' where id=auth.uid();
\echo '--- EXPECT permission denied (attempt insert)'
savepoint d; insert into public.attempts (user_id, dedupe_scope, clear_mode, clear_threshold) values (auth.uid(),'set','consecutive',1); rollback to d;
\echo '--- EXPECT question_set_not_accessible (paid set)'
savepoint e; select public.start_attempt('20000000-0000-0000-0000-000000000002'); rollback to e;
select public.start_attempt('20000000-0000-0000-0000-000000000001') as att \gset
\echo :att
select (:'att'::jsonb->>'attempt_id') as aid \gset
select public.submit_answer(:'aid', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000012', null, 4200);
\echo '--- EXPECT already_answered'
savepoint f; select public.submit_answer(:'aid', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000011'); rollback to f;
\echo '--- EXPECT invalid_choice'
savepoint g; select public.submit_answer(:'aid', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000011'); rollback to g;
\echo '--- EXPECT question_not_in_attempt'
savepoint g2; select public.submit_answer(:'aid', '30000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000041'); rollback to g2;
select public.submit_answer(:'aid', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000022', null, 1000);
select answered_count, correct_count, score, completed_at is not null done from public.attempts;
select knowledge_item_id, correct_count, wrong_count, current_streak from public.user_knowledge_progress;
select question_id, correct_count, wrong_count, current_streak from public.user_question_progress;
select count(*) set_prog from public.user_set_question_progress;
select activity_date, answered_count, correct_count, study_seconds from public.daily_activity;
select 'review' t, public.get_review_questions();
select 'restart skips cleared Q2' t, public.start_attempt('20000000-0000-0000-0000-000000000001');
select 'review attempt' t, public.start_attempt(null, 'review');
\echo '--- EXPECT unsupported_mode'
savepoint h; select public.start_attempt('20000000-0000-0000-0000-000000000001','exam'); rollback to h;
select 'proximity (expect 2)' t, public.category_proximity((select id from public.categories where path='language/english/vocabulary'),(select id from public.categories where path='language/english'));
reset role;

update public.daily_activity set answered_count = 300;
set local role authenticated;
select public.start_attempt('20000000-0000-0000-0000-000000000001', 'normal', false) as att2 \gset
select (:'att2'::jsonb->>'attempt_id') as aid2 \gset
\echo '--- EXPECT daily_limit_reached'
savepoint i; select public.submit_answer(:'aid2', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000011'); rollback to i;
reset role;

update public.daily_activity set answered_count = 0;
update public.questions set format='true_false' where id='30000000-0000-0000-0000-000000000002';
delete from public.question_choices where id in ('40000000-0000-0000-0000-000000000023','40000000-0000-0000-0000-000000000024');
set constraints all immediate;
set constraints all deferred;
set local role authenticated;
\echo '--- EXPECT unsupported_format'
savepoint j; select public.submit_answer(:'aid2', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000022'); rollback to j;
reset role;

update public.subscriptions set plan_key='pro' where user_id='00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select 'pro sees questions (expect 3)' t, count(*) from public.questions;
reset role;

update public.profiles set status='suspended' where id='00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select 'suspended answers (expect 0)' t, count(*) from public.answers;
\echo '--- EXPECT user_not_active'
savepoint k; select public.start_attempt('20000000-0000-0000-0000-000000000001'); rollback to k;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true) \g /dev/null
select 'admin sees questions (expect 4)' t, count(*) from public.questions;
insert into public.structure_types (key, label_ja) values ('test_type','テスト');
reset role;

\echo '--- EXPECT category_cycle'
savepoint m; update public.categories set parent_id=(select id from public.categories where path='language/english/vocabulary') where path='language'; rollback to m;
update public.categories set parent_id=(select id from public.categories where path='humanities') where path='language/english';
select path, depth from public.categories where depth>1;
\echo '--- EXPECT invalid_timezone'
savepoint n; update public.user_settings set timezone='Mars/Base'; rollback to n;
\echo '--- auth user delete cascades'
delete from auth.users where id='00000000-0000-0000-0000-00000000000b';
select count(*) remaining_answers from public.answers;
rollback;
