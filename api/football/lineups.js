// OutcomeChad Sports
// iSports API — Football Lineups & Formations
// Route: /api/football/lineups?matchId=123
// Environment: ISPORTS_API_KEY

const BASE_URL = 'https://api.isportsapi.com';

const CACHE_SECONDS = 90;
const STALE_SECONDS = 180;

function extractMatch(payload, matchId) {

  const data = payload?.data ?? payload;

  if (Array.isArray(data)) {
    return data.find(
      item => String(item.matchId) === String(matchId)
    ) || null;
  }

  if (Array.isArray(data?.matches)) {
    return data.matches.find(
      item => String(item.matchId) === String(matchId)
    ) || null;
  }

  if (
    data &&
    typeof data === 'object' &&
    String(data.matchId) === String(matchId)
  ) {
    return data;
  }

  return null;
}

function normalizePlayer(player, teamId, formationAvailable) {

  const position = Number(player.position);

  return {

    id: player.playerId || null,

    player_id: player.playerId || null,

    team_id: teamId || null,

    player_name: player.name || 'Unknown Player',

    jersey_number: player.number ?? null,

    formation_field:
      formationAvailable &&
      Number.isFinite(position)
        ? `${position + 1}:0`
        : null,

    formation_position: position,

    is_captain: Boolean(player.isCaptain),

    is_expected: true,

    player: {
      id: player.playerId || null,
      name: player.name || 'Unknown Player',
      display_name: player.name || 'Unknown Player'
    }

  };

}

function normalizePlayers(players, teamId, formation) {

  if (!Array.isArray(players)) {
    return [];
  }

  const formationAvailable = Boolean(formation);

  return players.map(player =>
    normalizePlayer(
      player,
      teamId,
      formationAvailable
    )
  );

}

export default async function handler(req, res) {

  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {

    res.setHeader('Allow', 'GET');

    return res.status(405).json({

      success: false,

      message: 'Method not allowed.'

    });

  }

  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {

    return res.status(500).json({

      success: false,

      provider: 'iSports',

      message: 'ISPORTS_API_KEY is missing in Vercel.'

    });

  }

  const matchId = String(
    req.query?.matchId || ''
  ).trim();

  const homeTeamId = String(
    req.query?.homeTeamId || ''
  );

  const awayTeamId = String(
    req.query?.awayTeamId || ''
  );

  if (!/^\d+$/.test(matchId)) {

    return res.status(400).json({

      success: false,

      message: 'A valid matchId is required.'

    });

  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    15000
  );

  try {

    const url = new URL(
      '/sport/football/lineups',
      BASE_URL
    );

    url.searchParams.set('matchId', matchId);

    url.searchParams.set('isPreview', 'true');

    url.searchParams.set('api_key', apiKey);

    const response = await fetch(url.toString(), {

      method: 'GET',

      headers: {
        Accept: 'application/json'
      },

      signal: controller.signal

    });

    const payload = await response.json().catch(
      () => null
    );

    if (!response.ok) {

      console.error('iSports lineup error:', {

        status: response.status,

        message: payload?.message

      });

      return res.status(response.status).json({

        success: false,

        provider: 'iSports',

        message:
          payload?.message ||
          'iSports lineup request failed.'

      });

    }

    const match = extractMatch(payload, matchId);

    if (!match) {

      return res.status(200).json({

        success: true,

        provider: 'iSports',

        data: {

          fixtureId: matchId,

          expectedLineups: [],

          lineups: [],

          selectedLineups: [],

          homeFormation: null,

          awayFormation: null,

          lineupType: 'unavailable',

          totalPlayers: 0

        }

      });

    }

    const homeFormation =
      match.homeFormation || null;

    const awayFormation =
      match.awayFormation || null;

    const homeStarting = normalizePlayers(
      match.homeLineup,
      homeTeamId,
      homeFormation
    );

    const awayStarting = normalizePlayers(
      match.awayLineup,
      awayTeamId,
      awayFormation
    );

    const homeSubstitutes = normalizePlayers(
      match.homeBackup,
      homeTeamId,
      null
    );

    const awaySubstitutes = normalizePlayers(
      match.awayBackup,
      awayTeamId,
      null
    );

    const selectedLineups = [
      ...homeStarting,
      ...awayStarting
    ];

    const expectedLineups = selectedLineups;

    return res.status(200).json({

      success: true,

      provider: 'iSports',

      data: {

        fixtureId: matchId,

        homeFormation,

        awayFormation,

        homeLineup: homeStarting,

        awayLineup: awayStarting,

        homeBackup: homeSubstitutes,

        awayBackup: awaySubstitutes,

        expectedLineups,

        lineups: selectedLineups,

        selectedLineups,

        lineupType: 'available',

        totalPlayers: selectedLineups.length,

        totalSubstitutes:
          homeSubstitutes.length +
          awaySubstitutes.length

      }

    });

  } catch (error) {

    console.error(
      'OutcomeChad iSports lineup error:',
      error.message
    );

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({

      success: false,

      provider: 'iSports',

      message:
        error.name === 'AbortError'
          ? 'Lineup request timed out.'
          : 'Unable to retrieve football lineups.'

    });

  } finally {

    clearTimeout(timeout);

  }

}