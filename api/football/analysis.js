// OutcomeChad Sports
// SportMonks Football API
// Handles league competitions and season standings.

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=1800, stale-while-revalidate=3600"
  );

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

  const base =
    "https://api.sportmonks.com/v3/football";

  async function sportmonks(path, params = {}) {
    const url = new URL(base + path);

    url.searchParams.set("api_token", token);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json();

    if (!response.ok) {
      console.error("SportMonks error:", payload);

      throw new Error(
        payload.message ||
        `SportMonks returned ${response.status}`
      );
    }

    return payload;
  }

  try {
    // =================================
    // 1. LOAD COMPETITIONS AND SEASONS
    // =================================

    if (req.query.mode === "leagues") {
      const competitions = [];

      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 20) {
        const payload = await sportmonks("/leagues", {
          include: "country;seasons;currentSeason",
          per_page: "50",
          page: String(page)
        });

        const leagues = Array.isArray(payload.data)
          ? payload.data
          : [];

        for (const league of leagues) {
          const country =
            league.country?.name ||
            league.countryName ||
            "";

          const seasons = Array.isArray(league.seasons)
            ? league.seasons
            : [];

          const currentSeason =
            league.currentSeason ||
            seasons.find(s => s.is_current) ||
            null;

          competitions.push({
            id: league.id,

            name: league.name,

            country,

            logo:
              league.image_path ||
              league.logo ||
              "",

            countryLogo:
              league.country?.image_path ||
              league.countryLogo ||
              "",

            currentSeasonId:
              currentSeason?.id || null,

            seasons: seasons.map(season => ({
              id: season.id,

              name: season.name,

              leagueId: season.league_id,

              startingAt: season.starting_at,

              endingAt: season.ending_at,

              isCurrent: Boolean(season.is_current)
            }))
          });
        }

        hasMore = Boolean(
          payload.pagination?.has_more
        );

        page++;
      }

      return res.status(200).json({
        success: true,
        mode: "leagues",
        data: competitions
      });
    }

    // =================================
    // 2. LOAD SEASON STANDINGS
    // =================================

    const seasonId = String(
      req.query.seasonId || ""
    ).trim();

    if (!/^\d+$/.test(seasonId)) {
      return res.status(400).json({
        success: false,
        message: "A valid seasonId is required."
      });
    }

    const payload = await sportmonks(
      `/standings/seasons/${seasonId}`,
      {
        include: "participant;details;form"
      }
    );

    const standings = Array.isArray(payload.data)
      ? payload.data
      : [];

    // Extract statistics from SportMonks details.

    function getDetail(details, keywords) {
      const item = details.find(detail => {
        const name = String(
          detail.type?.name || ""
        ).toLowerCase();

        return keywords.some(keyword =>
          name.includes(keyword)
        );
      });

      return item?.value ?? null;
    }

    const table = standings.map(item => {
      const details = Array.isArray(item.details)
        ? item.details
        : [];

      const participant = item.participant || {};

      const form = Array.isArray(item.form)
        ? item.form
            .map(x => {
              const value =
                typeof x === "string"
                  ? x
                  : x.form || x.result || "";

              return String(value).charAt(0).toUpperCase();
            })
            .join("")
        : typeof item.form === "string"
          ? item.form
          : "";

      return {
        position: item.position,

        team:
          participant.name ||
          item.name ||
          "Unknown club",

        logo:
          participant.image_path ||
          "",

        played: getDetail(details, [
          "matched played"
        ]),

        won: getDetail(details, [
          "overall won",
          "won"
        ]),

        drawn: getDetail(details, [
          "overall draw",
          "drawn"
        ]),

        lost: getDetail(details, [
          "overall lost",
          "lost"
        ]),

        goalsFor: getDetail(details, [
          "goals scored",
          "goals for"
        ]),

        goalsAgainst: getDetail(details, [
          "goals conceded",
          "goals against"
        ]),

        goalDifference: getDetail(details, [
          "goal difference"
        ]),

        points: item.points,

        form
      };
    });

    return res.status(200).json({
      success: true,

      mode: "standings",

      seasonId,

      count: table.length,

      data: table
    });

  } catch (error) {
    console.error(
      "OutcomeChad SportMonks API:",
      error
    );

    return res.status(502).json({
      success: false,

      message: "Could not retrieve SportMonks data.",

      error: error.message
    });
  }
}