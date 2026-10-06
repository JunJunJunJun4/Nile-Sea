-- (2) 権限関数・RLS ポリシー・列単位の権限
--
-- 方針
-- - Supabase は新しいテーブルに anon / authenticated の全権限を付けるため、いったん外して必要な権限だけを付け直す。
-- - service_role（Secret key）は RLS を通らないので、ここでは扱わない。
-- - 学習データ（attempts / answers / 進捗 / daily_activity）は、本人かつ status = active のときだけ読める。
-- - 学習データの書き込みは関数（submit_answer / start_attempt）だけが行う。

-- ---------------------------------------------------------------------------
-- 権限関数
-- 権限の判定はここに集約する。役割や状態を足すときはこれらの関数だけを直す。
-- 本人の profiles 行だけを見るので security invoker で足りる（profiles の RLS で本人の行は読める）。
-- ---------------------------------------------------------------------------

create function public.is_active_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and status = 'active'
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and status = 'active'
  );
$$;

-- 講師または管理者
create function public.is_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('instructor', 'admin')
      and status = 'active'
  );
$$;

-- 現在のプランで、すべての問題集を解けるか（subscriptions がなければ無料扱い）
create function public.can_access_all_sets()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select p.can_access_all_sets
    from public.subscriptions s
    join public.plans p on p.key = s.plan_key
    where s.user_id = (select auth.uid())
  ), false);
$$;

revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.can_access_all_sets() from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.can_access_all_sets() to authenticated;

-- ---------------------------------------------------------------------------
-- テーブル権限（いったん全部外す）
-- ---------------------------------------------------------------------------

revoke all on table
  public.profiles,
  public.user_settings,
  public.plans,
  public.subscriptions,
  public.stripe_events,
  public.categories,
  public.structure_types,
  public.knowledge_items,
  public.questions,
  public.question_choices,
  public.question_answer_keys,
  public.question_knowledge_items,
  public.question_sets,
  public.question_set_items,
  public.attempts,
  public.answers,
  public.user_set_question_progress,
  public.user_question_progress,
  public.user_knowledge_progress,
  public.daily_activity,
  public.ai_generations
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: 本人の行を読める。本人が更新できるのは display_name だけ（role / status は変更不可）
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "profiles: 本人が読める" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: 本人が更新できる" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- user_settings: 本人が読み書きできる（作成は登録時のトリガー）
-- ---------------------------------------------------------------------------

grant select on public.user_settings to authenticated;
grant update (dedupe_scope, clear_mode, clear_threshold, timezone, daily_goal)
  on public.user_settings to authenticated;

create policy "user_settings: 本人が読める" on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_settings: 本人が更新できる" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- plans: 全員が読める（料金ページ用）。書き込みは管理者
-- ---------------------------------------------------------------------------

grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;

create policy "plans: 全員が読める" on public.plans
  for select to anon, authenticated
  using (true);

create policy "plans: 管理者が追加できる" on public.plans
  for insert to authenticated
  with check ((select public.is_admin()));

create policy "plans: 管理者が更新できる" on public.plans
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "plans: 管理者が削除できる" on public.plans
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- subscriptions: 本人の行を読める。書き込みは Stripe Webhook（Secret key）だけ
-- ---------------------------------------------------------------------------

grant select on public.subscriptions to authenticated;

create policy "subscriptions: 本人が読める" on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- stripe_events: 権限もポリシーも付けない（Secret key だけが読み書きする）

-- ---------------------------------------------------------------------------
-- マスタ（categories / structure_types / knowledge_items）: ログインユーザー全員が読める。書き込みは管理者
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.structure_types to authenticated;
grant select, insert, update, delete on public.knowledge_items to authenticated;

create policy "categories: ログインユーザーが読める" on public.categories
  for select to authenticated
  using (true);
create policy "categories: 管理者が追加できる" on public.categories
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "categories: 管理者が更新できる" on public.categories
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "categories: 管理者が削除できる" on public.categories
  for delete to authenticated
  using ((select public.is_admin()));

create policy "structure_types: ログインユーザーが読める" on public.structure_types
  for select to authenticated
  using (true);
create policy "structure_types: 管理者が追加できる" on public.structure_types
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "structure_types: 管理者が更新できる" on public.structure_types
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "structure_types: 管理者が削除できる" on public.structure_types
  for delete to authenticated
  using ((select public.is_admin()));

create policy "knowledge_items: ログインユーザーが読める" on public.knowledge_items
  for select to authenticated
  using (true);
create policy "knowledge_items: 管理者が追加できる" on public.knowledge_items
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "knowledge_items: 管理者が更新できる" on public.knowledge_items
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "knowledge_items: 管理者が削除できる" on public.knowledge_items
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- question_sets / question_set_items
-- 一覧は published かつ public のもの（無料ユーザーにも有料の問題集を見せる）と、自分が作成したもの
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.question_sets to authenticated;
grant select, insert, update, delete on public.question_set_items to authenticated;

create policy "question_sets: 公開中と自分の問題集を読める" on public.question_sets
  for select to authenticated
  using (
    (status = 'published' and visibility = 'public')
    or owner_id = (select auth.uid())
    or (select public.is_admin())
  );
create policy "question_sets: 管理者が追加できる" on public.question_sets
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "question_sets: 管理者が更新できる" on public.question_sets
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "question_sets: 管理者が削除できる" on public.question_sets
  for delete to authenticated
  using ((select public.is_admin()));

-- question_sets の RLS を通るので「question_sets と同じ条件」になる
create policy "question_set_items: 読める問題集のものを読める" on public.question_set_items
  for select to authenticated
  using (
    exists (
      select 1 from public.question_sets s
      where s.id = question_set_items.question_set_id
    )
  );
create policy "question_set_items: 管理者が追加できる" on public.question_set_items
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "question_set_items: 管理者が更新できる" on public.question_set_items
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "question_set_items: 管理者が削除できる" on public.question_set_items
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- questions / question_choices / question_knowledge_items
-- published かつ「プランで解ける問題集」に含まれるもの、または自分が作成したもの。
-- 「プランで解ける」= 問題集が is_free / プランが can_access_all_sets / 自分の問題集
-- （一覧が見えるだけの有料問題集の中身を、無料ユーザーが API から読めないようにする）
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.question_knowledge_items to authenticated;

create policy "questions: 解ける問題集の公開中の問題と自分の問題を読める" on public.questions
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.is_admin())
    or (
      status = 'published'
      and exists (
        select 1
        from public.question_set_items i
        join public.question_sets s on s.id = i.question_set_id
        where i.question_id = questions.id
          and (
            (
              s.status = 'published'
              and s.visibility = 'public'
              and (s.is_free or (select public.can_access_all_sets()))
            )
            or s.owner_id = (select auth.uid())
          )
      )
    )
  );
create policy "questions: 管理者が追加できる" on public.questions
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "questions: 管理者が更新できる" on public.questions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "questions: 管理者が削除できる" on public.questions
  for delete to authenticated
  using ((select public.is_admin()));

-- question_choices: is_correct 列は anon / authenticated に読ませない（管理者も含む）。
-- 正解は submit_answer の戻り値でだけ返す。問題の管理画面は Secret key を使うサーバー側で正解を読む。
-- クライアントは select('*') ではなく列を指定して読む必要がある。
grant select (id, question_id, position, body) on public.question_choices to authenticated;
grant insert, update, delete on public.question_choices to authenticated;

create policy "question_choices: 読める問題のものを読める" on public.question_choices
  for select to authenticated
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_choices.question_id
    )
  );
create policy "question_choices: 管理者が追加できる" on public.question_choices
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "question_choices: 管理者が更新できる" on public.question_choices
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "question_choices: 管理者が削除できる" on public.question_choices
  for delete to authenticated
  using ((select public.is_admin()));

-- question_answer_keys: 権限もポリシーも付けない（anon / authenticated は読み書きできない）。
-- 書き込みは Secret key を使うサーバー側、参照は採点用の関数だけが行う。

create policy "question_knowledge_items: 読める問題のものを読める" on public.question_knowledge_items
  for select to authenticated
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_knowledge_items.question_id
    )
  );
create policy "question_knowledge_items: 管理者が追加できる" on public.question_knowledge_items
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "question_knowledge_items: 管理者が更新できる" on public.question_knowledge_items
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "question_knowledge_items: 管理者が削除できる" on public.question_knowledge_items
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 学習データ: 本人かつ active のときだけ読める。書き込みは関数だけ（権限を付けない）
-- ---------------------------------------------------------------------------

grant select on public.attempts to authenticated;
grant select on public.answers to authenticated;
grant select on public.user_set_question_progress to authenticated;
grant select on public.user_question_progress to authenticated;
grant select on public.user_knowledge_progress to authenticated;
grant select on public.daily_activity to authenticated;

create policy "attempts: 本人が読める" on public.attempts
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy "answers: 本人が読める" on public.answers
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy "user_set_question_progress: 本人が読める" on public.user_set_question_progress
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy "user_question_progress: 本人が読める" on public.user_question_progress
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy "user_knowledge_progress: 本人が読める" on public.user_knowledge_progress
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy "daily_activity: 本人が読める" on public.daily_activity
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

-- ---------------------------------------------------------------------------
-- ai_generations: 本人の行を読める。書き込みは AI 出題の API（Secret key）だけ
-- ---------------------------------------------------------------------------

grant select on public.ai_generations to authenticated;

create policy "ai_generations: 本人が読める" on public.ai_generations
  for select to authenticated
  using (user_id = (select auth.uid()));
