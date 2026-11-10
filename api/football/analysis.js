// OutcomeChad Sports
// Combined iSports Analysis + SportMonks Standings API
// File: api/football/analysis.js

const SPORTMONKS_BASE =
  "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 300;

const MAX_PAGES = 10;

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function validId(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

async function sportmonks(path, token, params = {}) {
  const url = new URL(`${SPORTMONKS_BASE}${path}`);

  url.searchParams.set("api_token", token);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
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

// -------------------------
// Normalize competitions
// -------------------------

function normalizeSeason(season) {
  if (!season?.id) return null;

  return {
    id: season.id,
    name: season.name || String(season.id),
    leagueId: season.league_id || null,
    startingAt: season.starting_at || null,
    endingAt: season.ending_at || null,
    isCurrent: Boolean(season.is_current)
  };
}

function normalizeLeague(league) {
  const currentSeason =
    league.currentSeason ||
    league.currentseason ||
    league.current_season ||
    null;

  const seasons = getArray(league.seasons)
    .map(normalizeSeason)
    .filter(Boolean);

  const current = normalizeSeason(currentSeason);

  if (
    current &&
    !seasons.some(
      season => String(season.id) === String(current.id)
    )
  ) {
    seasons.unshift(current);
  }

  return {
    id: league.id,
    name: league.name || "Unknown Competition",
    logo: league.image_path || "",
    countryId: league.country_id || null,
    countryName: league.country?.name || "International",
    countryLogo: league.country?.image_path || "",
    currentSeason: current,
    seasons
  };
}

// -------------------------
// Get competitions
// -------------------------

async function getLeagues(token) {
  const leagues = [];

  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES) {
    const payload = await sportmonks(
      "/leagues",
      token,
      {
        include: "country;currentSeason",
        per_page: 50,
        page
      }
    );

    const items = getArray(payload);

    leagues.push(...items);

    hasMore = payload.pagination?.has_more === true;

    if (!items.length) break;

    page++;
  }

  const normalized = [
    ...new Map(
      leagues.map(league => [
        String(league.id),
        normalizeLeague(league)
      ])
    ).values()
  ].sort((a, b) => a.name.localeCompare(b.name));

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
    countries
  };
}

// -------------------------
// Get competition seasons
// -------------------------

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

// -------------------------
// Normalize standings
// -------------------------

function getStat(details, names) {
  if (!Array.isArray(details)) return null;

  const found = details.find(detail => {
    const name = String(
      detail.type?.name ||
      detail.type?.developer_name ||
      detail.name ||
      ""
    ).toLowerCase();

    return names.some(target => name.includes(target));
  });

  if (!found) return null;

  const number = Number(found.value);

  return Number.isFinite(number) ? number : null;
}

function normalizeStanding(row) {
  const team = row.participant || {};
  const details = row.details || [];

  const played = getStat(details, ["played"]);
  const won = getStat(details, ["won"]);
  const drawn = getStat(details, ["draw"]);
  const lost = getStat(details, ["lost"]);

  const goalsFor = getStat(details, [
    "goals scored",
    "goals for"
  ]);

  const goalsAgainst = getStat(details, [
    "goals conceded",
    "goals against"
  ]);

  let goalDifference = getStat(details, [
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
    position: row.position ?? null,
    teamId: row.participant_id || team.id || null,
    team: team.name || "Unknown Team",
    logo: team.image_path || "",
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference,
    points: row.points ?? null,
    form: row.form || "",
    groupId: row.group_id || null,
    groupName: row.group?.name || null
  };
}

// -------------------------
// Get league standings
// -------------------------

async function getStandings(token, seasonId) {
  const payload = await sportmonks(
    `/standings/seasons/${seasonId}`,
    token,
    {
      include: "participant;details;group",
      per_page: 50
    }
  );

  const standings = getArray(payload)
    .map(normalizeStanding)
    .sort(
      (a, b) =>
        (a.position ?? 999) - (b.position ?? 999)
    );

  return standings;
}

// -------------------------
// Existing iSports analysis
// -------------------------

async function getAnalysis(matchId) {
  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "ISPORTS_API_KEY is missing in Vercel."
    );
    error.status = 500;
    throw error;
  }

  const baseUrl =
    process.env.ISPORTS_FOOTBALL_ANALYSIS_URL ||
    "https://api.isportsapi.com/sport/football/analysis";

  const url = new URL(baseUrl);

  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("matchId", matchId);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json().catch(() => null);

  if (!data) {
    const error = new Error(
      "iSports returned invalid JSON."
    );
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      "iSports analysis request failed."
    );
    error.status = response.status;
    throw error;
  }

  if (
    data.code !== undefined &&
    Number(data.code) !== 0
  ) {
    const error = new Error(
      "iSports rejected the analysis request."
    );
    error.status = 502;
    throw error;
  }

  return data;
}

// -------------------------
// Main API handler
// -------------------------

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const mode = String(req.query?.mode || "").toLowerCase();

  const matchId = String(req.query?.matchId || "");
  const leagueId = String(req.query?.leagueId || "");
  const seasonId = String(req.query?.seasonId || "");

  try {
    // Preserve existing match analysis.
    if (
      mode === "analysis" ||
      (!mode && matchId)
    ) {
      if (!matchId) {
        return res.status(400).json({
          success: false,
          message: "A valid matchId is required."
        });
      }

      const result = await getAnalysis(matchId);

      return res.status(200).json(result);
    }

    const token = process.env.SPORTMONKS_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        message:
          "SPORTMONKS_API_TOKEN is missing in Vercel."
      });
    }

    // List competitions.
    if (mode === "leagues") {
      const result = await getLeagues(token);

      return res.status(200).json({
        success: true,
        mode: "leagues",
        data: result.leagues,
        countries: result.countries,
        total: result.leagues.length
      });
    }

    // List seasons.
    if (mode === "seasons") {
      if (!validId(leagueId)) {
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

    // League standings.
    if (seasonId) {
      if (!validId(seasonId)) {
        return res.status(400).json({
          success: false,
          message: "A valid seasonId is required."
        });
      }

      const standings = await getStandings(
        token,
        seasonId
      );

      return res.status(200).json({
        success: true,
        mode: "standings",
        seasonId,
        data: standings,
        total: standings.length
      });
    }

    return res.status(400).json({
      success: false,
      message:
        "Provide mode=leagues, mode=seasons with leagueId, seasonId, or matchId."
    });

  } catch (error) {
    console.error(
      "OutcomeChad Football API:",
      error.message
    );

    return res.status(error.status || 502).json({
      success: false,
      message: error.message ||
        "Football API request failed."
    });
  }
}