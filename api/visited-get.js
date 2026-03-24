export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN, NOTION_VISITED_PAGE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_VISITED_PAGE_ID) {
    return res.status(200).json({ countries: [], error: 'env not set' });
  }

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
}
