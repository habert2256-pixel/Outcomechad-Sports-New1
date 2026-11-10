// OutcomeChad Sports — SportMonks Football Fixtures
// Endpoint: /api/football/fixtures?date=YYYY-MM-DD

const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;

const PER_PAGE = 50;
const MAX_PAGES = 10;

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function getCurrentScores(scores = []) {
  const result = { home: null, away: null };

  for (const item of Array.isArray(scores) ? scores : []) {
    if (
      String(item.description || "").toUpperCase() !== "CURRENT"
    ) {
      continue;
    }

    const score = Array.isArray(item.score)
      ? item.score
      : [item.score];

    for (const entry of score) {
      if (!entry) continue;

      const side = String(entry.participant || "").toLowerCase();

      if (side === "home") {
        result.home = entry.goals ?? null;
      }

      if (side === "away") {
        result.away = entry.goals ?? null;
      }
    }
  }

  return result;
}

function normalizeFixture(fixture) {
  const participants = Array.isArray(fixture.participants)
    ? fixture.participants
    : [];

  const home = participants.find(
    team => String(team.meta?.location).toLowerCase() === "home"
  );

  const away = participants.find(
    team => String(team.meta?.location).toLowerCase() === "away"
  );

  const scores = getCurrentScores(fixture.scores);

  const stateName = String(
    fixture.state?.name ||
    fixture.state?.state ||
    fixture.status ||
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

  // SportMonks may provide formations on the fixture object.
  const formations = fixture.formations || {};

  const homeFormation =
    fixture.home_formation ||
    formations.home ||
    home?.meta?.formation ||
    null;

  const awayFormation =
    fixture.away_formation ||
    formations.away ||
    away?.meta?.formation ||
    null;

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

    competitionName: league.name || "Football",
    league: league.name || "Football",
    leagueId: league.id ?? null,
    leagueLogo: league.image_path || "",
    country: league.country?.name || "",

    venue: fixture.venue?.name || "",
    round: fixture.round?.name || "",

    homeFormation,
    awayFormation
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
      message: "A valid date is required in YYYY-MM-DD format."
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
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const allFixtures = [];
    let hasMore = true;
    let page = 1;

    while (hasMore && page <= MAX_PAGES) {
      const url = new URL(
        `https://api.sportmonks.com/v3/football/fixtures/date/${date}`
      );

      url.searchParams.set("api_token", token);
      url.searchParams.set("per_page", String(PER_PAGE));
      url.searchParams.set("page", String(page));

      url.searchParams.set(
        "include",
        "participants;scores;league;league.country;state;venue;round"
      );

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error(
          "SportMonks fixtures error:",
          response.status,
          payload
        );

        return res.status(response.status).json({
          success: false,
          message:
            payload?.message ||
            "SportMonks fixtures request failed."
        });
      }

      const pageFixtures = getArray(payload);

      allFixtures.push(...pageFixtures);

      hasMore = payload?.pagination?.has_more === true;
      page++;

      if (!hasMore || pageFixtures.length === 0) break;
    }

    const uniqueFixtures = [
      ...new Map(
        allFixtures.map(fixture => [
          String(fixture.id),
          fixture
        ])
      ).values()
    ];

    const matches = uniqueFixtures
      .map(normalizeFixture)
      .filter(match => match.homeName && match.awayName);

    return res.status(200).json({
      success: true,
      data: matches,
      total: matches.length,
      pagesFetched: page - 1,
      hasMorePages: hasMore
    });

  } catch (error) {
    console.error("SportMonks fixtures error:", error.message);

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      message:
        error.name === "AbortError"
          ? "SportMonks fixtures request timed out."
          : "Unable to retrieve football fixtures."
    });

  } finally {
    clearTimeout(timeout);
  }
}