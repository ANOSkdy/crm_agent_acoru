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
- Borders: `--color-border`, `--color-border-strong`
- Radius: `--radius-btn`, `--radius-input`, `--radius-menu`, `--radius-modal`
- Motion: `--dur-menu`, `--ease-out`

## Login page

`/login/` は CRM 本体と同じブランド・トークンを使い、以下を満たします。

- 中央配置のカードレイアウトにする。
- ブランドロゴはヘッダーと同じ単文字ロゴ表現を使う。
- 入力欄は `.input`、送信ボタンは `.btn.btn--primary` を使う。
- エラーは danger トークンを使い、`role="alert"` を付与する。

## Navigation

ログイン後のサイドナビゲーションは、主要機能リンクを上部、セッション操作を下部に配置します。

- 「ログアウト」はナビゲーション最下部に固定する。
- 折りたたみ時も操作可能なアイコンボタンとして残す。
