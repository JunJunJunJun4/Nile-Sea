-- DB の動作確認（migration を変えたら再実行する）
-- 実行（PowerShell）: Get-Content -Raw supabase/tests/db_smoke_test.sql | docker exec -i supabase_db_nile-sea psql -U postgres -q
--
-- - 全体を1つのトランザクションで実行し、最後に rollback するのでデータは残らない。
-- - エラーが出ても止まらない（ON_ERROR_STOP 0）。「--- EXPECT xxx」の直後に、そのエラー xxx が出ていれば正常。
--   「(expect n)」のついた行は、件数が n になっていれば正常。
-- - seed.sql のデータや既存のユーザーが入っていても結果が変わらないよう、件数はこのテストで作るデータ
--   （ユーザー 00000000-…-00a / 00b、問題集 20000000-…、問題 30000000-…）だけを数える。
-- - pgTAP 形式ではないため、supabase test db では実行しない。
\set ON_ERROR_STOP 0
\set VERBOSITY terse
\set test_users '''00000000-0000-0000-0000-00000000000a'', ''00000000-0000-0000-0000-00000000000b'''
begin;
-- users
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@x'),
 ('00000000-0000-0000-0000-00000000000b','free@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-00000000000a';
select 'test users rows (expect 2, 2, 2)' t, count(*) as profiles, (select count(*) from public.subscriptions where user_id in (:test_users)) subs, (select count(*) from public.user_settings where user_id in (:test_users)) settings from public.profiles where id in (:test_users);
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
select 'test sets (expect free set 2, paid set 2)' t, title, question_count from public.question_sets where id::text like '20000000-%' order by title;
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
select 'free sees questions (expect 2: Q1,Q2)' t, count(*) from public.questions where id::text like '30000000-%';
select 'free sees sets (expect 2)' t, count(*) from public.question_sets where id::text like '20000000-%';
\echo '--- EXPECT permission denied (is_correct)'
savepoint a; select is_correct from public.question_choices limit 1; rollback to a;
\echo '--- EXPECT permission denied (answer_keys)'
savepoint b; select * from public.question_answer_keys; rollback to b;
select 'choices visible (expect 8)' t, count(*) from (select id, body from public.question_choices where question_id::text like '30000000-%') x;
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
select 'attempt_questions saved (expect 2)' t, count(*) from public.attempt_questions where attempt_id = :'aid';
\echo '--- EXPECT permission denied (attempt_questions insert)'
savepoint d2; insert into public.attempt_questions values (:'aid', auth.uid(), '30000000-0000-0000-0000-000000000004', 3); rollback to d2;
select 'result before answering (expect 0)' t, count(*) from public.get_attempt_result(:'aid');
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
select 'result rows (expect 2: Q1 wrong / correct 11, Q2 correct / correct 22)' t, question_position, is_correct, selected_choice_id, correct_choice_id, explanation from public.get_attempt_result(:'aid');
select 'set progress (expect total 2, cleared 1)' t, * from public.get_set_progress('20000000-0000-0000-0000-000000000001');
select 'paid set progress (expect total 2, cleared 1: Q2 is shared)' t, * from public.get_set_progress('20000000-0000-0000-0000-000000000002');
select 'review' t, public.get_review_questions();
select 'review attempt' t, public.start_attempt(null, 'review');
select public.start_attempt('20000000-0000-0000-0000-000000000001') as att3 \gset
select 'restart skips cleared Q2 (expect planned 1, skipped 1)' t, :'att3';
select (:'att3'::jsonb->>'attempt_id') as aid3 \gset
\echo '--- EXPECT question_not_in_attempt (cleared Q2 was skipped)'
savepoint g3; select public.submit_answer(:'aid3', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000022'); rollback to g3;
select public.submit_answer(:'aid3', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000011');
\echo '--- EXPECT no_questions (all cleared)'
savepoint h2; select public.start_attempt('20000000-0000-0000-0000-000000000001'); rollback to h2;
\echo '--- EXPECT no_questions (nothing to review)'
savepoint h3; select public.start_attempt(null, 'review'); rollback to h3;
select 'attempts (expect 3: none created on no_questions)' t, count(*) from public.attempts;
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
select 'pro sees questions (expect 3)' t, count(*) from public.questions where id::text like '30000000-%';
reset role;

update public.profiles set status='suspended' where id='00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select 'suspended answers (expect 0)' t, count(*) from public.answers;
\echo '--- EXPECT user_not_active'
savepoint k; select public.start_attempt('20000000-0000-0000-0000-000000000001'); rollback to k;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true) \g /dev/null
select 'admin sees questions (expect 4)' t, count(*) from public.questions where id::text like '30000000-%';
select 'admin sees others attempt_questions (expect 0)' t, count(*) from public.attempt_questions;
\echo '--- EXPECT attempt_not_found (other user)'
savepoint l; select * from public.get_attempt_result(:'aid'); rollback to l;
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
select 'remaining answers of deleted user (expect 0)' t, count(*) from public.answers where user_id = '00000000-0000-0000-0000-00000000000b';
select 'remaining attempt_questions of deleted user (expect 0)' t, count(*) from public.attempt_questions where user_id = '00000000-0000-0000-0000-00000000000b';
rollback;
