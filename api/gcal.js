export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { GCAL_API_KEY, GCAL_CALENDAR_ID } = process.env;

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // 月曜
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // 日曜
  endOfWeek.setHours(23, 59, 59, 999);

  const calId = encodeURIComponent(GCAL_CALENDAR_ID);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?key=${GCAL_API_KEY}&timeMin=${startOfWeek.toISOString()}&timeMax=${endOfWeek.toISOString()}&singleEvents=true&orderBy=startTime`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
