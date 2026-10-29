// OutcomeChad Sports — iSports Football Fixtures
// Endpoint: /api/football/fixtures?date=2026-10-29
// API key stays securely in Vercel Environment Variables.

const CACHE_SECONDS = 300; // 5 minutes
const STALE_SECONDS = 600; // 10 minutes

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
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

  const controller = new AbortController();

  // Prevent a slow upstream request from hanging the Vercel function.
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const url = new URL(baseUrl);

    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("date", date);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        code: response.status,
        message: result?.message || "iSports API request failed",
      });
    }

    // iSports can return HTTP 200 with a non-zero API code.
    if (result?.code !== 0) {
      const message = String(
        result?.message || "iSports returned an API error"
      );

      // Preserve the upstream error meaning.
      if (/frequency|rate.?limit|exceeds the limit/i.test(message)) {
        res.setHeader("Retry-After", "300");

        return res.status(429).json({
          code: result.code,
          message:
            "iSports request limit reached. Please wait before trying again.",
          retryAfter: 300,
        });
      }

      if (/haven't purchased|not purchased|purchase this data/i.test(message)) {
        return res.status(403).json({
          code: result.code,
          message:
            "This fixtures data is not included in the current iSports subscription.",
        });
      }

      return res.status(502).json({
        code: result.code || 502,
        message,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Football fixtures API error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        code: 504,
        message: "iSports request timed out. Please try again later.",
      });
    }

    return res.status(500).json({
      code: 500,
      message: "Unable to retrieve football fixtures",
    });
  } finally {
    clearTimeout(timeout);
  }
}