// OutcomeChad Sports
// SportMonks Football Lineups & Formations API
// Endpoint: /api/football/lineups?matchId=FIXTURE_ID

const CACHE_SECONDS = 120;
const STALE_SECONDS = 300;

function getArray(value) {
  if (Array.isArray(value)) return value;

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
}

function normalizePlayer(player, expected = false) {
  return {
    id: player.id ?? null,

    fixture_id:
      player.fixture_id ??
      player.fixtureId ??
      null,

    player_id:
      player.player_id ??
      player.player?.id ??
      null,

    team_id:
      player.team_id ??
      player.participant_id ??
      player.team?.id ??
      null,

    player_name:
      player.player_name ??
      player.player?.display_name ??
      player.player?.name ??
      player.name ??
      "Unknown Player",

    jersey_number:
      player.jersey_number ??
      player.player?.jersey_number ??
      player.number ??
      null,

    formation_field:
      player.formation_field ??
      player.formationField ??
      null,

    formation_position:
      player.formation_position ??
      player.formationPosition ??
      null,

    position_id:
      player.position_id ??
      null,

    type_id:
      player.type_id ??
      null,

    is_expected: expected,

    player: player.player ?? null,

    position: player.position ?? null,

    detailedPosition:
      player.detailedPosition ??
      player.detailed_position ??
      null
  };
}

function getFormationName(formations, teamId, location) {
  if (!Array.isArray(formations)) {
    formations = formations
      ? Object.values(formations)
      : [];
  }

  const formation = formations.find(item => {
    const id = String(
      item.participant_id ??
      item.team_id ??
      item.participant?.id ??
      ""
    );

    return id === String(teamId);
  });

  return formation?.formation_name ??
    formation?.formation ??
    formation?.name ??
    null;
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
      error: "Method not allowed"
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  const matchId = String(
    req.query?.matchId || ""
  ).trim();

  if (!token) {
    return res.status(500).json({
      success: false,
      error: "SPORTMONKS_API_TOKEN is not configured"
    });
  }

  if (!/^\d+$/.test(matchId)) {
    return res.status(400).json({
      success: false,
      error: "A valid matchId is required"
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    15000
  );

  try {
    const url = new URL(
      `https://api.sportmonks.com/v3/football/fixtures/${matchId}`
    );

    url.searchParams.set("api_token", token);

    url.searchParams.set(
      "include",
      [
        "participants",
        "expectedLineups",
        "lineups",
        "formations",
        "lineups.player",
        "lineups.position",
        "expectedLineups.player",
        "expectedLineups.position"
      ].join(";")
    );

    const response = await fetch(url.toString(), {
      method: "GET",

      headers: {
        Accept: "application/json"
      },

      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error(
        "SportMonks lineup error:",
        response.status,
        payload
      );

      return res.status(response.status).json({
        success: false,
        error:
          payload?.message ||
          "SportMonks lineup request failed"
      });
    }

    const fixture = payload?.data || {};

    const participants = getArray(
      fixture.participants
    );

    const rawExpected = getArray(
      fixture.expectedLineups ??
      fixture.expectedlineups
    );

    const rawConfirmed = getArray(
      fixture.lineups
    );

    const formations = getArray(
      fixture.formations
    );

    const expectedLineups = rawExpected
      .map(player => normalizePlayer(player, true))
      .sort(
        (a, b) =>
          Number(a.formation_position || 999) -
          Number(b.formation_position || 999)
      );

    const confirmedLineups = rawConfirmed
      .map(player => normalizePlayer(player, false))
      .sort(
        (a, b) =>
          Number(a.formation_position || 999) -
          Number(b.formation_position || 999)
      );

    // Prefer confirmed lineups when available.
    // Otherwise use expected lineups.
    const usingExpected =
      confirmedLineups.length === 0 &&
      expectedLineups.length > 0;

    const selectedLineups = usingExpected
      ? expectedLineups
      : confirmedLineups;

    const teams = participants.map(team => ({
      id: team.id,

      name: team.name,

      location: team.meta?.location || "",

      logo: team.image_path || "",

      formation: getFormationName(
        formations,
        team.id,
        team.meta?.location
      )
    }));

    const homeTeam = teams.find(
      team => team.location === "home"
    ) || null;

    const awayTeam = teams.find(
      team => team.location === "away"
    ) || null;

    return res.status(200).json({
      success: true,

      data: {
        fixtureId: fixture.id,

        fixtureName: fixture.name,

        startingAt: fixture.starting_at,

        lineupConfirmed:
          fixture.metadata?.lineup_confirmed ?? null,

        participants,

        teams,

        homeFormation: homeTeam?.formation || null,

        awayFormation: awayTeam?.formation || null,

        expectedLineups,

        lineups: confirmedLineups,

        selectedLineups,

        lineupType: usingExpected
          ? "expected"
          : confirmedLineups.length
            ? "confirmed"
            : "unavailable",

        totalPlayers: selectedLineups.length
      }
    });

  } catch (error) {
    console.error(
      "OutcomeChad Lineups Error:",
      error
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,

      error:
        error.name === "AbortError"
          ? "SportMonks lineup request timed out."
          : "Could not load football lineups."
    });

  } finally {
    clearTimeout(timeout);
  }
}