// ============================================================
// Google Apps Script — Googleカレンダー今週イベント取得
// ============================================================
// 【使い方】
// 1. https://script.google.com にアクセス
// 2. 「新しいプロジェクト」をクリック
// 3. デフォルトの myFunction を削除してこのコードを全て貼り付け
// 4. 「デプロイ」→「新しいデプロイ」→「種類の選択: ウェブアプリ」
// 5. 設定:
//      次のユーザーとして実行: 自分
//      アクセスできるユーザー: 全員
// 6. 「デプロイ」→ Googleアカウント認証 → 「アクセスを許可」
// 7. 表示された URL（https://script.google.com/macros/s/.../exec）をコピー
// ============================================================

function doGet(e) {
  var cal = CalendarApp.getDefaultCalendar();
  var now = new Date();

  // 今週の月曜00:00〜日曜23:59を計算
  var mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  var sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  var events = cal.getEvents(mon, sun);

  var items = events.map(function(ev) {
    var isAllDay = ev.isAllDayEvent();
    return {
      summary: ev.getTitle(),
      start: isAllDay
        ? { date: Utilities.formatDate(ev.getStartTime(), Session.getScriptTimeZone(), 'yyyy-MM-dd') }
        : { dateTime: ev.getStartTime().toISOString() }
    };
  });

  var output = ContentService
    .createTextOutput(JSON.stringify({ items: items }))
    .setMimeType(ContentService.MimeType.JSON);

  return output;
}
