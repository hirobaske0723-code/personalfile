// ===================================================
// メールトリアージ — Google Apps Script
// Gmail未読を毎朝AI分類 → Notion登録 → サマリーメール送信
// ===================================================

const PROPS = PropertiesService.getScriptProperties();
const OPENROUTER_API_KEY     = PROPS.getProperty('OPENROUTER_API_KEY');
const OPENROUTER_MODEL       = 'google/gemini-2.0-flash-001';
const NOTION_TOKEN           = PROPS.getProperty('NOTION_TOKEN');
const NOTION_MAIL_TRIAGE_DB  = PROPS.getProperty('NOTION_MAIL_TRIAGE_DB_ID');
const SUMMARY_TO             = Session.getActiveUser().getEmail();

// ===================================================
// メインエントリーポイント（トリガーで毎朝8:00に実行）
// ===================================================
function runMailTriage() {
  const threads = GmailApp.search('is:unread newer_than:1d');
  const added = [];

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (!msg.isUnread()) continue;

      const gmailId   = msg.getId();
      const subject   = msg.getSubject() || '（件名なし）';
      const from      = msg.getFrom();
      const receivedAt = Utilities.formatDate(msg.getDate(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
      const body      = msg.getPlainBody().substring(0, 500);

      // 重複チェック
      if (isAlreadyInNotion(gmailId)) {
        Logger.log(`スキップ（登録済み）: ${subject}`);
        continue;
      }

      // AI分類
      let result;
      try {
        result = classifyEmail(subject, from, body);
      } catch (e) {
        Logger.log(`分類エラー: ${subject} — ${e}`);
        continue;
      }
      Logger.log(`分類結果: ${subject} → ${result.classification} / ${result.priority}`);

      if (result.classification !== '要返信') continue;

      // Notion登録
      try {
        addToNotion({ subject, from, receivedAt, gmailId, ...result });
        added.push({ subject, from, ...result });
        Logger.log(`登録完了: ${subject}`);
      } catch (e) {
        Logger.log(`Notion登録エラー: ${subject} — ${e}`);
      }
    }
  }

  sendSummaryEmail(added);
  Logger.log(`=== 完了: ${added.length}件登録 ===`);
}

// ===================================================
// OpenRouter: メール分類
// ===================================================
function classifyEmail(subject, from, body) {
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  const prompt = `今日の日付: ${today}

以下のメールを分析して、JSONのみで回答してください。

【メール情報】
件名: ${subject}
送信者: ${from}
本文（先頭500文字）: ${body}

【分類ルール】
- 要返信: 返事・確認・承認・依頼が明確に求められているもの
- 要確認: 重要情報だが返信不要（請求書・通知・領収書など）
- 不要: ニュースレター・広告・自動送信メール

【優先度ルール】
- 高: 今日〜明日が期限、または重要な取引先から
- 中: 3日以内に対応が必要
- 低: それ以外

出力形式（JSONのみ、説明文なし）:
{"classification":"要返信"|"要確認"|"不要","priority":"高"|"中"|"低","summary":"100文字以内の要約","reply_deadline":"YYYY-MM-DD"|null}`;

  const res = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(res.getContentText());
  const text = data.choices?.[0]?.message?.content || '';

  const s = text.indexOf('{');
  const e = text.lastIndexOf('}') + 1;
  if (s === -1 || e === 0) return { classification: '不要', priority: '低', summary: '', reply_deadline: null };

  try {
    return JSON.parse(text.substring(s, e));
  } catch (_) {
    return { classification: '不要', priority: '低', summary: '', reply_deadline: null };
  }
}

// ===================================================
// Notion: 重複チェック
// ===================================================
function isAlreadyInNotion(gmailId) {
  const res = UrlFetchApp.fetch(
    `https://api.notion.com/v1/databases/${NOTION_MAIL_TRIAGE_DB}/query`,
    {
      method: 'post',
      headers: notionHeaders(),
      payload: JSON.stringify({
        filter: { property: 'Gmail_ID', rich_text: { equals: gmailId } },
      }),
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(res.getContentText());
  return (data.results || []).length > 0;
}

// ===================================================
// Notion: レコード追加
// ===================================================
function addToNotion({ subject, from, receivedAt, classification, priority, summary, reply_deadline, gmailId }) {
  const properties = {
    '件名':     { title:     [{ text: { content: subject } }] },
    '送信者':   { rich_text: [{ text: { content: from } }] },
    '受信日時': { date:      { start: receivedAt } },
    'AI判定':   { select:    { name: classification } },
    '優先度':   { select:    { name: priority } },
    'AI要約':   { rich_text: [{ text: { content: summary || '' } }] },
    'ステータス': { select:  { name: '未対応' } },
    'Gmail_ID': { rich_text: [{ text: { content: gmailId } }] },
  };
  if (reply_deadline) {
    properties['返信期限'] = { date: { start: reply_deadline } };
  }

  const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    headers: notionHeaders(),
    payload: JSON.stringify({ parent: { database_id: NOTION_MAIL_TRIAGE_DB }, properties }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (data.object === 'error') throw new Error(data.message);
}

function notionHeaders() {
  return {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
}

// ===================================================
// Gmail: サマリーメール送信
// ===================================================
function sendSummaryEmail(items) {
  if (items.length === 0) {
    Logger.log('要返信メールなし。サマリーメール送信スキップ。');
    return;
  }

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M月d日');
  const high = items.filter(i => i.priority === '高').length;

  const rows = items.map(item => {
    const color = item.priority === '高' ? '#ef4444' : item.priority === '中' ? '#f59e0b' : '#10b981';
    const bg    = item.priority === '高' ? '#fee2e2' : item.priority === '中' ? '#fef3c7' : '#d1fae5';
    return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">
          <span style="background:${bg};color:${color};padding:2px 10px;border-radius:10px;font-size:12px;font-weight:bold;">${item.priority}</span>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-weight:600;">${item.subject}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">${item.from}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555;">${item.summary || ''}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#f59e0b;">${item.reply_deadline || ''}</td>
      </tr>`;
  }).join('');

  GmailApp.sendEmail(
    SUMMARY_TO,
    `【要返信】${today} — ${items.length}件（高優先度 ${high}件）`,
    `要返信メールが${items.length}件あります。HTMLメールをご確認ください。`,
    {
      htmlBody: `
        <div style="font-family:-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 6px;color:#111;font-size:20px;">📬 要返信メール — ${today}</h2>
          <p style="color:#888;margin:0 0 20px;font-size:14px;">
            合計 <strong style="color:#111;">${items.length}件</strong>&nbsp;
            高優先度 <strong style="color:#ef4444;">${high}件</strong>
          </p>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#fafafa;">
                <th style="padding:8px;text-align:left;font-size:12px;color:#999;font-weight:600;border-bottom:2px solid #eee;">優先度</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#999;font-weight:600;border-bottom:2px solid #eee;">件名</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#999;font-weight:600;border-bottom:2px solid #eee;">送信者</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#999;font-weight:600;border-bottom:2px solid #eee;">AI要約</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#999;font-weight:600;border-bottom:2px solid #eee;">返信期限</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `
    }
  );
  Logger.log(`サマリーメール送信完了: ${SUMMARY_TO}`);
}
