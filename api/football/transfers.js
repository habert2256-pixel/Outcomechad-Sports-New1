// OutcomeChad Sports
// SportMonks Football API v3 — Transfer Rumours
// Route: /api/football/transfers
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN
//
// Endpoint:
// /v3/football/transfer-rumours
//
// Includes:
// player;fromTeam;toTeam;type

const BASE_URL =
  "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 300;
const STALE_SECONDS = 300;
const PER_PAGE = 50;
const MAX_PAGES = 5;

function pick(...values) {
  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );
}

function normalizeTeam(team) {
  if (!team || typeof team !== "object") {
    return null;
  }

  return {
    id: team.id ?? null,

    name: pick(
      team.name,
      team.team_name,
      "Unknown club"
    ),

    short_code: team.short_code ?? null,

    image_path: pick(
      team.image_path,
      team.logo,
      team.logo_path,
      team.image,
      null
    )
  };
}

function normalizePlayer(player) {
  if (!player || typeof player !== "object") {
    return null;
  }

  const fullName = [
    player.firstname,
    player.lastname
  ].filter(Boolean).join(" ");

  return {
    id: player.id ?? null,

    name: pick(
      player.display_name,
      player.name,
      fullName,
      "Player information unavailable"
    ),

    display_name: pick(
      player.display_name,
      player.name,
      fullName,
      "Player information unavailable"
    ),

    firstname: player.firstname ?? null,

    lastname: player.lastname ?? null,

    image_path: pick(
      player.image_path,
      player.image,
      player.photo,
      null
    ),

    nationality: player.nationality ?? null
  };
}

function normalizeRumour(item) {
  const player = normalizePlayer(
    item.player
  );

  // SportMonks may return these relationships
  // using lowercase property names.
  const from = normalizeTeam(
    item.fromteam || item.fromTeam
  );

  const to = normalizeTeam(
    item.toteam || item.toTeam
  );

  const type = item.type || {};

  const amount = pick(
    item.amount,
    item.fee,
    null
  );

  const currency = pick(
    item.currency,
    item.currency_code,
    null
  );

  return {
    id: item.id ?? null,

    player_id: item.player_id ?? player?.id ?? null,

    player,

    player_name: pick(
      player?.display_name,
      player?.name,
      item.player_name,
      "Player information unavailable"
    ),

    player_image: pick(
      player?.image_path,
      item.player_image,
      null
    ),

    fromteam: from,

    fromTeam: from,

    from_team_id: item.from_team_id ?? from?.id ?? null,

    from_team_name: from?.name ?? "Not reported",

    toteam: to,

    toTeam: to,

    to_team_id: item.to_team_id ?? to?.id ?? null,

    to_team_name: to?.name ?? "Not reported",

    probability: pick(
      item.probability,
      item.rumour_probability,
      "Not specified"
    ),

    status: pick(
      item.status,
      item.probability,
      "Not specified"
    ),

    amount,

    fee: amount,

    currency,

    currency_code: currency,

    date: item.date ?? null,

    type: {
      id: type.id ?? item.type_id ?? null,

      name: pick(
        type.name,
        type.developer_name,
        "Transfer rumour"
      ),

      code: type.code ?? null
    },

    type_name: pick(
      type.name,
      type.developer_name,
      "Transfer rumour"
    ),

    source_name: pick(
      item.source_name,
      item.source?.name,
      "Source not reported"
    ),

    source_url: pick(
      item.source_url,
      item.source?.url,
      null
    ),

    details: pick(
      item.description,
      item.details,
      null
    ),

    completed: false
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

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {

    const allRumours = [];

    let hasMore = false;

    for (let page = 1; page <= MAX_PAGES; page++) {

      const url = new URL(
        `${BASE_URL}/transfer-rumours`
      );

      url.searchParams.set(
        "api_token",
        apiToken
      );

      url.searchParams.set(
        "include",
        "player;fromTeam;toTeam;type"
      );

      url.searchParams.set(
        "per_page",
        String(PER_PAGE)
      );

      url.searchParams.set(
        "order",
        "desc"
      );

      url.searchParams.set(
        "page",
        String(page)
      );

      const response = await fetch(
        url.toString(),
        {
          method: "GET",

          headers: {
            Accept: "application/json"
          },

          signal: controller.signal
        }
      );

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

      const records = Array.isArray(payload?.data)
        ? payload.data
        : [];

      allRumours.push(
        ...records.map(normalizeRumour)
      );

      hasMore = Boolean(
        payload?.pagination?.has_more ??
        payload?.meta?.pagination?.has_more ??
        false
      );

      if (!hasMore || records.length === 0) {
        break;
      }
    }

    return res.status(200).json({

      success: true,

      provider: "SportMonks",

      type: "transfer-rumours",

      total: allRumours.length,

      hasMore,

      // Main response used by the existing frontend.
      data: allRumours,

      // Compatibility with existing transfer code.
      rumours: allRumours,

      message: allRumours.length
        ? "Transfer rumours retrieved successfully."
        : "No transfer rumours are currently available."

    });

  } catch (error) {

    console.error(
      "SportMonks transfers error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({

      success: false,

      provider: "SportMonks",

      message:
        error.name === "AbortError"
          ? "Transfer request timed out."
          : "Unable to retrieve transfer rumours.",

      error: error.message

    });

  } finally {

    clearTimeout(timeout);

  }
}