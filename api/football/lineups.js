// OutcomeChad Sports
// SportMonks Football API v3 — Match Lineups
// Route: /api/football/lineups?matchId=123
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN

const BASE_URL =
  "https://api.sportmonks.com/v3/football";

const CACHE_SECONDS = 90;
const STALE_SECONDS = 180;

const INCLUDE = [
  "participants",
  "lineups.player",
  "lineups.position",
  "lineups.detailedPosition",
  "formations"
].join(";");

function normalizePlayer(player, teamId) {
  return {
    id: player.player_id || player.id || null,

    team_id: player.team_id || teamId,

    player_name:
      player.player_name ||
      player.player?.display_name ||
      player.player?.name ||
      "Unknown Player",

    jersey_number:
      player.jersey_number ?? null,

    formation_field:
      player.formation_field ?? null,

    formation_position:
      player.formation_position ?? null,

    position:
      player.position?.name ||
      player.detailed_position?.name ||
      "",

    player: {
      id: player.player_id || null,

      name:
        player.player?.display_name ||
        player.player?.name ||
        player.player_name ||
        "Unknown Player",

      display_name:
        player.player?.display_name ||
        player.player?.name ||
        player.player_name ||
        "Unknown Player",

      image_path:
        player.player?.image_path || ""
    }
  };
}

function getFormation(formations, location) {
  const formation = formations.find(
    item =>
      String(item.location || "").toLowerCase() ===
      location
  );

  return formation?.formation || null;
}

function getTeamLineup(players, teamId, typeId) {
  return players
    .filter(player =>
      String(player.team_id) === String(teamId) &&
      Number(player.type_id) === typeId
    )
    .map(player => normalizePlayer(player, teamId))
    .sort((a, b) => {
      const positionA =
        Number(a.formation_position) || 999;

      const positionB =
        Number(b.formation_position) || 999;

      return positionA - positionB;
    });
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
    url.searchParams.set("include", INCLUDE);

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

    const players = Array.isArray(fixture.lineups)
      ? fixture.lineups
      : [];

    const participants = Array.isArray(
      fixture.participants
    )
      ? fixture.participants
      : [];

    const formations = Array.isArray(
      fixture.formations
    )
      ? fixture.formations
      : [];

    const home = participants.find(
      team =>
        String(team.meta?.location).toLowerCase() ===
        "home"
    );

    const away = participants.find(
      team =>
        String(team.meta?.location).toLowerCase() ===
        "away"
    );

    const homeTeamId = home?.id || null;
    const awayTeamId = away?.id || null;

    const homeLineup = homeTeamId
      ? getTeamLineup(players, homeTeamId, 11)
      : [];

    const awayLineup = awayTeamId
      ? getTeamLineup(players, awayTeamId, 11)
      : [];

    const homeBackup = homeTeamId
      ? getTeamLineup(players, homeTeamId, 12)
      : [];

    const awayBackup = awayTeamId
      ? getTeamLineup(players, awayTeamId, 12)
      : [];

    const selectedLineups = [
      ...homeLineup,
      ...awayLineup
    ];

    const expectedLineups = players
      .filter(player => Number(player.type_id) === 11)
      .map(player => ({
        ...normalizePlayer(player, player.team_id),
        team_id: player.team_id
      }));

    const totalPlayers = selectedLineups.length;

    const totalSubstitutes =
      homeBackup.length + awayBackup.length;

    const available =
      totalPlayers > 0 || totalSubstitutes > 0;

    const data = {
      fixtureId: matchId,

      homeTeam: {
        id: homeTeamId,
        name: home?.name || "Home",
        logo: home?.image_path || ""
      },

      awayTeam: {
        id: awayTeamId,
        name: away?.name || "Away",
        logo: away?.image_path || ""
      },

      expectedLineups,

      lineups: players.map(player =>
        normalizePlayer(player, player.team_id)
      ),

      selectedLineups,

      homeLineup,
      awayLineup,

      homeBackup,
      awayBackup,

      homeFormation: getFormation(
        formations,
        "home"
      ),

      awayFormation: getFormation(
        formations,
        "away"
      ),

      lineupType: available
        ? "available"
        : "unavailable",

      totalPlayers,
      totalSubstitutes
    };

    return res.status(200).json({
      success: true,
      provider: "SportMonks",
      matchId,
      available,
      data,

      message: available
        ? "Match lineups retrieved successfully."
        : "Official lineups are not available yet."
    });

  } catch (error) {
    console.error(
      "SportMonks lineups error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      provider: "SportMonks",

      message:
        error.name === "AbortError"
          ? "Lineups request timed out."
          : "Unable to retrieve match lineups.",

      error: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}