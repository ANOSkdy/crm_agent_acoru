# DESIGN.md

Acoru CRM のデザイン基準です。画面追加・改修時はこのファイルと `app/globals.css` のデザイントークンを優先して参照します。

## Core principles

- **業務アプリらしい落ち着き**: 高彩度の装飾より、読みやすさ・認識しやすさを優先する。
- **一貫したトークン利用**: 色、角丸、影、余白、アニメーションは CSS カスタムプロパティを使用する。
- **フォームは明快に**: ラベルを常に表示し、入力・エラー・送信ボタンの状態が分かるようにする。
- **アクセシビリティ優先**: `:focus-visible`、ランドマーク、`aria-*`、十分なコントラストを維持する。

## Tokens

主要トークンは `app/globals.css` の `:root` に定義します。

- Background: `--color-bg`
- Surface: `--color-surface`
- Text: `--color-text`, `--color-text-sub`, `--color-text-faint`
- Primary: `--color-primary`, `--color-primary-hover`, `--color-primary-soft`
- Brand: `--color-primary` は Acoru のブランド紫 `#534491`（`templates/acoru-v1/DESIGN.md` と同じ）
- Highlight: `--color-highlight`, `--color-highlight-soft`（アクティブ・フォーカスの線。ブランド紫と同色）
- Borders: `--color-border`, `--color-border-strong`
- Radius: `--radius-btn`, `--radius-input`, `--radius-menu`, `--radius-modal`
- Motion: `--dur-menu`, `--ease-out`

## Login page

`/login/` は CRM 本体と同じブランド・トークンを使い、以下を満たします。

- 中央配置のカードレイアウトにする。
- ブランドロゴはヘッダーと同じ単文字ロゴ表現を使う。
- 入力欄は `.input`、送信ボタンは `.btn.btn--primary` を使う。
- エラーは danger トークンを使い、`role="alert"` を付与する。

## Layout

- サイドバーは使わない。上部の 46px トップバー（ブランド・横並びナビ・ユーザー・ログアウト）以外はすべてコンテンツに使う。
- 900px 未満ではナビを「ナビゲーションを展開」ボタンのメニューに畳む。
- 一覧画面は `.workspace` + `CrmDataGrid`（`title` / `actions` を渡す）で、ツールバー・グリッド・ステータスバーを画面高いっぱいに表示する。
- 絞り込みはグリッド内で行う：全列検索、列フィルター行（選択肢列はセレクト、数値列は `>1000` などの比較）、ステータスバーに件数と `aggregate: 'sum'` 列の合計。
- レコードの編集はグリッド内で行う（ダブルクリック／Enterで編集、Escで取消）。別ページの編集画面・新規作成画面は作らず、新規行はグリッド先頭の入力行から追加する。詳細ページの項目もクリックで編集する。
- 課題管理・請求管理・一斉メールも同じ構成（ページバー → シートタブ → 本文）。シートタブは `.sheet-tab`、表は `.data-table` かグリッドと同じ見た目にする。

## Visual tone

- 白基調。背景は `--color-bg`（#fafafa）、面とトップバーは白。色はブランド紫（`--color-primary` = `#534491`）だけをアクセントに使う。
- アクティブなタブ・ナビ・フォーカスは紫の下線または枠で示す。影は `--shadow-card` 程度に抑える。
- 数値は `font-variant-numeric: tabular-nums` で右揃え。
- Tailwind の blue パレットは `globals.css` の `@theme` でブランド紫に再マップ済み。新規画面では Tailwind の色指定より既存クラスを優先する。
