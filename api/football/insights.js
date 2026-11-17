// OutcomeChad Sports
// Match Insights API
// Provider: iSports API
// Endpoint: /api/football/insights?matchId=123456
//
// Required Vercel Environment Variable:
// ISPORTS_API_KEY
//
// iSports endpoint:
// /sport/football/analysis
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }
  const apiKey = process.env.ISPORTS_API_KEY;
  const matchId = String(req.query.matchId || "").trim();
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "ISPORTS_API_KEY is not configured"
    });
  }
  if (!matchId || !/^\d+$/.test(matchId)) {
    return res.status(400).json({
      success: false,
      error: "A valid matchId is required"
    });
  }
  const API_URL =
    "https://api.isportsapi.com/sport/football/analysis";
  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }
  function parseNumber(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function formatDate(value) {
    const timestamp = parseNumber(value);
    if (timestamp === null) {
      return value || null;
    }
    return new Date(timestamp * 1000).toISOString();
  }
  // iSports documents match-history entries as
  // comma-separated strings.
  //
  // Field order:
  // 0 matchId
  // 1 league
  // 2 leagueId
  // 3 matchTime
  // 4 home
  // 5 homeTeamId
  // 6 away
  // 7 awayTeamId
  // 8 scoreHome
  // 9 scoreAway
  // 10 homeHalfScore
  // 11 awayHalfScore
  // 12 homeRed
  // 13 awayRed
  // 14 homeCorner
  // 15 awayCorner
  function parseMatch(item) {
    if (typeof item === "string") {
      const fields = item.split(",");
      return {
        matchId: fields[0] || null,
        league: fields[1] || null,
        leagueId: fields[2] || null,
        matchTime: parseNumber(fields[3]),
        date: formatDate(fields[3]),
        home: fields[4] || "Home",
        homeTeamId: fields[5] || null,
        away: fields[6] || "Away",
        awayTeamId: fields[7] || null,
        scoreHome: parseNumber(fields[8]),
        scoreAway: parseNumber(fields[9]),
        homeHalfScore: parseNumber(fields[10]),
        awayHalfScore: parseNumber(fields[11]),
        homeRed: parseNumber(fields[12]),
        awayRed: parseNumber(fields[13]),
        homeCorner: parseNumber(fields[14]),
        awayCorner: parseNumber(fields[15])
      };
    }
    if (item && typeof item === "object") {
      return {
        matchId: item.matchId ?? item.id ?? null,
        league: item.league ?? item.leagueName ?? null,
        leagueId: item.leagueId ?? null,
        matchTime: parseNumber(item.matchTime),
        date: formatDate(item.matchTime),
        home: item.home ?? item.homeName ?? "Home",
        homeTeamId: item.homeTeamId ?? null,
        away: item.away ?? item.awayName ?? "Away",
        awayTeamId: item.awayTeamId ?? null,
        scoreHome: parseNumber(item.scoreHome),
        scoreAway: parseNumber(item.scoreAway),
        homeHalfScore: parseNumber(item.homeHalfScore),
        awayHalfScore: parseNumber(item.awayHalfScore),
        homeRed: parseNumber(item.homeRed),
        awayRed: parseNumber(item.awayRed),
        homeCorner: parseNumber(item.homeCorner),
        awayCorner: parseNumber(item.awayCorner)
      };
    }
    return null;
  }
  function normalizeMatch(item) {
    const match = parseMatch(item);
    if (!match) return null;
    const homeScore = match.scoreHome;
    const awayScore = match.scoreAway;
    let result = "N";
    if (
      homeScore !== null &&
      awayScore !== null
    ) {
      result =
        homeScore > awayScore
          ? "W"
          : homeScore < awayScore
          ? "L"
          : "D";
    }
    return {
      fixtureId: match.matchId,
      date: match.date,
      league: match.league,
      home: match.home,
      away: match.away,
      opponent: match.away,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore,
      awayScore,
      score:
        homeScore !== null && awayScore !== null
          ? `${homeScore}-${awayScore}`
          : null,
      halfTimeScore:
        match.homeHalfScore !== null &&
        match.awayHalfScore !== null
          ? `${match.homeHalfScore}-${match.awayHalfScore}`
          : null,
      result
    };
  }
  function normalizeSchedule(item) {
    if (typeof item === "string") {
      const fields = item.split(",");
      return {
        matchId: fields[0] || null,
        league: fields[1] || null,
        leagueId: fields[2] || null,
        matchTime: parseNumber(fields[3]),
        date: formatDate(fields[3]),
        home: fields[4] || "Home",
        homeTeamId: fields[5] || null,
        away: fields[6] || "Away",
        awayTeamId: fields[7] || null,
        day: parseNumber(fields[8])
      };
    }
    if (item && typeof item === "object") {
      return {
        matchId: item.matchId ?? null,
        league: item.league ?? null,
        leagueId: item.leagueId ?? null,
        matchTime: parseNumber(item.matchTime),
        date: formatDate(item.matchTime),
        home: item.home ?? "Home",
        homeTeamId: item.homeTeamId ?? null,
        away: item.away ?? "Away",
        awayTeamId: item.awayTeamId ?? null,
        day: parseNumber(item.day)
      };
    }
    return null;
  }
  function normalizeList(value, mapper) {
    return getArray(value)
      .map(mapper)
      .filter(Boolean);
  }
  try {
    const url = new URL(API_URL);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("matchId", matchId);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      throw new Error("Invalid JSON response from iSports");
    }
    if (!response.ok) {
      throw new Error(
        payload?.message ||
        payload?.error ||
        `iSports returned HTTP ${response.status}`
      );
    }
    // Support common response envelopes.
    const analysis =
      payload?.data?.data ??
      payload?.data ??
      payload;
    if (
      !analysis ||
      typeof analysis !== "object" ||
      Array.isArray(analysis)
    ) {
      return res.status(404).json({
        success: false,
        error: "Match analysis was not found"
      });
    }
    const headToHead = normalizeList(
      analysis.headToHead,
      normalizeMatch
    ).slice(0, 20);
    const homeRecent = normalizeList(
      analysis.homeLastMatches,
      normalizeMatch
    ).slice(0, 20);
    const awayRecent = normalizeList(
      analysis.awayLastMatches,
      normalizeMatch
    ).slice(0, 20);
    const homeSchedule = normalizeList(
      analysis.homeSchedule,
      normalizeSchedule
    ).slice(0, 5);
    const awaySchedule = normalizeList(
      analysis.awaySchedule,
      normalizeSchedule
    ).slice(0, 5);
    const responseData = {
      provider: "iSports",
      fixture: {
        id: matchId
      },
      recentForm: {
        home: homeRecent,
        away: awayRecent
      },
      headToHead,
      upcomingFixtures: {
        home: homeSchedule,
        away: awaySchedule
      },
      teamSummary: {
        home: analysis.homeDataVs || null,
        away: analysis.awayDataVs || null
      },
      goalDistribution: {
        home: analysis.homeGoals || null,
        away: analysis.awayGoals || null
      },
      halfTimeFullTime: {
        home: analysis.homeHT || null,
        away: analysis.awayHT || null
      },
      scoringTimes: {
        home: analysis.homeShootTime || null,
        away: analysis.awayShootTime || null
      },
      notes: {
        recentForm:
          "Recent match history is supplied by iSports.",
        headToHead:
          "Head-to-head history is supplied by iSports.",
        upcomingFixtures:
          "Upcoming fixtures are supplied by iSports.",
        cache:
          "iSports caches match analysis data for 24 hours."
      }
    };
    return res.status(200).json({
      success: true,
      provider: "iSports",
      matchId,
      data: responseData
    });
  } catch (error) {
    console.error(
      "iSports Match Insights error:",
      error
    );
    return res.status(502).json({
      success: false,
      error: "Could not load Match Insights",
      message:
        error.message ||
        "iSports request failed"
    });
  }
}