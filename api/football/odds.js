// OutcomeChad Sports — Sportmonks Odds (Pre-match + In-play)
// Endpoint: /api/football/odds?matchId=XXXX
// Requires Odds add-on on your Sportmonks plan.
// SPORTMONKS_API_TOKEN must be set in Vercel Environment Variables.

const CACHE_SECONDS = 60;       // pre-match odds don't need to be super fresh
const STALE_SECONDS = 120;

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeOdd(odd) {
  return {
    id: odd.idid,
    marketId: odd.market_id,
    bookmakerId: odd.bookmaker_id,
    market: odd.market_description || odd.market?.name || "Unknown",
    label: odd.label || odd.name || "",
    name: odd.name || odd.label || "",
    value: odd.value || odd.dp3 || null,
    probability: odd.probability || null,
    american: odd.american || null,
    fractional: odd.fractional || null,
    handicap: odd.handicap ?? null,
    total: odd.total ?? null,
    stopped: Boolean(odd.stopped),
    winning: Boolean(odd.winning),
    updatedAt: odd.latest_bookmaker_update || odd.updated_at || null
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
    // Pre-match odds
    const preMatchUrl = new URL(
      `https://api.sportmonks.com/v3/football/odds/pre-match/fixtures/${matchId}`
    );
    preMatchUrl.searchParams.set("api_token", token);

    // In-play odds (will be empty if match is not live)
    const inPlayUrl = new URL(
      `https://api.sportmonks.com/v3/football/odds/inplay/fixtures/${matchId}`
    );
    inPlayUrl.searchParams.set("api_token", token);

    const [preRes, inPlayRes] = await Promise.all([
      fetch(preMatchUrl.toString(), {
        headers: { Accept: "application/json" },
        signal: controller.signal
      }),
      fetch(inPlayUrl.toString(), {
        headers: { Accept: "application/json" },
        signal: controller.signal
      })
    ]);

    const prePayload = await preRes.json().catch(() => null);
    const inPlayPayload = await inPlayRes.json().catch(() => null);

    if (!preRes.ok && !inPlayRes.ok) {
      return res.status(preRes.status || 502).json({
        success: false,
        message:
          prePayload?.message ||
          inPlayPayload?.message ||
          "Sportmonks odds request failed."
      });
    }

    const preMatch = getArray(prePayload).map(normalizeOdd);
    const inPlay = getArray(inPlayPayload).map(normalizeOdd);

    // Group by market for easier frontend consumption
    const groupByMarket = (odds) => {
      const map = {};
      for (const odd of odds) {
        const key = odd.market || "Other";
        if (!map[key]) map[key] = [];
        map[key].push(odd);
      }
      return map;
    };

    return res.status(200).json({
      success: true,
      data: {
        matchId,
        preMatch: {
          odds: preMatch,
          byMarket: groupByMarket(preMatch)
        },
        inPlay: {
          odds: inPlay,
          byMarket: groupByMarket(inPlay)
        }
      }
    });
  } catch (error) {
    console.error("Sportmonks odds error:", error.message);

    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message:
        error.name === "AbortError"
          ? "Sportmonks odds request timed out."
          : "Unable to retrieve odds."
    });
  } finally {
    clearTimeout(timeout);
  }
}