/**
 * 夫婦向け 家事・タスク管理 LINE Bot v3
 * 
 * v3 変更点:
 * - 「完了」だけ打つとクイックリプライボタン付きでToDo一覧表示（タップで完了）
 * - 番号入力での完了にも対応（半角・全角）
 * - 「完了 xxx」の全角スペースも許容
 * - 朝のToDo一覧に期日なしアイテムも表示
 *
 * スプレッドシート構成:
 *   シート1: CustomTodos  (名前/登録者/登録日時/期日/完了フラグ/完了者/完了日時)
 */

// ========== 設定 ==========
const CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('CHANNEL_ACCESS_TOKEN');
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const TIMEZONE = 'Asia/Tokyo';

// ========== アクセス制限 ==========
const REGISTRATION_MODE = false;

function getAllowedUserIds() {
  const raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_USER_IDS') || '';
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// ========== 日々の流れ定義 ==========
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

const DAY_SPECIFIC_FLOW = {
  2: ['🗑️ ゴミ捨て（燃えるゴミ）'],
  5: ['🗑️ ゴミ捨て（缶・ペット）', '🛏️ 保育園 布団入れ替え'],
};

// ========== LINE Webhook エントリーポイント ==========
function doPost(e) {
  try {
    const events = JSON.parse(e.postData.contents).events;
    events.forEach(event => {
      if (event.type === 'message' && event.message.type === 'text') {
        if (event.source && event.source.userId) {
          handleMessage(event);
        }
      }
    });
  } catch (err) {
    console.error('doPost error: ' + err);
  }
  return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== 全角→半角数字変換 ==========
function zenkakuToHankaku(str) {
  return str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

// ========== メッセージ処理 ==========
function handleMessage(event) {
  const rawText = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  // 登録モード
  if (REGISTRATION_MODE) {
    replyMessage(replyToken,
      `🔧 登録モード\nあなたのuserId:\n${userId}\n\nこの文字列をスクリプトプロパティ ALLOWED_USER_IDS に登録してください（複数人はカンマ区切り）`);
    return;
  }

  // アクセス制限チェック
  const allowed = getAllowedUserIds();
  if (allowed.length === 0) {
    replyMessage(replyToken, '⚠️ 許可ユーザーが未設定です。ALLOWED_USER_IDSを設定してください');
    return;
  }
  if (!allowed.includes(userId)) {
    console.log('Unauthorized access: userId=' + userId);
    return;
  }

  const userName = getUserName(userId);

  // 半角・全角スペース両対応: 全角スペースを半角に正規化
  const text = rawText.replace(/\u3000/g, ' ');

  // コマンド判定
  if (text === 'ヘルプ' || text === 'help' || text === '?') {
    replyMessage(replyToken, helpMessage());
  }
  else if (text === '今日' || text === 'おはよう' || text === '今日の流れ') {
    replyMessage(replyToken, showTodayFlow());
  }
  else if (text === 'リスト' || text === 'todo' || text === 'ToDo') {
    replyMessage(replyToken, showTodos());
  }
  else if (text.startsWith('追加 ')) {
    const body = text.substring(3).trim();
    replyMessage(replyToken, addTodo(body, userName));
  }
  else if (text === '完了') {
    // 「完了」のみ → クイックリプライ付きToDoリスト表示
    showCompletionPicker(replyToken);
  }
  else if (text.startsWith('完了 ')) {
    const taskName = text.substring(3).trim();
    replyMessage(replyToken, completeTodo(taskName, userName));
  }
  else if (text.startsWith('完了:')) {
    // クイックリプライからの完了コマンド（ボタンタップで送信される）
    const taskName = text.substring(3).trim();
    replyMessage(replyToken, completeTodo(taskName, userName));
  }
  else if (text.startsWith('削除 ')) {
    const taskName = text.substring(3).trim();
    replyMessage(replyToken, deleteTodo(taskName));
  }
  else {
    // 番号入力（半角・全角対応）→ ToDo完了
    const numStr = zenkakuToHankaku(text);
    if (/^\d+$/.test(numStr)) {
      const num = parseInt(numStr);
      const todos = getActiveTodos();
      if (num >= 1 && num <= todos.length) {
        replyMessage(replyToken, completeTodo(todos[num - 1].name, userName));
        return;
      }
    }
    replyMessage(replyToken, '🤖 コマンドがわからないよ。「ヘルプ」で使い方を確認してね');
  }
}

// ========== 完了ピッカー（クイックリプライ付き） ==========
function showCompletionPicker(replyToken) {
  const todos = getActiveTodos();

  if (todos.length === 0) {
    replyMessage(replyToken, '📝 完了できるToDoがないよ\n「追加 〇〇」で登録してね');
    return;
  }

  const today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  // メッセージ本文（番号付きリスト）
  let msg = '✅ どれを完了する？\nボタンをタップ or 番号を入力\n━━━━━━━━━━━━━━\n';
  todos.forEach((t, i) => {
    let line = `${i + 1}. ${t.name}`;
    if (t.dueDate) {
      if (t.dueDate < today) line += ` 🔴超過`;
      else if (t.dueDate === today) line += ` 🟡今日`;
      else line += ` (${t.dueDate})`;
    }
    msg += line + '\n';
  });

  // クイックリプライボタン作成（最大13個）
  const quickReplyItems = todos.slice(0, 13).map((t, i) => {
    // ラベルは最大20文字
    let label = t.name;
    if (label.length > 18) label = label.substring(0, 17) + '…';
    label = `✅${label}`;
    return {
      type: 'action',
      action: {
        type: 'message',
        label: label,
        text: `完了:${t.name}` // ボタンタップ時にこのテキストが送信される
      }
    };
  });

  // クイックリプライ付きメッセージを送信
  replyWithQuickReply(replyToken, msg, quickReplyItems);
}

// ========== 今日の流れ表示 ==========
function showTodayFlow() {
  const now = new Date();
  const today = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const dayOfWeek = parseInt(Utilities.formatDate(now, TIMEZONE, 'u')) % 7;
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  let msg = `☀️ はじめましましー！\n${today}（${dayNames[dayOfWeek]}）\n`;
  msg += '━━━━━━━━━━━━━━\n';

  if (isWeekday) {
    msg += '\n【🌅 朝の流れ】\n';
    MORNING_FLOW_WEEKDAY.forEach(t => msg += `  ${t}\n`);
  }

  msg += '\n【☀️ 日中のどこかで】\n';
  DAYTIME_FLOW.forEach(t => msg += `  ${t}\n`);

  if (isWeekday) {
    msg += '\n【🌆 夕方〜夜の流れ】\n';
    EVENING_FLOW_WEEKDAY.forEach(t => msg += `  ${t}\n`);
  }

  if (DAY_SPECIFIC_FLOW[dayOfWeek]) {
    msg += '\n【📌 今日限定】\n';
    DAY_SPECIFIC_FLOW[dayOfWeek].forEach(t => msg += `  ${t}\n`);
  }

  // すべてのアクティブToDo
  const todos = getActiveTodos();
  if (todos.length > 0) {
    const overdue = todos.filter(t => t.dueDate && t.dueDate < today);
    const todayTodos = todos.filter(t => t.dueDate === today);
    const upcoming = todos.filter(t => t.dueDate && t.dueDate > today)
                          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const noDate = todos.filter(t => !t.dueDate);

    msg += '\n━━━━━━━━━━━━━━\n';
    msg += '📝 ToDo\n';

    if (overdue.length > 0) {
      msg += '\n🔴 期日超過\n';
      overdue.forEach(t => msg += `  ⬜ ${t.name}（${t.dueDate}）\n`);
    }
    if (todayTodos.length > 0) {
      msg += '\n🟡 今日が期日\n';
      todayTodos.forEach(t => msg += `  ⬜ ${t.name}\n`);
    }
    if (upcoming.length > 0) {
      msg += '\n🟢 今後の予定\n';
      upcoming.forEach(t => msg += `  ⬜ ${t.name}（${t.dueDate}）\n`);
    }
    if (noDate.length > 0) {
      msg += '\n📌 期日なし\n';
      noDate.forEach(t => msg += `  ⬜ ${t.name}\n`);
    }
  }

  return msg;
}

// ========== ToDo追加（期日対応） ==========
function addTodo(body, userName) {
  if (!body) return '⚠️ タスク名を指定してね\n例: 追加 病院予約 4/25';

  const parts = body.split(/\s+/);
  let name = body;
  let dueDate = null;

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const parsed = parseDate(last);
    if (parsed) {
      dueDate = parsed;
      name = parts.slice(0, -1).join(' ');
    }
  }

  const sheet = getSheet('CustomTodos');
  sheet.appendRow([name, userName, new Date(), dueDate || '', false]);

  let response = `➕ 「${name}」を追加したよ`;
  if (dueDate) response += `\n📅 期日: ${dueDate}`;
  response += `\n(登録: ${userName})`;
  return response;
}

// ========== 日付パース ==========
function parseDate(str) {
  const now = new Date();
  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const currentYear = parseInt(Utilities.formatDate(now, TIMEZONE, 'yyyy'));

  if (str === '今日') return todayStr;
  if (str === '明日') {
    const d = new Date(now.getTime() + 86400000);
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  }
  if (str === '明後日') {
    const d = new Date(now.getTime() + 86400000 * 2);
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  }

  const dayMap = {'日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6};
  const weekMatch = str.match(/^(来週|今週)?([日月火水木金土])曜?$/);
  if (weekMatch) {
    const targetDay = dayMap[weekMatch[2]];
    const currentDay = parseInt(Utilities.formatDate(now, TIMEZONE, 'u')) % 7;
    let diff = targetDay - currentDay;
    if (weekMatch[1] === '来週') diff += 7;
    else if (diff <= 0) diff += 7;
    const d = new Date(now.getTime() + diff * 86400000);
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  }

  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${padZero(m[2])}-${padZero(m[3])}`;

  m = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${padZero(m[2])}-${padZero(m[3])}`;

  m = str.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    const candidate = `${currentYear}-${padZero(month)}-${padZero(day)}`;
    if (candidate < todayStr) {
      return `${currentYear + 1}-${padZero(month)}-${padZero(day)}`;
    }
    return candidate;
  }

  m = str.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (m) {
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    const candidate = `${currentYear}-${padZero(month)}-${padZero(day)}`;
    if (candidate < todayStr) {
      return `${currentYear + 1}-${padZero(month)}-${padZero(day)}`;
    }
    return candidate;
  }

  return null;
}

function padZero(n) {
  return String(n).padStart(2, '0');
}

// ========== ToDo完了 ==========
function completeTodo(taskName, userName) {
  const sheet = getSheet('CustomTodos');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === taskName && !data[i][4]) {
      sheet.getRange(i + 1, 5).setValue(true);
      sheet.getRange(i + 1, 6).setValue(userName);
      sheet.getRange(i + 1, 7).setValue(new Date());
      return `✅ 「${taskName}」を ${userName} さんが完了！お疲れさま🎉`;
    }
  }
  return `⚠️ 「${taskName}」はToDoリストに見つからなかったよ\n「リスト」で確認してね`;
}

// ========== ToDo削除 ==========
function deleteTodo(taskName) {
  const sheet = getSheet('CustomTodos');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === taskName && !data[i][4]) {
      sheet.deleteRow(i + 1);
      return `🗑️ 「${taskName}」を削除したよ`;
    }
  }
  return `⚠️ 「${taskName}」はリストにないよ`;
}

// ========== ToDo一覧 ==========
function showTodos() {
  const todos = getActiveTodos();
  if (todos.length === 0) return '📝 ToDoは今ないよ\n「追加 〇〇 4/25」で登録できるよ';

  const today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  todos.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  let msg = '📝 ToDoリスト\n━━━━━━━━━━━━━━\n';
  todos.forEach((t, i) => {
    let line = `${i + 1}. ⬜ ${t.name}`;
    if (t.dueDate) {
      if (t.dueDate < today) line += ` 🔴 ${t.dueDate}(超過)`;
      else if (t.dueDate === today) line += ` 🟡 今日`;
      else line += ` 🟢 ${t.dueDate}`;
    }
    line += `\n   (${t.addedBy})`;
    msg += line + '\n';
  });
  return msg;
}

// ========== アクティブToDo取得 ==========
function getActiveTodos() {
  const sheet = getSheet('CustomTodos');
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0] || data[i][4]) continue;
    let dueDate = data[i][3];
    if (dueDate instanceof Date) {
      dueDate = Utilities.formatDate(dueDate, TIMEZONE, 'yyyy-MM-dd');
    }
    result.push({
      name: String(data[i][0]).trim(),
      addedBy: data[i][1],
      dueDate: dueDate || null,
    });
  }
  return result;
}

// ========== ヘルプ ==========
function helpMessage() {
  return `🤖 家事ボット 使い方
━━━━━━━━━━━━━━
☀️ 今日 / おはよう
   → 今日の家事の流れ + ToDo表示

📝 リスト
   → ToDo一覧（期日順・番号付き）

➕ 追加 〇〇 [期日]
   期日の書き方:
   ・追加 病院予約
   ・追加 病院予約 明日
   ・追加 病院予約 4/25
   ・追加 病院予約 来週月曜

✅ 完了
   → ボタンから選んで完了
✅ 完了 〇〇
   → 名前指定で完了
✅ 番号入力（1, 2, ３…）
   → 番号で完了

🗑️ 削除 〇〇
   → ToDoを削除

❓ ヘルプ`;
}

// ========== LINE API ==========
function replyMessage(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken: replyToken,
    messages: [{type: 'text', text: text}]
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}

function replyWithQuickReply(replyToken, text, quickReplyItems) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken: replyToken,
    messages: [{
      type: 'text',
      text: text,
      quickReply: {
        items: quickReplyItems
      }
    }]
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}

function pushMessageToUser(userId, text) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: userId,
    messages: [{type: 'text', text: text}]
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}

function getUserName(userId) {
  try {
    const url = 'https://api.line.me/v2/bot/profile/' + userId;
    const response = UrlFetchApp.fetch(url, {
      headers: {'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN}
    });
    return JSON.parse(response.getContentText()).displayName;
  } catch(e) {
    return '誰か';
  }
}

// ========== スプレッドシート ==========
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === 'CustomTodos') {
      sheet.appendRow(['TaskName', 'AddedBy', 'AddedAt', 'DueDate', 'IsDone', 'DoneBy', 'DoneAt']);
    }
  }
  return sheet;
}

// ========== 毎朝の自動通知（トリガーで7時に実行） ==========
function morningPush() {
  const message = showTodayFlow();
  const allowed = getAllowedUserIds();

  allowed.forEach(userId => {
    try {
      pushMessageToUser(userId, message);
    } catch (e) {
      console.error('Failed to push to ' + userId + ': ' + e);
    }
  });
}

// ========== 初期セットアップ ==========
function setup() {
  getSheet('CustomTodos');
  console.log('セットアップ完了');
}

// ========== 旧データ移行用 ==========
function cleanupOldSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const oldSheet = ss.getSheetByName('DailyLog');
  if (oldSheet) {
    ss.deleteSheet(oldSheet);
    console.log('DailyLogシートを削除しました');
  }
}
