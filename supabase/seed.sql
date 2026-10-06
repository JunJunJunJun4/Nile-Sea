-- ローカル開発用のテストデータ（supabase db reset のときに migration の後で読み込まれる）
--
-- - リモートには反映しない（supabase db push に --include-seed を付けない）。
-- - 分類 language/english/vocabulary の英単語の問題集を2つ作る。
--     英単語 基礎A（無料）20問 / 英単語 基礎B（有料）20問。問題はすべて四択（single_choice）・公開中。
-- - 重複の確認用に、次の3種類を混ぜる。
--     S1〜S8 : AとBの両方に入っている同じ問題（questions の同じ行を両方に登録）
--     P1〜P4 : 問題文は違うが同じ知識項目（同じ単語）を問う問題。PnA は A、PnB は B に入れる
--     A1〜A8 / B1〜B8 : その問題集だけの問題（A1・B1 は知識項目を2つ持つ）
-- - validate_question（選択肢4つ・正解1つの検査）はコミット時に動くため、全体を1つのトランザクションで登録する。

begin;

-- ---------------------------------------------------------------------------
-- 問題の元データ（code で問題を参照する。choices は 1 番から順に並べ、correct が正解の番号）
-- ---------------------------------------------------------------------------

create temp table seed_questions (
  code text primary key,
  id uuid not null default gen_random_uuid(),
  structure_type_key text not null,
  difficulty smallint not null,
  body text not null,
  choices text[] not null,
  correct smallint not null,
  explanation text not null,
  words text[] not null
) on commit drop;

insert into seed_questions (code, structure_type_key, difficulty, body, choices, correct, explanation, words) values
  -- 共有（A・B の両方に入る同じ問題）
  ('S1', 'abstract_to_concrete', 1,
   '英単語 important の意味として最も適切なものを選びなさい。',
   array['重要な', '有名な', '不可能な', '興味深い'], 1,
   'important は「重要な・大切な」。It is important to ～（～することが大切だ）の形でよく使う。名詞形は importance（重要性）。',
   array['important']),
  ('S2', 'cause_to_effect', 1,
   E'次の英文の decided の意味として最も適切なものを選びなさい。\n\nIt started to rain, so we decided to stay home.',
   array['心配した', '決めた', '約束した', '急いだ'], 2,
   'decide は「決める・決心する」。decide to ～ で「～することに決める」。雨が降り出した（原因）ので家にいることに決めた（結果）。名詞形は decision（決定）。',
   array['decide']),
  ('S3', 'effect_to_cause', 1,
   E'次の英文の remember の意味として最も適切なものを選びなさい。\n\nI couldn''t call her because I didn''t remember her number.',
   array['書く', '調べる', '覚えている', '変える'], 3,
   'remember は「覚えている・思い出す」。電話できなかった（結果）の理由が because 以下で示されている。反対の意味は forget（忘れる）。',
   array['remember']),
  ('S4', 'contrast', 1,
   'cheap（安い）と反対の意味を持つ expensive の意味として最も適切なものを選びなさい。',
   array['便利な', '新しい', '重い', '高価な'], 4,
   'expensive は「高価な・値段が高い」。cheap（安い）と対になる語。値段そのものの高い・安いは The price is high / low. のように表す。',
   array['expensive']),
  ('S5', 'concrete_to_abstract', 1,
   E'次の英文の village の意味として最も適切なものを選びなさい。\n\nMy grandparents live in a small village near the mountains.',
   array['村', '駅', '港', '城'], 1,
   'village は「村」。town（町）や city（都市）より小さい集落を指す。villager は「村人」。',
   array['village']),
  ('S6', 'paradox', 1,
   E'次の英文の believe の意味として最も適切なものを選びなさい。\n\nIt sounds strange, but I believe his story.',
   array['疑う', '信じる', '忘れる', '話す'], 2,
   'believe は「信じる」。but の前で「奇妙に聞こえる」と言いながら、後ろで「信じる」と逆の流れの内容を述べている。名詞形は belief（信念）。',
   array['believe']),
  ('S7', 'induction', 2,
   E'dangerous は次のように使われる。\n\n- Swimming in this river is dangerous.\n- It is dangerous to cross the road here.\n\ndangerous の意味として最も適切なものを選びなさい。',
   array['安全な', '静かな', '危険な', '有名な'], 3,
   'dangerous は「危険な」。名詞 danger（危険）に -ous が付いた形容詞。反対の意味は safe（安全な）。',
   array['dangerous']),
  ('S8', 'deduction', 1,
   '-ly は形容詞に付いて「～に・～く」という意味の副詞を作る。quick（速い）から考えて、quickly の意味として最も適切なものを選びなさい。',
   array['ゆっくりと', '静かに', '注意深く', 'すばやく'], 4,
   'quickly は「すばやく・速く」。quick に -ly が付いた副詞。反対の意味は slowly（ゆっくりと）。',
   array['quickly']),

  -- 同じ知識・違う問題文（PnA は A、PnB は B）
  ('P1A', 'abstract_to_concrete', 2,
   '英単語 environment の意味として最も適切なものを選びなさい。',
   array['政府', '環境', '経験', '設備'], 2,
   'environment は「環境」。特に自然環境を指すことが多い。形容詞は environmental（環境の）。',
   array['environment']),
  ('P1B', 'cause_to_effect', 2,
   E'次の英文の environment の意味として最も適切なものを選びなさい。\n\nPlastic waste causes serious damage to the environment.',
   array['環境', '経済', '社会', '健康'], 1,
   'environment は「環境」。cause damage to ～ は「～に損害を与える」。プラスチックごみ（原因）が環境に深刻な被害（結果）をもたらす、という文。',
   array['environment']),
  ('P2A', 'concrete_to_abstract', 2,
   E'次の英文の improve の意味として最も適切なものを選びなさい。\n\nI read English books every day to improve my English.',
   array['教える', '忘れる', '向上させる', '説明する'], 3,
   'improve は「改善する・向上させる」。毎日英語の本を読んで英語力を伸ばす、という意味で使われている。名詞形は improvement（改善）。',
   array['improve']),
  ('P2B', 'contrast', 2,
   '物事を worse（より悪く）するのではなく better（より良く）することを表す動詞 improve の意味として最も適切なものを選びなさい。',
   array['減らす', '壊す', '守る', '改善する'], 4,
   'improve は「改善する・向上させる」。悪化させる worsen と対になる語。improve one''s skills（技能を高める）のように使う。',
   array['improve']),
  ('P3A', 'abstract_to_concrete', 2,
   '英単語 opinion の意味として最も適切なものを選びなさい。',
   array['意見', '質問', '返事', '習慣'], 1,
   'opinion は「意見・考え」。in my opinion（私の意見では）の形でよく使う。',
   array['opinion']),
  ('P3B', 'induction', 2,
   E'opinion は次のように使われる。\n\n- In my opinion, this plan is good.\n- What is your opinion about the new rule?\n\nopinion の意味として最も適切なものを選びなさい。',
   array['規則', '意見', '計画', '理由'], 2,
   'opinion は「意見・考え」。In my opinion（私の意見では）、What is your opinion about ～?（～についてどう思いますか）のように使う。',
   array['opinion']),
  ('P4A', 'effect_to_cause', 2,
   E'次の英文の prepared の意味として最も適切なものを選びなさい。\n\nShe did well on the test because she had prepared carefully.',
   array['心配した', '休んだ', '準備した', '遅れた'], 3,
   'prepare は「準備する」。prepare for ～ で「～に備える」。テストがよくできた（結果）の理由が because 以下にある。名詞形は preparation（準備）。',
   array['prepare']),
  ('P4B', 'paradox', 2,
   E'次の英文の prepare の意味として最も適切なものを選びなさい。\n\nWe had a lot of time to prepare, but we were still not ready.',
   array['出発する', '休憩する', '相談する', '準備する'], 4,
   'prepare は「準備する」。準備の時間はたくさんあったのに、まだ準備ができていない、という逆の流れの文。be ready は「準備ができている」。',
   array['prepare']),

  -- A だけの問題
  ('A1', 'contrast', 2,
   'borrow の意味として最も適切なものを選びなさい。（lend との違いに注意）',
   array['貸す', '借りる', '返す', '買う'], 2,
   'borrow は「借りる」、lend は「貸す」。Can I borrow your pen?（ペンを借りてもいい？）／ I''ll lend you my pen.（ペンを貸してあげる）のように、物の動く向きが逆になる。',
   array['borrow', 'lend']),
  ('A2', 'effect_to_cause', 2,
   E'次の英文の journey の意味として最も適切なものを選びなさい。\n\nShe was very tired because the journey took ten hours.',
   array['旅', '仕事', '道路', '季節'], 1,
   'journey は「旅・旅行」。特に長い距離を移動する旅に使うことが多い。とても疲れていた（結果）の理由が because 以下にある。',
   array['journey']),
  ('A3', 'concrete_to_abstract', 3,
   E'次の英文の ancient の意味として最も適切なものを選びなさい。\n\nWe visited an ancient temple built over 1,000 years ago.',
   array['巨大な', '美しい', '古代の', '有名な'], 3,
   'ancient は「古代の・大昔の」。1,000年以上前に建てられた、という文脈からも推測できる。反対の意味は modern（現代の）。',
   array['ancient']),
  ('A4', 'cause_to_effect', 2,
   E'次の英文の solved の意味として最も適切なものを選びなさい。\n\nHe solved the problem, so everyone could go home early.',
   array['作った', '解決した', '見つけた', '説明した'], 2,
   'solve は「解決する・解く」。solve a problem で「問題を解決する」。名詞形は solution（解決策）。',
   array['solve']),
  ('A5', 'contrast', 2,
   'rude（失礼な）と反対の意味を持つ polite の意味として最も適切なものを選びなさい。',
   array['正直な', '勇敢な', '礼儀正しい', '静かな'], 3,
   'polite は「礼儀正しい・丁寧な」。rude（失礼な）と対になる語。否定の im- を付けた impolite も「失礼な」という意味になる。',
   array['polite']),
  ('A6', 'induction', 1,
   E'weather は次のように使われる。\n\n- The weather is nice today.\n- We checked the weather before the trip.\n\nweather の意味として最も適切なものを選びなさい。',
   array['景色', '天気', '季節', '気分'], 2,
   'weather は「天気・天候」。ある日の空模様を表す。長い期間の気候は climate という。',
   array['weather']),
  ('A7', 'deduction', 2,
   E'protect A from B は「B から A を～する」という形で使う。次の英文の protect の意味として最も適切なものを選びなさい。\n\nSunglasses protect your eyes from strong light.',
   array['守る', '傷つける', '洗う', '閉じる'], 1,
   'protect は「守る・保護する」。protect A from B で「B から A を守る」。名詞形は protection（保護）。',
   array['protect']),
  ('A8', 'paradox', 2,
   E'次の英文の enough の意味として最も適切なものを選びなさい。\n\nHe is rich, but he never thinks he has enough money.',
   array['少しの', '余分な', '大切な', '十分な'], 4,
   'enough は「十分な」。お金持ちなのに十分だと思わない、という逆の流れの文。enough money（十分なお金）のように名詞の前、old enough（十分な年齢だ）のように形容詞の後ろに置く。',
   array['enough']),

  -- B だけの問題
  ('B1', 'cause_to_effect', 3,
   E'次の英文の affect の意味として最も適切なものを選びなさい。（effect との違いに注意）\n\nLack of sleep can affect your health.',
   array['効果', '影響を与える', '回復させる', '改善する'], 2,
   'affect は動詞で「影響を与える」、effect は名詞で「影響・効果」。have an effect on ～ は affect とほぼ同じ意味になる。睡眠不足（原因）が健康に影響する（結果）。',
   array['affect', 'effect']),
  ('B2', 'effect_to_cause', 2,
   E'次の英文の succeeded の意味として最も適切なものを選びなさい。\n\nShe succeeded because she never gave up.',
   array['成功した', '失敗した', '引退した', '出発した'], 1,
   'succeed は「成功する」。succeed in ～ で「～に成功する」。名詞形は success、形容詞は successful。反対の意味は fail（失敗する）。',
   array['succeed']),
  ('B3', 'concrete_to_abstract', 2,
   E'次の英文の neighbor の意味として最も適切なものを選びなさい。\n\nOur neighbor often gives us vegetables from her garden.',
   array['先生', '親戚', '隣人', '店員'], 3,
   'neighbor は「隣人・近所の人」。neighborhood は「近所・地域」。',
   array['neighbor']),
  ('B4', 'deduction', 2,
   E'compare A with B は「A と B を～する」という形で使う。次の英文の compare の意味として最も適切なものを選びなさい。\n\nCompare your answer with your partner''s.',
   array['交換する', '比較する', '隠す', '書き写す'], 2,
   'compare は「比較する・比べる」。compare A with B で「A と B を比べる」。名詞形は comparison（比較）。',
   array['compare']),
  ('B5', 'deduction', 1,
   '-y は名詞に付いて「～のある・～の状態の」という意味の形容詞を作る。health（健康）から考えて、healthy の意味として最も適切なものを選びなさい。',
   array['健康な', '病気の', '疲れた', '有名な'], 1,
   'healthy は「健康な・健康に良い」。health に -y が付いた形容詞。同じ作りの語に rainy（雨の）、sunny（晴れた）などがある。',
   array['healthy']),
  ('B6', 'induction', 2,
   E'invite は次のように使われる。\n\n- She invited me to her birthday party.\n- We invited our friends for dinner.\n\ninvite の意味として最も適切なものを選びなさい。',
   array['断る', '手伝う', '招待する', '紹介する'], 3,
   'invite は「招待する・誘う」。invite A to B で「A を B に招待する」。名詞形は invitation（招待）。',
   array['invite']),
  ('B7', 'paradox', 2,
   E'次の英文の explained の意味として最も適切なものを選びなさい。\n\nI explained it many times, but he still didn''t understand.',
   array['隠した', '尋ねた', '忘れた', '説明した'], 4,
   'explain は「説明する」。何度も説明したのに、まだ理解しなかった、という逆の流れの文。名詞形は explanation（説明）。',
   array['explain']),
  ('B8', 'abstract_to_concrete', 3,
   '英単語 century の意味として最も適切なものを選びなさい。',
   array['十年', '世紀', '千年', '週末'], 2,
   'century は「世紀・100年」。the 21st century（21世紀）のように使う。cent- は「100」を表す（percent など）。',
   array['century']);

-- ---------------------------------------------------------------------------
-- knowledge_items（kind = word。意味は definition に入れる）
-- ---------------------------------------------------------------------------

insert into public.knowledge_items (kind, label, definition, normalized_label, category_id)
select 'word', v.label, v.definition, lower(v.label), c.id
from (values
  ('important', '重要な'),
  ('decide', '決める'),
  ('remember', '覚えている、思い出す'),
  ('expensive', '高価な'),
  ('village', '村'),
  ('believe', '信じる'),
  ('dangerous', '危険な'),
  ('quickly', 'すばやく'),
  ('environment', '環境'),
  ('improve', '改善する、向上させる'),
  ('opinion', '意見'),
  ('prepare', '準備する'),
  ('borrow', '借りる'),
  ('lend', '貸す'),
  ('journey', '旅'),
  ('ancient', '古代の'),
  ('solve', '解決する、解く'),
  ('polite', '礼儀正しい'),
  ('weather', '天気'),
  ('protect', '守る'),
  ('enough', '十分な'),
  ('affect', '影響を与える'),
  ('effect', '影響、効果'),
  ('succeed', '成功する'),
  ('neighbor', '隣人'),
  ('compare', '比較する'),
  ('healthy', '健康な'),
  ('invite', '招待する'),
  ('explain', '説明する'),
  ('century', '世紀')
) as v(label, definition)
cross join (select id from public.categories where path = 'language/english/vocabulary') c;

-- ---------------------------------------------------------------------------
-- questions / question_choices / question_knowledge_items
-- ---------------------------------------------------------------------------

insert into public.questions (id, format, body, category_id, explanation, structure_type_key, difficulty, source, status)
select q.id, 'single_choice', q.body, c.id, q.explanation, q.structure_type_key, q.difficulty, 'curated', 'published'
from seed_questions q
cross join (select id from public.categories where path = 'language/english/vocabulary') c;

insert into public.question_choices (question_id, position, body, is_correct)
select q.id, ch.position, ch.body, ch.position = q.correct
from seed_questions q
cross join unnest(q.choices) with ordinality as ch(body, position);

insert into public.question_knowledge_items (question_id, knowledge_item_id)
select q.id, k.id
from seed_questions q
cross join unnest(q.words) as w(label)
join public.knowledge_items k on k.kind = 'word' and k.normalized_label = lower(w.label);

-- ---------------------------------------------------------------------------
-- question_sets / question_set_items（question_count はトリガーで設定される）
-- ---------------------------------------------------------------------------

create temp table seed_sets (
  code text primary key,
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text not null,
  is_free boolean not null,
  question_codes text[] not null
) on commit drop;

insert into seed_sets (code, title, description, is_free, question_codes) values
  ('A', '英単語 基礎A', '中学〜高校レベルの基本的な英単語の意味を四択で確認する問題集（無料）。', true,
   array['S1', 'P1A', 'A1', 'S2', 'A2', 'P2A', 'S3', 'A3', 'A4', 'S4',
         'P3A', 'A5', 'S5', 'A6', 'P4A', 'S6', 'A7', 'S7', 'A8', 'S8']),
  ('B', '英単語 基礎B', '中学〜高校レベルの基本的な英単語の意味を四択で確認する問題集（有料）。', false,
   array['B1', 'S8', 'P1B', 'B2', 'S6', 'B3', 'P2B', 'S4', 'B4', 'S2',
         'P3B', 'B5', 'S1', 'B6', 'S7', 'P4B', 'B7', 'S3', 'B8', 'S5']);

insert into public.question_sets (id, title, description, category_id, visibility, kind, is_free, status)
select s.id, s.title, s.description, c.id, 'public', 'practice', s.is_free, 'published'
from seed_sets s
cross join (select id from public.categories where path = 'language/english/vocabulary') c;

insert into public.question_set_items (question_set_id, question_id, position)
select s.id, q.id, i.position
from seed_sets s
cross join unnest(s.question_codes) with ordinality as i(code, position)
join seed_questions q on q.code = i.code;

commit;
