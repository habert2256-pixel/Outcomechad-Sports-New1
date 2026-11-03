// OutcomeChad Sports — Sportmonks Football Fixtures
// Endpoint: /api/football/fixtures?date=YYYY-MM-DD
// SPORTMONKS_API_TOKEN must be configured in Vercel Environment Variables.

const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;
const MAX_PAGES = 25; // safety limit

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function getCurrentScores(scores = []) {
  const result = { home: null, away: null };

  for (const item of Array.isArray(scores) ? scores : []) {
    if (String(item.description || "").toUpperCase() !== "CURRENT") continue;

    const score = Array.isArray(item.score) ? item.score : [item.score];

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
  const participants = Array.isArray(fixture.participants) ? fixture.participants : [];

  const home = participants.find(
    (team) => String(team.meta?.location).toLowerCase() === "home"
  );
  const away = participants.find(
    (team) => String(team.meta?.location).toLowerCase() === "away"
  );

  const scores = getCurrentScores(fixture.scores);

  const stateName = String(
    fixture.state?.name || fixture.state?.state || fixture.status || ""
  ).toLowerCase();

  let status = "NS";
  if (["inplay", "live", "1st half", "2nd half", "halftime", "ht", "et", "pen"].some(s => stateName.includes(s))) {
    status = "LIVE";
  } else if (["ft", "finished", "aet", "penalties", "after penalties"].some(s => stateName.includes(s))) {
    status = "FT";
  } else if (["postponed", "cancelled", "abandoned", "suspended"].some(s => stateName.includes(s))) {
    status = "POSTP";
  }

  return {
    id: fixture.id,
    homeName: home?.name || home?.short_code || "TBD",
    awayName: away?.name || away?.short_code || "TBD",
    homeLogo: home?.image_path || null,
    awayLogo: away?.image_path || null,
    homeScore: scores.home,
    awayScore: scores.away,
    status,
    state: stateName,
    league: fixture.league?.name || "Unknown",
    leagueId: fixture.league?.id || null,
    leagueLogo: fixture.league?.image_path || null,
    country: fixture.league?.country?.name || null,
    venue: fixture.venue?.name || null,
    startingAt: fixture.starting_at || fixture.starting_at_timestamp || null,
    minute: fixture.time?.minute || fixture.minute || null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`);
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    return res.status(500).json({
      success: false,
      message: "SPORTMONKS_API_TOKEN is missing in Vercel.",
    });
  }

  const date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: "Invalid calendar date. Use YYYY-MM-DD",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    let allFixtures = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      const url = new URL(`https://api.sportmonks.com/v3/football/fixtures/date/${date}`);
      url.searchParams.set("api_token", token);
      url.searchParams.set("include", "participants;scores;league;state;venue;league.country");
      url.searchParams.set("page", page);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Sportmonks fixtures error:", response.status, payload);
        return res.status(response.status).json({
          success: false,
          message: payload?.message || "Sportmonks fixtures request failed.",
        });
      }

      const pageFixtures = getArray(payload);
      allFixtures = allFixtures.concat(pageFixtures);

      hasMore = Boolean(payload?.pagination?.has_more);
      page += 1;
    }

    const matches = allFixtures
      .map(normalizeFixture)
      .filter((m) => m.homeName && m.awayName && m.homeName !== "TBD");

    return res.status(200).json({
      success: true,
      data: matches,
      total: matches.length,
      pages: page - 1,
    });
  } catch (error) {
    console.error("Sportmonks fixtures error:", error.message);
    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message:
        error.name === "AbortError"
          ? "Sportmonks fixtures request timed out."
          : "Unable to retrieve football fixtures.",
    });
  } finally {
    clearTimeout(timeout);
  }
}