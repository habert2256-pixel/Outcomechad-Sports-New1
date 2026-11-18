// OutcomeChad Sports
// Match Insights API
// Provider: API Ninjas
// Endpoint: /api/football/insights?matchId=123456
//
// API Ninjas does not currently provide a dedicated
// match-analysis endpoint equivalent to iSports.
//
// Required Vercel Environment Variable:
// API_NINJAS_KEY

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const matchId = String(
    req.query.matchId || ""
  ).trim();

  if (!matchId) {
    return res.status(400).json({
      success: false,
      error: "A valid matchId is required"
    });
  }

  const responseData = {
    provider: "API Ninjas",

    fixture: {
      id: matchId
    },

    available: false,

    recentForm: {
      home: [],
      away: []
    },

    headToHead: [],

    upcomingFixtures: {
      home: [],
      away: []
    },

    teamSummary: {
      home: null,
      away: null
    },

    goalDistribution: {
      home: null,
      away: null
    },

    halfTimeFullTime: {
      home: null,
      away: null
    },

    scoringTimes: {
      home: null,
      away: null
    },

    notes: {
      recentForm:
        "Recent team form is not available through the current API Ninjas integration.",

      headToHead:
        "Head-to-head match history is not available through the current API Ninjas integration.",

      upcomingFixtures:
        "Upcoming team fixtures are not available through this endpoint.",

      teamSummary:
        "Detailed team analysis is not available through this endpoint.",

      goalDistribution:
        "Goal distribution data is not available.",

      scoringTimes:
        "Scoring-time statistics are not available.",

      provider:
        "API Ninjas is currently used for supported football match data."
    }
  };

  return res.status(200).json({
    success: true,
    provider: "API Ninjas",
    matchId,
    available: false,
    data: responseData
  });
}