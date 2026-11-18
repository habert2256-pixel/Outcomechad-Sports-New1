// OutcomeChad Sports
// Combined Match Data API
// Provider: API Ninjas
// Endpoint: /api/football/match-data?matchId=XXXX
//
// API Ninjas does not provide the same dedicated
// odds and prediction data as the previous provider.
//
// No fabricated odds or predictions are returned.

const CACHE_SECONDS = 60;
const STALE_SECONDS = 120;

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

  const matchId = String(
    req.query?.matchId || ""
  ).trim();

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "A valid matchId is required."
    });
  }

  const data = {
    matchId,

    odds: {
      available: false,

      preMatch: {
        odds: [],
        byMarket: {}
      },

      inPlay: {
        odds: [],
        byMarket: {}
      },

      message:
        "Bookmaker odds are not available through the current API integration."
    },

    predictions: {
      available: false,
      fulltimeResult: null,
      btts: null,
      all: [],

      message:
        "Match predictions are not available through the current API integration."
    }
  };

  return res.status(200).json({
    success: true,
    provider: "API Ninjas",
    matchId,
    available: false,
    data
  });
}