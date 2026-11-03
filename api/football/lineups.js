export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const token = process.env.SPORTMONKS_API_TOKEN;
  const matchId = String(req.query.matchId || "").trim();
  if (!token) {
    return res.status(500).json({
      error: "SPORTMONKS_API_TOKEN is not configured"
    });
  }
  if (!/^\d+$/.test(matchId)) {
    return res.status(400).json({
      error: "A valid matchId is required"
    });
  }
  try {
    const url = new URL(
      `https://api.sportmonks.com/v3/football/fixtures/${matchId}`
    );
    url.searchParams.set("api_token", token);
    url.searchParams.set(
      "include",
      "participants;expectedLineups;lineups"
    );
    const response = await fetch(url.toString());
    const payload = await response.json();
    if (!response.ok) {
      console.error("Sportmonks lineup response:", payload);
      return res.status(response.status).json({
        error: payload.message || "Sportmonks lineup request failed"
      });
    }
    const fixture = payload.data || {};
    const participants = Array.isArray(fixture.participants)
      ? fixture.participants
      : [];
    const expectedLineups = Array.isArray(fixture.expectedLineups)
      ? fixture.expectedLineups
      : Array.isArray(fixture.expectedlineups)
        ? fixture.expectedlineups
        : [];
    const lineups = Array.isArray(fixture.lineups)
      ? fixture.lineups
      : [];
    return res.status(200).json({
      data: {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        startingAt: fixture.starting_at,
        participants,
        expectedLineups,
        lineups
      }
    });
  } catch (error) {
    console.error("Sportmonks Lineups API error:", error);
    return res.status(502).json({
      error: "Could not load expected lineups",
      message: error.message
    });
  }
}