// OutcomeChad Sports — iSports Basketball API
// Keep ISPORTS_API_KEY in Vercel Environment Variables.
export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=15, stale-while-revalidate=30"
  );
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
  const baseUrl =
    process.env.ISPORTS_BASKETBALL_URL ||
    "https://api.isportsapi.com/sport/basketball/livescores";
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("api_key", apiKey);
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    const body = await upstream.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return res.status(502).json({
        success: false,
        message: "iSports returned an invalid JSON response."
      });
    }
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        message: "iSports basketball request failed.",
        upstreamStatus: upstream.status
      });
    }
    if (
      data.code !== undefined &&
      Number(data.code) !== 0
    ) {
      return res.status(502).json({
        success: false,
        message: "iSports rejected the request. Check API access and subscription.",
        upstreamCode: data.code
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("Basketball API error:", error.message);
    return res.status(502).json({
      success: false,
      message: "Unable to connect to iSports basketball data."
    });
  }
}