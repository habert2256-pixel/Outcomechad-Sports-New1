// OutcomeChad Sports
// SportMonks v3 Match Statistics
// Endpoint: /api/football/stats?matchId=FIXTURE_ID
// Environment variable: SPORTMONKS_API_TOKEN

const CACHE_SECONDS = 15;
const STALE_SECONDS = 30;

function getValue(stat) {
  const candidates = [
    stat?.data?.value,
    stat?.value,
    stat?.data?.total,
    stat?.total,
    stat?.data
  ];

  for (const value of candidates) {
    if (
      value !== null &&
      value !== undefined &&
      typeof value !== "object"
    ) {
      return value;
    }
  }

  return null;
}

function getType(stat) {
  return String(
    stat?.type?.name ||
    stat?.type?.developer_name ||
    stat?.type_name ||
    stat?.name ||
    stat?.type_id ||
    "Other"
  ).trim();
}

function getSide(stat, homeId, awayId) {
  const participantId = String(
    stat?.participant_id ??
    stat?.participant?.id ??
    ""
  );

  if (participantId === homeId) return "home";
  if (participantId === awayId) return "away";

  const location = String(
    stat?.location ||
    stat?.participant?.meta?.location ||
    ""
  ).toLowerCase();

  if (location === "home") return "home";
  if (location === "away") return "away";

  return null;
}

function normalizeStatistics(statistics, homeId, awayId) {
  const grouped = new Map();

  for (const stat of statistics) {
    const name = getType(stat);

    const typeId = String(
      stat?.type_id ||
      stat?.type?.id ||
      name.toLowerCase()
    );

    const side = getSide(stat, homeId, awayId);

    if (!side) continue;

    const key = typeId;

    if (!grouped.has(key)) {
      grouped.set(key, {
        name,
        home: null,
        away: null
      });
    }

    const item = grouped.get(key);
    const value = getValue(stat);

    // Avoid overwriting an existing valid value
    // with an empty duplicate.
    if (
      value !== null &&
      value !== undefined &&
      item[side] === null
    ) {
      item[side] = value;
    }
  }

  return Array.from(grouped.values()).map(item => ({
    type: {
      name: item.name
    },

    home: item.home,
    away: item.away
  }));
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
      message: "Method not allowed"
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      message: "SPORTMONKS_API_TOKEN is not configured."
    });
  }

  const fixtureId = String(
    req.query?.matchId ||
    req.query?.fixtureId ||
    ""
  ).trim();

  if (!/^\d+$/.test(fixtureId)) {
    return res.status(400).json({
      success: false,
      message: "A valid fixture ID is required."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    12000
  );

  try {

    const url = new URL(
      `https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`
    );

    url.searchParams.set("api_token", token);

    url.searchParams.set(
      "include",
      "statistics.type;participants;state"
    );

    const response = await fetch(
      url.toString(),
      {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {

      console.error(
        "SportMonks statistics error:",
        payload
      );

      return res.status(response.status).json({
        success: false,
        message:
          payload?.message ||
          "Could not retrieve match statistics."
      });

    }

    const fixture = payload?.data;

    if (!fixture) {
      return res.status(404).json({
        success: false,
        message: "Fixture not found."
      });
    }

    const participants = Array.isArray(fixture.participants)
      ? fixture.participants
      : [];

    const home = participants.find(
      team =>
        String(team.meta?.location).toLowerCase() === "home"
    );

    const away = participants.find(
      team =>
        String(team.meta?.location).toLowerCase() === "away"
    );

    const homeId = String(home?.id || "");
    const awayId = String(away?.id || "");

    const statistics = Array.isArray(fixture.statistics)
      ? fixture.statistics
      : [];

    const normalized = normalizeStatistics(
      statistics,
      homeId,
      awayId
    );

    return res.status(200).json({

      success: true,

      fixtureId: fixture.id,

      teams: {
        home: {
          id: homeId,
          name: home?.name || "Home"
        },

        away: {
          id: awayId,
          name: away?.name || "Away"
        }
      },

      total: normalized.length,

      statistics: normalized

    });

  } catch (error) {

    console.error(
      "OutcomeChad statistics error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({

      success: false,

      message:
        error.name === "AbortError"
          ? "Statistics request timed out."
          : "Unable to retrieve match statistics."

    });

  } finally {

    clearTimeout(timeout);

  }

}