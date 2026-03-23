export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { GEMINI_API_KEY } = process.env;
  const { image, mimeType, cropName } = req.body;

  const prompt = `この写真は家庭菜園の「${cropName}」です。
写真を見て以下をJSON形式で答えてください（すべて日本語）:
{
  "stage": "現在の成長ステージ（発芽期 / 生育期 / 開花期 / 収穫期 のいずれか）",
  "estimatedDaysFromPlanting": 植え付けからの推定経過日数（整数）,
  "nextAction": "今すぐやるべきこと（1〜2文）",
  "message": "植物の状態についての説明（2〜3文）",
  "isHealthy": 健康かどうか（true または false）
}
必ずJSONのみ返してください。余分なテキストは不要です。`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
          ]}]
        })
      }
    );
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ error: '解析に失敗しました' });
    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
