export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_REFRESH_TOKEN, GCAL_CALENDAR_ID } = process.env;

  try {
    // リフレッシュトークンでアクセストークンを取得
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GCAL_CLIENT_ID,
        client_secret: GCAL_CLIENT_SECRET,
        refresh_token: GCAL_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const { access_token } = await tokenRes.json();

    // 今週の範囲を計算
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const calId = encodeURIComponent(GCAL_CALENDAR_ID);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?timeMin=${startOfWeek.toISOString()}&timeMax=${endOfWeek.toISOString()}&singleEvents=true&orderBy=startTime`;

    const calRes = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const data = await calRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
