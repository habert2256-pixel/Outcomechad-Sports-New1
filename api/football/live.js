// OutcomeChad Sports — Sportmonks Football Live Scores
// Endpoint: /api/football/live
// SPORTMONKS_API_TOKEN must be configured in Vercel Environment Variables.

const CACHE_SECONDS = 15;
const STALE_SECONDS = 30;

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

  let status = "LIVE";
  if (["ft", "finished", "aet", "penalties"].some(s => stateName.includes(s))) {
    status = "FT";
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
    startingAt: fixture.starting_at || null,
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const url = new URL("https://api.sportmonks.com/v3/football/livescores/inplay");
    url.searchParams.set("api_token", token);
    url.searchParams.set("include", "participants;scores;league;state;venue;league.country");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Sportmonks live-score error:", response.status, payload);
      return res.status(response.status).json({
        success: false,
        message: payload?.message || "Sportmonks live-score request failed.",
      });
    }

    const matches = getArray(payload)
      .map(normalizeFixture)
      .filter((m) => m.homeName && m.awayName);

    return res.status(200).json({
      success: true,
      data: matches,
      total: matches.length,
    });
  } catch (error) {
    console.error("Sportmonks live-score error:", error.message);
    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message:
        error.name === "AbortError"
          ? "Sportmonks live-score request timed out."
          : "Unable to connect to Sportmonks.",
    });
  } finally {
    clearTimeout(timeout);
  }
}