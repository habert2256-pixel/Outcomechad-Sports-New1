export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;
  const matchId = req.query.matchId;

  if (!token) {
    return res.status(500).json({ error: "SPORTMONKS_API_TOKEN is not configured" });
  }

  if (!matchId || !/^\d+$/.test(String(matchId))) {
    return res.status(400).json({ error: "A valid matchId is required" });
  }

  try {
    const url = new URL(
      `https://api.sportmonks.com/v3/football/fixtures/${matchId}`
    );

    url.searchParams.set("api_token", token);
    url.searchParams.set("include", "participants;expectedLineups");

    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload.message || `Sportmonks Lineups API returned ${response.status}`
      );
    }

    return res.status(200).json({ data: payload.data || null });
  } catch (error) {
    console.error("Sportmonks Lineups API error:", error);
    return res.status(502).json({
      error: "Could not load expected lineups",
      message: error.message
    });
  }
}