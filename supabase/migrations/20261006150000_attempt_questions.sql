-- (5) 挑戦の出題リストの保存と、結果・進捗を返す関数
--
-- - attempt_questions: start_attempt が作った出題リストを保存する。
--   再読み込み後に「その挑戦に含まれ、まだ回答していない問題」をサーバー側で決められるようにする。
-- - start_attempt: 出題リストを attempt_questions に保存する。出題する問題がなければ no_questions のエラーにして、挑戦を作らない。
-- - submit_answer: 回答できるのを、その挑戦の出題リストに含まれる問題に限る（開始時に省いたクリア済みの問題は回答できない）。
-- - get_attempt_result: 回答済みの問題の正誤・正解・解説を返す（未回答の問題の正解は返さない）。
-- - get_set_progress: 問題集のクリア済みの数と全体の数を、DB と同じクリア判定で返す。
--
-- このファイルより前に作られた挑戦には出題リストがないため、未完了でも続きに回答できない（question_not_in_attempt）。

-- ---------------------------------------------------------------------------
-- attempt_questions
-- ---------------------------------------------------------------------------

create table public.attempt_questions (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  -- RLS で本人の行を絞るための控え。ユーザー削除時は attempts 経由でも、この列からも連動削除される
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  position integer not null check (position >= 1),
  primary key (attempt_id, question_id),
  unique (attempt_id, position)
);

create index attempt_questions_user_id_idx on public.attempt_questions (user_id);
create index attempt_questions_question_id_idx on public.attempt_questions (question_id);

alter table public.attempt_questions enable row level security;

-- Supabase が付ける anon / authenticated の全権限を外し、本人の SELECT だけを付け直す。書き込みは関数だけ
revoke all on public.attempt_questions from anon, authenticated;
grant select on public.attempt_questions to authenticated;

create policy "attempt_questions: 本人が読める" on public.attempt_questions
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

-- ---------------------------------------------------------------------------
-- start_attempt: 出題リストを保存する。出題する問題がなければエラー
-- ---------------------------------------------------------------------------

create or replace function public.start_attempt(
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

  if cardinality(v_ids) = 0 then
    raise exception 'no_questions'
      using detail = case
        when p_mode = 'review' then '復習する問題はありません'
        when v_skipped > 0 then 'すべての問題をクリア済みです'
        else 'この問題集には出題できる問題がありません'
      end;
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

  insert into public.attempt_questions (attempt_id, user_id, question_id, position)
  select v_attempt_id, v_user_id, t.id, t.ord
  from unnest(v_ids) with ordinality as t(id, ord);

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'question_ids', to_jsonb(v_ids),
    'planned_count', cardinality(v_ids),
    'skipped_count', v_skipped
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_answer: 出題リストに含まれる問題だけに回答できるようにする（それ以外は変更なし）
-- ---------------------------------------------------------------------------

create or replace function public.submit_answer(
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

  if not exists (
    select 1 from public.attempt_questions
    where attempt_id = p_attempt_id and question_id = p_question_id
  ) then
    raise exception 'question_not_in_attempt'
      using detail = 'この挑戦の問題ではありません';
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
-- get_attempt_result: 回答済みの問題の正誤・自分の回答・正解・解説を出題順に返す
-- 正解は submit_answer がすでに返したもの（回答済みの問題）だけを返し、未回答の問題は含めない。
-- 問題文・選択肢の文もここで返す（回答後にプランが変わり、questions を読めなくなっても結果を表示できるように）。
-- feedback_mode = deferred の挑戦は、完了するまで正誤・正解・解説を返さない。
-- ---------------------------------------------------------------------------

create function public.get_attempt_result(p_attempt_id uuid)
returns table (
  question_id uuid,
  question_position integer,
  question_body text,
  explanation text,
  selected_choice_id uuid,
  selected_choice_body text,
  correct_choice_id uuid,
  correct_choice_body text,
  is_correct boolean,
  answered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_active_user();
  v_attempt public.attempts;
  v_reveal boolean;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;

  if not found or v_attempt.user_id <> v_user_id then
    raise exception 'attempt_not_found'
      using detail = '挑戦が見つかりません';
  end if;

  v_reveal := v_attempt.feedback_mode = 'immediate' or v_attempt.completed_at is not null;

  return query
  select
    a.question_id,
    aq.position,
    q.body,
    case when v_reveal then q.explanation end,
    a.selected_choice_id,
    sc.body,
    case when v_reveal then cc.id end,
    case when v_reveal then cc.body end,
    case when v_reveal then a.is_correct end,
    a.answered_at
  from public.answers a
  join public.attempt_questions aq
    on aq.attempt_id = a.attempt_id and aq.question_id = a.question_id
  join public.questions q on q.id = a.question_id
  left join public.question_choices sc on sc.id = a.selected_choice_id
  left join lateral (
    select c.id, c.body
    from public.question_choices c
    where c.question_id = a.question_id and c.is_correct
    order by c.position
    limit 1
  ) cc on true
  where a.attempt_id = p_attempt_id
  order by aq.position;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_set_progress: 問題集の公開中の問題のうち、現在の設定でクリア済みの数と全体の数を返す
-- 判定は start_attempt の「クリア済みを省く」と同じ（private.is_question_cleared）。
-- 一覧が見える問題集（published かつ public、または自分の問題集）だけを対象にする。
-- ---------------------------------------------------------------------------

create function public.get_set_progress(p_question_set_id uuid)
returns table (
  total_count integer,
  cleared_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_active_user();
  v_settings public.user_settings;
begin
  if not exists (
    select 1 from public.question_sets s
    where s.id = p_question_set_id
      and (s.owner_id = v_user_id or (s.status = 'published' and s.visibility = 'public'))
  ) then
    raise exception 'question_set_not_found'
      using detail = '問題集が見つかりません';
  end if;

  select * into v_settings from public.user_settings where user_id = v_user_id;
  if not found then
    raise exception 'user_settings_not_found'
      using detail = 'ユーザー設定が見つかりません';
  end if;

  return query
  select
    count(*)::integer,
    (count(*) filter (
      where private.is_question_cleared(
        v_user_id, p_question_set_id, i.question_id,
        v_settings.dedupe_scope, v_settings.clear_mode, v_settings.clear_threshold
      )
    ))::integer
  from public.question_set_items i
  join public.questions q on q.id = i.question_id
  where i.question_set_id = p_question_set_id
    and q.status = 'published';
end;
$$;

-- ---------------------------------------------------------------------------
-- 実行権限（create or replace は既存の権限を引き継ぐので、新しい関数だけ付け直す）
-- ---------------------------------------------------------------------------

revoke execute on function public.get_attempt_result(uuid) from public, anon;
revoke execute on function public.get_set_progress(uuid) from public, anon;

grant execute on function public.get_attempt_result(uuid) to authenticated;
grant execute on function public.get_set_progress(uuid) to authenticated;
