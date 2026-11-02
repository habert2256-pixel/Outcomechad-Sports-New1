// OutcomeChad Sports — Sportmonks v3 Match Statistics
// Required Vercel environment variable: SPORTMONKS_API_TOKEN

const CACHE_SECONDS = 15;
const STALE_SECONDS = 30;

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "SPORTMONKS_API_TOKEN is not configured."
    });
  }

  const fixtureId = req.query?.matchId || req.query?.fixtureId;

  if (!fixtureId || !/^\d+$/.test(String(fixtureId))) {
    return res.status(400).json({
      error: "A valid matchId or fixtureId is required."
    });
  }

  try {
    const url = new URL(
      `https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`
    );

    url.searchParams.set("api_token", token);
    url.searchParams.set("include", "statistics.type;participants;state");

    const response = await fetch(url.toString());

    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Sportmonks could not retrieve match statistics.",
        details: payload?.message || payload?.error || null
      });
    }

    const fixture = payload?.data;

    if (!fixture) {
      return res.status(404).json({
        error: "Fixture not found."
      });
    }

    const statistics = Array.isArray(fixture.statistics)
      ? fixture.statistics
      : [];

    return res.status(200).json({
      fixtureId: fixture.id,
      statistics
    });
  } catch (error) {
    console.error("Sportmonks statistics error:", error);

    return res.status(500).json({
      error: "Unable to retrieve match statistics."
    });
  }
}