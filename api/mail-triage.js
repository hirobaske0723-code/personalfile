export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN, NOTION_MAIL_TRIAGE_DB_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_MAIL_TRIAGE_DB_ID) {
    return res.status(500).json({ error: 'env not set' });
  }

  const { status = '未対応' } = req.query;

  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${NOTION_MAIL_TRIAGE_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: 'AI判定', select: { equals: '要返信' } },
            ...(status !== 'all' ? [{ property: 'ステータス', select: { equals: status } }] : []),
          ],
        },
        sorts: [{ property: '受信日時', direction: 'descending' }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message });

    const PRIORITY_ORDER = ['高', '中', '低'];
    const items = (data.results || []).map(page => {
      const p = page.properties;
      return {
        id: page.id,
        subject:        p['件名']?.title?.map(t => t.plain_text).join('') || '',
        from:           p['送信者']?.rich_text?.map(t => t.plain_text).join('') || '',
        received_at:    p['受信日時']?.date?.start || '',
        priority:       p['優先度']?.select?.name || '低',
        ai_summary:     p['AI要約']?.rich_text?.map(t => t.plain_text).join('') || '',
        reply_deadline: p['返信期限']?.date?.start || '',
        status:         p['ステータス']?.select?.name || '未対応',
      };
    }).sort((a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    );

    // サマリー
    const summary = {
      total: items.length,
      high: items.filter(i => i.priority === '高').length,
      medium: items.filter(i => i.priority === '中').length,
      low: items.filter(i => i.priority === '低').length,
    };

    res.status(200).json({ items, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
