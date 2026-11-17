// OutcomeChad Sports
// Football-Data API — Fixtures
// Endpoint: /api/football/fixtures?date=YYYY-MM-DD
//
// Required Vercel Environment Variable:
// FOOTBALL_DATA_API_TOKEN
const CACHE_SECONDS = 120;
const STALE_SECONDS = 300;
function normalizeMatch(match) {
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const competition = match.competition || {};
  const score = match.score || {};
  const fullTime = score.fullTime || {};
  const halfTime = score.halfTime || {};
  const rawStatus = String(
    match.status || ""
  ).toUpperCase();
  let status = "scheduled";
  if (
    [
      "LIVE",
      "IN_PLAY",
      "PAUSED"
    ].includes(rawStatus)
  ) {
    status = "live";
  } else if (
    [
      "FINISHED",
      "AWARDED"
    ].includes(rawStatus)
  ) {
    status = "finished";
  } else if (
    [
      "POSTPONED",
      "CANCELLED",
      "SUSPENDED",
      "ABANDONED"
    ].includes(rawStatus)
  ) {
    status = "other";
  }
  return {
    id: String(match.id),
    homeName: home.name || "Home",
    awayName: away.name || "Away",
    homeTeamId: home.id || null,
    awayTeamId: away.id || null,
    homeLogo: home.crest || "",
    awayLogo: away.crest || "",
    homeScore: fullTime.home ?? null,
    awayScore: fullTime.away ?? null,
    halfTimeHome: halfTime.home ?? null,
    halfTimeAway: halfTime.away ?? null,
    status,
    statusName: rawStatus,
    matchTime: match.utcDate || "",
    startingAt: match.utcDate || "",
    competitionName:
      competition.name || "Football",
    league: competition.name || "Football",
    leagueId: competition.id || null,
    leagueLogo: competition.emblem || "",
    country: competition.area?.name || "",
    stageName: match.stage || "",
    groupName: match.group || "",
    roundName: match.matchday
      ? `Matchday ${match.matchday}`
      : "",
    venue: match.venue || "",
    homeFormation: null,
    awayFormation: null
  };
}
export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }
  const token =
    process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) {
    return res.status(500).json({
      success: false,
      message: "FOOTBALL_DATA_API_TOKEN is missing in Vercel Environment Variables."
    });
  }
  const date = String(
    req.query?.date || ""
  ).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: "A valid date is required."
    });
  }
  const parsedDate = new Date(
    `${date}T00:00:00.000Z`
  );
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
    const url = new URL(
      "https://api.football-data.org/v4/matches"
    );
    url.searchParams.set("dateFrom", date);
    url.searchParams.set("dateTo", date);
    const response = await fetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          "X-Auth-Token": token,
          "Accept": "application/json"
        },
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(
      () => null
    );
    if (!response.ok) {
      console.error(
        "Football-Data fixtures error:",
        response.status,
        payload
      );
      return res.status(response.status).json({
        success: false,
        provider: "Football-Data",
        message:
          payload?.message ||
          `Football-Data API request failed (${response.status}).`,
        code: response.status
      });
    }
    const matches = Array.isArray(payload?.matches)
      ? payload.matches
      : [];
    const normalized = matches
      .map(normalizeMatch)
      .filter(match =>
        match.homeName !== "Home" &&
        match.awayName !== "Away"
      );
    return res.status(200).json({
      success: true,
      provider: "Football-Data",
      date,
      total: normalized.length,
      data: normalized
    });
  } catch (error) {
    console.error(
      "Football-Data fixtures error:",
      error.message
    );
    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      provider: "Football-Data",
      message:
        error.name === "AbortError"
          ? "Football fixtures request timed out."
          : "Unable to retrieve football fixtures."
    });
  } finally {
    clearTimeout(timeout);
  }
}