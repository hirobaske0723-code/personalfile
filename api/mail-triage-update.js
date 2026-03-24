export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN } = process.env;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not set' });

  const { pageId, status } = req.body || {};
  if (!pageId || !status) return res.status(400).json({ error: 'pageId and status are required' });

  const VALID = ['未対応', '対応中', '完了'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'invalid status' });

  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: { 'ステータス': { select: { name: status } } } }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
