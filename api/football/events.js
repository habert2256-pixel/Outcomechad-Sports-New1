// OutcomeChad Sports
// SportMonks Football API v3 — Match Events
// Route: /api/football/events?matchId=123
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN

const BASE_URL = "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 15;
const STALE_SECONDS = 30;

function normalizeEvent(event) {
  const type = event.type || {};

  return {
    id: event.id,

    fixtureId: event.fixture_id,

    minute: event.minute ?? null,
    extraMinute: event.extra_minute ?? null,

    type: {
      id: event.type_id ?? type.id ?? null,
      name: type.name || "Match event"
    },

    playerId: event.player_id ?? null,
    player_name: event.player_name || "",

    relatedPlayerId: event.related_player_id ?? null,
    related_player_name:
      event.related_player_name || "",

    teamId: event.participant_id ?? null,

    result: event.result || null,
    info: event.info || "",
    addition: event.addition || "",

    rescinded: Boolean(event.rescinded),

    injured: Boolean(event.injured),

    raw: event
  };
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

  const apiToken = process.env.SPORTMONKS_API_TOKEN;

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
      "events.type"
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

    const rawEvents = Array.isArray(fixture.events)
      ? fixture.events
      : [];

    const events = rawEvents
      .map(normalizeEvent)
      .sort((a, b) => {
        const minuteA = Number(a.minute || 0);
        const minuteB = Number(b.minute || 0);

        if (minuteA !== minuteB) {
          return minuteA - minuteB;
        }

        return Number(a.extraMinute || 0) -
          Number(b.extraMinute || 0);
      });

    return res.status(200).json({
      success: true,

      provider: "SportMonks",

      matchId,

      available: events.length > 0,

      total: events.length,

      data: {
        fixtureId: fixture.id,
        events
      },

      events,

      message: events.length
        ? "Match events retrieved successfully."
        : "No match events are currently available."
    });

  } catch (error) {
    console.error(
      "SportMonks match events error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,

      provider: "SportMonks",

      message:
        error.name === "AbortError"
          ? "Match events request timed out."
          : "Unable to retrieve match events.",

      error: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}