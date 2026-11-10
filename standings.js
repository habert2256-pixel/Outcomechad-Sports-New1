// OutcomeChad Sports
// SportMonks Football Standings API
// File: api/football/standings.js
//
// Endpoints:
// /api/football/standings?mode=leagues
// /api/football/standings?mode=seasons&leagueId=LEAGUE_ID
// /api/football/standings?seasonId=SEASON_ID

const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;

const BASE_URL = "https://api.sportmonks.com/v3/football";

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function getNumber(value) {
  if (value === null || value === undefined) return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeSeason(season) {
  if (!season || !season.id) return null;

  return {
    id: season.id,
    name: season.name || season.id,
    leagueId: season.league_id || null,
    startingAt: season.starting_at || null,
    endingAt: season.ending_at || null,
    isCurrent: Boolean(season.is_current),
    finished: Boolean(season.finished),
    pending: Boolean(season.pending)
  };
}

function normalizeLeague(league) {
  const currentSeason =
    league.currentSeason ||
    league.currentseason ||
    league.current_season ||
    null;

  const rawSeasons = getArray(league.seasons);

  const seasons = rawSeasons
    .map(normalizeSeason)
    .filter(Boolean);

  const current = normalizeSeason(currentSeason);

  if (
    current &&
    !seasons.some(s => String(s.id) === String(current.id))
  ) {
    seasons.push(current);
  }

  return {
    id: league.id,
    name: league.name || "Unknown Competition",

    logo: league.image_path || "",

    countryId: league.country_id || null,

    countryName:
      league.country?.name || "International",

    countryLogo:
      league.country?.image_path || "",

    currentSeason: current,

    seasons: seasons.sort((a, b) =>
      String(b.startingAt || "").localeCompare(
        String(a.startingAt || "")
      )
    )
  };
}

function getDetail(details, names) {
  if (!Array.isArray(details)) return null;

  const item = details.find(detail => {
    const name = String(
      detail.type?.name ||
      detail.type?.developer_name ||
      detail.name ||
      ""
    ).toLowerCase();

    return names.some(target => name.includes(target));
  });

  return item ? getNumber(item.value) : null;
}

function normalizeStanding(row) {
  const team = row.participant || {};

  const details = Array.isArray(row.details)
    ? row.details
    : [];

  const played = getDetail(details, [
    "matched played",
    "matches played",
    "played"
  ]);

  const wins = getDetail(details, [
    "overall won",
    "won"
  ]);

  const draws = getDetail(details, [
    "overall draw",
    "draw"
  ]);

  const losses = getDetail(details, [
    "overall lost",
    "lost"
  ]);

  const goalsFor = getDetail(details, [
    "goals scored",
    "goals for"
  ]);

  const goalsAgainst = getDetail(details, [
    "goals conceded",
    "goals against"
  ]);

  let goalDifference = getDetail(details, [
    "goal difference"
  ]);

  if (
    goalDifference === null &&
    goalsFor !== null &&
    goalsAgainst !== null
  ) {
    goalDifference = goalsFor - goalsAgainst;
  }

  return {
    id: row.id,

    position: getNumber(row.position),

    teamId: row.participant_id || team.id || null,

    team: team.name || "Unknown Team",

    logo: team.image_path || "",

    played,

    won: wins,

    drawn: draws,

    lost: losses,

    goalsFor,

    goalsAgainst,

    goalDifference,

    points: getNumber(row.points),

    form:
      row.form ||
      row.form_string ||
      "",

    result: row.result || "",

    groupId: row.group_id || null,

    groupName: row.group?.name || null
  };
}

async function sportmonks(path, token, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);

  url.searchParams.set("api_token", token);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15000)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.message ||
      `SportMonks returned HTTP ${response.status}`
    );

    error.status = response.status;

    throw error;
  }

  return payload || {};
}

async function getLeagues(token, countryId) {
  const leagues = [];

  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 20) {
    const payload = await sportmonks(
      "/leagues",
      token,
      {
        include: "country;currentSeason;seasons",
        per_page: 50,
        page
      }
    );

    const currentPage = getArray(payload);

    leagues.push(...currentPage);

    hasMore =
      payload.pagination?.has_more === true;

    if (!currentPage.length) break;

    page++;
  }

  let normalized = leagues
    .map(normalizeLeague)
    .filter(league => league.id);

  if (countryId) {
    normalized = normalized.filter(
      league =>
        String(league.countryId) === String(countryId)
    );
  }

  normalized.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const countries = [
    ...new Map(
      normalized.map(league => [
        String(league.countryId || "international"),
        {
          id: league.countryId,
          name: league.countryName,
          logo: league.countryLogo
        }
      ])
    ).values()
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    leagues: normalized,
    countries,
    total: normalized.length
  };
}

async function getSeasons(token, leagueId) {
  const payload = await sportmonks(
    `/leagues/${leagueId}`,
    token,
    {
      include: "country;currentSeason;seasons"
    }
  );

  const league = normalizeLeague(payload.data || {});

  return {
    league,
    seasons: league.seasons
  };
}

async function getStandings(token, seasonId) {
  const payload = await sportmonks(
    `/standings/seasons/${seasonId}`,
    token,
    {
      include: "participant;league;season;stage;group;details;form",
      per_page: 50
    }
  );

  const standings = getArray(payload)
    .map(normalizeStanding)
    .sort((a, b) => {
      if (a.groupName !== b.groupName) {
        return String(a.groupName || "").localeCompare(
          String(b.groupName || "")
        );
      }

      return (a.position ?? 999) - (b.position ?? 999);
    });

  return {
    seasonId,
    standings,
    total: standings.length
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

  const mode = String(
    req.query?.mode || ""
  ).trim().toLowerCase();

  const seasonId = String(
    req.query?.seasonId || ""
  ).trim();

  const leagueId = String(
    req.query?.leagueId || ""
  ).trim();

  const countryId = String(
    req.query?.countryId || ""
  ).trim();

  try {
    // 1. Load available competitions and countries.
    if (mode === "leagues") {
      const result = await getLeagues(
        token,
        countryId
      );

      return res.status(200).json({
        success: true,
        mode: "leagues",
        data: result.leagues,
        countries: result.countries,
        total: result.total
      });
    }

    // 2. Load seasons for a selected competition.
    if (mode === "seasons") {
      if (!/^\d+$/.test(leagueId)) {
        return res.status(400).json({
          success: false,
          message: "A valid leagueId is required."
        });
      }

      const result = await getSeasons(
        token,
        leagueId
      );

      return res.status(200).json({
        success: true,
        mode: "seasons",
        data: result.seasons,
        league: result.league
      });
    }

    // 3. Load standings for a selected season.
    if (!/^\d+$/.test(seasonId)) {
      return res.status(400).json({
        success: false,
        message: "A valid seasonId is required."
      });
    }

    const result = await getStandings(
      token,
      seasonId
    );

    return res.status(200).json({
      success: true,
      mode: "standings",
      data: result.standings,
      seasonId: result.seasonId,
      total: result.total
    });

  } catch (error) {
    console.error(
      "OutcomeChad Standings API error:",
      error.message
    );

    return res.status(
      error.status || (
        error.name === "TimeoutError" ||
        error.name === "AbortError"
          ? 504
          : 502
      )
    ).json({
      success: false,
      message: error.message ||
        "Unable to retrieve football standings."
    });
  }
}