export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { NOTION_TOKEN, NOTION_RECIPE_DATABASE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_RECIPE_DATABASE_ID) {
    return res.status(500).json({ error: 'env not set' });
  }

  const { pageId, name, category, difficulty, cookingTime, ingredients, steps, memo, imageUrl, sourceUrl } = req.body || {};
  if (!name) return res.status(400).json({ error: '料理名は必須です' });

  // Notion rich_text は1要素あたり2000文字制限のため分割
  function toRichText(text) {
    if (!text) return [];
    const chunks = [];
    for (let i = 0; i < text.length; i += 1990) {
      chunks.push({ text: { content: text.slice(i, i + 1990) } });
    }
    return chunks;
  }

  const properties = {
    '料理名': { title: [{ text: { content: name } }] },
    'カテゴリ': category ? { select: { name: category } } : { select: null },
    '難易度': difficulty ? { select: { name: difficulty } } : { select: null },
    '調理時間': { number: cookingTime ? Number(cookingTime) : null },
    '材料': { rich_text: toRichText(ingredients) },
    '手順': { rich_text: toRichText(steps) },
    'メモ': { rich_text: toRichText(memo) },
    '画像': { url: imageUrl || null },
    'ソースURL': { url: sourceUrl || null },
  };

  try {
    let response;
    if (pageId) {
      // 更新
      response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });
    } else {
      // 新規作成
      response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: NOTION_RECIPE_DATABASE_ID },
          properties,
        }),
      });
    }

    const data = await response.json();
    if (!response.ok) return res.status(200).json({ error: data.message || 'Notion error' });
    res.status(200).json({ ok: true, id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
