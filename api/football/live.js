// OutcomeChad Sports
// iSports API — Live Football Scores
// Route: /api/football/live
// Environment: ISPORTS_API_KEY

const BASE_URL = 'https://api.isportsapi.com';

const CACHE_SECONDS = 60;
const STALE_SECONDS = 60;

const STATUS = {
  '0': ['scheduled', 'TIMED'],
  '1': ['live', '1H'],
  '2': ['live', 'HT'],
  '3': ['live', '2H'],
  '4': ['live', 'ET'],
  '5': ['live', 'PEN'],
  '-1': ['finished', 'FT'],
  '-10': ['other', 'CANCELLED'],
  '-11': ['other', 'TBD'],
  '-12': ['other', 'TERMINATED'],
  '-13': ['other', 'INTERRUPTED'],
  '-14': ['other', 'POSTPONED']
};

function calculateMinute(m) {

  if (m.minute !== null && m.minute !== undefined) {
    return m.minute;
  }

  const kickoff = Number(m.halfStartTime);

  if (!kickoff || kickoff <= 0) {
    return null;
  }

  const status = Number(m.status);

  const elapsed = Math.floor(
    (Date.now() / 1000) - kickoff
  ) / 60;

  if (status === 1) {
    return Math.max(0, Math.floor(elapsed));
  }

  if (status === 3) {
    return Math.max(45, 45 + Math.floor(elapsed));
  }

  return null;
}

function normalizeMatch(m) {

  const [status, statusName] =
    STATUS[String(m.status)] || ['other', 'UNKNOWN'];

  const timestamp = Number(m.matchTime);

  const date = timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : '';

  const minute = calculateMinute(m);

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

    minute,

    addedTime: m.injuryTime ?? null,

    matchTime: date,
    startingAt: date,
    startingTimestamp: timestamp || null,

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

    venue: m.location || 'Venue unavailable',

    halfHome: m.homeHalfScore ?? null,
    halfAway: m.awayHalfScore ?? null,

    homeRed: m.homeRed ?? 0,
    awayRed: m.awayRed ?? 0,

    homeYellow: m.homeYellow ?? 0,
    awayYellow: m.awayYellow ?? 0,

    homeCorner: m.homeCorner ?? 0,
    awayCorner: m.awayCorner ?? 0,

    homeRank: m.homeRank || '',
    awayRank: m.awayRank || '',

    hasLineup: m.hasLineup === true,

    raw: m

  };

}

function extractMatches(payload) {

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.matches)) {
    return payload.data.matches;
  }

  if (Array.isArray(payload?.matches)) {
    return payload.matches;
  }

  return null;

}

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

  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {

    return res.status(500).json({
      success: false,
      provider: 'iSports',
      message: 'ISPORTS_API_KEY is missing in Vercel.'
    });

  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    15000
  );

  try {

    const url = new URL(
      '/sport/football/livescores',
      BASE_URL
    );

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

      console.error('iSports live error:', {
        status: response.status,
        message: payload?.message
      });

      return res.status(response.status).json({

        success: false,

        provider: 'iSports',

        message:
          payload?.message ||
          'iSports live scores request failed.',

        upstreamStatus: response.status

      });

    }

    const matches = extractMatches(payload);

    if (!matches) {

      console.error(
        'Unexpected iSports response:',
        payload
      );

      return res.status(502).json({

        success: false,

        provider: 'iSports',

        message: 'Unexpected iSports response format.'

      });

    }

    const normalized = matches
      .filter(m => m && m.matchId != null)
      .map(normalizeMatch);

    return res.status(200).json({

      success: true,

      provider: 'iSports',

      total: normalized.length,

      data: normalized

    });

  } catch (error) {

    console.error(
      'iSports live error:',
      error.message
    );

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({

      success: false,

      provider: 'iSports',

      message:
        error.name === 'AbortError'
          ? 'Live scores request timed out.'
          : 'Unable to retrieve iSports live scores.'

    });

  } finally {

    clearTimeout(timeout);

  }

}