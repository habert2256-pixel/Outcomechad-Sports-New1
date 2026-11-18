// OutcomeChad Sports
// SportMonks Football API v3 — Live Scores
// Route: /api/football/live
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN
//
// SportMonks endpoint:
// /v3/football/livescores/inplay

const BASE_URL =
  "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 15;
const STALE_SECONDS = 30;

const INCLUDE = [
  "participants",
  "league",
  "state",
  "scores",
  "periods",
  "venue",
  "round",
  "stage",
  "group"
].join(";");

function numberOrNull(value) {
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

function getParticipant(participants, location) {
  return participants.find(
    participant =>
      String(participant?.meta?.location || "")
        .toLowerCase() === location
  ) || {};
}

function getTeamScore(scores, location, description) {
  const item = scores.find(score => {
    const scoreDescription = String(
      score?.description || ""
    ).toUpperCase();

    const participant = String(
      score?.score?.participant || ""
    ).toLowerCase();

    return (
      scoreDescription === description &&
      participant === location
    );
  });

  return numberOrNull(item?.score?.goals);
}

function normalizeStatus(state) {
  const shortName = String(
    state?.short_name || ""
  ).toUpperCase();

  const name = String(
    state?.state ||
    state?.name ||
    state?.short_name ||
    ""
  ).toLowerCase();

  const finished = [
    "FT",
    "AET",
    "FT_PEN",
    "FINISHED"
  ];

  const live = [
    "1H",
    "2H",
    "HT",
    "ET",
    "BT",
    "P",
    "LIVE",
    "INT",
    "INPLAY"
  ];

  if (
    finished.includes(shortName) ||
    name.includes("finished") ||
    name.includes("full time")
  ) {
    return {
      status: "finished",
      statusName: shortName || "FT"
    };
  }

  if (
    live.includes(shortName) ||
    name.includes("live") ||
    name.includes("in play") ||
    name.includes("in progress") ||
    name.includes("half time")
  ) {
    return {
      status: "live",
      statusName: shortName || "LIVE"
    };
  }

  if (
    name.includes("postponed") ||
    shortName === "POSTP"
  ) {
    return {
      status: "other",
      statusName: "POSTPONED"
    };
  }

  if (
    name.includes("cancelled") ||
    shortName === "CANC"
  ) {
    return {
      status: "other",
      statusName: "CANCELLED"
    };
  }

  if (
    name.includes("suspended") ||
    shortName === "SUSP"
  ) {
    return {
      status: "other",
      statusName: "SUSPENDED"
    };
  }

  return {
    status: "scheduled",
    statusName: shortName || "NS"
  };
}

function getMinute(match) {
  const periods = Array.isArray(match.periods)
    ? match.periods
    : [];

  const currentPeriod = periods.find(
    period => period.ticking === true
  );

  const minute =
    currentPeriod?.minutes ??
    match.time?.minute ??
    null;

  return numberOrNull(minute);
}

function normalizeMatch(match) {
  const participants = Array.isArray(match.participants)
    ? match.participants
    : [];

  const scores = Array.isArray(match.scores)
    ? match.scores
    : [];

  const home = getParticipant(
    participants,
    "home"
  );

  const away = getParticipant(
    participants,
    "away"
  );

  const league = match.league || {};
  const venue = match.venue || {};

  const status = normalizeStatus(
    match.state || {}
  );

  const startingAt = match.starting_at || "";

  const matchTime = startingAt
    ? `${startingAt.replace(" ", "T")}Z`
    : "";

  const timestamp = match.starting_at_timestamp
    ? Number(match.starting_at_timestamp)
    : matchTime
      ? Math.floor(Date.parse(matchTime) / 1000)
      : null;

  const homeScore = getTeamScore(
    scores,
    "home",
    "CURRENT"
  );

  const awayScore = getTeamScore(
    scores,
    "away",
    "CURRENT"
  );

  const halfHome = getTeamScore(
    scores,
    "home",
    "1ST_HALF"
  );

  const halfAway = getTeamScore(
    scores,
    "away",
    "1ST_HALF"
  );

  return {
    id: String(match.id),

    homeName: home.name || "Home",
    awayName: away.name || "Away",

    homeTeamId: home.id || "",
    awayTeamId: away.id || "",

    homeLogo: home.image_path || "",
    awayLogo: away.image_path || "",

    homeScore,
    awayScore,

    halfHome,
    halfAway,

    status: status.status,
    statusName: status.statusName,

    minute:
      status.status === "live"
        ? getMinute(match)
        : null,

    addedTime: null,

    matchTime,
    startingAt: matchTime,

    startingTimestamp: timestamp,

    competitionName:
      league.name || "Football",

    league: {
      id: league.id || match.league_id || "",
      name: league.name || "Football"
    },

    leagueId:
      league.id || match.league_id || "",

    leagueLogo:
      league.image_path || "",

    country:
      league.country?.name || "",

    stageName:
      match.stage?.name || "",

    groupName:
      match.group?.name || "",

    roundName:
      match.round?.name || "",

    venue:
      venue.name || "Venue unavailable",

    homeRank: "",
    awayRank: "",

    homeRed: 0,
    awayRed: 0,

    homeYellow: 0,
    awayYellow: 0,

    homeCorner: 0,
    awayCorner: 0,

    hasLineup: false,

    raw: match
  };
}

async function fetchLiveScores(apiToken, signal) {
  const url = new URL(
    `${BASE_URL}/livescores/inplay`
  );

  url.searchParams.set(
    "include",
    INCLUDE
  );

  const response = await fetch(
    url.toString(),
    {
      method: "GET",

      headers: {
        Accept: "application/json",
        Authorization: apiToken
      },

      signal
    }
  );

  const payload = await response.json().catch(
    () => null
  );

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      payload?.error?.message ||
      `SportMonks returned HTTP ${response.status}`
    );
  }

  if (!Array.isArray(payload?.data)) {
    throw new Error(
      "Invalid live-score response from SportMonks."
    );
  }

  return payload;
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

  const apiToken =
    process.env.SPORTMONKS_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({
      success: false,
      provider: "SportMonks",
      message:
        "SPORTMONKS_API_TOKEN is missing in Vercel."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    const payload = await fetchLiveScores(
      apiToken,
      controller.signal
    );

    const matches = payload.data
      .filter(match => match && match.id)
      .map(normalizeMatch)
      .sort((a, b) =>
        (a.startingTimestamp || 0) -
        (b.startingTimestamp || 0)
      );

    return res.status(200).json({
      success: true,
      provider: "SportMonks",
      total: matches.length,
      data: matches
    });

  } catch (error) {
    console.error(
      "SportMonks live scores error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      provider: "SportMonks",
      message:
        error.name === "AbortError"
          ? "Live scores request timed out."
          : "Unable to retrieve live football scores.",
      error: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}