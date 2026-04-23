export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { NOTION_TOKEN, NOTION_RECIPE_DATABASE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_RECIPE_DATABASE_ID) {
    return res.status(500).json({ error: 'env not set' });
  }

  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_RECIPE_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sorts: [{ property: '料理名', direction: 'ascending' }],
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(200).json({ error: data.message });

    const recipes = (data.results || []).map(page => ({
      id: page.id,
      name: page.properties['料理名']?.title?.[0]?.plain_text || '',
      category: page.properties['カテゴリ']?.select?.name || '',
      difficulty: page.properties['難易度']?.select?.name || '',
      cookingTime: page.properties['調理時間']?.number || null,
      ingredients: page.properties['材料']?.rich_text?.map(t => t.plain_text).join('') || '',
      steps: page.properties['手順']?.rich_text?.map(t => t.plain_text).join('') || '',
      memo: page.properties['メモ']?.rich_text?.map(t => t.plain_text).join('') || '',
      imageUrl: page.properties['画像']?.url || '',
      sourceUrl: page.properties['ソースURL']?.url || '',
    }));

    res.status(200).json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
