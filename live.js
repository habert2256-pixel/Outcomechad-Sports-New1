// OutcomeChad Sports — Football live scores API
// IMPORTANT: Set ISPORTS_API_KEY and ISPORTS_FOOTBALL_URL in Vercel Environment Variables.
// ISPORTS_FOOTBALL_URL must be the exact live-football endpoint from your iSports documentation.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const key = process.env.ISPORTS_API_KEY;
  const endpoint = process.env.ISPORTS_FOOTBALL_URL;

  if (!key || !endpoint) {
    return res.status(503).json({
      success: false,
      message: "Football API is not configured. Set ISPORTS_API_KEY and ISPORTS_FOOTBALL_URL in Vercel."
    });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        // Confirm the required authentication header with your specific iSports product docs.
        "Authorization": `Bearer ${key}`
      }
    });

    const bodyText = await upstream.text();
    let data;
    try { data = JSON.parse(bodyText); }
    catch { data = { message: "iSports returned a non-JSON response" }; }

    if (!upstream.ok) {
      console.error("iSports football upstream status:", upstream.status);
      return res.status(502).json({
        success: false,
        message: "Football data provider returned an error. Check endpoint and authentication settings."
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("Football API request failed:", error?.message);
    return res.status(502).json({ success: false, message: "Unable to reach the football data provider." });
  }
}
