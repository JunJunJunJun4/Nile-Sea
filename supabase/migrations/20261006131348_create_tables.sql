-- (1) テーブル・制約・インデックス
-- 設計: docs/db-design.md。全テーブルで RLS を有効にする（ポリシーと権限は次の migration で定義する）。

-- ---------------------------------------------------------------------------
-- ユーザー
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'learner'
    check (role in ('learner', 'instructor', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'pending', 'suspended')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  dedupe_scope text not null default 'question'
    check (dedupe_scope in ('set', 'question', 'knowledge')),
  clear_mode text not null default 'consecutive'
    check (clear_mode in ('consecutive', 'cumulative')),
  clear_threshold smallint not null default 1
    check (clear_threshold between 1 and 10),
  timezone text not null default 'Asia/Tokyo',
  daily_goal smallint,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 課金
-- ---------------------------------------------------------------------------

create table public.plans (
  key text primary key,
  name text not null,
  daily_question_limit integer,
  can_access_all_sets boolean not null default false,
  can_use_ai boolean not null default false,
  stripe_price_id text,
  sort_order smallint not null default 0
);

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan_key text not null default 'free' references public.plans (key),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- マスタ
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  parent_id uuid references public.categories (id),
  -- path と depth はトリガー set_category_path で設定する
  path text not null unique,
  depth smallint not null
    check (depth between 1 and 6),
  sort_order integer not null default 0,
  description text,
  unique nulls not distinct (parent_id, slug)
);

create index categories_parent_id_idx on public.categories (parent_id);

create table public.structure_types (
  key text primary key,
  label_ja text not null,
  description text,
  sort_order smallint not null default 0
);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('word', 'term', 'concept', 'fact', 'formula')),
  label text not null,
  reading text,
  definition text,
  normalized_label text not null,
  category_id uuid references public.categories (id),
  note text,
  created_at timestamptz not null default now(),
  unique (kind, normalized_label)
);

create index knowledge_items_category_id_idx on public.knowledge_items (category_id);

-- ---------------------------------------------------------------------------
-- 問題
-- ---------------------------------------------------------------------------

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  format text not null default 'single_choice'
    check (format in (
      'single_choice', 'multiple_choice', 'true_false', 'fill_blank',
      'free_text', 'ordering', 'matching', 'flashcard'
    )),
  body text not null,
  content jsonb,
  category_id uuid references public.categories (id),
  version integer not null default 1,
  explanation text,
  structure_type_key text references public.structure_types (key),
  difficulty smallint
    check (difficulty between 1 and 5),
  source text not null default 'curated'
    check (source in ('curated', 'user', 'ai')),
  created_by uuid references public.profiles (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_category_id_idx on public.questions (category_id);
create index questions_structure_type_key_idx on public.questions (structure_type_key);
create index questions_created_by_idx on public.questions (created_by);

create table public.question_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  position smallint not null
    check (position >= 1),
  body text not null,
  is_correct boolean not null default false,
  -- 並べ替えで一時的に重複しても良いよう、検査はコミット時に行う
  unique (question_id, position) deferrable initially deferred
);

create table public.question_answer_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  spec jsonb not null,
  grading text not null default 'auto'
    check (grading in ('auto', 'ai', 'manual', 'self')),
  updated_at timestamptz not null default now()
);

create table public.question_knowledge_items (
  question_id uuid not null references public.questions (id) on delete cascade,
  knowledge_item_id uuid not null references public.knowledge_items (id),
  primary key (question_id, knowledge_item_id)
);

create index question_knowledge_items_knowledge_item_id_idx
  on public.question_knowledge_items (knowledge_item_id);

create table public.question_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category_id uuid references public.categories (id),
  owner_id uuid references public.profiles (id) on delete set null,
  visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  kind text not null default 'practice'
    check (kind in ('practice', 'exam', 'deck')),
  time_limit_sec integer,
  pass_score numeric(5, 2),
  is_free boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  question_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_sets_category_id_idx on public.question_sets (category_id);
create index question_sets_owner_id_idx on public.question_sets (owner_id);

create table public.question_set_items (
  question_set_id uuid not null references public.question_sets (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  position integer not null,
  primary key (question_set_id, question_id),
  unique (question_set_id, position) deferrable initially deferred
);

create index question_set_items_question_id_idx on public.question_set_items (question_id);

-- ---------------------------------------------------------------------------
-- 学習
-- ---------------------------------------------------------------------------

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_set_id uuid references public.question_sets (id),
  mode text not null default 'normal'
    check (mode in ('normal', 'review', 'exam', 'srs', 'ai')),
  feedback_mode text not null default 'immediate'
    check (feedback_mode in ('immediate', 'deferred')),
  time_limit_sec integer,
  expires_at timestamptz,
  score numeric(5, 2),
  dedupe_scope text not null
    check (dedupe_scope in ('set', 'question', 'knowledge')),
  clear_mode text not null
    check (clear_mode in ('consecutive', 'cumulative')),
  clear_threshold smallint not null
    check (clear_threshold between 1 and 10),
  planned_count integer not null default 0,
  skipped_count integer not null default 0,
  answered_count integer not null default 0,
  correct_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index attempts_user_id_started_at_idx on public.attempts (user_id, started_at);
create index attempts_question_set_id_idx on public.attempts (question_set_id);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  question_set_id uuid references public.question_sets (id),
  question_version integer not null,
  selected_choice_id uuid references public.question_choices (id),
  response jsonb,
  is_correct boolean,
  score numeric(4, 3)
    check (score between 0 and 1),
  grading_status text not null default 'graded'
    check (grading_status in ('graded', 'pending')),
  time_ms integer
    check (time_ms >= 0),
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index answers_user_id_answered_at_idx on public.answers (user_id, answered_at);
create index answers_question_id_idx on public.answers (question_id);

-- ---------------------------------------------------------------------------
-- 進捗
-- ---------------------------------------------------------------------------

create table public.user_set_question_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_set_id uuid not null references public.question_sets (id),
  question_id uuid not null references public.questions (id),
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  current_streak integer not null default 0,
  last_is_correct boolean,
  last_answered_at timestamptz,
  primary key (user_id, question_set_id, question_id)
);

create table public.user_question_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  current_streak integer not null default 0,
  last_is_correct boolean,
  last_answered_at timestamptz,
  primary key (user_id, question_id)
);

create table public.user_knowledge_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  knowledge_item_id uuid not null references public.knowledge_items (id),
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  current_streak integer not null default 0,
  last_is_correct boolean,
  last_answered_at timestamptz,
  primary key (user_id, knowledge_item_id)
);

create table public.daily_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_date date not null,
  answered_count integer not null default 0,
  correct_count integer not null default 0,
  study_seconds integer not null default 0,
  xp_earned integer not null default 0,
  primary key (user_id, activity_date)
);

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic text not null,
  requested_count smallint not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  status text not null
    check (status in ('succeeded', 'failed')),
  created_at timestamptz not null default now()
);

create index ai_generations_user_id_created_at_idx on public.ai_generations (user_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS（全テーブル）
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.categories enable row level security;
alter table public.structure_types enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.questions enable row level security;
alter table public.question_choices enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.question_knowledge_items enable row level security;
alter table public.question_sets enable row level security;
alter table public.question_set_items enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;
alter table public.user_set_question_progress enable row level security;
alter table public.user_question_progress enable row level security;
alter table public.user_knowledge_progress enable row level security;
alter table public.daily_activity enable row level security;
alter table public.ai_generations enable row level security;
