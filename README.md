# LINE 家事管理ボット

夫婦・家族向けの家事タスク管理 LINE Bot。Google Apps Script + スプレッドシートで動作し、完全無料で運用できます。

## 特徴

- **LINEだけで完結** — 専用アプリ不要。普段使いのLINEでタスク管理
- **夫婦で共有** — 誰が何を完了したか自動記録
- **毎朝自動通知** — 今日の家事フローとToDoを朝7時にプッシュ
- **期日管理** — 超過・今日・今後を色分け表示
- **曜日別タスク** — ゴミ出しなど曜日固有のタスクを自動表示
- **完全無料** — Google Apps Script + LINE Messaging API 無料枠で運用

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `今日` / `おはよう` | 今日の家事フロー + ToDo一覧 |
| `リスト` / `todo` | ToDoリスト表示（期日順） |
| `追加 〇〇 [期日]` | タスク追加（期日は任意） |
| `完了` | ボタン付き一覧から選んで完了 |
| `完了 〇〇` | 名前指定で完了 |
| `削除 〇〇` | タスクを削除 |
| `ヘルプ` | コマンド一覧表示 |

### 期日の指定方法

```
追加 病院予約              # 期日なし
追加 病院予約 明日          # 明日
追加 病院予約 4/25          # 月/日
追加 病院予約 来週月曜       # 曜日指定
追加 病院予約 2026-05-01    # yyyy-MM-dd
```

## アーキテクチャ

```
LINE App
  ↕ Messaging API (Webhook)
Google Apps Script (Code.gs)
  ↕ SpreadsheetApp
Google Spreadsheet (CustomTodos シート)
```

## セットアップ

詳細な手順は [SETUP.md](SETUP.md) を参照してください。約30〜40分で完成します。

### 必要なもの

- Google アカウント
- LINE アカウント
- スマホまたは PC

### 大まかな流れ

1. LINE公式アカウント作成 → Messaging API有効化
2. Googleスプレッドシート作成
3. Google Apps Script に `Code.gs` をコピー
4. スクリプトプロパティにトークン等を設定
5. GASをWebアプリとしてデプロイ → LINE Webhook に登録

## カスタマイズ

### 日々の家事フローを変更する

`Code.gs` 冒頭の定数を編集してください:

```javascript
const MORNING_FLOW_WEEKDAY = [
  '🍳 朝食',
  '🚗 保育園送迎',
];

const EVENING_FLOW_WEEKDAY = [
  '🚗 保育園お迎え',
  '🍚 晩ご飯',
  '🛁 風呂',
];

const DAYTIME_FLOW = [
  '🧺 洗濯 → 乾燥機',
  '🍽️ 食洗機',
  '🧽 風呂掃除',
];

// 曜日別タスク（0=日, 1=月, ..., 6=土）
const DAY_SPECIFIC_FLOW = {
  2: ['🗑️ ゴミ捨て（燃えるゴミ）'],
  5: ['🗑️ ゴミ捨て（缶・ペット）', '🛏️ 保育園 布団入れ替え'],
};
```

### アクセス制限

`ALLOWED_USER_IDS` スクリプトプロパティにカンマ区切りでLINEのuserIdを設定することで、許可されたユーザーのみ利用可能です。詳細は [SETUP.md の Step 7](SETUP.md#step-7-アクセス制限を設定する重要5分) を参照。

## スプレッドシート構成

### CustomTodos シート

| 列 | 内容 |
|----|------|
| A: TaskName | タスク名 |
| B: AddedBy | 登録者 |
| C: AddedAt | 登録日時 |
| D: DueDate | 期日 |
| E: IsDone | 完了フラグ |
| F: DoneBy | 完了者 |
| G: DoneAt | 完了日時 |

## 今後の拡張アイデア

- 在宅出社情報共有
- 週次レポート（夫婦の完了件数集計）
- 夜までに未完了タスクのリマインダー
- 買い物リスト機能
- リッチメニュー（ボタン式UI）
- Googleカレンダー連携

## ライセンス

[MIT License](LICENSE)
