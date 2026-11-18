// OutcomeChad Sports
// API Ninjas — Football Lineups Compatibility
// Route: /api/football/lineups?matchId=123
// Environment: API_NINJAS_KEY

const CACHE_SECONDS = 90;
const STALE_SECONDS = 180;

export default async function handler(req, res) {

  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  if (req.method !== 'GET') {

    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });

  }

  const apiKey = process.env.API_NINJAS_KEY;

  if (!apiKey) {

    return res.status(500).json({
      success: false,
      provider: 'API Ninjas',
      message: 'API_NINJAS_KEY is missing in Vercel.'
    });

  }

  const matchId = String(
    req.query?.matchId || ''
  ).trim();

  if (!matchId || matchId.length > 150) {

    return res.status(400).json({
      success: false,
      message: 'A valid matchId is required.'
    });

  }

  // API Ninjas does not document a dedicated
  // expected-lineups or formation endpoint.
  // Do not generate fictional player information.

  return res.status(200).json({

    success: true,

    provider: 'API Ninjas',

    data: {

      fixtureId: matchId,

      expectedLineups: [],

      lineups: [],

      selectedLineups: [],

      homeLineup: [],

      awayLineup: [],

      homeBackup: [],

      awayBackup: [],

      homeFormation: null,

      awayFormation: null,

      lineupType: 'unavailable',

      totalPlayers: 0,

      totalSubstitutes: 0

    },

    available: false,

    message:
      'Expected lineups and formations are not available through the configured API Ninjas Soccer integration.'

  });

}