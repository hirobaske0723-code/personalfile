export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    // HTMLを取得
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeImporter/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!pageRes.ok) return res.status(200).json({ error: `URLの取得に失敗しました (${pageRes.status})` });
    const html = await pageRes.text();

    // HTMLを平文に変換（script/style/タグを除去）
    const plainText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000); // Geminiのトークン制限対策

    // 画像URLを抽出（og:imageを優先）
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const ogImageUrl = ogImageMatch ? ogImageMatch[1] : '';

    const prompt = `以下はレシピサイトのHTMLをテキスト変換したものです。
料理のレシピ情報をJSONで抽出してください。

テキスト:
${plainText}

以下のJSON形式のみで返してください（余分なテキスト不要）:
{
  "name": "料理名",
  "category": "和食 または 洋食 または 中華 または イタリアン または その他",
  "difficulty": "簡単 または 普通 または 難しい",
  "cookingTime": 調理時間（分・整数・不明なら null）,
  "ingredients": "材料リスト（改行区切り、例: じゃがいも 3個\\n牛肉 200g）",
  "steps": "調理手順（改行区切り、例: 1. じゃがいもを切る\\n2. 炒める）"
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const geminiData = await geminiRes.json();

    if (geminiData.error) {
      return res.status(200).json({ error: `解析エラー: ${geminiData.error.message}` });
    }
    if (!geminiData.candidates?.length) {
      return res.status(200).json({ error: '解析結果が取得できませんでした' });
    }

    const text = geminiData.candidates[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ error: 'レシピ情報を抽出できませんでした。手動で入力してください。' });

    const recipe = JSON.parse(jsonMatch[0]);
    recipe.imageUrl = ogImageUrl;
    recipe.sourceUrl = url;

    res.status(200).json(recipe);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(200).json({ error: 'URLの取得がタイムアウトしました' });
    }
    res.status(500).json({ error: err.message });
  }
}
