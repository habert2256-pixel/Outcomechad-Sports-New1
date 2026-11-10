// OutcomeChad Sports — SportMonks Standings API
// GET /api/football/standings?mode=leagues
// GET /api/football/standings?seasonId=12345

const CACHE_SECONDS = 600;
const STALE_SECONDS = 1200;
const PER_PAGE = 50;
const MAX_PAGES = 10;

function getArray(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function sportmonks(path, token, params = {}) {
  const url = new URL(
    `https://api.sportmonks.com/v3/football/${path}`
  );

  url.searchParams.set("api_token", token);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.message || `SportMonks returned ${response.status}`
    );
  }

  return payload;
}

function getDetail(details, pattern) {
  const item = (details || []).find(x => {
    const name = String(
      x.type?.name || x.type_name || ""
    ).toLowerCase();

    return pattern.test(name);
  });

  return item?.value ?? null;
}

function normalizeStanding(item) {
  const details = item.details || [];
  const team = item.participant || {};

  return {
    id: item.id,
    position: item.position ?? null,

    team: team.name || "Unknown club",
    teamId: team.id || item.participant_id || null,
    logo: team.image_path || "",

    played: getDetail(details, /matched played|matches played/),
    won: getDetail(details, /overall won|matches won/),
    drawn: getDetail(details, /overall draw|matches draw/),
    lost: getDetail(details, /overall lost|matches lost/),

    goalsFor: getDetail(details, /goals scored|overall goals scored|goals for/),
    goalsAgainst: getDetail(details, /goals conceded|overall goals conceded|goals against/),

    goalDifference: getDetail(details, /goal difference/),
    points: item.points ?? null,

    form: item.form || "",
    league: item.league?.name || "",
    season: item.season?.name || ""
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
      message: "SPORTMONKS_API_TOKEN is missing."
    });
  }

  try {
    const mode = String(req.query?.mode || "");
    const seasonId = String(req.query?.seasonId || "").trim();

    // Retrieve competitions and their available seasons.
    if (mode === "leagues") {
      let leagues = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        const payload = await sportmonks("leagues", token, {
          include: "country;currentSeason;seasons",
          per_page: PER_PAGE,
          page
        });

        const items = getArray(payload);

        leagues.push(...items);

        if (payload.pagination?.has_more !== true) break;
        if (!items.length) break;
      }

      const result = leagues
        .filter(x => x.currentSeason?.id || x.seasons?.length)
        .map(x => ({
          id: x.id,
          name: x.name,
          country: x.country?.name || "",
          logo: x.image_path || "",
          currentSeasonId: x.currentSeason?.id || null,
          currentSeasonName: x.currentSeason?.name || "",
          seasons: (x.seasons || []).map(s => ({
            id: s.id,
            name: s.name
          }))
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return res.status(200).json({
        success: true,
        data: result,
        total: result.length
      });
    }

    // Retrieve standings for a selected season.
    if (!/^\d+$/.test(seasonId)) {
      return res.status(400).json({
        success: false,
        message: "A valid seasonId is required."
      });
    }

    const payload = await sportmonks(
      `standings/seasons/${seasonId}`,
      token,
      {
        include: "participant;league;season;details.type;form"
      }
    );

    const standings = getArray(payload)
      .map(normalizeStanding)
      .sort((a, b) => {
        const ap = Number(a.position);
        const bp = Number(b.position);

        return ap - bp;
      });

    return res.status(200).json({
      success: true,
      seasonId,
      data: standings,
      total: standings.length
    });

  } catch (error) {
    console.error("OutcomeChad standings error:", error);

    return res.status(
      error.name === "TimeoutError" ? 504 : 502
    ).json({
      success: false,
      message: error.message || "Unable to retrieve standings."
    });
  }
}