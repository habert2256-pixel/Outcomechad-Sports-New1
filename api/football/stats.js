// OutcomeChad Sports
// SportMonks Football API v3 — Match Statistics
// Route: /api/football/stats?matchId=123
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN
//
// SportMonks endpoint:
// /v3/football/fixtures/{fixture_id}
// Include: statistics.type

const BASE_URL =
  "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 30;
const STALE_SECONDS = 30;

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeStatistics(statistics) {
  if (!Array.isArray(statistics)) {
    return [];
  }

  const grouped = new Map();

  for (const item of statistics) {
    const typeId = item.type_id ?? item.type?.id;
    const typeName =
      item.type?.name ||
      item.name ||
      `Statistic ${typeId ?? ""}`;

    const key = String(typeId ?? typeName);

    if (!grouped.has(key)) {
      grouped.set(key, {
        typeId: typeId ?? null,
        type: {
          name: typeName
        },
        home: null,
        away: null
      });
    }

    const entry = grouped.get(key);

    const value = numberOrNull(
      item.data?.value ??
      item.value
    );

    const location = String(
      item.location || ""
    ).toLowerCase();

    if (location === "home") {
      entry.home = value;
    }

    if (location === "away") {
      entry.away = value;
    }
  }

  return Array.from(grouped.values());
}

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  const apiToken =
    process.env.SPORTMONKS_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({
      success: false,
      provider: "SportMonks",
      message:
        "SPORTMONKS_API_TOKEN is missing in Vercel."
    });
  }

  const matchId = String(
    req.query?.matchId || ""
  ).trim();

  if (!/^\d+$/.test(matchId)) {
    return res.status(400).json({
      success: false,
      message: "A valid SportMonks matchId is required."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const url = new URL(
      `${BASE_URL}/fixtures/${encodeURIComponent(matchId)}`
    );

    url.searchParams.set("api_token", apiToken);

    url.searchParams.set(
      "include",
      "statistics.type"
    );

    const response = await fetch(url.toString(), {
      method: "GET",

      headers: {
        Accept: "application/json"
      },

      signal: controller.signal
    });

    const payload = await response.json().catch(
      () => null
    );

    if (!response.ok) {
      throw new Error(
        payload?.message ||
        payload?.error?.message ||
        `SportMonks returned HTTP ${response.status}`
      );
    }

    const fixture = payload?.data;

    if (
      !fixture ||
      String(fixture.id) !== matchId
    ) {
      return res.status(404).json({
        success: false,
        provider: "SportMonks",
        matchId,
        message: "Match was not found."
      });
    }

    const rawStatistics = Array.isArray(
      fixture.statistics
    )
      ? fixture.statistics
      : [];

    const statistics = normalizeStatistics(
      rawStatistics
    );

    return res.status(200).json({
      success: true,

      provider: "SportMonks",

      matchId,

      available: statistics.length > 0,

      total: statistics.length,

      data: {
        matchId,

        fixture: {
          id: fixture.id,
          name: fixture.name || "",
          startingAt: fixture.starting_at || "",
          state: fixture.state || null
        },

        statistics
      },

      statistics,

      message:
        statistics.length > 0
          ? "Match statistics retrieved successfully."
          : "No match statistics are currently available."
    });

  } catch (error) {
    console.error(
      "SportMonks match statistics error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,

      provider: "SportMonks",

      message:
        error.name === "AbortError"
          ? "Statistics request timed out."
          : "Unable to retrieve match statistics.",

      error: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}