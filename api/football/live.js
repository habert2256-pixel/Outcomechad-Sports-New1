// OutcomeChad Sports
// iSports API — Live Football Scores

const BASE_URL = 'https://api.isportsapi.com';

const STATUS = {
  0: ['scheduled', 'TIMED'],
  1: ['live', '1H'],
  2: ['live', 'HT'],
  3: ['live', '2H'],
  4: ['live', 'ET'],
  5: ['live', 'PEN'],
  '-1': ['finished', 'FT'],
  '-10': ['other', 'CANCELLED'],
  '-11': ['other', 'TBD'],
  '-12': ['other', 'TERMINATED'],
  '-13': ['other', 'INTERRUPTED'],
  '-14': ['other', 'POSTPONED']
};

function normalizeMatch(m) {

  const [status, statusName] =
    STATUS[m.status] || ['other', 'UNKNOWN'];

  const timestamp = Number(m.matchTime);

  const date = timestamp
    ? new Date(timestamp * 1000).toISOString()
    : '';

  return {

    id: String(m.matchId),

    homeName: m.homeName || 'Home',
    awayName: m.awayName || 'Away',

    homeTeamId: m.homeId || '',
    awayTeamId: m.awayId || '',

    homeLogo: '',
    awayLogo: '',

    homeScore: m.homeScore ?? null,
    awayScore: m.awayScore ?? null,

    status,
    statusName,

    minute: m.minute ?? null,
    addedTime: m.injuryTime ?? null,

    matchTime: date,
    startingAt: date,

    competitionName: m.leagueName || 'Football',

    league: {
      id: m.leagueId || '',
      name: m.leagueName || 'Football'
    },

    leagueId: m.leagueId || '',
    leagueLogo: '',

    country: '',

    stageName: m.round || '',
    groupName: m.group || '',

    roundName: m.round || '',

    venue: m.location || '',

    halfHome: m.homeHalfScore ?? null,
    halfAway: m.awayHalfScore ?? null,

    homeRed: m.homeRed ?? 0,
    awayRed: m.awayRed ?? 0,

    homeYellow: m.homeYellow ?? 0,
    awayYellow: m.awayYellow ?? 0,

    homeCorner: m.homeCorner ?? 0,
    awayCorner: m.awayCorner ?? 0,

    raw: m

  };
}

export default async function handler(req, res) {

  res.setHeader(
    'Cache-Control',
    's-maxage=15, stale-while-revalidate=30'
  );

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: 'ISPORTS_API_KEY is missing.'
    });
  }

  try {

    const url = new URL(
      '/sport/football/livescores',
      BASE_URL
    );

    url.searchParams.set('api_key', apiKey);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    });

    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: payload?.message || 'iSports live request failed.'
      });
    }

    if (!Array.isArray(payload?.data)) {
      return res.status(502).json({
        success: false,
        message: payload?.message || 'Unexpected iSports response.'
      });
    }

    const matches = payload.data.map(normalizeMatch);

    return res.status(200).json({
      success: true,
      provider: 'iSports',
      total: matches.length,
      data: matches
    });

  } catch (error) {

    return res.status(502).json({
      success: false,
      message: error.name === 'TimeoutError'
        ? 'Live scores request timed out.'
        : 'Unable to retrieve iSports live scores.'
    });

  }
}