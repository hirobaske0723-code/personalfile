export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN, NOTION_VISITED_PAGE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_VISITED_PAGE_ID) {
    return res.status(200).json({ ok: false, error: 'env not set' });
  }

  const { countries } = req.body;
  const text = (countries || []).join(',');

  try {
    // 既存ブロック取得
    const listRes = await fetch(
      `https://api.notion.com/v1/blocks/${NOTION_VISITED_PAGE_ID}/children`,
      { headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' } }
    );
    const listData = await listRes.json();
    const block = listData.results?.find(b => b.type === 'paragraph');

    if (block) {
      // 既存ブロックを更新
      await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paragraph: { rich_text: [{ type: 'text', text: { content: text } }] }
        }),
      });
    } else {
      // 新規ブロック作成
      await fetch(`https://api.notion.com/v1/blocks/${NOTION_VISITED_PAGE_ID}/children`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          children: [{
            object: 'block', type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: text } }] }
          }]
        }),
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
