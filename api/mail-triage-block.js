export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN, NOTION_SENDER_FILTER_DB_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_SENDER_FILTER_DB_ID) {
    return res.status(500).json({ error: 'env not set' });
  }

  const { pageId, from } = req.body || {};
  if (!pageId || !from) return res.status(400).json({ error: 'pageId and from are required' });

  try {
    // 1. ステータスを「対応不要」に更新
    const r1 = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: { 'ステータス': { select: { name: '対応不要' } } } }),
    });
    const d1 = await r1.json();
    if (!r1.ok) return res.status(r1.status).json({ error: d1.message });

    // 2. 送信者フィルターDBに追加
    const today = new Date().toISOString().split('T')[0];
    const r2 = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_SENDER_FILTER_DB_ID },
        properties: {
          '送信者': { title: [{ text: { content: from } }] },
          '追加日': { date: { start: today } },
        },
      }),
    });
    const d2 = await r2.json();
    if (!r2.ok) return res.status(r2.status).json({ error: d2.message });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
