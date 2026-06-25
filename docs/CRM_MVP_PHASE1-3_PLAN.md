# Acoru Hub CRM MVP Phase 1-3 作業計画

## 0. 目的

Acoru社内向けに、HubSpot風のCRM機能を備えた社内システム **Acoru Hub** をMVPとして構築する。

MVPでは以下を検証する。

1. 顧客・担当者・案件・活動履歴・タスクを一元管理できること
2. 案件パイプラインと売上見込みを管理できること
3. 顧客別にファイル・メモ・AI要約を扱えること
4. GitHub → Vercel → Next.js App Router → Neon Postgres 構成で安全に運用できること

---

## 1. 技術前提

### Stack

* Next.js App Router
* TypeScript
* pnpm
* Neon Postgres
* Vercel
* Server Components / Server Actions 優先
* DB処理はNode runtime
* 環境変数はserver-only
* SQLは必ずパラメータ化
* 入力値は必ずバリデーション
* 秘密情報をクライアント・ログ・レスポンスに出さない

### 想定デプロイ

```txt
GitHub
  ↓
Vercel
  ↓
Next.js App Router
  ↓
Neon Postgres
```

---

## 2. MVP範囲

MVPは Phase 1〜3 までを対象とする。

### Phase 1: CRM中核

* 認証
* 顧客管理
* 担当者管理
* 案件管理
* 活動履歴
* タスク管理
* 簡易ダッシュボード

### Phase 2: 営業管理強化

* フェーズ別パイプライン
* 売上見込み
* 受注確度
* 期限切れタスク表示
* CSVインポート
* CSVエクスポート

### Phase 3: ファイル・AI

* 顧客別ファイル管理
* 案件別ファイル管理
* 活動履歴AI要約
* 顧客状況AI要約
* 次アクション提案

---

## 3. MVPで作らないもの

以下はMVP対象外とする。

* HubSpot完全互換
* 請求管理
* 会計連携
* メール自動送信
* Gmail双方向同期
* Google Calendar双方向同期
* Slack通知
* マルチテナントSaaS化
* 顧客向け外部公開画面
* 複雑なワークフローエンジン
* 高度な権限マトリクス
* 本格的なMA機能
* 広告・フォーム・LP管理
* 大規模なBIダッシュボード

---

## 4. 成功条件

MVP完了時点で、以下ができること。

### 業務面

* 顧客を登録・編集・検索できる
* 顧客に担当者を紐づけられる
* 顧客に案件を紐づけられる
* 案件のフェーズ・金額・確度・予定受注日を管理できる
* 顧客・案件に活動履歴を残せる
* 顧客・案件にタスクを紐づけられる
* 期限切れタスクが分かる
* 顧客詳細画面で、担当者・案件・活動履歴・タスク・ファイルをまとめて確認できる
* 案件一覧でフェーズ別・金額別に営業状況を確認できる
* 顧客別に関連ファイルを登録できる
* 活動履歴をAIで要約できる
* 顧客状況と次アクション案をAIで生成できる

### 技術面

* `pnpm install` が通る
* `pnpm dev` が起動する
* `pnpm typecheck` が通る
* `pnpm lint` が通る
* `pnpm build` が通る
* Vercelにデプロイできる
* Neon Postgresに接続できる
* DB接続情報がクライアントに漏れない
* APIキー・DB URL・AIキーがログやレスポンスに出ない

---

## 5. 推奨ディレクトリ構成

既存リポジトリがある場合は、既存構成を優先すること。
新規構築または構成整理時は以下を基準にする。

```txt
app/
  page.tsx
  dashboard/
    page.tsx
  companies/
    page.tsx
    new/
      page.tsx
    [companyId]/
      page.tsx
      edit/
        page.tsx
  contacts/
    page.tsx
  deals/
    page.tsx
    [dealId]/
      page.tsx
  activities/
    page.tsx
  tasks/
    page.tsx
  files/
    page.tsx
  reports/
    page.tsx
  settings/
    page.tsx
  api/
    ai/
      summarize-company/
        route.ts
      suggest-next-actions/
        route.ts

components/
  layout/
  companies/
  contacts/
  deals/
  activities/
  tasks/
  files/
  reports/
  ui/

lib/
  db/
    index.ts
    queries/
      companies.ts
      contacts.ts
      deals.ts
      activities.ts
      tasks.ts
      files.ts
      dashboard.ts
  validation/
    companies.ts
    contacts.ts
    deals.ts
    activities.ts
    tasks.ts
    files.ts
  ai/
    summarize-company.ts
    suggest-next-actions.ts
  auth/
  utils/

scripts/
  db/
    migrate.ts
    seed.ts

docs/
  CRM_MVP_PHASE1-3_PLAN.md
```

---

## 6. 画面一覧

### `/dashboard`

目的: 今日見るべき情報を集約する。

表示項目:

* 今日のタスク
* 期限切れタスク
* 進行中案件
* 提案中案件
* 今月の受注見込み
* 最近の活動履歴
* フェーズ別案件数
* フェーズ別見込み金額

---

### `/companies`

目的: 顧客一覧を管理する。

機能:

* 顧客一覧
* 顧客検索
* ステータス絞り込み
* 業種絞り込み
* 新規登録
* CSVエクスポート
* CSVインポート

一覧表示項目:

* 会社名
* 業種
* ステータス
* 担当者数
* 進行中案件数
* 最新活動日
* 次回アクション日

---

### `/companies/new`

目的: 顧客を新規登録する。

入力項目:

* 会社名
* 法人番号
* 業種
* WebサイトURL
* 郵便番号
* 住所
* 電話番号
* 流入元
* ステータス
* メモ

---

### `/companies/[companyId]`

目的: 顧客に関する情報を1画面で確認する。

表示セクション:

1. 基本情報
2. 担当者一覧
3. 進行中案件
4. 活動履歴
5. タスク
6. ファイル
7. AI要約
8. 次アクション提案

主要アクション:

* 顧客編集
* 担当者追加
* 案件追加
* 活動履歴追加
* タスク追加
* ファイル追加
* AI要約生成
* 次アクション生成

---

### `/contacts`

目的: 担当者を一覧管理する。

表示項目:

* 氏名
* 会社名
* 部署
* 役職
* メール
* 電話番号
* 意思決定者フラグ
* 最新活動日

---

### `/deals`

目的: 案件・商談を一覧管理する。

機能:

* 案件一覧
* フェーズ絞り込み
* ステータス絞り込み
* 予定受注日絞り込み
* 金額集計
* CSVエクスポート

表示項目:

* 案件名
* 会社名
* 金額
* フェーズ
* 確度
* 見込み金額
* 予定受注日
* 担当者
* 次回アクション日

---

### `/deals/[dealId]`

目的: 案件ごとの詳細を確認する。

表示セクション:

* 案件基本情報
* 関連会社
* 関連担当者
* 活動履歴
* タスク
* ファイル
* AI要約

---

### `/activities`

目的: 全活動履歴を時系列で確認する。

表示項目:

* 活動日
* 活動種別
* 会社名
* 担当者
* 案件名
* 概要
* 次回アクション
* 作成者

---

### `/tasks`

目的: フォローアップ漏れを防ぐ。

機能:

* タスク一覧
* 未完了のみ表示
* 期限切れ表示
* 今日のタスク表示
* 完了処理

表示項目:

* タイトル
* 会社名
* 案件名
* 期限
* 優先度
* ステータス
* 担当者

---

### `/files`

目的: 顧客・案件に紐づくファイルを一覧管理する。

表示項目:

* ファイル名
* 紐づく会社
* 紐づく案件
* 種別
* アップロード者
* 作成日

MVPでは、ファイルそのものの保存方式は以下のいずれかでよい。

優先順:

1. Vercel Blob
2. S3互換ストレージ
3. Google Drive URL登録
4. 一時的に外部URL登録のみ

MVP検証では、まず `file_url` 登録方式でも可。

---

### `/reports`

目的: 営業状況を簡易集計する。

表示項目:

* フェーズ別案件数
* フェーズ別見込み金額
* 今月予定受注金額
* 来月予定受注金額
* 確度加重見込み金額
* 期限切れタスク数
* 活動履歴件数

---

## 7. DBテーブル設計

DBはPostgresを前提とする。

### users

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

role:

```txt
admin
member
viewer
```

---

### companies

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  corporate_number text,
  industry text,
  website_url text,
  postal_code text,
  address text,
  phone text,
  status text not null default 'active',
  source text,
  memo text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

status:

```txt
lead
active
proposal
customer
inactive
lost
```

---

### contacts

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  department text,
  position text,
  email text,
  phone text,
  is_decision_maker boolean not null default false,
  memo text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

---

### deal_stages

```sql
create table deal_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null,
  default_probability integer not null default 0,
  is_closed boolean not null default false,
  is_won boolean not null default false,
  created_at timestamptz not null default now()
);
```

初期データ:

```txt
リード: 10
初回接触: 20
ヒアリング済: 30
提案中: 40
見積提出: 50
稟議中: 70
受注: 100
失注: 0
保留: 0
```

---

### deals

```sql
create table deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  amount numeric(12, 0) not null default 0,
  stage_id uuid references deal_stages(id),
  probability integer not null default 0,
  expected_close_date date,
  owner_user_id uuid references users(id),
  status text not null default 'open',
  memo text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

status:

```txt
open
won
lost
on_hold
```

見込み金額は保存せず、以下で算出する。

```txt
amount * probability / 100
```

---

### activities

```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  contact_id uuid references contacts(id),
  deal_id uuid references deals(id),
  type text not null,
  activity_date timestamptz not null,
  summary text not null,
  body text,
  next_action text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

type:

```txt
call
email
meeting
visit
proposal
estimate
contract
support
note
other
```

---

### tasks

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  deal_id uuid references deals(id),
  title text not null,
  description text,
  due_date date,
  priority text not null default 'medium',
  status text not null default 'open',
  assigned_to uuid references users(id),
  created_by uuid references users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

priority:

```txt
low
medium
high
urgent
```

status:

```txt
open
done
cancelled
```

---

### files

```sql
create table files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  deal_id uuid references deals(id),
  filename text not null,
  file_url text not null,
  mime_type text,
  file_type text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

file_type:

```txt
proposal
estimate
contract
minutes
document
other
```

---

### ai_summaries

```sql
create table ai_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  deal_id uuid references deals(id),
  summary_type text not null,
  source_hash text,
  content text not null,
  generated_by uuid references users(id),
  created_at timestamptz not null default now()
);
```

summary_type:

```txt
company_summary
deal_summary
next_actions
activity_summary
```

---

### audit_logs

```sql
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
```

---

## 8. バリデーション方針

Zodなどを使用し、フォーム入力・Server Action・API Routeで同一スキーマを使う。

### company validation

* name: 必須、1〜200文字
* corporate_number: 任意、数字13桁を許容
* website_url: 任意、URL形式
* phone: 任意
* status: enum
* memo: 任意、最大5000文字

### contact validation

* company_id: 必須UUID
* name: 必須、1〜100文字
* email: 任意、email形式
* phone: 任意
* is_decision_maker: boolean

### deal validation

* company_id: 必須UUID
* title: 必須、1〜200文字
* amount: 0以上
* probability: 0〜100
* expected_close_date: 任意
* status: enum

### activity validation

* company_id: 必須UUID
* type: enum
* activity_date: 必須
* summary: 必須、1〜300文字
* body: 任意、最大10000文字
* next_action: 任意、最大1000文字

### task validation

* title: 必須、1〜200文字
* due_date: 任意
* priority: enum
* status: enum

### file validation

* filename: 必須
* file_url: 必須、URL形式
* file_type: enum

---

## 9. セキュリティ要件

### 必須

* 未ログインでは全CRM画面にアクセス不可
* DB接続はサーバー側のみ
* DB URLは `DATABASE_URL` としてserver-onlyで扱う
* OpenAI等のAI APIキーはserver-onlyで扱う
* SQLは必ずパラメータ化する
* 入力値を必ずバリデーションする
* 削除は原則 `deleted_at` による論理削除
* 操作ログを `audit_logs` に保存する
* エラー内容に秘密情報を含めない
* `NEXT_PUBLIC_` に秘密情報を置かない
* APIレスポンスに内部エラー詳細を返さない

### 権限

MVPでは3ロールのみ。

| role   | 権限                         |
| ------ | -------------------------- |
| admin  | 全操作、削除、設定変更                |
| member | 顧客・担当者・案件・活動・タスク・ファイルの作成編集 |
| viewer | 閲覧のみ                       |

---

## 10. AI機能仕様

### 方針

AIはCRMの主機能ではなく、蓄積データを読む補助機能とする。

MVPでは以下2つを実装する。

1. 顧客状況要約
2. 次アクション提案

---

### 顧客状況要約

対象画面:

```txt
/companies/[companyId]
```

入力データ:

* 会社基本情報
* 担当者一覧
* 進行中案件
* 直近活動履歴
* 未完了タスク
* 登録ファイル名

出力:

```txt
現在の状況
主な論点
進行中の案件
未完了タスク
注意点
次回確認すべき事項
```

保存先:

```txt
ai_summaries.summary_type = company_summary
```

---

### 次アクション提案

対象画面:

```txt
/companies/[companyId]
/deals/[dealId]
```

入力データ:

* 会社情報
* 案件情報
* 活動履歴
* タスク
* 予定受注日
* フェーズ
* 確度

出力:

```txt
推奨アクション
理由
優先度
期限目安
作成すべきタスク案
```

保存先:

```txt
ai_summaries.summary_type = next_actions
```

---

### AI利用時の禁止事項

* APIキーをクライアントに渡さない
* 顧客情報をログに出さない
* AIレスポンスを無検証でDB更新に使わない
* AI提案で自動送信・自動削除・自動契約処理をしない
* AI出力は必ず「提案」として表示する

---

## 11. CSV仕様

### companies import

CSVカラム:

```txt
name
corporate_number
industry
website_url
postal_code
address
phone
status
source
memo
```

必須:

```txt
name
```

### companies export

出力カラム:

```txt
id
name
corporate_number
industry
website_url
postal_code
address
phone
status
source
memo
created_at
updated_at
```

### deals export

出力カラム:

```txt
id
company_name
title
amount
stage
probability
weighted_amount
expected_close_date
owner_name
status
created_at
updated_at
```

---

## 12. 実装順序

エージェントは以下の順番で実装すること。

### Step 1: 既存構成確認

* package manager確認
* Next.js App Router構成確認
* TypeScript設定確認
* lint/typecheck/buildコマンド確認
* DB接続方式確認
* 認証有無確認
* 既存UIコンポーネント確認

既存実装がある場合は、既存パターンを優先する。

---

### Step 2: 環境変数整理

必要な環境変数:

```txt
DATABASE_URL
OPENAI_API_KEY
APP_URL
```

認証を入れる場合:

```txt
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
```

ルール:

* `.env.example` を更新する
* `.env.local` はコミットしない
* 秘密情報をコードに直書きしない

---

### Step 3: DBスキーマ追加

追加対象:

* users
* companies
* contacts
* deal_stages
* deals
* activities
* tasks
* files
* ai_summaries
* audit_logs

必要ならmigrationファイルを作成する。

---

### Step 4: DBアクセス層作成

作成対象:

```txt
lib/db/queries/companies.ts
lib/db/queries/contacts.ts
lib/db/queries/deals.ts
lib/db/queries/activities.ts
lib/db/queries/tasks.ts
lib/db/queries/files.ts
lib/db/queries/dashboard.ts
```

原則:

* DB処理はserver-only
* クライアントコンポーネントから直接DBを呼ばない
* SQLはパラメータ化
* `deleted_at is null` を標準条件にする

---

### Step 5: バリデーション作成

作成対象:

```txt
lib/validation/companies.ts
lib/validation/contacts.ts
lib/validation/deals.ts
lib/validation/activities.ts
lib/validation/tasks.ts
lib/validation/files.ts
```

---

### Step 6: 画面実装 Phase 1

作成対象:

```txt
/dashboard
/companies
/companies/new
/companies/[companyId]
/contacts
/deals
/deals/[dealId]
/activities
/tasks
```

優先順位:

1. companies
2. contacts
3. deals
4. activities
5. tasks
6. dashboard

---

### Step 7: 画面実装 Phase 2

追加対象:

* フェーズ別案件集計
* 確度加重見込み金額
* 期限切れタスク
* CSVインポート
* CSVエクスポート

作成対象:

```txt
/reports
```

---

### Step 8: 画面実装 Phase 3

追加対象:

* files
* ai_summaries
* AI要約API
* 次アクション提案API

作成対象:

```txt
/files
app/api/ai/summarize-company/route.ts
app/api/ai/suggest-next-actions/route.ts
lib/ai/summarize-company.ts
lib/ai/suggest-next-actions.ts
```

---

### Step 9: 操作ログ

対象操作:

* 顧客作成
* 顧客編集
* 顧客削除
* 担当者作成
* 担当者編集
* 案件作成
* 案件編集
* 活動履歴作成
* タスク作成
* タスク完了
* ファイル登録
* AI要約生成

---

### Step 10: 確認

以下を実行して失敗を修正する。

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
```

---

## 13. UI方針

### 基本

* 業務画面なので装飾より視認性を優先
* 一覧・詳細・作成・編集を明確に分ける
* 一覧では検索・絞り込み・主要ステータスを優先
* 詳細画面では関連情報をタブまたはセクションでまとめる
* モバイル完全対応はMVP必須ではないが、崩れないこと

### 表示優先度

顧客詳細では以下の順番を優先する。

1. 顧客基本情報
2. 次回アクション
3. 未完了タスク
4. 進行中案件
5. 活動履歴
6. 担当者
7. ファイル
8. AI要約

---

## 14. 初期データ

開発確認用にseedを作る。

### companies

```txt
JR北海道
JA石狩
辰和運輸
CAR SHUZO
イーグルホーム
札幌美容外科
北海道高校野球連盟
ROBINSON
```

### deal_stages

```txt
リード
初回接触
ヒアリング済
提案中
見積提出
稟議中
受注
失注
保留
```

### activity types

```txt
電話
メール
訪問
Web会議
紹介
提案
見積
契約
サポート
その他
```

---

## 15. 受け入れテスト

### 顧客管理

* 顧客を新規登録できる
* 顧客一覧に表示される
* 顧客詳細を開ける
* 顧客情報を編集できる
* 削除した顧客は通常一覧に表示されない

### 担当者管理

* 顧客詳細から担当者を追加できる
* 担当者一覧に表示される
* 担当者が会社に紐づいている

### 案件管理

* 顧客詳細から案件を追加できる
* 案件一覧に表示される
* 案件のフェーズを変更できる
* 金額と確度から見込み金額が表示される

### 活動履歴

* 顧客詳細から活動履歴を追加できる
* 活動履歴一覧に表示される
* 案件に紐づく活動履歴を表示できる

### タスク

* 顧客詳細からタスクを追加できる
* 期限切れタスクが分かる
* タスクを完了できる

### レポート

* フェーズ別案件数が表示される
* フェーズ別金額が表示される
* 確度加重見込み金額が表示される

### ファイル

* 顧客にファイルURLを登録できる
* 案件にファイルURLを登録できる
* 顧客詳細に関連ファイルが表示される

### AI

* 顧客詳細でAI要約を生成できる
* 次アクション提案を生成できる
* AI出力がDBに保存される
* AI APIキーがクライアントに漏れない

---

## 16. エージェント向け実装ルール

### 最優先

* production safety
* end-to-endで動くこと
* 最小差分
* 既存挙動の維持
* 秘密情報の保護
* DB処理のserver-only化
* パラメータ化SQL
* 入力バリデーション

### 禁止

* 大規模リファクタ
* 不要な依存追加
* UI全面刷新
* unrelated edits
* `NEXT_PUBLIC_` で秘密情報を扱う
* クライアントからDB接続
* APIキーのログ出力
* AI出力による自動確定処理
* 型エラーやlintエラーを残す

### 判断に迷った場合

以下の優先順位で判断する。

```txt
1. セキュリティ
2. 既存パターン
3. 最小実装
4. 動作確認しやすさ
5. 将来拡張性
```

---

## 17. 完了時の提出物

エージェントは作業完了時に以下を整理すること。

```txt
1. 実装した機能一覧
2. 追加・変更したファイル一覧
3. 追加したテーブル一覧
4. 追加した環境変数一覧
5. 実行した確認コマンド
6. 残課題
7. MVP外に回した項目
```

---

## 18. 最終確認コマンド

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
```

DB migrationがある場合:

```bash
pnpm db:migrate
pnpm db:seed
```

コマンド名が既存package.jsonと異なる場合は、既存のscriptsを優先すること。

---

## 19. MVP完了定義

以下を満たしたら Phase 1〜3 MVP 完了とする。

```txt
顧客・担当者・案件・活動履歴・タスク・ファイルを登録できる
顧客詳細に関連情報が集約される
案件のフェーズ・金額・確度を管理できる
営業見込みをレポートで確認できる
期限切れタスクを確認できる
顧客状況をAI要約できる
次アクションをAI提案できる
Vercelにデプロイできる
Neon Postgresに安全に接続できる
pnpm typecheck / lint / build が通る
秘密情報がクライアント・ログ・レスポンスに漏れていない
```

---

## 20. Cloud作業用プロンプト

以下をCloudエージェントに渡す。

```txt
GOAL:
Build the Acoru Hub internal CRM MVP covering Phase 1-3: CRM core, sales pipeline/reporting, file management, and AI-assisted summaries/next-action suggestions.

SUCCESS:
The app must allow internal users to manage companies, contacts, deals, activities, tasks, files, simple reports, AI company summaries, and AI next-action suggestions. It must deploy safely on Vercel using Next.js App Router, TypeScript, pnpm, and Neon Postgres. pnpm typecheck, lint, and build must pass.

CONTEXT:
This is an internal HubSpot-like CRM for Acoru. Do not attempt to clone all HubSpot features. The MVP should focus on practical internal usage: customer records, deal tracking, activity history, task follow-up, file references, pipeline visibility, and AI-assisted review.

STACK:
- Next.js App Router
- TypeScript
- pnpm
- Neon Postgres
- Vercel
- server-only environment variables
- Node runtime for DB operations

CONSTRAINTS:
- Inspect the repository first and follow existing patterns.
- Make the smallest safe change.
- Preserve existing behavior unless a change is required for this MVP.
- Do not do unrelated refactors.
- Keep secrets server-side.
- Do not expose DATABASE_URL or AI API keys to the client.
- Do not put secrets in NEXT_PUBLIC_ variables.
- Use parameterized SQL.
- Validate inputs.
- Prefer logical deletes via deleted_at.
- Add audit logging for important mutations where practical.
- AI output must be advisory only.
- Do not use AI output to automatically send emails, delete records, or finalize deals.
- If implementation scope becomes large, prioritize companies, contacts, deals, activities, tasks, dashboard, reports, files, then AI.

IMPLEMENTATION ORDER:
1. Inspect existing repo structure and scripts.
2. Add or confirm environment variable structure.
3. Add DB schema/migrations for users, companies, contacts, deal_stages, deals, activities, tasks, files, ai_summaries, and audit_logs.
4. Add DB query modules under lib/db/queries.
5. Add validation modules.
6. Implement Phase 1 screens.
7. Implement Phase 2 reporting and CSV import/export.
8. Implement Phase 3 files and AI.
9. Add seed data.
10. Run pnpm typecheck, lint, and build.

OUTPUT:
Provide a concise implementation summary, changed files, DB changes, env vars, verification commands, and remaining issues.
```
