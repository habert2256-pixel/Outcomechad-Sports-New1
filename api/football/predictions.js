// OutcomeChad Sports — Sportmonks Predictions / Probabilities
// Endpoint: /api/football/predictions?matchId=XXXX
// Requires Predictions add-on on your Sportmonks plan.
// SPORTMONKS_API_TOKEN must be set in Vercel Environment Variables.

const CACHE_SECONDS = 300;      // predictions update less frequently
const STALE_SECONDS = 600;

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

// Common prediction type_ids (Sportmonks)
const TYPE_MAP = {
  237: "fulltime_result",       // Home / Draw / Away
  231: "btts",                  // Both Teams To Score
  235: "over_under",            // Over/Under goals (various lines)
  240: "correct_score",         // Correct score distribution
  // Add more as needed
};

function normalizePrediction(item) {
  const typeKey = TYPE_MAP[item.type_id] || `type_${item.type_id}`;

  return {
    id: item.id,
    typeId: item.type_id,
    type: typeKey,
    predictions: item.predictions || {},
    // Keep the raw object so frontend can handle any market
    raw: item.predictions
  };
}

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;
  const matchId = String(req.query?.matchId || "").trim();

  if (!token) {
    return res.status(500).json({
      success: false,
      message: "SPORTMONKS_API_TOKEN is missing in Vercel."
    });
  }

  if (!/^\d+$/.test(matchId)) {
    return res.status(400).json({
      success: false,
      message: "A valid matchId is required."
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const url = new URL(
      `https://api.sportmonks.com/v3/football/predictions/probabilities/fixtures/${matchId}`
    );
    url.searchParams.set("api_token", token);
    // Optional: include type for nicer names
    // url.searchParams.set("include", "type");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Sportmonks predictions error:", response.status, payload);

      return res.status(response.status).json({
        success: false,
        message:
          payload?.message ||
          "Sportmonks predictions request failed. Check if Predictions add-on is enabled."
      });
    }

    const items = getArray(payload).map(normalizePrediction);

    // Convenience objects for the most common markets
    const fulltime = items.find(p => p.type === "fulltime_result");
    const btts = items.find(p => p.type === "btts");

    return res.status(200).json({
      success: true,
      data: {
        matchId,
        available: items.length > 0,
        // Easy access for the UI
        fulltimeResult: fulltime?.predictions || null,   // { home, draw, away }
        btts: btts?.predictions || null,                 // { yes, no }
        all: items                                       // full list for advanced use
      }
    });
  } catch (error) {
    console.error("Sportmonks predictions error:", error.message);

    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message:
        error.name === "AbortError"
          ? "Sportmonks predictions request timed out."
          : "Unable to retrieve predictions."
    });
  } finally {
    clearTimeout(timeout);
  }
}