// OutcomeChad Sports
// SportMonks Football API v3 — Enhanced Match Insights
// Route: /api/football/insights?matchId=123456
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN

const BASE_URL = "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;

const PER_PAGE = 50;
const MAX_PAGES = 5;

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

// SportMonks score participant is normally "home" or "away".
function getScore(scores, location) {
  const current = (scores || []).find(score => {
    return (
      String(score?.description || "").toUpperCase() === "CURRENT" &&
      String(score?.score?.participant || "").toLowerCase() === location
    );
  });

  if (current?.score?.goals !== undefined) {
    return Number(current.score.goals);
  }

  // Fallback to the latest available score for that side.
  const fallback = (scores || []).filter(score =>
    String(score?.score?.participant || "").toLowerCase() === location
  );

  if (!fallback.length) return null;

  const item = fallback[fallback.length - 1];
  const goals = item?.score?.goals;

  return goals === undefined || goals === null
    ? null
    : Number(goals);
}

function normalizeMatch(match, teamId = null) {
  const participants = match?.participants || [];

  const home = getParticipant(participants, "home");
  const away = getParticipant(participants, "away");

  const homeScore = getScore(match?.scores, "home");
  const awayScore = getScore(match?.scores, "away");

  let homeResult = "N";

  if (homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) homeResult = "W";
    else if (homeScore < awayScore) homeResult = "L";
    else homeResult = "D";
  }

  let result = homeResult;

  if (teamId && String(teamId) === String(away.id)) {
    result =
      homeResult === "W" ? "L" :
      homeResult === "L" ? "W" :
      homeResult;
  }

  const isHomeTeam =
    teamId && String(teamId) === String(home.id);

  return {
    fixtureId: match?.id,
    date: match?.starting_at || null,

    league: match?.league?.name || "Football",

    home: home.name || "Home",
    away: away.name || "Away",

    opponent: teamId
      ? isHomeTeam
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

    result,

    goalsFor: teamId
      ? isHomeTeam ? homeScore : awayScore
      : null,

    goalsAgainst: teamId
      ? isHomeTeam ? awayScore : homeScore
      : null,

    cleanSheet: teamId && homeScore !== null && awayScore !== null
      ? isHomeTeam
        ? awayScore === 0
        : homeScore === 0
      : false,

    status: match?.state?.name || null
  };
}

async function apiRequest(path, token, signal, page = 1) {
  const url = new URL(`${BASE_URL}${path}`);

  url.searchParams.set("api_token", token);
  url.searchParams.set("include", INCLUDE);
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", String(page));

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

// Retrieve multiple pages instead of only the first 50 fixtures.
async function fetchTeamFixtures(
  token,
  teamId,
  startDate,
  endDate,
  signal
) {
  const path =
    `/fixtures/between/${startDate}/${endDate}/${teamId}`;

  const allFixtures = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const payload = await apiRequest(
      path,
      token,
      signal,
      page
    );

    const fixtures = Array.isArray(payload.data)
      ? payload.data
      : [];

    allFixtures.push(...fixtures);

    const pagination = payload?.pagination ||
      payload?.meta?.pagination;

    const hasMore =
      pagination?.has_more === true ||
      pagination?.has_more_pages === true;

    if (!hasMore || fixtures.length === 0) {
      break;
    }
  }

  return allFixtures;
}

function uniqueFixtures(fixtures) {
  const map = new Map();

  for (const fixture of fixtures || []) {
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
    .map(match => normalizeMatch(match, teamId))
    .filter(match =>
      match.homeScore !== null &&
      match.awayScore !== null
    )
    .sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    )
    .slice(0, 5);
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

function buildTeamSummary(matches) {
  const summary = {
    played: matches.length,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsScored: 0,
    goalsConceded: 0,
    cleanSheets: 0,
    goalDifference: 0,
    points: 0
  };

  for (const match of matches) {
    if (match.result === "W") {
      summary.wins++;
      summary.points += 3;
    } else if (match.result === "D") {
      summary.draws++;
      summary.points += 1;
    } else if (match.result === "L") {
      summary.losses++;
    }

    summary.goalsScored += match.goalsFor || 0;
    summary.goalsConceded += match.goalsAgainst || 0;

    if (match.cleanSheet) {
      summary.cleanSheets++;
    }
  }

  summary.goalDifference =
    summary.goalsScored - summary.goalsConceded;

  return summary;
}

function buildHeadToHead(fixtures, fixtureId) {
  return uniqueFixtures(fixtures)
    .filter(match =>
      String(match.id) !== String(fixtureId)
    )
    .map(match => normalizeMatch(match))
    .filter(match =>
      match.homeScore !== null &&
      match.awayScore !== null
    )
    .sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    )
    .slice(0, 20);
}

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");

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
    // 1. Retrieve the selected fixture.
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

    // 2. Retrieve both teams' fixtures and head-to-head history.
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

    // 3. Recent form.
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

    // 4. Upcoming fixtures.
    const homeUpcoming = upcomingMatches(
      homeFixtures,
      targetDate
    );

    const awayUpcoming = upcomingMatches(
      awayFixtures,
      targetDate
    );

    // 5. Head-to-head.
    const headToHead = buildHeadToHead(
      h2hFixtures,
      fixture.id
    );

    // 6. Team performance summaries.
    const homeSummary = buildTeamSummary(homeRecent);
    const awaySummary = buildTeamSummary(awayRecent);

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

      available: {
        recentForm:
          homeRecent.length > 0 ||
          awayRecent.length > 0,

        headToHead:
          headToHead.length > 0,

        upcomingFixtures:
          homeUpcoming.length > 0 ||
          awayUpcoming.length > 0,

        teamSummary:
          homeRecent.length > 0 ||
          awayRecent.length > 0
      },

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
        home: homeSummary,
        away: awaySummary
      },

      cleanSheets: {
        home: homeSummary.cleanSheets,
        away: awaySummary.cleanSheets
      },

      notes: {
        recentForm:
          "Based on the five most recent completed fixtures returned by SportMonks.",

        headToHead:
          "Based on historical completed fixtures between both teams.",

        upcomingFixtures:
          "Based on fixtures scheduled after the selected match.",

        teamSummary:
          "Performance totals are calculated from the recent matches returned above.",

        cleanSheets:
          "A clean sheet is a match in which the team conceded zero goals.",

        coverage:
          "Team fixture history is limited to the date range and page limit configured in this endpoint."
      }
    };

    return res.status(200).json({
      success: true,
      provider: "SportMonks",
      matchId,
      available: data.available,
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