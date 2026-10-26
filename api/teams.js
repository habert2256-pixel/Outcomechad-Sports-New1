// OutcomeChad Sports — Team Information API
// Keeps the iSports API key on the server.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }
  const teamId = String(req.query.teamId || "").trim();
  const apiKey = process.env.ISPORTS_API_KEY;
  if (!teamId) {
    return res.status(400).json({
      success: false,
      message: "Missing teamId."
    });
  }
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: "API key is not configured."
    });
  }
  // The team-information endpoint varies by iSports product.
  // Set ISPORTS_TEAM_URL only after confirming the endpoint
  // supported by your subscription.
  const baseUrl = process.env.ISPORTS_TEAM_URL;
  if (!baseUrl) {
    return res.status(501).json({
      success: false,
      message: "Team details endpoint has not been configured."
    });
  }
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("teamId", teamId);
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "Team information request failed."
      });
    }
    return res.status(200).json({
      success: true,
      team: data
    });
  } catch (error) {
    console.error("Team API error:", error.message);
    return res.status(502).json({
      success: false,
      message: "Unable to retrieve team information."
    });
  }
}