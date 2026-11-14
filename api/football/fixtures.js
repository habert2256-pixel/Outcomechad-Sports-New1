// OutcomeChad Sports — Enhanced SportMonks Fixtures
// Endpoint: /api/football/fixtures?date=YYYY-MM-DD

const CACHE_SECONDS = 120;
const STALE_SECONDS = 300;
const PER_PAGE = 50;
const MAX_PAGES = 10;

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function getCurrentScores(scores = []) {
  const result = { home: null, away: null };

  for (const item of scores) {
    if (
      String(item.description || "").toUpperCase() !== "CURRENT"
    ) continue;

    const score = Array.isArray(item.score)
      ? item.score
      : [item.score];

    for (const entry of score) {
      if (!entry) continue;

      const side = String(entry.participant || "").toLowerCase();

      if (side === "home") result.home = entry.goals ?? null;
      if (side === "away") result.away = entry.goals ?? null;
    }
  }

  return result;
}

function normalizeFixture(fixture) {
  const participants = Array.isArray(fixture.participants)
    ? fixture.participants
    : [];

  const home = participants.find(
    p => String(p.meta?.location).toLowerCase() === "home"
  );

  const away = participants.find(
    p => String(p.meta?.location).toLowerCase() === "away"
  );

  const scores = getCurrentScores(fixture.scores);

  const stateName = String(
    fixture.state?.name ||
    fixture.state?.state ||
    ""
  );

  const state = stateName.toLowerCase();

  let status = "scheduled";

  if (
    /finished|full.?time|after.?extra.?time|after.?penalties|ended|\bft\b/.test(state)
  ) {
    status = "finished";
  } else if (
    /in.?play|live|1st half|2nd half|half.?time|extra.?time|penalt|playing/.test(state)
  ) {
    status = "live";
  } else if (
    /cancel|postpon|abandon|suspend/.test(state)
  ) {
    status = "other";
  }

  const league = fixture.league || {};
  const group = fixture.group || {};
  const stage = fixture.stage || {};
  const round = fixture.round || {};

  const formations = fixture.formations || [];

  let homeFormation = null;
  let awayFormation = null;

  if (Array.isArray(formations)) {
    homeFormation = formations.find(
      f => String(f.location).toLowerCase() === "home"
    )?.formation || null;

    awayFormation = formations.find(
      f => String(f.location).toLowerCase() === "away"
    )?.formation || null;
  }

  return {
    id: String(fixture.id),

    homeName: home?.name || "Home",
    awayName: away?.name || "Away",

    homeTeamId: home?.id ?? null,
    awayTeamId: away?.id ?? null,

    homeLogo: home?.image_path || "",
    awayLogo: away?.image_path || "",

    homeScore: scores.home,
    awayScore: scores.away,

    status,
    statusName: stateName,

    matchTime: fixture.starting_at || "",
    startingAt: fixture.starting_at || "",
    startingTimestamp: fixture.starting_at_timestamp || null,

    competitionName: league.name || "Football",
    league: league.name || "Football",
    leagueId: league.id ?? null,
    leagueLogo: league.image_path || "",

    country: league.country?.name || "",

    stageName: stage.name || "",
    stageId: stage.id ?? null,

    groupName: group.name || "",
    groupId: group.id ?? null,

    roundName: round.name || "",
    round: round.name || "",

    venue: fixture.venue?.name || "",

    homeFormation:
      homeFormation ||
      fixture.home_formation ||
      home?.meta?.formation ||
      null,

    awayFormation:
      awayFormation ||
      fixture.away_formation ||
      away?.meta?.formation ||
      null
  };
}

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      message: "SPORTMONKS_API_TOKEN is missing in Vercel."
    });
  }

  const date = String(req.query?.date || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: "A valid date is required."
    });
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid calendar date."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {

    const allFixtures = [];

    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {

      const url = new URL(
        `https://api.sportmonks.com/v3/football/fixtures/date/${date}`
      );

      url.searchParams.set("api_token", token);
      url.searchParams.set("per_page", String(PER_PAGE));
      url.searchParams.set("page", String(page));

      url.searchParams.set(
        "include",
        "participants;scores;league;league.country;state;venue;round;stage;group;formations"
      );

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {

        console.error("SportMonks fixtures error:", payload);

        return res.status(response.status).json({
          success: false,
          message:
            payload?.message ||
            "SportMonks fixtures request failed."
        });

      }

      const fixtures = getArray(payload);

      allFixtures.push(...fixtures);

      hasMore = payload?.pagination?.has_more === true;

      page++;

      if (!fixtures.length) break;

    }

    const unique = [
      ...new Map(
        allFixtures.map(f => [String(f.id), f])
      ).values()
    ];

    const matches = unique
      .map(normalizeFixture)
      .filter(m => m.homeName && m.awayName);

    return res.status(200).json({
      success: true,
      provider: "SportMonks",
      date,
      total: matches.length,
      pagesFetched: page - 1,
      hasMorePages: hasMore,
      data: matches
    });

  } catch (error) {

    console.error("Fixtures error:", error.message);

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      message: error.name === "AbortError"
        ? "Fixtures request timed out."
        : "Unable to retrieve football fixtures."
    });

  } finally {
    clearTimeout(timeout);
  }

}