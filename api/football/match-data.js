// OutcomeChad Sports — Combined Odds + Predictions
// Endpoint: /api/football/match-data?matchId=XXXX
// Requires Odds + Predictions add-ons on your Sportmonks plan.

const CACHE_SECONDS = 60;
const STALE_SECONDS = 120;

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeOdd(odd) {
  return {
    id: odd.id,
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
    winning: Boolean(odd.winning)
  };
}

const TYPE_MAP = {
  237: "fulltime_result",
  231: "btts",
  235: "over_under",
  240: "correct_score"
};

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
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
  const timeout = setTimeout(() => controller.abort(), 14000);

  try {
    const base = "https://api.sportmonks.com/v3/football";

    const urls = {
      preMatch: `${base}/odds/pre-match/fixtures/${matchId}?api_token=${token}`,
      inPlay: `${base}/odds/inplay/fixtures/${matchId}?api_token=${token}`,
      predictions: `${base}/predictions/probabilities/fixtures/${matchId}?api_token=${token}`
    };

    const [preRes, inPlayRes, predRes] = await Promise.all([
      fetch(urls.preMatch, { headers: { Accept: "application/json" }, signal: controller.signal }),
      fetch(urls.inPlay, { headers: { Accept: "application/json" }, signal: controller.signal }),
      fetch(urls.predictions, { headers: { Accept: "application/json" }, signal: controller.signal })
    ]);

    const [prePayload, inPlayPayload, predPayload] = await Promise.all([
      preRes.json().catch(() => null),
      inPlayRes.json().catch(() => null),
      predRes.json().catch(() => null)
    ]);

    // Odds
    const preMatch = getArray(prePayload).map(normalizeOdd);
    const inPlay = getArray(inPlayPayload).map(normalizeOdd);

    const groupByMarket = (odds) => {
      const map = {};
      for (const odd of odds) {
        const key = odd.market || "Other";
        if (!map[key]) map[key] = [];
        map[key].push(odd);
      }
      return map;
    };

    // Predictions
    const predItems = getArray(predPayload).map(item => ({
      id: item.id,
      typeId: item.type_id,
      type: TYPE_MAP[item.type_id] || `type_${item.type_id}`,
      predictions: item.predictions || {}
    }));

    const fulltime = predItems.find(p => p.type === "fulltime_result");
    const btts = predItems.find(p => p.type === "btts");

    return res.status(200).json({
      success: true,
      data: {
        matchId,
        odds: {
          preMatch: {
            odds: preMatch,
            byMarket: groupByMarket(preMatch)
          },
          inPlay: {
            odds: inPlay,
            byMarket: groupByMarket(inPlay)
          }
        },
        predictions: {
          available: predItems.length > 0,
          fulltimeResult: fulltime?.predictions || null,  // { home, draw, away }
          btts: btts?.predictions || null,                // { yes, no }
          all: predItems
        }
      }
    });
  } catch (error) {
    console.error("Sportmonks match-data error:", error.message);
    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message:
        error.name === "AbortError"
          ? "Request timed out."
          : "Unable to retrieve match data."
    });
  } finally {
    clearTimeout(timeout);
  }
}