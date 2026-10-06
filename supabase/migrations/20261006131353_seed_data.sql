-- (4) 初期データ（structure_types / categories / plans）と、既存ユーザーの補完

-- ---------------------------------------------------------------------------
-- structure_types
-- ---------------------------------------------------------------------------

insert into public.structure_types (key, label_ja, sort_order) values
  ('abstract_to_concrete', '抽象→具体', 1),
  ('concrete_to_abstract', '具体→抽象', 2),
  ('induction', '帰納法', 3),
  ('deduction', '演繹法', 4),
  ('paradox', '逆説', 5),
  ('contrast', '対比', 6),
  ('cause_to_effect', '原因→結果', 7),
  ('effect_to_cause', '結果→原因', 8);

-- ---------------------------------------------------------------------------
-- categories（第1階層は仮の案。path と depth はトリガーで設定される）
-- ---------------------------------------------------------------------------

insert into public.categories (slug, name, sort_order) values
  ('language', '言語', 1),
  ('mathematics', '数学', 2),
  ('natural-science', '自然科学', 3),
  ('technology', '技術・IT', 4),
  ('society', '社会・経済', 5),
  ('history-geography', '歴史・地理', 6),
  ('humanities', '人文・思想', 7),
  ('arts', '芸術・文化', 8),
  ('business', 'ビジネス・資格', 9),
  ('life', '生活・教養', 10);

insert into public.categories (slug, name, parent_id)
select 'english', '英語', id from public.categories where path = 'language';

-- TOEIC・英検の単語問題集はここに紐づける
insert into public.categories (slug, name, parent_id)
select 'vocabulary', '語彙', id from public.categories where path = 'language/english';

-- ---------------------------------------------------------------------------
-- plans（pro の stripe_price_id は Stripe で作成後に設定する）
-- ---------------------------------------------------------------------------

insert into public.plans (key, name, daily_question_limit, can_access_all_sets, can_use_ai, sort_order) values
  ('free', '無料', 300, false, false, 1),
  ('pro', '有料', null, true, true, 2);

-- ---------------------------------------------------------------------------
-- このトリガー導入前に登録済みの認証ユーザーに、profiles / user_settings / subscriptions を作る
-- ---------------------------------------------------------------------------

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.subscriptions (user_id, plan_key)
select id, 'free' from auth.users
on conflict (user_id) do nothing;
