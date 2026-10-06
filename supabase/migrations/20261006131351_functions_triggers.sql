-- (3) 関数とトリガー
--
-- 方針
-- - すべての関数で search_path を '' に固定し、オブジェクトはスキーマ名つきで参照する。
-- - API（PostgREST）に公開しない補助関数とトリガー関数は private スキーマに置く。
-- - クライアントから呼ぶ security definer 関数（start_attempt / submit_answer / get_review_questions）は、
--   最初に auth.uid() で本人を確定し、本人のデータだけを扱う。
-- - security definer のトリガー関数（handle_new_user / validate_question）は RPC から呼べない。
--   handle_new_user は登録時に auth.uid() がまだ NULL のため、本人確認の代わりに EXECUTE 権限を外す。
--
-- エラーは message に識別子（例: daily_limit_reached）、detail に日本語の説明を入れる。

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_updated_at: 更新時に updated_at を現在時刻にする
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.user_settings
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.questions
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.question_answer_keys
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.question_sets
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- handle_new_user: 認証ユーザーの作成時に profiles / user_settings / subscriptions(free) を作る
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  insert into public.subscriptions (user_id, plan_key) values (new.id, 'free');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- user_settings.timezone の検査（カレンダーと1日の上限の計算が失敗しないように）
-- ---------------------------------------------------------------------------

create function private.validate_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone'
      using detail = format('タイムゾーン %s は使えません', new.timezone);
  end if;
  return new;
end;
$$;

create trigger validate_timezone before insert or update of timezone on public.user_settings
  for each row execute function private.validate_timezone();

-- ---------------------------------------------------------------------------
-- set_category_path: 親の path に自分の slug をつなげて path と depth を設定する
-- 親や slug を変えたときは、子孫の path も更新する（cascade_category_path）
-- ---------------------------------------------------------------------------

create function private.set_category_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent_path text;
  v_parent_depth smallint;
begin
  if new.parent_id is null then
    new.path := new.slug;
    new.depth := 1;
    return new;
  end if;

  select path, depth into v_parent_path, v_parent_depth
  from public.categories
  where id = new.parent_id;

  if not found then
    raise exception 'category_parent_not_found'
      using detail = '親の分類が見つかりません';
  end if;

  -- 自分自身や自分の子孫を親にすると循環する
  if tg_op = 'UPDATE'
     and (new.parent_id = new.id or starts_with(v_parent_path, old.path || '/')) then
    raise exception 'category_cycle'
      using detail = '自分自身や子孫の分類を親にはできません';
  end if;

  new.path := v_parent_path || '/' || new.slug;
  new.depth := v_parent_depth + 1;
  return new;
end;
$$;

create trigger set_category_path before insert or update on public.categories
  for each row execute function private.set_category_path();

create function private.cascade_category_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.path is distinct from old.path then
    -- 子の更新で set_category_path が動き、新しい親の path から作り直す（孫以降も再帰的に更新される）
    update public.categories set parent_id = parent_id where parent_id = new.id;
  end if;
  return null;
end;
$$;

create trigger cascade_category_path after update on public.categories
  for each row execute function private.cascade_category_path();

-- ---------------------------------------------------------------------------
-- sync_question_count: question_set_items の増減で question_sets.question_count を更新する
-- ---------------------------------------------------------------------------

create function private.sync_question_count()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.question_sets
    set question_count = (
      select count(*) from public.question_set_items where question_set_id = new.question_set_id
    )
    where id = new.question_set_id;
  end if;

  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and old.question_set_id is distinct from new.question_set_id) then
    update public.question_sets
    set question_count = (
      select count(*) from public.question_set_items where question_set_id = old.question_set_id
    )
    where id = old.question_set_id;
  end if;

  return null;
end;
$$;

create trigger sync_question_count after insert or update of question_set_id or delete
  on public.question_set_items
  for each row execute function private.sync_question_count();

-- ---------------------------------------------------------------------------
-- validate_question: 公開中（published）の問題が形式ごとの条件を満たすか検査する
-- 選択肢を1行ずつ登録しても途中で失敗しないよう、コミット時にまとめて検査する（DEFERRABLE）。
-- 公開する時だけでなく、公開中の問題の選択肢・正解データを変えたときも検査する。
-- is_correct と question_answer_keys は管理者も読めないため security definer で読む。
-- ---------------------------------------------------------------------------

create function private.check_question(p_question_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_format text;
  v_status text;
  v_choices integer;
  v_correct integer;
begin
  select format, status into v_format, v_status
  from public.questions
  where id = p_question_id;

  if not found or v_status <> 'published' then
    return;
  end if;

  if v_format in ('single_choice', 'true_false', 'multiple_choice') then
    select count(*), count(*) filter (where is_correct)
    into v_choices, v_correct
    from public.question_choices
    where question_id = p_question_id;

    if v_format = 'single_choice' and (v_choices <> 4 or v_correct <> 1) then
      raise exception 'invalid_question'
        using detail = format('四択の問題は選択肢4つ・正解1つが必要です（問題 %s: 選択肢 %s・正解 %s）',
                              p_question_id, v_choices, v_correct);
    elsif v_format = 'true_false' and (v_choices <> 2 or v_correct <> 1) then
      raise exception 'invalid_question'
        using detail = format('二択の問題は選択肢2つ・正解1つが必要です（問題 %s: 選択肢 %s・正解 %s）',
                              p_question_id, v_choices, v_correct);
    elsif v_format = 'multiple_choice' and (v_choices < 2 or v_correct < 1) then
      raise exception 'invalid_question'
        using detail = format('複数選択の問題は選択肢2つ以上・正解1つ以上が必要です（問題 %s: 選択肢 %s・正解 %s）',
                              p_question_id, v_choices, v_correct);
    end if;
  elsif not exists (select 1 from public.question_answer_keys where question_id = p_question_id) then
    raise exception 'invalid_question'
      using detail = format('選択式以外の問題は正解データ（question_answer_keys）が必要です（問題 %s）',
                            p_question_id);
  end if;
end;
$$;

create function private.validate_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'questions' then
    perform private.check_question(new.id);
  else
    if tg_op in ('INSERT', 'UPDATE') then
      perform private.check_question(new.question_id);
    end if;
    if tg_op = 'DELETE'
       or (tg_op = 'UPDATE' and old.question_id is distinct from new.question_id) then
      perform private.check_question(old.question_id);
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger validate_question
  after insert or update of status, format on public.questions
  deferrable initially deferred
  for each row execute function private.validate_question();

create constraint trigger validate_question
  after insert or update or delete on public.question_choices
  deferrable initially deferred
  for each row execute function private.validate_question();

create constraint trigger validate_question
  after insert or update or delete on public.question_answer_keys
  deferrable initially deferred
  for each row execute function private.validate_question();

-- ---------------------------------------------------------------------------
-- 内部の補助関数（private。p_user_id は呼び出し元の関数が auth.uid() で確定した値を渡す）
-- ---------------------------------------------------------------------------

-- クリア判定。「クリア済み」は保存せず、進捗の数値と設定を比べてその都度判定する
create function private.is_cleared(
  p_current_streak integer,
  p_correct_count integer,
  p_clear_mode text,
  p_clear_threshold integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_clear_mode
    when 'consecutive' then coalesce(p_current_streak, 0) >= p_clear_threshold
    else coalesce(p_correct_count, 0) >= p_clear_threshold
  end;
$$;

-- ユーザーの現在のプラン（subscriptions がなければ free）
create function private.user_plan(p_user_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.plans p
  where p.key = coalesce(
    (select s.plan_key from public.subscriptions s where s.user_id = p_user_id),
    'free'
  );
$$;

-- ユーザーがその問題集を解けるか（公開中かつ public で、無料公開またはプランで解ける。自分の問題集は常に可）
create function private.can_solve_set(p_user_id uuid, p_question_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.question_sets s
    where s.id = p_question_set_id
      and (
        s.owner_id = p_user_id
        or (
          s.status = 'published'
          and s.visibility = 'public'
          and (s.is_free or coalesce((private.user_plan(p_user_id)).can_access_all_sets, false))
        )
      )
  );
$$;

-- ユーザーがその問題を解けるか（自分が作成した問題、または解ける問題集に含まれる公開中の問題）
create function private.can_access_question(p_user_id uuid, p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    where q.id = p_question_id
      and (
        q.created_by = p_user_id
        or (
          q.status = 'published'
          and exists (
            select 1
            from public.question_set_items i
            where i.question_id = q.id
              and private.can_solve_set(p_user_id, i.question_set_id)
          )
        )
      )
  );
$$;

-- 問題がクリア済みか（重複の判定範囲に応じて進捗テーブルを切り替える）
-- knowledge: 付いている知識項目が「すべて」クリア済みならクリア。知識項目がなければ question として判定
create function private.is_question_cleared(
  p_user_id uuid,
  p_question_set_id uuid,
  p_question_id uuid,
  p_dedupe_scope text,
  p_clear_mode text,
  p_clear_threshold integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item_count integer;
  v_cleared_count integer;
begin
  if p_dedupe_scope = 'set' then
    return exists (
      select 1 from public.user_set_question_progress p
      where p.user_id = p_user_id
        and p.question_set_id = p_question_set_id
        and p.question_id = p_question_id
        and private.is_cleared(p.current_streak, p.correct_count, p_clear_mode, p_clear_threshold)
    );
  end if;

  if p_dedupe_scope = 'knowledge' then
    select
      count(*),
      count(*) filter (
        where private.is_cleared(p.current_streak, p.correct_count, p_clear_mode, p_clear_threshold)
      )
    into v_item_count, v_cleared_count
    from public.question_knowledge_items qk
    left join public.user_knowledge_progress p
      on p.user_id = p_user_id and p.knowledge_item_id = qk.knowledge_item_id
    where qk.question_id = p_question_id;

    if v_item_count > 0 then
      return v_cleared_count = v_item_count;
    end if;
  end if;

  return exists (
    select 1 from public.user_question_progress p
    where p.user_id = p_user_id
      and p.question_id = p_question_id
      and private.is_cleared(p.current_streak, p.correct_count, p_clear_mode, p_clear_threshold)
  );
end;
$$;

-- 復習の対象（不正解があり、未クリアの問題）。p_question_set_id を渡すとその問題集の問題に絞る
create function private.review_question_ids(p_user_id uuid, p_question_set_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings;
  v_ids uuid[];
begin
  select * into v_settings from public.user_settings where user_id = p_user_id;

  if v_settings.dedupe_scope = 'set' then
    if p_question_set_id is null then
      raise exception 'question_set_required'
        using detail = '重複の判定範囲が「問題集ごと」のときは、問題集を指定してください';
    end if;

    select coalesce(array_agg(p.question_id order by p.last_answered_at desc), '{}')
    into v_ids
    from public.user_set_question_progress p
    join public.question_set_items i
      on i.question_set_id = p.question_set_id and i.question_id = p.question_id
    join public.questions q on q.id = p.question_id
    where p.user_id = p_user_id
      and p.question_set_id = p_question_set_id
      and p.wrong_count >= 1
      and not private.is_cleared(p.current_streak, p.correct_count,
                                 v_settings.clear_mode, v_settings.clear_threshold)
      and q.status = 'published';

    return v_ids;
  end if;

  with candidates as (
    -- 同じ問題（question）、または知識項目が付いていない問題（knowledge のとき）
    select p.question_id, p.last_answered_at
    from public.user_question_progress p
    where p.user_id = p_user_id
      and p.wrong_count >= 1
      and not private.is_cleared(p.current_streak, p.correct_count,
                                 v_settings.clear_mode, v_settings.clear_threshold)
      and (
        v_settings.dedupe_scope = 'question'
        or not exists (select 1 from public.question_knowledge_items qk where qk.question_id = p.question_id)
      )
    union all
    -- 同じ知識（knowledge）: 不正解があり未クリアの知識項目が付いた問題
    select qk.question_id, kp.last_answered_at
    from public.user_knowledge_progress kp
    join public.question_knowledge_items qk on qk.knowledge_item_id = kp.knowledge_item_id
    where v_settings.dedupe_scope = 'knowledge'
      and kp.user_id = p_user_id
      and kp.wrong_count >= 1
      and not private.is_cleared(kp.current_streak, kp.correct_count,
                                 v_settings.clear_mode, v_settings.clear_threshold)
  ),
  ranked as (
    select c.question_id, max(c.last_answered_at) as last_answered_at
    from candidates c
    group by c.question_id
  )
  select coalesce(array_agg(r.question_id order by r.last_answered_at desc), '{}')
  into v_ids
  from ranked r
  where private.can_access_question(p_user_id, r.question_id)
    and (
      p_question_set_id is null
      or exists (
        select 1 from public.question_set_items i
        where i.question_set_id = p_question_set_id and i.question_id = r.question_id
      )
    );

  return v_ids;
end;
$$;

-- 本人確認と利用停止の確認。auth.uid() を返す
create function private.require_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using detail = 'ログインが必要です';
  end if;

  if not exists (select 1 from public.profiles where id = v_user_id and status = 'active') then
    raise exception 'user_not_active'
      using detail = 'このアカウントは現在利用できません';
  end if;

  return v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_review_questions: 復習の対象の問題IDを返す（不正解があり未クリアのもの、直近に回答した順）
-- ---------------------------------------------------------------------------

create function public.get_review_questions(p_question_set_id uuid default null)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_active_user();
begin
  if p_question_set_id is not null and not private.can_solve_set(v_user_id, p_question_set_id) then
    raise exception 'question_set_not_accessible'
      using detail = 'この問題集は現在のプランでは解けません';
  end if;

  return private.review_question_ids(v_user_id, p_question_set_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_attempt: 挑戦を開始する
-- ①プランでその問題集を解けるか確認 ②設定（重複範囲・クリア条件）を読む
-- ③クリア済みの問題を省いて出題リストを作る ④attempts を作成して返す
-- mode は normal / review のみ対応（exam / srs / ai は未対応）
-- p_skip_cleared = false のときはクリア済みの問題も出題する（解き直し）
-- 戻り値: { attempt_id, question_ids, planned_count, skipped_count }
-- ---------------------------------------------------------------------------

create function public.start_attempt(
  p_question_set_id uuid,
  p_mode text default 'normal',
  p_skip_cleared boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_active_user();
  v_settings public.user_settings;
  v_all_ids uuid[];
  v_ids uuid[];
  v_skipped integer := 0;
  v_attempt_id uuid;
begin
  if p_mode is null or p_mode not in ('normal', 'review') then
    raise exception 'unsupported_mode'
      using detail = format('モード %s は未対応です', coalesce(p_mode, 'NULL'));
  end if;

  if p_question_set_id is not null and not private.can_solve_set(v_user_id, p_question_set_id) then
    raise exception 'question_set_not_accessible'
      using detail = 'この問題集は現在のプランでは解けません';
  end if;

  select * into v_settings from public.user_settings where user_id = v_user_id;
  if not found then
    raise exception 'user_settings_not_found'
      using detail = 'ユーザー設定が見つかりません';
  end if;

  if p_mode = 'normal' then
    if p_question_set_id is null then
      raise exception 'question_set_required'
        using detail = '問題集を指定してください';
    end if;

    select coalesce(array_agg(i.question_id order by i.position), '{}')
    into v_all_ids
    from public.question_set_items i
    join public.questions q on q.id = i.question_id
    where i.question_set_id = p_question_set_id
      and q.status = 'published';

    if p_skip_cleared then
      select coalesce(array_agg(t.id order by t.ord), '{}')
      into v_ids
      from unnest(v_all_ids) with ordinality as t(id, ord)
      where not private.is_question_cleared(
        v_user_id, p_question_set_id, t.id,
        v_settings.dedupe_scope, v_settings.clear_mode, v_settings.clear_threshold
      );
    else
      v_ids := v_all_ids;
    end if;

    v_skipped := cardinality(v_all_ids) - cardinality(v_ids);
  else
    v_ids := private.review_question_ids(v_user_id, p_question_set_id);
  end if;

  insert into public.attempts (
    user_id, question_set_id, mode, feedback_mode,
    dedupe_scope, clear_mode, clear_threshold,
    planned_count, skipped_count
  )
  values (
    v_user_id, p_question_set_id, p_mode, 'immediate',
    v_settings.dedupe_scope, v_settings.clear_mode, v_settings.clear_threshold,
    cardinality(v_ids), v_skipped
  )
  returning id into v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'question_ids', to_jsonb(v_ids),
    'planned_count', cardinality(v_ids),
    'skipped_count', v_skipped
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_answer: 1問の回答を登録して採点する。関数全体が1つのトランザクションで動く
-- ①本人の挑戦か・利用停止でないか・制限時間内か確認 ②1日の上限を確認
-- ③採点（single_choice のみ対応） ④answers に追加
-- ⑤進捗3テーブル・daily_activity・attempts を更新（不正解なら、付いているすべての知識項目を不正解として記録）
-- ⑥正誤・正解・解説を返す（feedback_mode = deferred のときは返さない）
-- 問題集のない挑戦（問題集をまたぐ復習）では user_set_question_progress は更新しない。
-- 戻り値: { answer_id, attempt_completed, is_correct?, correct_choice_id?, explanation? }
-- ---------------------------------------------------------------------------

create function public.submit_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_choice_id uuid default null,
  p_response jsonb default null,
  p_time_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_active_user();
  v_now timestamptz := now();
  v_attempt public.attempts;
  v_question public.questions;
  v_plan public.plans;
  v_timezone text;
  v_today date;
  v_today_count integer;
  v_is_correct boolean;
  v_correct_choice_id uuid;
  v_answer_id uuid;
  v_correct integer;
  v_completed boolean;
begin
  -- ① 本人の挑戦か（同じ挑戦への同時回答を直列化するため行をロックする）
  select * into v_attempt
  from public.attempts
  where id = p_attempt_id
  for update;

  if not found or v_attempt.user_id <> v_user_id then
    raise exception 'attempt_not_found'
      using detail = '挑戦が見つかりません';
  end if;

  if v_attempt.completed_at is not null then
    raise exception 'attempt_completed'
      using detail = 'この挑戦はすでに終了しています';
  end if;

  if v_attempt.expires_at is not null and v_now > v_attempt.expires_at then
    raise exception 'attempt_expired'
      using detail = '制限時間を過ぎています';
  end if;

  if p_time_ms is not null and p_time_ms < 0 then
    raise exception 'invalid_time_ms'
      using detail = '回答時間が不正です';
  end if;

  select * into v_question from public.questions where id = p_question_id;
  if not found then
    raise exception 'question_not_found'
      using detail = '問題が見つかりません';
  end if;

  if v_attempt.question_set_id is not null then
    if not exists (
      select 1 from public.question_set_items
      where question_set_id = v_attempt.question_set_id and question_id = p_question_id
    ) or v_question.status <> 'published' then
      raise exception 'question_not_in_attempt'
        using detail = 'この挑戦の問題ではありません';
    end if;

    if not private.can_solve_set(v_user_id, v_attempt.question_set_id) then
      raise exception 'question_set_not_accessible'
        using detail = 'この問題集は現在のプランでは解けません';
    end if;
  elsif not private.can_access_question(v_user_id, p_question_id) then
    raise exception 'question_not_found'
      using detail = '問題が見つかりません';
  end if;

  if exists (select 1 from public.answers where attempt_id = p_attempt_id and question_id = p_question_id) then
    raise exception 'already_answered'
      using detail = 'この問題にはすでに回答しています';
  end if;

  -- ② 1日の上限（daily_question_limit が NULL のプランは無制限）
  select timezone into v_timezone from public.user_settings where user_id = v_user_id;
  v_today := (v_now at time zone coalesce(v_timezone, 'Asia/Tokyo'))::date;

  insert into public.daily_activity (user_id, activity_date)
  values (v_user_id, v_today)
  on conflict (user_id, activity_date) do nothing;

  select answered_count into v_today_count
  from public.daily_activity
  where user_id = v_user_id and activity_date = v_today
  for update;

  v_plan := private.user_plan(v_user_id);
  if v_plan.daily_question_limit is not null and v_today_count >= v_plan.daily_question_limit then
    raise exception 'daily_limit_reached'
      using detail = format('1日に解ける問題数（%s問）に達しました', v_plan.daily_question_limit);
  end if;

  -- ③ 採点
  if v_question.format <> 'single_choice' then
    raise exception 'unsupported_format'
      using detail = format('出題形式 %s の採点は未対応です', v_question.format);
  end if;

  if p_selected_choice_id is null then
    raise exception 'choice_required'
      using detail = '選択肢を選んでください';
  end if;

  select is_correct into v_is_correct
  from public.question_choices
  where id = p_selected_choice_id and question_id = p_question_id;

  if not found then
    raise exception 'invalid_choice'
      using detail = 'この問題の選択肢ではありません';
  end if;

  select id into v_correct_choice_id
  from public.question_choices
  where question_id = p_question_id and is_correct
  order by position
  limit 1;

  v_correct := case when v_is_correct then 1 else 0 end;

  -- ④ answers に追加
  insert into public.answers (
    attempt_id, user_id, question_id, question_set_id, question_version,
    selected_choice_id, response, is_correct, score, grading_status, time_ms, answered_at
  )
  values (
    p_attempt_id, v_user_id, p_question_id, v_attempt.question_set_id, v_question.version,
    p_selected_choice_id, null, v_is_correct, v_correct, 'graded', p_time_ms, v_now
  )
  returning id into v_answer_id;

  -- ⑤ 進捗3テーブル
  if v_attempt.question_set_id is not null then
    insert into public.user_set_question_progress as p (
      user_id, question_set_id, question_id,
      correct_count, wrong_count, current_streak, last_is_correct, last_answered_at
    )
    values (
      v_user_id, v_attempt.question_set_id, p_question_id,
      v_correct, 1 - v_correct, v_correct, v_is_correct, v_now
    )
    on conflict (user_id, question_set_id, question_id) do update set
      correct_count = p.correct_count + excluded.correct_count,
      wrong_count = p.wrong_count + excluded.wrong_count,
      current_streak = case when excluded.last_is_correct then p.current_streak + 1 else 0 end,
      last_is_correct = excluded.last_is_correct,
      last_answered_at = excluded.last_answered_at;
  end if;

  insert into public.user_question_progress as p (
    user_id, question_id,
    correct_count, wrong_count, current_streak, last_is_correct, last_answered_at
  )
  values (
    v_user_id, p_question_id,
    v_correct, 1 - v_correct, v_correct, v_is_correct, v_now
  )
  on conflict (user_id, question_id) do update set
    correct_count = p.correct_count + excluded.correct_count,
    wrong_count = p.wrong_count + excluded.wrong_count,
    current_streak = case when excluded.last_is_correct then p.current_streak + 1 else 0 end,
    last_is_correct = excluded.last_is_correct,
    last_answered_at = excluded.last_answered_at;

  -- 付いているすべての知識項目に同じ正誤を記録する（不正解ならすべて連続正解数が 0 に戻る）
  insert into public.user_knowledge_progress as p (
    user_id, knowledge_item_id,
    correct_count, wrong_count, current_streak, last_is_correct, last_answered_at
  )
  select
    v_user_id, qk.knowledge_item_id,
    v_correct, 1 - v_correct, v_correct, v_is_correct, v_now
  from public.question_knowledge_items qk
  where qk.question_id = p_question_id
  on conflict (user_id, knowledge_item_id) do update set
    correct_count = p.correct_count + excluded.correct_count,
    wrong_count = p.wrong_count + excluded.wrong_count,
    current_streak = case when excluded.last_is_correct then p.current_streak + 1 else 0 end,
    last_is_correct = excluded.last_is_correct,
    last_answered_at = excluded.last_answered_at;

  -- daily_activity
  update public.daily_activity set
    answered_count = answered_count + 1,
    correct_count = correct_count + v_correct,
    study_seconds = study_seconds + coalesce(round(p_time_ms / 1000.0)::integer, 0)
  where user_id = v_user_id and activity_date = v_today;

  -- attempts（出題数に達したら完了にして得点を計算する）
  v_completed := v_attempt.answered_count + 1 >= v_attempt.planned_count;

  update public.attempts set
    answered_count = answered_count + 1,
    correct_count = correct_count + v_correct,
    completed_at = case when v_completed then v_now end,
    score = case
      when v_completed then round((correct_count + v_correct) * 100.0 / (answered_count + 1), 2)
    end
  where id = p_attempt_id;

  -- ⑥ 結果を返す
  if v_attempt.feedback_mode = 'deferred' then
    return jsonb_build_object(
      'answer_id', v_answer_id,
      'attempt_completed', v_completed
    );
  end if;

  return jsonb_build_object(
    'answer_id', v_answer_id,
    'attempt_completed', v_completed,
    'is_correct', v_is_correct,
    'correct_choice_id', v_correct_choice_id,
    'explanation', v_question.explanation
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- category_proximity: 2つの分類の path が先頭から何階層一致するかを返す（どちらかが見つからなければ NULL）
-- ---------------------------------------------------------------------------

create function public.category_proximity(p_category_a uuid, p_category_b uuid)
returns integer
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_a text[];
  v_b text[];
  v_matched integer := 0;
begin
  select string_to_array(path, '/') into v_a from public.categories where id = p_category_a;
  select string_to_array(path, '/') into v_b from public.categories where id = p_category_b;

  if v_a is null or v_b is null then
    return null;
  end if;

  for i in 1 .. least(cardinality(v_a), cardinality(v_b)) loop
    exit when v_a[i] <> v_b[i];
    v_matched := v_matched + 1;
  end loop;

  return v_matched;
end;
$$;

-- ---------------------------------------------------------------------------
-- 実行権限
-- Supabase は public スキーマの新しい関数に anon / authenticated の EXECUTE を付けるので外し、
-- クライアントから呼ぶ関数だけ authenticated に付け直す。
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function public.get_review_questions(uuid) from public, anon;
revoke execute on function public.start_attempt(uuid, text, boolean) from public, anon;
revoke execute on function public.submit_answer(uuid, uuid, uuid, jsonb, integer) from public, anon;
revoke execute on function public.category_proximity(uuid, uuid) from public, anon;

grant execute on function public.get_review_questions(uuid) to authenticated;
grant execute on function public.start_attempt(uuid, text, boolean) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid, jsonb, integer) to authenticated;
grant execute on function public.category_proximity(uuid, uuid) to authenticated;
