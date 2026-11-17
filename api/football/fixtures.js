// OutcomeChad Sports
// iSports API — Football Fixtures

const BASE_URL = 'https://api.isportsapi.com';

function normalizeMatch(m) {
  const statusMap = {
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

  const [status, statusName] =
    statusMap[m.status] || ['other', 'UNKNOWN'];

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
    league: m.leagueName || 'Football',

    leagueId: m.leagueId || '',
    leagueLogo: '',

    country: '',

    stageName: m.round || '',
    groupName: m.group || '',
    roundName: m.round || '',

    venue: m.location || 'Venue unavailable',

    raw: m
  };
}

export default async function handler(req, res) {

  res.setHeader(
    'Cache-Control',
    's-maxage=300, stale-while-revalidate=600'
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

  const date = String(req.query?.date || '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'Valid date required.'
    });
  }

  try {

    const url = new URL(
      '/sport/football/schedule',
      BASE_URL
    );

    url.searchParams.set('date', date);
    url.searchParams.set('api_key', apiKey);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(20000)
    });

    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: payload?.message || 'iSports fixtures request failed.'
      });
    }

    if (!Array.isArray(payload?.data)) {
      return res.status(502).json({
        success: false,
        message: payload?.message || 'Unexpected iSports response.',
        provider: 'iSports'
      });
    }

    const matches = payload.data.map(normalizeMatch);

    return res.status(200).json({
      success: true,
      provider: 'iSports',
      date,
      total: matches.length,
      data: matches
    });

  } catch (error) {

    return res.status(502).json({
      success: false,
      message: error.name === 'TimeoutError'
        ? 'Fixtures request timed out.'
        : 'Unable to retrieve iSports fixtures.'
    });

  }
}