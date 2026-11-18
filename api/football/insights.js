// OutcomeChad Sports
// SportMonks Football API v3 — Match Insights
// Route: /api/football/insights?matchId=123456
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN

const BASE_URL = "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;

const INCLUDE = "participants;scores;league;state;round";

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return dateString(result);
}

function getParticipant(participants, location) {
  return (participants || []).find(
    item =>
      String(item?.meta?.location || "").toLowerCase() === location
  ) || {};
}

function getScore(scores, teamId) {
  const item = (scores || []).find(score => {
    const participant = score?.score?.participant;

    return (
      String(participant) === String(teamId) ||
      String(participant).toLowerCase() ===
        (String(teamId) === "home" ? "home" : "away")
    ) && String(score?.description || "").toUpperCase() === "CURRENT";
  });

  return item?.score?.goals ?? null;
}

function normalizeMatch(match, teamId = null) {
  const participants = match.participants || [];

  const home = getParticipant(participants, "home");
  const away = getParticipant(participants, "away");

  const homeScore = getScore(match.scores, home.id);
  const awayScore = getScore(match.scores, away.id);

  let result = "N";

  if (homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) result = "W";
    else if (homeScore < awayScore) result = "L";
    else result = "D";

    // Recent form is expressed from the requested
    // team's perspective, not always the home team's.
    if (
      teamId &&
      String(teamId) === String(away.id)
    ) {
      result =
        result === "W" ? "L" :
        result === "L" ? "W" : result;
    }
  }

  return {
    fixtureId: match.id,
    date: match.starting_at || null,

    league:
      match.league?.name || "Football",

    home: home.name || "Home",
    away: away.name || "Away",

    opponent: teamId
      ? String(teamId) === String(home.id)
        ? away.name
        : home.name
      : away.name,

    homeTeamId: home.id || null,
    awayTeamId: away.id || null,

    homeScore,
    awayScore,

    score:
      homeScore !== null && awayScore !== null
        ? `${homeScore}-${awayScore}`
        : null,

    halfTimeScore: null,

    result
  };
}

async function apiRequest(path, token, signal) {
  const url = new URL(`${BASE_URL}${path}`);

  url.searchParams.set("api_token", token);
  url.searchParams.set("include", INCLUDE);
  url.searchParams.set("per_page", "50");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    signal
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      payload?.error?.message ||
      `SportMonks HTTP ${response.status}`
    );
  }

  if (!Array.isArray(payload?.data) && !payload?.data?.id) {
    throw new Error("Invalid SportMonks response.");
  }

  return payload;
}

async function fetchTeamFixtures(
  token,
  teamId,
  startDate,
  endDate,
  signal
) {
  const path =
    `/fixtures/between/${startDate}/${endDate}/${teamId}`;

  const payload = await apiRequest(path, token, signal);

  return Array.isArray(payload.data)
    ? payload.data
    : [];
}

function uniqueFixtures(fixtures) {
  const map = new Map();

  for (const fixture of fixtures) {
    if (fixture?.id) {
      map.set(String(fixture.id), fixture);
    }
  }

  return [...map.values()];
}

function recentMatches(fixtures, teamId, targetDate) {
  return uniqueFixtures(fixtures)
    .filter(match =>
      match.starting_at &&
      match.starting_at.slice(0, 10) < targetDate
    )
    .sort((a, b) =>
      String(b.starting_at).localeCompare(
        String(a.starting_at)
      )
    )
    .slice(0, 5)
    .map(match => normalizeMatch(match, teamId));
}

function upcomingMatches(fixtures, targetDate) {
  return uniqueFixtures(fixtures)
    .filter(match =>
      match.starting_at &&
      match.starting_at.slice(0, 10) > targetDate
    )
    .sort((a, b) =>
      String(a.starting_at).localeCompare(
        String(b.starting_at)
      )
    )
    .slice(0, 5)
    .map(match => normalizeMatch(match));
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
      message: "Method not allowed."
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      provider: "SportMonks",
      message: "SPORTMONKS_API_TOKEN is missing in Vercel."
    });
  }

  const matchId = String(
    req.query?.matchId || ""
  ).trim();

  if (!/^\d+$/.test(matchId)) {
    return res.status(400).json({
      success: false,
      message: "A valid SportMonks matchId is required."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 25000);

  try {
    // Retrieve the selected match first.
    const fixturePayload = await apiRequest(
      `/fixtures/${matchId}`,
      token,
      controller.signal
    );

    const fixture = fixturePayload.data;

    if (
      !fixture ||
      String(fixture.id) !== matchId
    ) {
      return res.status(404).json({
        success: false,
        provider: "SportMonks",
        message: "Match not found."
      });
    }

    const participants = fixture.participants || [];

    const home = getParticipant(participants, "home");
    const away = getParticipant(participants, "away");

    if (!home.id || !away.id) {
      return res.status(502).json({
        success: false,
        provider: "SportMonks",
        message: "Match team information is unavailable."
      });
    }

    const targetDate =
      String(fixture.starting_at || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return res.status(502).json({
        success: false,
        provider: "SportMonks",
        message: "Match date is unavailable."
      });
    }

    const historyStart = shiftDate(targetDate, -365);
    const futureEnd = shiftDate(targetDate, 90);

    // Retrieve team fixtures and head-to-head history.
    const requests = await Promise.allSettled([
      fetchTeamFixtures(
        token,
        home.id,
        historyStart,
        futureEnd,
        controller.signal
      ),

      fetchTeamFixtures(
        token,
        away.id,
        historyStart,
        futureEnd,
        controller.signal
      ),

      apiRequest(
        `/fixtures/head-to-head/${home.id}/${away.id}`,
        token,
        controller.signal
      )
    ]);

    const errors = [];

    function getResult(index, label) {
      const result = requests[index];

      if (result.status === "fulfilled") {
        return result.value;
      }

      errors.push({
        section: label,
        message:
          result.reason?.message ||
          "Unable to retrieve data."
      });

      return index === 2 ? { data: [] } : [];
    }

    const homeFixtures = getResult(0, "home");
    const awayFixtures = getResult(1, "away");
    const h2hPayload = getResult(2, "headToHead");

    const h2hFixtures = Array.isArray(h2hPayload.data)
      ? h2hPayload.data
      : [];

    const homeRecent = recentMatches(
      homeFixtures,
      home.id,
      targetDate
    );

    const awayRecent = recentMatches(
      awayFixtures,
      away.id,
      targetDate
    );

    const homeUpcoming = upcomingMatches(
      homeFixtures,
      targetDate
    );

    const awayUpcoming = upcomingMatches(
      awayFixtures,
      targetDate
    );

    const headToHead = uniqueFixtures(h2hFixtures)
      .filter(match => match.id !== fixture.id)
      .sort((a, b) =>
        String(b.starting_at).localeCompare(
          String(a.starting_at)
        )
      )
      .slice(0, 20)
      .map(match => normalizeMatch(match));

    const data = {
      provider: "SportMonks",

      fixture: {
        id: matchId,
        date: fixture.starting_at,
        home: home.name,
        away: away.name,
        homeTeamId: home.id,
        awayTeamId: away.id
      },

      available: true,

      recentForm: {
        home: homeRecent,
        away: awayRecent
      },

      headToHead,

      upcomingFixtures: {
        home: homeUpcoming,
        away: awayUpcoming
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
          "Based on the five most recent available fixtures.",

        headToHead:
          "Based on historical fixtures between both teams.",

        upcomingFixtures:
          "Based on fixtures scheduled after the selected match.",

        advancedStatistics:
          "Goal distribution and scoring-time analysis are not calculated by this endpoint."
      }
    };

    return res.status(200).json({
      success: true,
      provider: "SportMonks",
      matchId,
      available: true,
      partial: errors.length > 0,
      errors,
      data
    });

  } catch (error) {
    console.error(
      "SportMonks insights error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      provider: "SportMonks",
      message:
        error.name === "AbortError"
          ? "Match insights request timed out."
          : "Unable to retrieve match insights.",
      error: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}