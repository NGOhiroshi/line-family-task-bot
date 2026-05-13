# LINE 家事管理ボット

## プロジェクト概要
夫婦・家族向けの家事タスク管理 LINE Bot。Google Apps Script (GAS) + Google スプレッドシートで動作。

## 技術スタック
- Google Apps Script (V8ランタイム)
- LINE Messaging API
- Google Spreadsheet (データストア)

## ファイル構成
- `Code.gs` — ボット本体（Webhook処理、タスク管理、LINE API通信すべて1ファイル）
- `SETUP.md` — セットアップ手順書
- `LICENSE` — MIT License

## スプレッドシート構成
- `CustomTodos` — ToDoタスク管理（1行=1タスク）
- `WorkSchedule` — 出社在宅予定（1行=1人1週間分、列: UserId/UserName/WeekStart/Mon〜Fri）

## 開発時の注意
- GASはブラウザ上のエディタまたはclaspで編集する。このリポジトリの`Code.gs`が正とする
- スクリプトプロパティ (`CHANNEL_ACCESS_TOKEN`, `SPREADSHEET_ID`, `ALLOWED_USER_IDS`) は秘匿情報。コードにハードコードしない
- GASの制約: ES Modules未対応、`import/export`不可、トップレベル`const`はファイルスコープのグローバル
- LINE Messaging API無料枠: replyは無制限、pushは月200通
- デプロイ後はバージョンを「新バージョン」にしないと反映されない
