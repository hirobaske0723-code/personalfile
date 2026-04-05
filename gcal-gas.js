// ============================================================
// Google Apps Script — Googleカレンダー今週イベント取得 + 追加
// ============================================================
// 【再デプロイ手順】
// 1. script.google.com でこのコードに差し替え
// 2. 「デプロイ」→「デプロイを管理」→「編集（鉛筆アイコン）」
// 3. バージョン:「新しいバージョン」→「デプロイ」
// ※ URLは変わらない
// ============================================================

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  if (action === 'add') {
    return addEvent(e.parameter);
  }

  return getWeekEvents();
}

// ── 今週のイベントを取得 ──────────────────────────────
function getWeekEvents() {
  var cal = CalendarApp.getDefaultCalendar();
  var now = new Date();

  var start = new Date(now);
  start.setHours(0, 0, 0, 0);
  var end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  var events = cal.getEvents(start, end);

  var items = events.map(function(ev) {
    var isAllDay = ev.isAllDayEvent();
    return {
      summary: ev.getTitle(),
      start: isAllDay
        ? { date: Utilities.formatDate(ev.getStartTime(), Session.getScriptTimeZone(), 'yyyy-MM-dd') }
        : { dateTime: ev.getStartTime().toISOString() }
    };
  });

  return json({ items: items });
}

// ── カレンダーにイベントを追加 ────────────────────────
function addEvent(params) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    var title = params.title || '（無題）';
    var startIso = params.start; // ISO 8601 文字列

    if (!startIso) {
      return json({ ok: false, error: 'start parameter missing' });
    }

    var start = new Date(startIso);
    var end = new Date(start.getTime() + 60 * 60 * 1000); // デフォルト1時間

    // 終日イベント判定（時刻が 00:00:00 かつ title に「起床」「記念日」「誕生日」等を含む場合）
    var isAllDay = params.allDay === 'true';

    var ev;
    if (isAllDay) {
      ev = cal.createAllDayEvent(title, start);
    } else {
      ev = cal.createEvent(title, start, end);
    }

    return json({ ok: true, eventId: ev.getId(), title: ev.getTitle() });
  } catch(e) {
    return json({ ok: false, error: e.message });
  }
}

// ── ヘルパー ──────────────────────────────────────────
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
