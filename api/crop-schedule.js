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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ error: 'スケジュールの生成に失敗しました' });
    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
