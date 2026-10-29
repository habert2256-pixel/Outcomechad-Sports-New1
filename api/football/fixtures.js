// OutcomeChad Sports — iSports Football Fixtures
// Endpoint: /api/football/fixtures?date=2026-10-29
// API key stays securely in Vercel Environment Variables.

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=60, stale-while-revalidate=120"
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      code: 405,
      message: "Method not allowed",
    });
  }

  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      code: 500,
      message: "ISPORTS_API_KEY is not configured",
    });
  }

  const date = String(req.query?.date || "").trim();

  // Require YYYY-MM-DD format.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      code: 400,
      message: "A valid date is required in YYYY-MM-DD format",
    });
  }

  // Validate that the date is a real calendar date.
  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return res.status(400).json({
      code: 400,
      message: "Invalid calendar date",
    });
  }

  const baseUrl =
    process.env.ISPORTS_FOOTBALL_FIXTURES_URL ||
    "https://api.isportsapi.com/sport/football/schedule/basic";

  try {
    const url = new URL(baseUrl);

    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("date", date);

    const response = await fetch(url.toString());
    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        code: response.status,
        message: result?.message || "iSports API request failed",
      });
    }

    // iSports can return HTTP 200 with a non-zero API code.
    if (result?.code !== 0) {
      return res.status(502).json({
        code: result?.code || 502,
        message: result?.message || "iSports returned an API error",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Football fixtures API error:", error);

    return res.status(500).json({
      code: 500,
      message: "Unable to retrieve football fixtures",
    });
  }
}