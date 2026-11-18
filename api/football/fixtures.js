// OutcomeChad Sports
// SportMonks Football API v3 — Fixtures
// Route: /api/football/fixtures?date=YYYY-MM-DD
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN
//
// Official endpoint:
// /v3/football/fixtures/date/{date}

const BASE_URL = "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 60;
const STALE_SECONDS = 120;

const INCLUDE = [
  "participants",
  "league",
  "state",
  "scores",
  "venue",
  "round",
  "stage",
  "group"
].join(";");

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

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

function getName(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  return value?.name || fallback;
}

function getParticipant(participants, location) {
  return participants.find(
    participant =>
      String(participant?.meta?.location || "")
        .toLowerCase() === location
  ) || {};
}

function getScore(scores, participant, description) {
  const item = scores.find(score => {
    if (
      String(score?.description || "").toUpperCase() !==
      description
    ) {
      return false;
    }

    const scoreParticipant =
      score?.score?.participant;

    if (typeof scoreParticipant === "string") {
      return (
        scoreParticipant.toLowerCase() ===
        participant.toLowerCase()
      );
    }

    return (
      String(scoreParticipant) ===
      String(participant)
    );
  });

  return numberOrNull(item?.score?.goals);
}

function getTeamScore(scores, team, location, current = true) {
  const teamId = String(team?.id || "");

  const score = scores.find(item => {
    const description = String(
      item?.description || ""
    ).toUpperCase();

    const matchesDescription = current
      ? ["CURRENT", "2ND_HALF", "EXTRA_TIME"].includes(description)
      : ["1ST_HALF", "HALF_TIME"].includes(description);

    if (!matchesDescription) {
      return false;
    }

    const scoreParticipant = item?.score?.participant;

    if (
      typeof scoreParticipant === "string" &&
      ["home", "away"].includes(
        scoreParticipant.toLowerCase()
      )
    ) {
      return (
        scoreParticipant.toLowerCase() === location
      );
    }

    if (
      scoreParticipant !== null &&
      scoreParticipant !== undefined
    ) {
      return String(scoreParticipant) === teamId;
    }

    return false;
  });

  return numberOrNull(score?.score?.goals);
}

function normalizeStatus(state) {
  const name = String(
    state?.state || state?.name || state?.short_name || ""
  ).toLowerCase();

  const shortName = String(
    state?.short_name || ""
  ).toUpperCase();

  const finishedStates = [
    "FT",
    "AET",
    "FT_PEN",
    "FINISHED",
    "AFTER EXTRA TIME",
    "AFTER PENALTIES"
  ];

  const liveStates = [
    "1H",
    "2H",
    "HT",
    "ET",
    "BT",
    "P",
    "LIVE",
    "INPLAY",
    "IN_PLAY",
    "INT"
  ];

  if (
    finishedStates.includes(shortName) ||
    name.includes("finished") ||
    name.includes("full time")
  ) {
    return {
      status: "finished",
      statusName: shortName || "FT"
    };
  }

  if (
    liveStates.includes(shortName) ||
    name.includes("live") ||
    name.includes("in play") ||
    name.includes("in progress")
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
    name.includes("canceled") ||
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

function normalizeMatch(match) {
  const participants = Array.isArray(match.participants)
    ? match.participants
    : [];

  const home = getParticipant(participants, "home");
  const away = getParticipant(participants, "away");

  const scores = Array.isArray(match.scores)
    ? match.scores
    : [];

  const state = match.state || {};

  const status = normalizeStatus(state);

  const startingAt = match.starting_at || "";

  let matchTime = "";

  if (startingAt) {
    const normalizedDate = startingAt.includes("T")
      ? startingAt
      : startingAt.replace(" ", "T");

    matchTime = /Z$|[+-]\d{2}:\d{2}$/.test(normalizedDate)
      ? normalizedDate
      : `${normalizedDate}Z`;
  }

  const timestamp = matchTime
    ? Date.parse(matchTime)
    : NaN;

  const homeScore = getTeamScore(
    scores,
    home,
    "home",
    true
  );

  const awayScore = getTeamScore(
    scores,
    away,
    "away",
    true
  );

  const halfHome = getTeamScore(
    scores,
    home,
    "home",
    false
  );

  const halfAway = getTeamScore(
    scores,
    away,
    "away",
    false
  );

  const league = match.league || {};
  const venue = match.venue || {};

  const round = match.round || {};
  const stage = match.stage || {};
  const group = match.group || {};

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

    minute: null,
    addedTime: null,

    matchTime,
    startingAt: matchTime,

    startingTimestamp: Number.isFinite(timestamp)
      ? Math.floor(timestamp / 1000)
      : null,

    competitionName: league.name || "Football",

    league: {
      id: league.id || match.league_id || "",
      name: league.name || "Football"
    },

    leagueId: league.id || match.league_id || "",

    leagueLogo: league.image_path || "",

    country: league.country?.name || "",

    stageName: getName(stage),
    groupName: getName(group),
    roundName: getName(round),

    venue: venue.name || "Venue unavailable",

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

async function fetchFixtures(apiToken, date, page, signal) {
  const url = new URL(
    `${BASE_URL}/fixtures/date/${encodeURIComponent(date)}`
  );

  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("include", INCLUDE);
  url.searchParams.set("per_page", "50");
  url.searchParams.set("page", String(page));
  url.searchParams.set("timezone", "UTC");

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
      `SportMonks returned HTTP ${response.status}`
    );
  }

  if (!Array.isArray(payload?.data)) {
    throw new Error(
      "Invalid fixtures response from SportMonks."
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

  const apiToken = process.env.SPORTMONKS_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({
      success: false,
      provider: "SportMonks",
      message: "SPORTMONKS_API_TOKEN is missing in Vercel."
    });
  }

  const date = String(req.query?.date || "").trim();

  if (!validDate(date)) {
    return res.status(400).json({
      success: false,
      message: "A valid date is required in YYYY-MM-DD format."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    const allMatches = [];

    let page = 1;
    let hasMore = true;

    // Retrieve paginated fixtures.
    // Maximum of 5 pages per request.
    while (hasMore && page <= 5) {
      const payload = await fetchFixtures(
        apiToken,
        date,
        page,
        controller.signal
      );

      allMatches.push(...payload.data);

      hasMore = Boolean(
        payload?.pagination?.has_more ||
        payload?.meta?.pagination?.has_more
      );

      page++;
    }

    const normalized = allMatches
      .filter(match => match && match.id)
      .map(normalizeMatch)
      .sort((a, b) => {
        const dateA = Date.parse(a.matchTime) || 0;
        const dateB = Date.parse(b.matchTime) || 0;

        return dateA - dateB;
      });

    const competitions = [
      ...new Set(
        normalized.map(match => match.competitionName)
      )
    ];

    return res.status(200).json({
      success: true,
      provider: "SportMonks",
      date,
      total: normalized.length,
      competitions,
      data: normalized
    });

  } catch (error) {
    console.error(
      "SportMonks fixtures error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      provider: "SportMonks",
      message:
        error.name === "AbortError"
          ? "Fixtures request timed out."
          : "Unable to retrieve football fixtures.",
      error: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}