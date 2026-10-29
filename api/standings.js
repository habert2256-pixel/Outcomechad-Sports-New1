// OutcomeChad Sports — iSports Football Standings API
// API key stays securely in Vercel Environment Variables.
//
// Endpoint:
// GET /api/standings?leagueId=LEAGUE_ID
// GET /api/standings?leagueId=LEAGUE_ID&subLeagueId=SUB_LEAGUE_ID

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=3600, stale-while-revalidate=7200"
  );

  // Allow GET requests only.
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  // Get API key from Vercel environment variables.
  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: "ISPORTS_API_KEY is missing in Vercel."
    });
  }

  // Read league and optional sub-league IDs.
  const leagueId = String(
    req.query?.leagueId || ""
  ).trim();

  const subLeagueId = String(
    req.query?.subLeagueId || ""
  ).trim();

  // A league ID is required.
  if (!leagueId) {
    return res.status(400).json({
      success: false,
      message: "A valid leagueId is required."
    });
  }

  // iSports football standings endpoint.
  const baseUrl =
    process.env.ISPORTS_STANDINGS_URL ||
    "https://api.isportsapi.com/sport/football/standing/league";

  try {
    const url = new URL(baseUrl);

    // Add authentication and required parameters.
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("leagueId", leagueId);

    // Add sub-league only when provided.
    if (subLeagueId) {
      url.searchParams.set(
        "subLeagueId",
        subLeagueId
      );
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const text = await response.text();

    let data;

    // Parse the upstream JSON response.
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        success: false,
        message: "iSports returned an invalid JSON response."
      });
    }

    // Handle HTTP errors from iSports.
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "iSports standings request failed.",
        upstreamStatus: response.status
      });
    }

    // iSports uses code 0 to indicate success.
    if (
      data.code !== undefined &&
      Number(data.code) !== 0
    ) {
      return res.status(502).json({
        success: false,
        message:
          data.message ||
          "iSports rejected the standings request. Check your API key and subscription.",
        upstreamCode: data.code
      });
    }

    // Return the original iSports response.
    return res.status(200).json(data);

  } catch (error) {
    console.error(
      "Football standings API error:",
      error.message
    );

    return res.status(502).json({
      success: false,
      message: "Unable to connect to iSports standings."
    });
  }
}