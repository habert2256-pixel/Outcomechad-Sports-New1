// OutcomeChad Sports — iSports Football Analysis API
// Provides head-to-head, recent form, and fixture analysis.
// API key stays securely in Vercel Environment Variables.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }
  const apiKey = process.env.ISPORTS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: "ISPORTS_API_KEY is missing in Vercel."
    });
  }
  const matchId = req.query?.matchId;
  if (!matchId || typeof matchId !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid matchId query parameter is required."
    });
  }
  const baseUrl =
    process.env.ISPORTS_FOOTBALL_ANALYSIS_URL ||
    "https://api.isportsapi.com/sport/football/analysis";
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("matchId", matchId);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        success: false,
        message: "iSports returned an invalid JSON response."
      });
    }
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "iSports analysis request failed.",
        upstreamStatus: response.status
      });
    }
    if (data.code !== undefined && Number(data.code) !== 0) {
      return res.status(502).json({
        success: false,
        message: "iSports rejected the analysis request.",
        upstreamCode: data.code
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("Football analysis API error:", error.message);
    return res.status(502).json({
      success: false,
      message: "Unable to connect to iSports."
    });
  }
}