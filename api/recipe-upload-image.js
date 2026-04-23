export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { IMGBB_API_KEY } = process.env;
  if (!IMGBB_API_KEY) return res.status(500).json({ error: 'IMGBB_API_KEY not set' });

  const { image, fileName } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image is required' });

  try {
    const formData = new URLSearchParams();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', image); // base64文字列
    if (fileName) formData.append('name', fileName);

    const uploadRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    const data = await uploadRes.json();

    if (!data.success) {
      return res.status(200).json({ error: data.error?.message || '画像のアップロードに失敗しました' });
    }

    res.status(200).json({ url: data.data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
