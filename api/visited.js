export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN, NOTION_VISITED_PAGE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_VISITED_PAGE_ID) {
    return res.status(200).json({ countries: [], ok: false, error: 'env not set' });
  }

  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `https://api.notion.com/v1/blocks/${NOTION_VISITED_PAGE_ID}/children`,
        { headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' } }
      );
      const data = await r.json();
      const block = data.results?.find(b => b.type === 'paragraph');
      const text = block?.paragraph?.rich_text?.[0]?.plain_text || '';
      res.status(200).json({ countries: text ? text.split(',').filter(Boolean) : [] });
    } catch (err) {
      res.status(500).json({ error: err.message, countries: [] });
    }
  } else if (req.method === 'POST') {
    const { countries } = req.body;
    const text = (countries || []).join(',');
    try {
      const listRes = await fetch(
        `https://api.notion.com/v1/blocks/${NOTION_VISITED_PAGE_ID}/children`,
        { headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' } }
      );
      const listData = await listRes.json();
      const block = listData.results?.find(b => b.type === 'paragraph');

      if (block) {
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
}
