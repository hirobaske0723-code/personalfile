export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { GEMINI_API_KEY } = process.env;
  const { cropName } = req.body;

  const prompt = `「${cropName}」を家庭菜園のプランターで育てる場合の栽培スケジュールを教えてください。
植え付けから終了までの主要なマイルストーンを以下のJSON形式で返してください（すべて日本語）:
{
  "milestones": [
    { "days": 0, "label": "植え付け", "detail": "具体的な作業内容（1〜2文）" },
    { "days": 14, "label": "液肥スタート", "detail": "具体的な作業内容（1〜2文）" }
  ]
}
ルール：
- マイルストーンは4〜6個
- days は植え付けからの経過日数（整数）
- その植物に特有の作業（わき芽かき・誘引・花芽摘みなど）を含める
- 最後は「終了目安」で締める
- JSONのみ返す。余分なテキスト不要`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await response.json();

    // APIエラーチェック
    if (data.error) return res.status(200).json({ error: data.error.message || 'API error' });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(200).json({ error: '応答が空でした' });

    // コードブロックを除去してJSONを抽出
    const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ error: '解析失敗', raw: text });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.milestones || !Array.isArray(parsed.milestones)) {
      return res.status(200).json({ error: 'milestones が見つかりません', raw: text });
    }
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
