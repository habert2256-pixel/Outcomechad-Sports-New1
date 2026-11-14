// OutcomeChad Sports
// SportMonks: Check leagues available to this API token
// Endpoint: /api/football/my-leagues

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      message: "SPORTMONKS_API_TOKEN is missing."
    });
  }

  try {
    const url = new URL(
      "https://api.sportmonks.com/v3/my/leagues"
    );

    url.searchParams.set("api_token", token);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message:
          payload?.message ||
          "Unable to retrieve subscribed leagues."
      });
    }

    const leagues = Array.isArray(payload?.data)
      ? payload.data
      : [];

    return res.status(200).json({
      success: true,
      provider: "SportMonks",
      total: leagues.length,
      data: leagues.map(league => ({
        id: league.id,
        name: league.name,
        country: league.country?.name || ""
      }))
    });

  } catch (error) {
    console.error("My leagues error:", error.message);

    return res.status(502).json({
      success: false,
      message: "Unable to check subscribed leagues."
    });
  }
}