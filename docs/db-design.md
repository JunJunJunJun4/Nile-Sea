# DB設計（Nile-Sea）

Supabase（PostgreSQL）。全テーブルで RLS を有効にする。選択肢を持つ列は text + CHECK 制約。

実装は `supabase/migrations/` の5ファイル（テーブル / 権限関数・RLS・列権限 / 関数・トリガー / 初期データ / 出題リストの保存と結果・進捗の関数）。適用済みの migration は編集せず、変更は新しいファイルで追加する。動作確認は `supabase/tests/db_smoke_test.sql`。

## 設計方針

| 区分 | 要件 | 実現方法 | 関係するテーブル・列 |
|---|---|---|---|
| 基本 | 4択問題を解く（将来：二択・穴埋め・記述・並び替え・マッチング・単語カード） | questions.format で出題形式を持つ。選択肢は question_choices、選択式以外の正解データは question_answer_keys に分ける。最初に実装するのは四択（single_choice）だけだが、形式を足してもテーブルを作り直さずに済む | questions.format / question_answer_keys |
| 基本 | 何度でもチャレンジできる | 1回の挑戦を attempts、1問ごとの回答を answers に記録する。answers は追記のみで書き換えない（学習履歴の正本） | attempts / answers |
| 基本 | 間違えた問題を復習できる | 進捗テーブルの「不正解あり・未クリア」を抽出して復習モード（attempts.mode = review）で出題する | user_question_progress |
| 基本 | 挑戦数・正解数・不正解数・カレンダー | 累計は進捗テーブル、日別は daily_activity に集計して持つ。毎回 answers を全件数えずに済むので速い | daily_activity |
| 拡張 | 模擬試験（制限時間つき）・単語帳に広げられる | question_sets.kind（練習 / 模擬試験 / 単語帳）と制限時間、attempts の制限時間・採点結果の返し方（即時 / 終了後）を最初から持つ | question_sets.kind / attempts |
| 拡張 | 記述式や部分点に対応できる | answers に、選んだ選択肢だけでなく回答内容（response）・得点（score）・採点状態（採点済み / 採点待ち）を持つ | answers |
| 拡張 | 問題を後から修正しても学習履歴が狂わない | questions.version を持ち、回答時の版を answers に記録する。内容が変わる修正は版を上げる | questions.version / answers.question_version |
| 拡張 | 講師・受講者・凍結などの権限を足せる | 権限の判定を is_admin() などの共通関数にまとめ、すべての RLS がそれを呼ぶ。役割や状態を足しても、関数を1か所直すだけで済む | profiles.role / status、権限関数 |
| 拡張 | ブックマーク・メモ・コメント・タグを何にでも付けられる | 「対象の種類（target_type）＋対象のID（target_id）」で指す共通の形に統一する。問題・問題集・レッスンなど、対象が増えてもテーブルを増やさずに済む | 将来テーブル シート |
| 特徴① | 問題集の重複を省ける（同じ問題） | 問題を問題集に直接持たせず、中間テーブル question_set_items でつなぐ。同じ問題を複数の問題集に入れられる | question_set_items |
| 特徴① | 問題集の重複を省ける（同じ知識） | 「知識項目」（単語・概念）のテーブル knowledge_items を作り、中間テーブルで問題に紐づける。1つの問題に複数の知識項目を付けられる。問題文が違っても同じ知識を問う問題を束ねられる | knowledge_items / question_knowledge_items |
| 特徴① | 重複と判定する範囲をユーザーが選べる | user_settings.dedupe_scope に3段階（問題集ごと / 同じ問題 / 同じ知識）を持つ。進捗も3つの粒度で記録し、設定に応じて参照先を切り替える | user_settings と進捗3テーブル |
| 特徴① | クリアの条件をユーザーが選べる | 「クリア済み」というフラグは保存しない。正解数と連続正解数だけを記録し、設定（連続n回 / 累計n回）と比べてその都度判定する。設定を変えると即座に判定が変わる | user_settings.clear_mode / clear_threshold |
| 特徴② | 問題ごとに構造の型を持つ | 型の一覧をマスタ structure_types にして、questions から参照する。型の追加や、型ごとの正答率の集計ができる | structure_types |
| 特徴③ | 独自の分類体系で分類し、領域の近さを構造化する | 独自の分類をマスタ categories に階層（親子関係）で持ち、問題集に紐づける。各分類に「言語/英語/語彙」のような経路（path）を持たせ、経路の先頭が何階層まで一致するかで「同じ / 近い / 遠い」を判定する。階層の深さは自由に決められる | categories |
| 運用 | 問題集はユーザーも作れるが、最初は開放しない | テーブルには最初から owner_id / visibility / source を持たせておく。当面は RLS で「作成・編集は管理者（profiles.role = admin）のみ」に絞り、開放時はポリシーを足すだけにする | question_sets / questions の RLS |
| 課金 | 無料は問題集の一部だけ | question_sets.is_free で無料公開の問題集を指定する。それ以外は有料プランのみ。一覧（question_sets）は全員に見せるが、問題の中身（questions / question_choices / question_knowledge_items）はプランで解ける問題集のものだけを RLS で読ませる | question_sets.is_free / questions の RLS |
| 課金 | 無料は1日に解ける問題数に上限 | 上限値は plans テーブルに持ち、回答の登録時にサーバー側で daily_activity と比べて判定する。値を変えるだけで上限を調整できる | plans.daily_question_limit |
| 課金 | AI出題は有料のみ | plans.can_use_ai で判定する。生成した問題は questions に source = ai・作成者本人のみ閲覧可で保存し、利用量を ai_generations に記録する | plans.can_use_ai / ai_generations |
| 安全 | 正解をブラウザに送らない | question_choices.is_correct と question_answer_keys はクライアント（anon / authenticated。管理者も含む）から読めないようにし、採点はサーバー側の関数 submit_answer で行う。問題の管理画面は Secret key を使うサーバー側で作る | 列単位の権限 + 関数 |
| 安全 | 他人のデータを読めない | 全テーブルで RLS を有効にする。学習データは本人の行だけ読める。書き込みはサーバー側の関数に限定する。Supabase が新しいテーブルに付ける anon / authenticated の全権限はいったん外し、必要な権限だけを付け直す | RLS・権限シート |
| 安全 | ユーザーを削除できる | auth.users の削除で profiles が消え、本人の設定・課金・学習データ（user_settings / subscriptions / attempts / attempt_questions / answers / 進捗 / daily_activity / ai_generations）も連動削除する。作成者の列（questions.created_by / question_sets.owner_id）は NULL にする | 各テーブルの FK |

## テーブル一覧

| カテゴリ | テーブル | 役割 | 書き込む人・処理 | MVP |
|---|---|---|---|---|
| ユーザー | profiles | ユーザーの表示名と権限（user / admin）。認証ユーザーと1対1 | 登録時に自動作成 | ◎ |
| ユーザー | user_settings | 重複の判定範囲、クリア条件、タイムゾーンなど、ユーザーが選ぶ設定 | 登録時に自動作成、本人が更新 | ◎ |
| 課金 | plans | プランの定義（無料 / 有料）と制限値 | 管理者 | ◎ |
| 課金 | subscriptions | Stripe の課金状態。ユーザーがどのプランか | Stripe Webhook（サーバー） | ◎ |
| 課金 | stripe_events | 処理済みの Webhook イベントID（二重処理の防止） | Stripe Webhook（サーバー） | ◎ |
| マスタ | categories | 独自の分類体系（分野の階層）。領域の近さの判定に使う | 管理者 | ◎ |
| マスタ | structure_types | 問題の構造の型（抽象→具体、帰納法 など） | 管理者 | ◎ |
| マスタ | knowledge_items | 知識項目（単語・用語・概念）。同じ知識を問う問題を束ねる | 管理者 | ◎ |
| 問題 | questions | 問題文、解説、構造の型、知識項目、作成元 | 管理者（将来：ユーザー / AI） | ◎ |
| 問題 | question_choices | 選択肢と正解（四択・二択など選択式の問題用） | 管理者（将来：ユーザー / AI） | ◎ |
| 問題 | question_answer_keys | 選択式以外の正解データ（穴埋めの正答、並び順、組み合わせ、採点基準）。クライアントからは読めない | サーバー（Secret key を使う管理画面） | ◎ |
| 問題 | question_knowledge_items | 問題と知識項目の対応（1問に複数の知識項目を付けられる） | 管理者（将来：ユーザー / AI） | ◎ |
| 問題 | question_sets | 問題集（タイトル、分類、無料公開か） | 管理者（将来：ユーザー） | ◎ |
| 問題 | question_set_items | 問題集と問題の対応、出題順 | 管理者（将来：ユーザー） | ◎ |
| 学習 | attempts | 1回のチャレンジ（どの問題集を、どの設定で、いつ） | サーバー関数 start_attempt | ◎ |
| 学習 | attempt_questions | 1回の挑戦の出題リスト（どの問題を、どの順で出すか）。途中再開と回答できる問題の判定に使う | サーバー関数 start_attempt | ◎ |
| 学習 | answers | 1問ごとの回答（選んだ選択肢、正誤、日時）。学習履歴の正本 | サーバー関数 submit_answer | ◎ |
| 進捗 | user_set_question_progress | ユーザー × 問題集 × 問題ごとの累計（重複判定「問題集ごと」用） | サーバー関数 submit_answer | ◎ |
| 進捗 | user_question_progress | ユーザー × 問題ごとの累計（重複判定「同じ問題」用） | サーバー関数 submit_answer | ◎ |
| 進捗 | user_knowledge_progress | ユーザー × 知識項目ごとの累計（重複判定「同じ知識」用） | サーバー関数 submit_answer | ◎ |
| 進捗 | daily_activity | ユーザー × 日付ごとの回答数・正解数（カレンダー、1日の上限判定） | サーバー関数 submit_answer | ◎ |
| AI | ai_generations | AI出題の利用記録（トークン数、成否）。費用の監視用 | サーバー（AI出題のAPI） | ◎（テーブルのみ。AI出題の機能は後） |

## カラム定義

### profiles

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × |  | PK, FK → auth.users（削除時は連動削除） | Supabase の認証ユーザーID |
| display_name | text | ○ |  |  | 表示名。★profiles には他人に見せてよい情報だけを置き、非公開の設定は user_settings に置く |
| role | text | × | 'learner' | CHECK: learner / instructor / admin | learner = 受講者 / instructor = 講師（将来）/ admin = 管理者。★本人が書き換えられないようにする |
| status | text | × | 'active' | CHECK: active / pending / suspended | pending = 承認待ち（将来）/ suspended = 凍結。active 以外は学習データの読み書きを拒否する。★本人が書き換えられないようにする |
| avatar_url | text | ○ |  |  | アイコン画像（将来：ランキングやコミュニティで表示） |
| created_at | timestamptz | × | now() |  | 作成日時 |
| updated_at | timestamptz | × | now() |  | 更新日時（トリガーで自動更新） |

### user_settings

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | × |  | PK, FK → profiles（連動削除） |  |
| dedupe_scope | text | × | 'question' | CHECK: set / question / knowledge | 重複と判定する範囲。set = 問題集ごとに独立 / question = 同じ問題 / knowledge = 同じ知識項目 |
| clear_mode | text | × | 'consecutive' | CHECK: consecutive / cumulative | クリア条件の数え方。consecutive = 連続正解 / cumulative = 累計正解 |
| clear_threshold | smallint | × | 1 | CHECK: 1〜10 | クリアに必要な回数。既定は「1回正解でクリア」 |
| timezone | text | × | 'Asia/Tokyo' | トリガーで検査（pg_timezone_names にある名前だけ） | カレンダーと1日の上限の「1日」の区切りに使う |
| daily_goal | smallint | ○ |  |  | 1日の目標問題数（任意） |
| updated_at | timestamptz | × | now() |  | 更新日時（トリガーで自動更新） |

### plans

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| key | text | × |  | PK | free / pro など |
| name | text | × |  |  | 表示名 |
| daily_question_limit | integer | ○ |  |  | 1日に解ける問題数。NULL = 無制限 |
| can_access_all_sets | boolean | × | false |  | false のとき is_free の問題集だけ解ける |
| can_use_ai | boolean | × | false |  | AI出題を使えるか |
| stripe_price_id | text | ○ |  |  | Stripe の価格ID（price_...）。無料プランは NULL |
| sort_order | smallint | × | 0 |  | 表示順 |

### subscriptions

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | × |  | PK, FK → profiles（連動削除） | 1ユーザー1行 |
| plan_key | text | × | 'free' | FK → plans | 現在のプラン |
| stripe_customer_id | text | ○ |  | UNIQUE | Stripe の顧客ID（cus_...） |
| stripe_subscription_id | text | ○ |  | UNIQUE | Stripe のサブスクID（sub_...） |
| status | text | × | 'none' |  | none / active / trialing / past_due / canceled など（Stripe の値をそのまま保存） |
| current_period_end | timestamptz | ○ |  |  | 現在の請求期間の終了日時 |
| cancel_at_period_end | boolean | × | false |  | 期間終了時に解約予定か |
| updated_at | timestamptz | × | now() |  | 更新日時（トリガーで自動更新） |

### stripe_events

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | text | × |  | PK | Stripe のイベントID（evt_...）。同じIDが来たら処理しない |
| type | text | × |  |  | イベントの種類 |
| received_at | timestamptz | × | now() |  | 受信日時 |

### categories

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| slug | text | × |  | UNIQUE NULLS NOT DISTINCT (parent_id, slug), CHECK: 英小文字・数字・ハイフン | 分類の識別名。例：english。最上位どうしでも重複させない |
| name | text | × |  |  | 表示名。例：英語 |
| parent_id | uuid | ○ |  | FK → categories | 1つ上の階層。最上位は NULL。自分自身や子孫を親にはできない（トリガーで検査） |
| path | text | × |  | UNIQUE, INDEX | 最上位からの経路。例：language/english/vocabulary（トリガーで自動生成。slug や親を変えると子孫の path も更新する） |
| depth | smallint | × |  | CHECK: 1〜6 | 階層の深さ。最上位 = 1 |
| sort_order | integer | × | 0 |  | 表示順 |
| description | text | ○ |  |  | 分類の説明（任意） |

### structure_types

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| key | text | × |  | PK | 例：abstract_to_concrete |
| label_ja | text | × |  |  | 表示名。例：抽象→具体 |
| description | text | ○ |  |  | 型の説明 |
| sort_order | smallint | × | 0 |  | 表示順 |

### knowledge_items

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| kind | text | × |  | CHECK: word / term / concept / fact / formula | 知識の種類 |
| label | text | × |  |  | 表示名。例：abandon |
| reading | text | ○ |  |  | 読み・発音（将来：音声読み上げ、単語カード） |
| definition | text | ○ |  |  | 意味・短い解説（将来：用語のポップアップ解説、単語カードの裏面） |
| normalized_label | text | × |  | UNIQUE(kind, normalized_label) | 小文字化・空白除去した値。同じ知識の二重登録を防ぐ |
| category_id | uuid | ○ |  | FK → categories | この知識が属する分類（任意） |
| note | text | ○ |  |  | メモ |
| created_at | timestamptz | × | now() |  | 作成日時 |

### questions

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| format | text | × | 'single_choice' | CHECK: single_choice / multiple_choice / true_false / fill_blank / free_text / ordering / matching / flashcard | 出題形式。最初に実装するのは single_choice（四択）のみ |
| body | text | × |  |  | 問題文（Markdown） |
| content | jsonb | ○ |  |  | 形式ごとの追加データ（穴埋めの空欄位置、並び替える項目、画像・音声の参照など）。★正解は入れない |
| category_id | uuid | ○ |  | FK → categories | 問題そのものの分類（得意・苦手分野の集計に使う） |
| version | integer | × | 1 |  | 問題の版。正解や意味が変わる修正のときに上げる |
| explanation | text | ○ |  |  | 解説（回答後に表示） |
| structure_type_key | text | ○ |  | FK → structure_types | 構造の型 |
| difficulty | smallint | ○ |  | CHECK: 1〜5 | 難易度（任意） |
| source | text | × | 'curated' | CHECK: curated / user / ai | 作成元。curated = 運営が用意 |
| created_by | uuid | ○ |  | FK → profiles（削除時は NULL） | 作成者。運営の問題は NULL でも可 |
| status | text | × | 'draft' | CHECK: draft / published / archived | published だけが出題される |
| created_at | timestamptz | × | now() |  | 作成日時 |
| updated_at | timestamptz | × | now() |  | 更新日時（トリガーで自動更新） |

### question_choices

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| question_id | uuid | × |  | FK → questions（連動削除） |  |
| position | smallint | × |  | CHECK: 1以上, UNIQUE(question_id, position)（DEFERRABLE。並べ替えのため検査はコミット時） | 選択肢の番号。個数の制約（四択は4つ、二択は2つ）は形式ごとにトリガーで検査する |
| body | text | × |  |  | 選択肢の文 |
| is_correct | boolean | × | false | single_choice / true_false は正解1つ（トリガーで検査） | ★クライアントから読めない列にする（管理者も含む）。クライアントは select('*') ではなく列を指定して読む |

### question_answer_keys

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| question_id | uuid | × |  | PK, FK → questions（連動削除） | 選択式以外の問題に1行 |
| spec | jsonb | × |  |  | 正解データ。例：穴埋め = 許容する答えの一覧 / 並び替え = 正しい順 / マッチング = 組み合わせ / 記述 = 模範解答と採点基準 |
| grading | text | × | 'auto' | CHECK: auto / ai / manual / self | 採点方法。auto = 自動 / ai = AIが採点 / manual = 講師が採点 / self = 自己採点（単語カード） |
| updated_at | timestamptz | × | now() |  | 更新日時（トリガーで自動更新） |

### question_knowledge_items

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| question_id | uuid | × |  | PK(1), FK → questions（連動削除） |  |
| knowledge_item_id | uuid | × |  | PK(2), FK → knowledge_items, INDEX | この問題が問う知識項目。1問に複数行を登録できる。0行の問題は、重複判定「同じ知識」のとき「同じ問題」として判定する |

### question_sets

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| title | text | × |  |  | 問題集のタイトル |
| description | text | ○ |  |  | 説明 |
| category_id | uuid | ○ |  | FK → categories | 問題集の分類 |
| owner_id | uuid | ○ |  | FK → profiles（削除時は NULL） | 作成者。運営の問題集は NULL |
| visibility | text | × | 'public' | CHECK: public / private | private は作成者だけが見える（ユーザー作成の開放後に使う） |
| kind | text | × | 'practice' | CHECK: practice / exam / deck | practice = 通常の問題集 / exam = 模擬試験 / deck = 単語帳（将来） |
| time_limit_sec | integer | ○ |  |  | 制限時間（秒）。模擬試験用。NULL = 制限なし |
| pass_score | numeric(5,2) | ○ |  |  | 合格点（%）。模擬試験用 |
| is_free | boolean | × | false |  | 無料プランでも解けるか |
| status | text | × | 'draft' | CHECK: draft / published / archived | published だけが一覧に出る |
| question_count | integer | × | 0 |  | 問題数（トリガーで自動更新する控え） |
| created_at | timestamptz | × | now() |  | 作成日時 |
| updated_at | timestamptz | × | now() |  | 更新日時（トリガーで自動更新） |

### question_set_items

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| question_set_id | uuid | × |  | PK(1), FK → question_sets（連動削除） |  |
| question_id | uuid | × |  | PK(2), FK → questions | 同じ問題を複数の問題集に登録できる |
| position | integer | × |  | UNIQUE(question_set_id, position)（DEFERRABLE。並べ替えのため検査はコミット時） | 出題順 |

### attempts

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| user_id | uuid | × |  | FK → profiles（連動削除） |  |
| question_set_id | uuid | ○ |  | FK → question_sets | AI出題のとき、問題集を指定しない復習（問題集をまたぐ復習）のときは NULL |
| mode | text | × | 'normal' | CHECK: normal / review / exam / srs / ai | normal = 通常 / review = 復習 / exam = 模擬試験 / srs = 忘却曲線による復習（将来）/ ai = AI出題。★現在 start_attempt が作れるのは normal / review だけ |
| feedback_mode | text | × | 'immediate' | CHECK: immediate / deferred | immediate = 1問ごとに正誤を返す / deferred = 終了後にまとめて返す（模擬試験） |
| time_limit_sec | integer | ○ |  |  | この回の制限時間（秒） |
| expires_at | timestamptz | ○ |  |  | 制限時間の終了時刻。過ぎた回答はサーバー側で拒否する |
| score | numeric(5,2) | ○ |  |  | 得点（%）。完了時に submit_answer が計算 |
| dedupe_scope | text | × |  | CHECK: set / question / knowledge | 開始時点の設定の控え（後で設定を変えても、この回の結果は変わらない） |
| clear_mode | text | × |  | CHECK: consecutive / cumulative | 同上 |
| clear_threshold | smallint | × |  | CHECK: 1〜10 | 同上 |
| planned_count | integer | × | 0 |  | この回に出題する問題数（省いた後） |
| skipped_count | integer | × | 0 |  | クリア済みとして省いた問題数 |
| answered_count | integer | × | 0 |  | 回答済みの数 |
| correct_count | integer | × | 0 |  | 正解数 |
| started_at | timestamptz | × | now() |  | 開始日時 |
| completed_at | timestamptz | ○ |  |  | 完了日時。NULL = 途中。answered_count が planned_count に達したときに submit_answer が設定する |

### attempt_questions

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| attempt_id | uuid | × |  | PK(1), FK → attempts（連動削除） |  |
| user_id | uuid | × |  | FK → profiles（連動削除）, INDEX | RLS で本人の行を絞るための控え |
| question_id | uuid | × |  | PK(2), FK → questions, INDEX | 出題する問題 |
| position | integer | × |  | CHECK: 1以上, UNIQUE(attempt_id, position) | 出題順 |

start_attempt が作成時に書き、以後は変更しない。行数は attempts.planned_count と一致する。この表ができる前に作られた挑戦には行がないため、未完了でも続きに回答できない。

### answers

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| attempt_id | uuid | × |  | FK → attempts（連動削除）, UNIQUE(attempt_id, question_id) | 1回の挑戦で同じ問題は1度だけ |
| user_id | uuid | × |  | FK → profiles（連動削除）, INDEX(user_id, answered_at) |  |
| question_id | uuid | × |  | FK → questions |  |
| question_set_id | uuid | ○ |  | FK → question_sets | 集計を速くするための控え |
| question_version | integer | × |  |  | 回答した時点の問題の版 |
| selected_choice_id | uuid | ○ |  | FK → question_choices | 選んだ選択肢（選択式のとき） |
| response | jsonb | ○ |  |  | 選択式以外の回答内容（入力した文字、並べた順、組み合わせ、単語カードの自己評価） |
| is_correct | boolean | ○ |  |  | 正誤（サーバー側で判定）。採点待ちの間は NULL |
| score | numeric(4,3) | ○ |  | CHECK: 0〜1 | 得点（部分点に対応）。四択は 0 か 1 |
| grading_status | text | × | 'graded' | CHECK: graded / pending | pending = AIや講師の採点待ち（記述式） |
| time_ms | integer | ○ |  | CHECK: 0以上 | 回答にかかった時間（ミリ秒、任意） |
| answered_at | timestamptz | × | now() |  | 回答日時 |

### user_set_question_progress

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | × |  | PK(1), FK → profiles（連動削除） |  |
| question_set_id | uuid | × |  | PK(2), FK → question_sets |  |
| question_id | uuid | × |  | PK(3), FK → questions |  |
| correct_count | integer | × | 0 |  | 累計の正解数 |
| wrong_count | integer | × | 0 |  | 累計の不正解数 |
| current_streak | integer | × | 0 |  | 現在の連続正解数。不正解で 0 に戻る |
| last_is_correct | boolean | ○ |  |  | 直近の回答が正解だったか |
| last_answered_at | timestamptz | ○ |  |  | 直近の回答日時 |

### user_question_progress

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | × |  | PK(1), FK → profiles（連動削除） |  |
| question_id | uuid | × |  | PK(2), FK → questions |  |
| correct_count | integer | × | 0 |  | 累計の正解数 |
| wrong_count | integer | × | 0 |  | 累計の不正解数 |
| current_streak | integer | × | 0 |  | 現在の連続正解数。不正解で 0 に戻る |
| last_is_correct | boolean | ○ |  |  | 直近の回答が正解だったか |
| last_answered_at | timestamptz | ○ |  |  | 直近の回答日時 |

### user_knowledge_progress

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | × |  | PK(1), FK → profiles（連動削除） |  |
| knowledge_item_id | uuid | × |  | PK(2), FK → knowledge_items |  |
| correct_count | integer | × | 0 |  | 累計の正解数 |
| wrong_count | integer | × | 0 |  | 累計の不正解数 |
| current_streak | integer | × | 0 |  | 現在の連続正解数。不正解で 0 に戻る |
| last_is_correct | boolean | ○ |  |  | 直近の回答が正解だったか |
| last_answered_at | timestamptz | ○ |  |  | 直近の回答日時 |

### daily_activity

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | × |  | PK(1), FK → profiles（連動削除） |  |
| activity_date | date | × |  | PK(2) | ユーザーのタイムゾーンでの日付 |
| answered_count | integer | × | 0 |  | その日に回答した数（1日の上限の判定に使う） |
| correct_count | integer | × | 0 |  | その日の正解数 |
| study_seconds | integer | × | 0 |  | その日の学習時間（秒）。回答時間の合計。将来は教材の閲覧時間も加算 |
| xp_earned | integer | × | 0 |  | その日に獲得した経験値（将来） |

### ai_generations

| カラム | 型 | NULL | 既定値 | キー・制約 | 説明 |
|---|---|---|---|---|---|
| id | uuid | × | gen_random_uuid() | PK |  |
| user_id | uuid | × |  | FK → profiles（連動削除） |  |
| topic | text | × |  |  | ユーザーが指定したテーマ |
| requested_count | smallint | × |  |  | 依頼した問題数 |
| model | text | × |  |  | 使用したモデル名 |
| input_tokens | integer | ○ |  |  | 入力トークン数 |
| output_tokens | integer | ○ |  |  | 出力トークン数 |
| status | text | × |  | CHECK: succeeded / failed | 成否 |
| created_at | timestamptz | × | now() |  | 作成日時 |

## RLS・権限

「関数のみ」= サーバー側の PostgreSQL 関数経由でだけ書ける。「サーバーのみ」= Secret key を使う処理だけが書ける。管理者 = profiles.role が admin かつ status が active。

- テーブル権限：Supabase が新しいテーブルに付ける anon / authenticated の全権限をいったん外し、下の表で「不可」「関数のみ」「サーバーのみ」以外の操作だけを付け直す（権限がない操作はポリシー以前に permission denied になる）。
- ログインが必要：plans 以外は authenticated だけに権限を付ける。anon は plans だけ読める。
- 管理者の SELECT：問題・マスタのテーブルは、下の条件に加えて管理者がすべての行を読める（is_correct 列と question_answer_keys を除く）。
- 学習データ（attempts / answers / 進捗3テーブル / daily_activity）の「本人の行」は、本人かつ is_active_user() が真のとき。

| テーブル | SELECT | INSERT | UPDATE | DELETE | 備考 |
|---|---|---|---|---|---|
| profiles | 本人の行 | 不可（登録時にトリガーで作成） | 本人（display_name のみ） | 不可 | ★role と status は本人が変更できないよう、更新できる列を限定する。将来、ランキングやコミュニティで他人の表示名を見せるときは、公開用のビューを足す |
| user_settings | 本人の行 | 不可（登録時にトリガーで作成） | 本人 | 不可 |  |
| plans | 全員（ログイン不要でも可） | 管理者 | 管理者 | 管理者 | 料金ページで表示するため公開 |
| subscriptions | 本人の行 | サーバーのみ | サーバーのみ | サーバーのみ | ★Stripe Webhook が Secret key で書く。クライアントからは一切書けない |
| stripe_events | 不可 | サーバーのみ | 不可 | 不可 | ポリシーを作らない＝クライアントからは読み書き不可 |
| categories | ログインユーザー全員 | 管理者 | 管理者 | 管理者 |  |
| structure_types | ログインユーザー全員 | 管理者 | 管理者 | 管理者 |  |
| knowledge_items | ログインユーザー全員 | 管理者 | 管理者 | 管理者 |  |
| questions | published かつ、プランで解ける問題集に含まれるもの／自分が作成したもの | 管理者 | 管理者 | 管理者 | 「プランで解ける問題集」= published かつ public で、is_free または can_access_all_sets() が真のもの、または自分の問題集。一覧が見えるだけの有料問題集の中身を、無料ユーザーが API から読めないようにする。ユーザー作成の開放時に「本人が自分の行を作成・編集」のポリシーを追加する |
| question_choices | questions と同じ条件。★ただし is_correct 列は読めない（管理者も含む） | 管理者 | 管理者 | 管理者 | 列単位の権限で is_correct を除外する（SELECT は id / question_id / position / body だけ）。管理者は is_correct を書けるが読めない。正解は submit_answer の戻り値でだけ返す。問題の管理画面は Secret key を使うサーバー側で正解を読む |
| question_answer_keys | 不可 | サーバーのみ | サーバーのみ | サーバーのみ | ★権限もポリシーも付けない＝クライアントからは管理者も含めて読み書きできない（WHERE つきの UPDATE / DELETE には SELECT が必要なため、管理者に書き込みだけ許しても機能しない）。採点はサーバー側の関数だけが参照する |
| question_knowledge_items | questions と同じ条件 | 管理者 | 管理者 | 管理者 |  |
| question_sets | published かつ public のもの／自分が作成したもの | 管理者 | 管理者 | 管理者 | 無料ユーザーにも一覧は見せ、解けるかどうかは start_attempt で判定する（有料の問題集に鍵マークを出せる） |
| question_set_items | question_sets と同じ条件 | 管理者 | 管理者 | 管理者 |  |
| attempts | 本人の行 | 関数 start_attempt のみ | 関数のみ | 不可 |  |
| attempt_questions | 本人の行 | 関数 start_attempt のみ | 不可 | 不可 |  |
| answers | 本人の行 | 関数 submit_answer のみ | 不可 | 不可 | ★追記のみ。書き換え・削除を許さない（ユーザー削除時の連動削除は除く） |
| user_set_question_progress | 本人の行 | 関数のみ | 関数のみ | 不可 |  |
| user_question_progress | 本人の行 | 関数のみ | 関数のみ | 不可 |  |
| user_knowledge_progress | 本人の行 | 関数のみ | 関数のみ | 不可 |  |
| daily_activity | 本人の行 | 関数のみ | 関数のみ | 不可 |  |
| ai_generations | 本人の行 | サーバーのみ | 不可 | 不可 |  |

## ユーザーが選べる設定と判定方法

「クリア済み」は保存せず、進捗の数値と設定値を比べて都度判定する。

| 設定項目 | 値 | 意味 | 判定方法 | 参照するデータ | 想定する使い方 |
|---|---|---|---|---|---|
| 重複の判定範囲 (dedupe_scope) | set | 問題集ごとに独立 | 他の問題集で解いた結果は引き継がない。その問題集の中での成績だけで判定する | user_set_question_progress | 基礎を固めたい人、問題集ごとにやり切りたい人 |
| 重複の判定範囲 (dedupe_scope) | question（既定） | 同じ問題を省く | 問題文も選択肢も同じ問題が別の問題集にあれば、クリア済みとして省く | user_question_progress | 中級者。別の聞き方の問題は解いておきたい人 |
| 重複の判定範囲 (dedupe_scope) | knowledge | 同じ知識を省く | 問題に付いている知識項目が「すべて」クリア済みなら省く（1つでも未クリアがあれば出題する）。知識項目が付いていない問題は「同じ問題」として判定 | user_knowledge_progress | 上級者。知識が構造化されていて、未習の項目だけ解きたい人 |
| クリア条件の数え方 (clear_mode) | consecutive（既定） | 連続正解 | current_streak ≧ clear_threshold のときクリア。不正解で連続数が 0 に戻る | 各進捗テーブルの current_streak | 定着を重視 |
| クリア条件の数え方 (clear_mode) | cumulative | 累計正解 | correct_count ≧ clear_threshold のときクリア。途中で間違えても累計は減らない | 各進捗テーブルの correct_count | まず一通り終えたい人 |
| クリアに必要な回数 (clear_threshold) | 1（既定）〜10 | 回数 | 既定は「1回正解でクリア」。例：連続正解 × 2 にすると「2回連続で正解」が条件になる |  |  |
| 復習の対象 | （設定なし） | 不正解があり、未クリアの問題 | wrong_count ≧ 1 かつ、上のクリア条件を満たしていない問題。重複の判定範囲に応じた進捗テーブルから抽出する | 各進捗テーブル |  |

## プラン制限

| 項目 | 無料（free） | 有料（pro） | 使うテーブル・列 | 判定する場所 |
|---|---|---|---|---|
| 解ける問題集 | is_free = true の問題集だけ | すべての問題集 | plans.can_access_all_sets / question_sets.is_free | start_attempt（挑戦の開始時） |
| 1日に解ける問題数 | 300問 | 無制限（NULL） | plans.daily_question_limit / daily_activity.answered_count | submit_answer（回答の登録時） |
| AI出題 | 使えない | 使える | plans.can_use_ai | AI出題のAPI（サーバー） |
| 復習・カレンダー・学習記録 | 使える | 使える | ― | ― |
| 重複の判定範囲・クリア条件の変更 | 使える（★有料限定にするかは未定） | 使える | user_settings | ― |

現在のプランは subscriptions.plan_key をそのまま使う（解約時に free へ戻すのは Stripe Webhook の役割）。subscriptions の行がなければ free として扱う。

## サーバー側の関数・トリガー

| 名前 | 種類 | いつ動くか | 処理の内容 |
|---|---|---|---|
| is_admin / is_staff / is_active_user | 権限関数（public・security invoker） | すべての RLS ポリシーから呼ばれる | 本人の profiles.role と status を見て真偽を返す。is_admin / is_staff は status = active も条件にする。is_staff = 講師または管理者。★権限の判定をここに集約し、役割や状態を足すときはこの関数だけを直す |
| can_access_all_sets | 権限関数（public・security invoker） | questions の RLS から呼ばれる | 本人の現在のプランの can_access_all_sets を返す（subscriptions がなければ false） |
| validate_question | 制約トリガー（DEFERRABLE INITIALLY DEFERRED・security definer） | questions の追加・status / format の変更時、question_choices / question_answer_keys の追加・変更・削除時（コミット時にまとめて検査） | published の問題だけを対象に、形式ごとの整合性を検査する。四択（single_choice）は選択肢4つ・正解1つ、二択（true_false）は選択肢2つ・正解1つ、複数選択（multiple_choice）は選択肢2つ以上・正解1つ以上、選択式以外は question_answer_keys があること。公開中の問題の選択肢を変えたときも検査する。管理者も読めない is_correct を読むため security definer |
| handle_new_user | トリガー（security definer） | 認証ユーザーの作成時 | profiles、user_settings、subscriptions（plan_key = free）を自動で作る。登録時は auth.uid() が NULL のため本人確認はできない。代わりに EXECUTE 権限を外し、トリガー以外からは呼べないようにする |
| validate_timezone | トリガー | user_settings の追加・timezone の変更時 | pg_timezone_names にない名前を拒否する（1日の区切りの計算が失敗しないように） |
| start_attempt(p_question_set_id, p_mode = 'normal', p_skip_cleared = true) | 関数（security definer） | 問題集の「挑戦する」「復習する」を押したとき | ⓪auth.uid() で本人を確定し、利用停止でないか確認 ①プランでその問題集を解けるか確認 ②ユーザーの設定（重複範囲・クリア条件）を読む ③出題リストを作る（normal：問題集の published の問題を出題順に並べ、p_skip_cleared が true ならクリア済みを省く。review：get_review_questions と同じ抽出。問題集は省略可）④出題リストが空なら no_questions のエラーにし、挑戦を作らない ⑤attempts を作成し、出題リストを attempt_questions に保存して、{ attempt_id, question_ids, planned_count, skipped_count } を返す。★mode は normal / review だけ対応し、exam / srs / ai は「未対応」のエラーにする |
| submit_answer(p_attempt_id, p_question_id, p_selected_choice_id, p_response, p_time_ms) | 関数（security definer） | 1問回答するたび | ①auth.uid() で本人の挑戦か、利用停止でないか、未完了・制限時間内か、問題がその挑戦の出題リスト（attempt_questions）に含まれるか、その問題集に含まれる published の問題か（問題集のない挑戦では、その問題を解けるか）、未回答かを確認 ②1日の上限を確認（plans.daily_question_limit が NULL でないプランだけ。日付は user_settings.timezone で区切る）③形式に応じて採点（★single_choice のみ対応。他の形式は「未対応」のエラー）④answers に追加 ⑤進捗3テーブルと daily_activity、attempts の集計を更新（知識項目は、その問題に付いているすべての項目に同じ正誤を記録する。問題集のない挑戦では user_set_question_progress は更新しない。answered_count が planned_count に達したら completed_at と score を設定する）⑥{ answer_id, attempt_completed, is_correct, correct_choice_id, explanation } を返す（feedback_mode が deferred のときは正誤・正解・解説を返さない）。★①〜⑤は1つのトランザクションで行う。同じ挑戦への同時回答は attempts の行ロックで直列化する |
| get_review_questions(p_question_set_id = NULL) | 関数（security definer） | 「復習する」を押したとき | auth.uid() で本人を確定し、不正解があり未クリアの問題IDを、設定に応じた進捗テーブルから直近に回答した順に返す。set のときは問題集の指定が必須。knowledge のときは、未クリアの知識項目が付いた問題と、知識項目のない問題（同じ問題として判定）を返す。現在のプランで解ける問題だけに絞る |
| get_attempt_result(p_attempt_id) | 関数（security definer） | 結果画面を表示するとき | auth.uid() で本人の挑戦か確認し、回答済みの問題について { question_id, question_position, question_body, explanation, selected_choice_id, selected_choice_body, correct_choice_id, correct_choice_body, is_correct, answered_at } を出題順に返す。★未回答の問題の正解は返さない。feedback_mode が deferred の挑戦は、完了するまで正誤・正解・解説を返さない。回答後にプランが変わって questions を読めなくなっても結果を表示できるよう、問題文と選択肢の文もここで返す |
| get_set_progress(p_question_set_id) | 関数（security definer） | 問題集の詳細画面を表示するとき | auth.uid() で本人を確定し、問題集の published の問題数（total_count）と、現在の設定でクリア済みの数（cleared_count）を返す。判定は start_attempt の「クリア済みを省く」と同じ。一覧が見える問題集（published かつ public、または自分の問題集）だけが対象 |
| category_proximity | 関数（security invoker） | 関連する問題集の表示など | 2つの分類の経路（path）が先頭から何階層一致するかを返す。例：language/english/vocabulary と language/english/grammar は 2階層一致＝近い / language/... と science/... は 0＝遠い |
| set_category_path | トリガー | categories の追加・更新時 | 親の path に自分の slug をつなげて path と depth を設定する。自分自身や子孫を親にすると拒否する。path が変わったときは子の行も更新し、子孫まで再帰的に path を作り直す（cascade_category_path） |
| set_updated_at | トリガー | 各テーブルの更新時 | updated_at を現在時刻にする |
| sync_question_count | トリガー | question_set_items の追加・削除・問題集の付け替え時 | question_sets.question_count を数え直す |
| Stripe Webhook | API（Next.js） | Stripe からの通知 | 署名を検証 → stripe_events で二重処理を防止 → subscriptions を更新 |

関数の共通方針

- すべての関数で search_path を '' に固定し、スキーマ名つきで参照する。
- クライアントから呼ぶ security definer 関数（start_attempt / submit_answer / get_review_questions / get_attempt_result / get_set_progress）は、最初に auth.uid() で本人を確定し、本人のデータだけを扱う。実行権限は authenticated だけに付ける。
- トリガー関数と内部の補助関数（is_cleared / user_plan / can_solve_set / can_access_question / is_question_cleared / review_question_ids / require_active_user）は、API に公開されない private スキーマに置き、EXECUTE 権限を外す。
- エラーは message に識別子（例：daily_limit_reached / unsupported_format / unsupported_mode / question_set_not_accessible / user_not_active）、detail に日本語の説明を入れる。

## 拡張予定の機能と対応方針

★ = 最初に作るテーブルへ先に入れた準備。

| 機能分野 | 機能 | 対応方針 | 今の設計での準備 | 追加するテーブル |
|---|---|---|---|---|
| 1. 教材閲覧 | マルチメディア教材（テキスト・画像・動画・音声・PDF） | ファイルは Supabase Storage に置き、media_assets で管理する | questions.content から画像・音声を参照できる | media_assets |
| 1. 教材閲覧 | インタラクティブ教材（スライド、ステップ解説） | コース > 章 > レッスン > ブロックの階層。ブロックの中身は種類ごとの JSON で持ち、種類を後から足せる | ―（追加のみ） | courses, course_sections, lessons, lesson_blocks |
| 1. 教材閲覧 | 用語のポップアップ解説 | 知識項目をそのまま用語集として使う | ★knowledge_items に reading / definition を追加済み | ― |
| 1. 教材閲覧 | 検索・フィルタリング | 分野は categories、難易度は difficulty、自由なタグは tags で絞り込む。キーワード検索は全文検索のインデックスを足す | categories / difficulty は対応済み | tags, taggings |
| 1. 教材閲覧 | お気に入り・ブックマーク | 対象の種類＋IDで何にでも付けられる共通テーブル | ―（追加のみ） | bookmarks |
| 1. 教材閲覧 | メモ・ハイライト | 同上。ハイライトの位置は JSON で持つ | ―（追加のみ） | notes |
| 2. 演習・テスト | 多様な出題形式（二択・穴埋め・記述・並び替え・マッチング） | 形式ごとに正解データの持ち方を変える。選択式は question_choices、それ以外は question_answer_keys | ★questions.format / content、question_answer_keys、answers.response / score を追加済み | ― |
| 2. 演習・テスト | 自動採点と即時フィードバック | submit_answer が形式に応じて採点する。記述式は AI または講師が採点 | ★answers.grading_status（採点待ち）を追加済み | answer_reviews（講師・AIの採点記録） |
| 2. 演習・テスト | 模擬試験・テストモード | 制限時間はサーバー側で判定し、正誤は終了後にまとめて返す | ★question_sets.kind / time_limit_sec / pass_score、attempts.feedback_mode / expires_at / score を追加済み | ― |
| 2. 演習・テスト | 復習モード（弱点克服） | 進捗テーブルの正解数・不正解数から、間違えた問題や正答率の低い問題を抽出する | 対応済み | ― |
| 3. 暗記・単語帳 | デジタルフラッシュカード | 単語カードを「問題の形式の1つ」として扱う。単語帳は「問題集の種類の1つ」。挑戦・回答・進捗・カレンダーの仕組みをそのまま使える | ★questions.format = flashcard、question_sets.kind = deck を追加済み | ― |
| 3. 暗記・単語帳 | 忘却曲線アルゴリズム（SM-2 など） | ユーザー × 問題ごとに、次回の出題日・間隔・定着度を持つ。アルゴリズム名も記録し、後から別の方式に替えられる | ★attempts.mode = srs を追加済み | user_review_states |
| 3. 暗記・単語帳 | 音声読み上げ | 端末の読み上げ機能を使うか、音声ファイルを media_assets に置く | ★knowledge_items.reading を追加済み | media_assets |
| 4. 学習管理 | 進捗トラッキング（完了率、進捗バー） | 問題集は進捗テーブルから計算。コース・レッスンは完了記録を持つ | 問題集は対応済み | course_enrollments, lesson_progress |
| 4. 学習管理 | 学習統計（学習時間、正答率、得意・苦手分野） | 日別の集計を daily_activity に持つ。分野別・型別は answers を questions の分類・構造の型で集計する | ★daily_activity.study_seconds、questions.category_id を追加済み | ―（集計用のビューを追加） |
| 4. 学習管理 | ストリーク（連続学習日数） | daily_activity から計算でき、表示用に user_stats にも控えを持つ | daily_activity で対応可能 | user_stats |
| 4. 学習管理 | 目標設定・リマインダー | 目標の種類（1日の時間、期限つき完了など）と値を持つ | user_settings.daily_goal は対応済み | goals, notification_preferences |
| 5. ゲーム要素 | ポイント・経験値（XP） | 獲得のたびに1行追加する台帳方式（後から検算・取り消しができる） | ★daily_activity.xp_earned を追加済み | xp_transactions, user_stats |
| 5. ゲーム要素 | レベル・ランク | レベルごとの必要XPを表で持つ | ―（追加のみ） | levels |
| 5. ゲーム要素 | バッジ・実績 | バッジの定義（条件は JSON）と、ユーザーの獲得記録 | ―（追加のみ） | badges, user_badges |
| 5. ゲーム要素 | ランキング | 期間ごとの順位を定期的に集計して保存する。他人に見せるのは公開用の表示名だけ | ★profiles は公開してよい情報だけを置く方針にした | leaderboard_entries |
| 6. コミュニティ | Q&A・質問掲示板 / コメント | 対象の種類＋IDで、問題やレッスンにスレッドを付ける。返信はスレッドの中の投稿 | ―（追加のみ） | discussion_threads, discussion_posts, reactions |
| 6. コミュニティ | 学習仲間（進捗の共有） | フォロー関係を持ち、相手の公開範囲の設定に従って見せる | ―（追加のみ） | follows |
| 6. コミュニティ | 安全対策（通報・ブロック） | 投稿機能を開放するときは必ず同時に入れる | ―（追加のみ） | content_reports, user_blocks |
| 7. 管理・運用 | ユーザー管理（権限、凍結、登録承認） | 役割と状態を profiles に持ち、権限関数で判定する | ★profiles.role（learner / instructor / admin）、status、権限関数を追加済み | admin_audit_logs |
| 7. 管理・運用 | コース・コンテンツ管理（CMS） | 下書き / 公開 / 非公開の状態と、作成者を各コンテンツに持つ | status / owner_id / created_by / version は対応済み | ― |
| 7. 管理・運用 | 講師と受講者（クラス） | グループと所属を持ち、講師は自分のグループの受講者の成績だけ見られる | ―（追加のみ） | groups, group_members |
| 7. 管理・運用 | 成績・分析、CSV エクスポート | テーブルの追加は不要。管理画面から answers / attempts を集計して出力する | 対応済み | ― |
| 7. 管理・運用 | お知らせ・通知配信 | お知らせ本体と、ユーザーごとの通知（既読管理）を分ける。プッシュ通知は端末のトークンを持つ | ―（追加のみ） | announcements, notifications, push_tokens |

## 将来の拡張で追加するテーブル（今は作らない）

対象を指す列は target_type と target_id の組にそろえる。

| 機能分野 | テーブル名 | 役割 | 主なカラム（案） | 優先度（案） |
|---|---|---|---|---|
| 1. 教材閲覧 | media_assets | 画像・音声・動画・PDF のファイル情報 | kind, storage_path, mime_type, duration_sec, alt_text, owner_id | 中 |
| 1. 教材閲覧 | courses | コース | title, description, category_id, owner_id, status, is_free | 中 |
| 1. 教材閲覧 | course_sections | コースの章 | course_id, title, position | 中 |
| 1. 教材閲覧 | lessons | レッスン | section_id, title, position, status, estimated_minutes | 中 |
| 1. 教材閲覧 | lesson_blocks | レッスンの中身（1ブロック = 文章 / 画像 / 動画 / スライド / 手順 / 問題集への参照） | lesson_id, position, kind, content(jsonb), media_asset_id, question_set_id | 中 |
| 1. 教材閲覧 | tags | 自由なタグ | slug, name | 低 |
| 1. 教材閲覧 | taggings | タグと対象の対応 | tag_id, target_type, target_id | 低 |
| 1. 教材閲覧 | bookmarks | お気に入り | user_id, target_type, target_id, created_at | 高 |
| 1. 教材閲覧 | notes | メモ・ハイライト | user_id, target_type, target_id, body, anchor(jsonb), color | 中 |
| 2. 演習・テスト | answer_reviews | 記述式の採点記録（AI・講師） | answer_id, reviewer_id, grader(ai / manual), score, feedback | 低 |
| 3. 暗記・単語帳 | user_review_states | 忘却曲線による復習の状態 | user_id, question_id, algorithm, ease_factor, interval_days, repetitions, due_at, last_reviewed_at | 高 |
| 4. 学習管理 | course_enrollments | コースの受講登録 | user_id, course_id, enrolled_at, completed_at | 中 |
| 4. 学習管理 | lesson_progress | レッスンの完了記録 | user_id, lesson_id, status, completed_at, study_seconds | 中 |
| 4. 学習管理 | user_stats | ユーザーごとの累計の控え（表示を速くする） | user_id, total_answered, total_correct, total_study_seconds, current_streak_days, longest_streak_days, last_active_date, total_xp, level | 高 |
| 4. 学習管理 | goals | 目標 | user_id, kind, target_value, period, target_type, target_id, due_date, achieved_at | 中 |
| 5. ゲーム要素 | xp_transactions | 経験値の獲得履歴（台帳） | user_id, amount, reason, source_type, source_id, created_at | 中 |
| 5. ゲーム要素 | levels | レベルごとの必要経験値 | level, required_xp, title | 中 |
| 5. ゲーム要素 | badges | バッジの定義 | key, name, description, icon, criteria(jsonb) | 中 |
| 5. ゲーム要素 | user_badges | 獲得したバッジ | user_id, badge_key, awarded_at | 中 |
| 5. ゲーム要素 | leaderboard_entries | 期間ごとのランキング | period_type, period_start, metric, user_id, value, rank | 低 |
| 6. コミュニティ | discussion_threads | 質問・ディスカッションのスレッド | target_type, target_id, author_id, title, kind(question / discussion), status, accepted_post_id | 低 |
| 6. コミュニティ | discussion_posts | スレッド内の投稿・返信 | thread_id, author_id, parent_post_id, body, deleted_at | 低 |
| 6. コミュニティ | reactions | いいね等 | user_id, target_type, target_id, kind | 低 |
| 6. コミュニティ | follows | 学習仲間（フォロー） | follower_id, followee_id, status, created_at | 低 |
| 6. コミュニティ | content_reports | 通報 | reporter_id, target_type, target_id, reason, status, handled_by | 低（投稿機能と同時に必須） |
| 6. コミュニティ | user_blocks | ブロック | blocker_id, blocked_id | 低（投稿機能と同時に必須） |
| 7. 管理・運用 | groups | 講師のクラス・グループ | name, owner_id, join_code | 低 |
| 7. 管理・運用 | group_members | グループの所属 | group_id, user_id, role(instructor / learner) | 低 |
| 7. 管理・運用 | announcements | お知らせ | title, body, audience(jsonb), publish_at, created_by | 中 |
| 7. 管理・運用 | notifications | ユーザーごとの通知と既読 | user_id, kind, title, body, link, read_at | 中 |
| 7. 管理・運用 | notification_preferences | 通知の受け取り設定・リマインダー時刻 | user_id, channel(email / push), kind, enabled, remind_at | 中 |
| 7. 管理・運用 | push_tokens | プッシュ通知用の端末トークン（モバイルアプリ） | user_id, token, platform, last_seen_at | 中 |
| 7. 管理・運用 | admin_audit_logs | 管理操作の記録（凍結、権限変更など） | actor_id, action, target_type, target_id, detail(jsonb), created_at | 中 |
| 共通 | learning_events | 学習行動の記録（教材の閲覧、動画の視聴時間など、回答以外の行動） | user_id, event_type, target_type, target_id, duration_sec, occurred_at | 中 |

## 初期データ

| テーブル | キー / コード | 名称 | 備考 |
|---|---|---|---|
| structure_types | abstract_to_concrete | 抽象→具体 |  |
| structure_types | concrete_to_abstract | 具体→抽象 |  |
| structure_types | induction | 帰納法 |  |
| structure_types | deduction | 演繹法 |  |
| structure_types | paradox | 逆説 |  |
| structure_types | contrast | 対比 |  |
| structure_types | cause_to_effect | 原因→結果 |  |
| structure_types | effect_to_cause | 結果→原因 |  |
| categories（第1階層・案） | language | 言語 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | mathematics | 数学 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | natural-science | 自然科学 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | technology | 技術・IT | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | society | 社会・経済 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | history-geography | 歴史・地理 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | humanities | 人文・思想 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | arts | 芸術・文化 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | business | ビジネス・資格 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第1階層・案） | life | 生活・教養 | depth = 1。★名称と区分は仮の案。自由に変更可 |
| categories（第2階層以下・例） | language/english | 英語 | depth = 2 |
| categories（第2階層以下・例） | language/english/vocabulary | 語彙 | depth = 3。TOEIC・英検の単語問題集はここに紐づける |
| plans | free | 無料 | daily_question_limit = 300 / can_access_all_sets = false / can_use_ai = false |
| plans | pro | 有料 | daily_question_limit = NULL / can_access_all_sets = true / can_use_ai = true / stripe_price_id は Stripe で作成後に設定 |
| profiles / user_settings / subscriptions | （既存ユーザー） | ― | handle_new_user を入れる前に登録済みの auth.users にも、同じ3行を作る |

## 確認事項・未決事項

| 区分 | 項目 | 内容 | 補足・対応案 |
|---|---|---|---|
| 要確認 | 独自分類の第1階層 | 「初期データ」シートの10分類は仮の案です。作りたい問題集の分野に合わせて、名称と区分を決めてください。既存の分類法（デューイ十進分類法、日本十進分類法など）の区分や名称をそのまま写すと権利上の問題になり得るので、独自に決めます。 | 後から分類を追加・移動できる設計なので、最初は必要な分野だけで始めてよい |
| 未定 | 分類の階層の深さ | 「近い / 遠い」をどの粒度で判定したいか。今の設計は最大6階層まで | 例：2階層一致＝近い、1階層一致＝やや遠い、0＝遠い。しきい値はアプリ側で調整できる |
| 未定 | 重複範囲・クリア条件の変更を有料限定にするか | 今の設計では無料でも変更可 | 有料限定にする場合は plans に列を1つ足す |
| 決定済み | 無料プランの1日の上限 | 300問 | plans.daily_question_limit に設定。後から変更可 |
| 決定済み | 1つの問題が問う知識の数 | 複数可（question_knowledge_items で対応） |  |
| 決定済み | 複数の知識を問う問題に不正解だったとき | どの知識でつまずいたかは回答からは分からないため、その問題に付いているすべての知識項目を「不正解」として記録する（連続正解数が 0 に戻る） | 厳しめの判定。緩めたい場合は「主となる知識項目」を1つ指定できる列を足し、不正解はそれだけに記録する方法がある |
| 決定済み | 有料問題集の中身の公開範囲 | 一覧（question_sets / question_set_items）は全員に見せ、問題・選択肢・知識項目の対応はプランで解ける問題集のものだけを読ませる | questions の RLS で can_access_all_sets() を判定 |
| 決定済み | 正解データの管理 | is_correct と question_answer_keys は管理者もクライアントから読めない | 問題の管理画面は Secret key を使うサーバー側で作る |
| 決定済み | 挑戦の完了 | 回答数が出題数（planned_count）に達したら submit_answer が完了にし、得点を計算する | 途中でやめた挑戦は completed_at が NULL のまま残る |
| 未対応 | 模擬試験（feedback_mode = deferred） | answers.is_correct・進捗の last_is_correct・attempts.correct_count は本人が読めるため、試験中に正誤が分かってしまう。終了後に結果をまとめて返す関数もない | それまで start_attempt は exam / srs / ai を「未対応」のエラーにする。対応時は、未完了の deferred の挑戦の answers を RLS で隠す、進捗の更新を完了時にまとめる、結果を返す関数を足す、などを検討する |
| 未対応 | 選択式以外の出題形式の採点 | submit_answer が採点するのは single_choice だけ | 他の形式は「未対応」のエラーを返す |
| 決定済み | 挑戦の途中再開 | 途中でやめた挑戦も、続きから再開できるようにする | start_attempt が出題リストを attempt_questions に保存し、出題リストのうち未回答で出題順が最初の問題を次に出す。出題する問題はサーバー側で決め、クライアントからは指定させない |
| 決定済み | 出題する問題がないとき | すべてクリア済みなどで出題リストが空なら、start_attempt は no_questions のエラーにして挑戦を作らない | 完了しない空の挑戦が残らないようにする |
| 決定済み | 選択肢のシャッフル | 入れ替えず、position の順に表示する | 入れ替える場合も DB の変更は不要（表示時に並べ替える） |
| 未定 | 拡張機能の優先順位 | 「将来テーブル」シートの優先度は仮の案です。どの機能から作るかを決めてください | ブックマーク、忘却曲線による復習、累計の控え（user_stats）は、今の問題集の機能と相性がよく早めに足しやすい |
| 未定 | 問題を修正したときの扱い | 誤字の修正は版を上げず、正解や意味が変わる修正は版を上げる運用を想定 | 版を上げたとき、過去の進捗（クリア済みなど）を引き継ぐかリセットするかは、実装時に決める |
| 要確認 | コミュニティ機能と未成年の利用 | 投稿・ランキング・フォローなど、利用者同士が見える機能を入れるときは、通報・ブロック・公開範囲の設定を同時に入れる | 利用規約とプライバシーポリシーにも反映が必要 |
| 将来 | ユーザーによる問題集の作成 | テーブルは対応済み。RLS のポリシーを追加して開放する | 通報・非公開化の仕組み、作成数の上限なども合わせて検討 |
| 将来 | AI出題した問題の共有 | 今の設計は「作成した本人だけが見える」 | 品質を確認したものを運営が公開する流れにすると安全 |
